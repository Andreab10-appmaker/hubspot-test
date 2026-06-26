import { getPropertyOptions } from "./hubspot-crm.js";
import {
  buildPipelineDataset,
  type PipelineDatasetDeal,
  type StageHistoryEntry,
} from "./pipeline-dataset.js";
import { logger } from "./logger.js";

/**
 * Motore ANALITICO deterministico del funnel deal. Risponde — con gli stessi
 * numeri sia per il frontend (pagina Insight) sia per l'assistente AI (tool
 * get_deal_analytics) — alle domande:
 *
 *  1) velocità nel funnel per sorgente del deal (funnelVelocityBySource)
 *  2) in quali fasi i deal si bloccano (stuckStages)
 *  3) deal senza attività da N settimane (inactiveDeals)
 *  4) ciclo di vendita medio per fascia di valore (salesCycleByValue)
 *  5) win rate per paese (winRateByCountry)
 *  6) transizioni di fase, incl. Discovery → Closed Lost diretto (stageTransitions)
 *
 * Tutto si basa sul DATASET CANONICO (lib/pipeline-dataset.ts) arricchito con i
 * campi HubSpot deal_source, deal_country, last_activity_date, stage_history.
 */

const DAY_MS = 86_400_000;
const DEFAULT_INACTIVITY_DAYS = 21; // "3 settimane"
const DEFAULT_STUCK_DAYS = 30; // soglia "bloccato" nella fase corrente

function toDate(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? t : null;
}
function daysBetween(aIso: string, bIso: string): number | null {
  const a = toDate(aIso);
  const b = toDate(bIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / DAY_MS);
}
function avg(xs: number[]): number {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
}
function isClosedStage(label: string): boolean {
  return /closed|won|lost/i.test(label);
}
function isWon(label: string): boolean {
  return /won/i.test(label);
}
function isLost(label: string): boolean {
  return /lost/i.test(label);
}
function isDiscovery(label: string): boolean {
  return /discovery/i.test(label);
}

// Prima/ultima tappa utili dallo storico fasi.
function firstEntered(h: StageHistoryEntry[]): string | null {
  return h.length ? h[0].enteredAt : null;
}
function closedEntry(h: StageHistoryEntry[]): StageHistoryEntry | null {
  for (let i = h.length - 1; i >= 0; i--) if (isClosedStage(h[i].stage)) return h[i];
  return null;
}
// Fase corrente di un deal aperto: ultima tappa senza uscita.
function currentOpenStage(h: StageHistoryEntry[]): StageHistoryEntry | null {
  for (let i = h.length - 1; i >= 0; i--) {
    if (!h[i].exitedAt && !isClosedStage(h[i].stage)) return h[i];
  }
  return null;
}

export interface DealAnalyticsOptions {
  /** Data di riferimento (ISO) per "oggi". Default: data corrente. */
  now?: string;
  /** Ordine canonico delle fasi (label), per ordinare gli output. */
  stageOrder?: string[];
  inactivityDays?: number;
  stuckDays?: number;
}

// ---- Tipi di output -------------------------------------------------------

export interface StageVelocity {
  stage: string;
  avgDays: number;
  count: number;
}
export interface SourceVelocity {
  source: string;
  deals: number;
  avgDaysToClose: number | null;
  stages: StageVelocity[];
}
export interface StuckStage {
  stage: string;
  avgDaysInStage: number;
  completedTransitions: number;
  currentlyInStage: number;
  currentlyStuck: number;
  stuckDeals: Array<{ code: string; name: string; owner: string; daysInStage: number }>;
}
export interface InactiveDeal {
  code: string;
  name: string;
  owner: string;
  stage: string;
  amount: number;
  lastActivityDate: string;
  daysSinceActivity: number;
}
export interface CycleBucket {
  bucket: string;
  label: string;
  avgCycleDays: number;
  count: number;
}
export interface CountryWinRate {
  country: string;
  won: number;
  lost: number;
  open: number;
  decided: number;
  winRate: number | null; // won / (won+lost), null se nessun deal deciso
}
export interface StageTransition {
  from: string;
  to: string;
  count: number;
}

export interface DealAnalytics {
  generatedAt: string;
  totals: { deals: number; closed: number; won: number; lost: number; open: number };
  funnelVelocityBySource: SourceVelocity[];
  stuckStages: StuckStage[];
  inactiveDeals: { thresholdDays: number; count: number; deals: InactiveDeal[] };
  salesCycleByValue: { buckets: CycleBucket[]; overallAvgDays: number };
  winRateByCountry: { countries: CountryWinRate[]; overallWinRate: number | null };
  stageTransitions: {
    transitions: StageTransition[];
    discoveryToClosedLost: {
      count: number;
      deals: Array<{ code: string; name: string }>;
    };
  };
  notes: string[];
}

// Fasce di valore per il ciclo di vendita.
const VALUE_BUCKETS: Array<{ bucket: string; label: string; test: (n: number) => boolean }> = [
  { bucket: "lt100k", label: "< 100k €", test: (n) => n < 100_000 },
  { bucket: "100-300k", label: "100k–300k €", test: (n) => n >= 100_000 && n < 300_000 },
  { bucket: "300-500k", label: "300k–500k €", test: (n) => n >= 300_000 && n < 500_000 },
  { bucket: "gte500k", label: "≥ 500k €", test: (n) => n >= 500_000 },
];

/** Calcolo PURO delle analisi a partire dai deal del dataset canonico. */
export function computeDealAnalytics(
  deals: PipelineDatasetDeal[],
  opts: DealAnalyticsOptions = {},
): DealAnalytics {
  const now = opts.now || new Date().toISOString().slice(0, 10);
  const inactivityDays = opts.inactivityDays ?? DEFAULT_INACTIVITY_DAYS;
  const stuckDays = opts.stuckDays ?? DEFAULT_STUCK_DAYS;
  const stageOrder = opts.stageOrder ?? [];
  const orderIdx = (s: string) => {
    const i = stageOrder.findIndex((x) => x.toLowerCase() === s.toLowerCase());
    return i === -1 ? 999 : i;
  };
  const notes: string[] = [];

  // Totali esito.
  const totals = { deals: deals.length, closed: 0, won: 0, lost: 0, open: 0 };
  for (const d of deals) {
    if (isWon(d.stageLabel)) { totals.won++; totals.closed++; }
    else if (isLost(d.stageLabel)) { totals.lost++; totals.closed++; }
    else totals.open++;
  }
  const withHistory = deals.filter((d) => d.stageHistory.length > 0);
  if (withHistory.length < deals.length) {
    notes.push(
      `${deals.length - withHistory.length} deal senza stage_history: esclusi da velocità funnel, fasi bloccate, ciclo di vendita e transizioni.`,
    );
  }

  // 1) Velocità funnel per sorgente -----------------------------------------
  const bySource = new Map<string, PipelineDatasetDeal[]>();
  for (const d of deals) {
    const key = d.source || "(non impostata)";
    (bySource.get(key) ?? bySource.set(key, []).get(key)!).push(d);
  }
  const funnelVelocityBySource: SourceVelocity[] = [...bySource.entries()]
    .map(([source, ds]) => {
      const stageDur = new Map<string, number[]>();
      const closeDurations: number[] = [];
      for (const d of ds) {
        for (const e of d.stageHistory) {
          if (isClosedStage(e.stage) || !e.exitedAt) continue;
          const dur = daysBetween(e.enteredAt, e.exitedAt);
          if (dur != null && dur >= 0) (stageDur.get(e.stage) ?? stageDur.set(e.stage, []).get(e.stage)!).push(dur);
        }
        const first = firstEntered(d.stageHistory);
        const closed = closedEntry(d.stageHistory);
        if (first && closed) {
          const c = daysBetween(first, closed.enteredAt);
          if (c != null && c >= 0) closeDurations.push(c);
        }
      }
      const stages: StageVelocity[] = [...stageDur.entries()]
        .map(([stage, xs]) => ({ stage, avgDays: avg(xs), count: xs.length }))
        .sort((a, b) => orderIdx(a.stage) - orderIdx(b.stage));
      return {
        source,
        deals: ds.length,
        avgDaysToClose: closeDurations.length ? avg(closeDurations) : null,
        stages,
      };
    })
    .sort((a, b) => b.deals - a.deals);

  // 2) Fasi dove i deal si bloccano ------------------------------------------
  const stageCompleted = new Map<string, number[]>(); // durate completate per fase
  const stageCurrent = new Map<string, PipelineDatasetDeal[]>(); // deal aperti ora in fase
  for (const d of deals) {
    for (const e of d.stageHistory) {
      if (isClosedStage(e.stage) || !e.exitedAt) continue;
      const dur = daysBetween(e.enteredAt, e.exitedAt);
      if (dur != null && dur >= 0) (stageCompleted.get(e.stage) ?? stageCompleted.set(e.stage, []).get(e.stage)!).push(dur);
    }
    const cur = currentOpenStage(d.stageHistory);
    if (cur) (stageCurrent.get(cur.stage) ?? stageCurrent.set(cur.stage, []).get(cur.stage)!).push(d);
  }
  const allStages = new Set<string>([...stageCompleted.keys(), ...stageCurrent.keys()]);
  const stuckStages: StuckStage[] = [...allStages]
    .map((stage) => {
      const completed = stageCompleted.get(stage) ?? [];
      const current = stageCurrent.get(stage) ?? [];
      const stuckDeals = current
        .map((d) => {
          const e = currentOpenStage(d.stageHistory)!;
          const days = daysBetween(e.enteredAt, now) ?? 0;
          return { code: d.code, name: d.name, owner: d.owner, daysInStage: days };
        })
        .filter((x) => x.daysInStage >= stuckDays)
        .sort((a, b) => b.daysInStage - a.daysInStage);
      return {
        stage,
        avgDaysInStage: avg(completed),
        completedTransitions: completed.length,
        currentlyInStage: current.length,
        currentlyStuck: stuckDeals.length,
        stuckDeals,
      };
    })
    .sort((a, b) => b.avgDaysInStage - a.avgDaysInStage);

  // 3) Deal senza attività da N giorni ---------------------------------------
  const inactive: InactiveDeal[] = deals
    .filter((d) => !isClosedStage(d.stageLabel))
    .map((d) => {
      const days = d.lastActivityDate ? daysBetween(d.lastActivityDate, now) : null;
      return { d, days };
    })
    .filter((x) => x.days != null && x.days >= inactivityDays)
    .map(({ d, days }) => ({
      code: d.code,
      name: d.name,
      owner: d.owner,
      stage: d.stageLabel,
      amount: d.amount,
      lastActivityDate: d.lastActivityDate,
      daysSinceActivity: days as number,
    }))
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

  // 4) Ciclo di vendita per fascia di valore (deal CHIUSI VINTI) -------------
  const cycleByBucket = new Map<string, number[]>();
  const allCycles: number[] = [];
  for (const d of deals) {
    if (!isWon(d.stageLabel)) continue;
    const first = firstEntered(d.stageHistory);
    const closed = closedEntry(d.stageHistory);
    if (!first || !closed) continue;
    const cycle = daysBetween(first, closed.enteredAt);
    if (cycle == null || cycle < 0) continue;
    allCycles.push(cycle);
    const b = VALUE_BUCKETS.find((x) => x.test(d.amount));
    if (b) (cycleByBucket.get(b.bucket) ?? cycleByBucket.set(b.bucket, []).get(b.bucket)!).push(cycle);
  }
  const salesCycleByValue = {
    buckets: VALUE_BUCKETS.map((b) => ({
      bucket: b.bucket,
      label: b.label,
      avgCycleDays: avg(cycleByBucket.get(b.bucket) ?? []),
      count: (cycleByBucket.get(b.bucket) ?? []).length,
    })).filter((b) => b.count > 0),
    overallAvgDays: avg(allCycles),
  };

  // 5) Win rate per paese -----------------------------------------------------
  const byCountry = new Map<string, { won: number; lost: number; open: number }>();
  for (const d of deals) {
    const key = d.country || "(non impostato)";
    const e = byCountry.get(key) ?? { won: 0, lost: 0, open: 0 };
    if (isWon(d.stageLabel)) e.won++;
    else if (isLost(d.stageLabel)) e.lost++;
    else e.open++;
    byCountry.set(key, e);
  }
  let gWon = 0, gDecided = 0;
  const countries: CountryWinRate[] = [...byCountry.entries()]
    .map(([country, e]) => {
      const decided = e.won + e.lost;
      gWon += e.won; gDecided += decided;
      return {
        country,
        won: e.won,
        lost: e.lost,
        open: e.open,
        decided,
        winRate: decided ? Math.round((e.won / decided) * 100) / 100 : null,
      };
    })
    .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.decided - a.decided);
  const winRateByCountry = {
    countries,
    overallWinRate: gDecided ? Math.round((gWon / gDecided) * 100) / 100 : null,
  };

  // 6) Transizioni di fase (incl. Discovery → Closed Lost diretto) -----------
  const transMap = new Map<string, number>();
  const discoveryToLostDeals: Array<{ code: string; name: string }> = [];
  for (const d of deals) {
    const h = d.stageHistory;
    let flagged = false;
    for (let i = 0; i < h.length - 1; i++) {
      const from = h[i].stage, to = h[i + 1].stage;
      const k = `${from}→${to}`;
      transMap.set(k, (transMap.get(k) ?? 0) + 1);
      if (!flagged && isDiscovery(from) && isLost(to)) {
        discoveryToLostDeals.push({ code: d.code, name: d.name });
        flagged = true;
      }
    }
  }
  const transitions: StageTransition[] = [...transMap.entries()]
    .map(([k, count]) => {
      const [from, to] = k.split("→");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  logger.info(
    { deals: deals.length, sources: bySource.size, countries: byCountry.size, inactive: inactive.length },
    "[deal-analytics] analisi calcolate",
  );

  return {
    generatedAt: now,
    totals,
    funnelVelocityBySource,
    stuckStages,
    inactiveDeals: { thresholdDays: inactivityDays, count: inactive.length, deals: inactive },
    salesCycleByValue,
    winRateByCountry,
    stageTransitions: {
      transitions,
      discoveryToClosedLost: { count: discoveryToLostDeals.length, deals: discoveryToLostDeals },
    },
    notes,
  };
}

/** Costruisce le analisi leggendo HubSpot (dataset canonico + ordine fasi). */
export async function buildDealAnalytics(
  opts: DealAnalyticsOptions = {},
): Promise<DealAnalytics> {
  const [dataset, stageOpts] = await Promise.all([
    buildPipelineDataset(),
    getPropertyOptions("deals", "dealstage").catch(() => []),
  ]);
  const stageOrder = stageOpts.map((o) => o.label);
  return computeDealAnalytics(dataset.deals, { stageOrder, ...opts });
}
