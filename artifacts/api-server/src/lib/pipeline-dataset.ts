import { listAll, getPropertyOptions, type CrmRecord } from "./hubspot-crm.js";
import type { RevenueDeal } from "./revenue-spreading.js";
import { logger } from "./logger.js";

/**
 * FONTE DI VERITÀ UNICA della pipeline / revenue spreading.
 *
 * Problema risolto: prima esistevano TRE calcoli diversi del fatturato per anno
 * (export "Revenue Spreading" via revenue_schedule, export "Pipeline" via importo
 * nell'anno di chiusura, e l'assistente AI che inventava la propria suddivisione).
 * Risultato: interfaccia, Excel e assistente mostravano numeri e "split" diversi.
 *
 * Questo modulo legge i deal da HubSpot in modo DETERMINISTICO (tutte le pagine)
 * e calcola UNA SOLA volta la suddivisione canonica del fatturato per anno. Tutti
 * i consumatori — export Revenue Spreading, export Pipeline, dashboard e i tool
 * dell'assistente — usano questo stesso dataset, così i dati sono sempre allineati
 * tra loro e con HubSpot.
 *
 * Criterio di split (in ordine di priorità, identico ovunque):
 *  1. `revenue_schedule` (JSON anno→importo) se presente e valido → è la verità.
 *  2. Fallback "spread": importo distribuito sui mesi attivi del contratto
 *     (contract_start + durata) e aggregato per anno.
 *  3. Fallback "close": importo intero nell'anno della data di chiusura.
 *  4. Nessuno: deal senza importo/date → nessun fatturato.
 */

// Proprietà deal (incluse le custom Revenue Spreading) lette da HubSpot.
export const PIPELINE_DEAL_PROPS = [
  "deal_code",
  "dealname",
  "contract_owner",
  "dealstage",
  "closedate",
  "contract_start",
  "amount",
  "contract_duration_years",
  "contract_type",
  "kpmg_note",
  "revenue_schedule",
];

export type ScheduleSource =
  | "schedule"
  | "fallback-spread"
  | "fallback-close"
  | "none";

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isoDate(v: string | null | undefined): string {
  return (v || "").slice(0, 10);
}

function yearOf(iso: string | null | undefined): number | null {
  const m = /(\d{4})/.exec(String(iso ?? ""));
  return m ? Number(m[1]) : null;
}

/** Interpreta il campo `revenue_schedule` (JSON anno→importo). */
export function parseSchedule(
  raw: string | null | undefined,
): Record<string, number> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const y = /^\d{4}$/.test(k.trim()) ? k.trim() : null;
      const n = Number(v);
      if (y && Number.isFinite(n)) out[y] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Fallback deterministico quando manca `revenue_schedule`: distribuisce l'importo
 * sui mesi attivi del contratto (contract_start per `durationYears` anni) e
 * aggrega per anno. Se mancano start/durata, mette tutto nell'anno di chiusura.
 */
function fallbackSchedule(
  amount: number,
  contractStart: string,
  durationYears: number,
  closeDate: string,
): { schedule: Record<string, number>; source: ScheduleSource } {
  if (!amount) return { schedule: {}, source: "none" };

  const startY = yearOf(contractStart);
  const startM = (() => {
    const m = /\d{4}-(\d{2})/.exec(isoDate(contractStart));
    return m ? Number(m[1]) : null;
  })();
  const months = Math.round((durationYears || 0) * 12);

  if (startY && startM && months > 0) {
    const startIdx = startY * 12 + (startM - 1);
    const perMonth = amount / months;
    const byYear: Record<string, number> = {};
    for (let i = 0; i < months; i++) {
      const idx = startIdx + i;
      const y = Math.floor(idx / 12);
      byYear[String(y)] = (byYear[String(y)] || 0) + perMonth;
    }
    // Arrotonda mantenendo il totale = amount (l'ultimo anno assorbe il residuo).
    const ys = Object.keys(byYear).sort();
    let acc = 0;
    ys.forEach((y, i) => {
      if (i < ys.length - 1) {
        byYear[y] = Math.round(byYear[y]);
        acc += byYear[y];
      } else {
        byYear[y] = Math.round(amount) - acc;
      }
    });
    return { schedule: byYear, source: "fallback-spread" };
  }

  const closeY = yearOf(closeDate);
  if (closeY) return { schedule: { [String(closeY)]: amount }, source: "fallback-close" };
  return { schedule: {}, source: "none" };
}

/** Classifica la fase deal (per il foglio Cash Flow e per won/open). */
export function stageKind(label: string): RevenueDeal["stageKind"] {
  const l = label.toLowerCase();
  if (/won/.test(l)) return "won";
  if (/proposal/.test(l)) return "proposal";
  if (/discovery/.test(l)) return "discovery";
  return "other";
}

// Won/closed determinati sulla LABEL parlante (coerente con hubspot-crm.ts).
function isWonLabel(label: string): boolean {
  return /won/i.test(label);
}
function isClosedLabel(label: string): boolean {
  return /closed(\s*(won|lost))?|won|lost/i.test(label);
}

export interface PipelineDatasetDeal extends RevenueDeal {
  /** Origine dello split (per diagnostica e per spiegare i criteri all'utente). */
  scheduleSource: ScheduleSource;
  /** Somma dello schedule (fatturato pluriennale totale del deal). */
  scheduledTotal: number;
}

export interface PipelineDataset {
  deals: PipelineDatasetDeal[];
  /** Anni coperti dagli schedule (ordinati), es. [2025,2026,2027,2028,2029]. */
  years: number[];
  /** Fatturato totale per anno (somma degli schedule di tutti i deal). */
  revenueByYear: Record<number, number>;
  /** Somma di tutti gli schedule (fatturato pluriennale complessivo). */
  totalScheduledRevenue: number;
  /** Somma dei valori nominali (`amount`) dei deal. */
  totalContractValue: number;
  byStage: Array<{
    stage: string;
    stageLabel: string;
    count: number;
    value: number;
  }>;
  won: { count: number; value: number };
  open: { count: number; value: number };
  /** Incoerenze rilevate (es. schedule ≠ amount, schedule mancante). */
  warnings: string[];
}

/**
 * Costruisce il dataset canonico della pipeline leggendo HubSpot. Deterministico:
 * stesso input HubSpot → stesso output, indipendentemente dal chiamante.
 */
export async function buildPipelineDataset(): Promise<PipelineDataset> {
  const [records, stageOpts, typeOpts] = await Promise.all([
    listAll("deals", PIPELINE_DEAL_PROPS),
    getPropertyOptions("deals", "dealstage").catch(() => []),
    getPropertyOptions("deals", "contract_type").catch(() => []),
  ]);
  const stageMap = new Map(stageOpts.map((o) => [o.value, o.label]));
  const typeMap = new Map(typeOpts.map((o) => [o.value, o.label]));
  return computePipelineDataset(records, stageMap, typeMap);
}

/**
 * Calcolo PURO del dataset (senza I/O): a partire dai record deal e dalle mappe
 * value→label di fase/tipo, produce deal canonici e aggregati. Estratto da
 * buildPipelineDataset per essere testabile in modo deterministico.
 */
export function computePipelineDataset(
  records: CrmRecord[],
  stageMap: Map<string, string>,
  typeMap: Map<string, string>,
): PipelineDataset {
  const warnings: string[] = [];

  const deals: PipelineDatasetDeal[] = records
    .map((rec) => {
      const p = rec.properties;
      const stageLabel = stageMap.get(p.dealstage || "") || p.dealstage || "—";
      const amount = num(p.amount);
      const durationYears = num(p.contract_duration_years);
      const closingDate = p.closedate || "";
      const contractStart = p.contract_start || "";

      // 1) schedule reale, 2) fallback deterministico.
      let schedule = parseSchedule(p.revenue_schedule);
      let source: ScheduleSource = "schedule";
      if (Object.keys(schedule).length === 0) {
        const fb = fallbackSchedule(amount, contractStart, durationYears, closingDate);
        schedule = fb.schedule;
        source = fb.source;
      }

      const scheduledTotal = Object.values(schedule).reduce((a, b) => a + b, 0);
      const code = p.deal_code || rec.id;

      // Diagnostica frizioni: schedule che non riconcilia con l'importo nominale.
      if (source === "schedule" && amount > 0) {
        const diff = Math.abs(scheduledTotal - amount);
        if (diff > Math.max(1, amount * 0.005)) {
          warnings.push(
            `${code} "${p.dealname || ""}": revenue_schedule somma ${Math.round(
              scheduledTotal,
            )} € ma amount è ${Math.round(amount)} € (scarto ${Math.round(diff)} €).`,
          );
        }
      } else if (source !== "schedule" && amount > 0) {
        warnings.push(
          `${code} "${p.dealname || ""}": nessun revenue_schedule su HubSpot, split calcolato per ${
            source === "fallback-spread" ? "distribuzione sul contratto" : "anno di chiusura"
          }.`,
        );
      }

      return {
        code,
        name: p.dealname || "(senza nome)",
        owner: p.contract_owner || "",
        stageLabel,
        closingDate,
        contractStart,
        amount,
        durationYears,
        typeLabel: typeMap.get(p.contract_type || "") || p.contract_type || "",
        kpmgNote: p.kpmg_note || "",
        schedule,
        stageKind: stageKind(stageLabel),
        scheduleSource: source,
        scheduledTotal,
      } satisfies PipelineDatasetDeal;
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  // Aggregati per anno.
  const yearSet = new Set<number>();
  const revenueByYear: Record<number, number> = {};
  for (const d of deals) {
    for (const [y, v] of Object.entries(d.schedule)) {
      const yr = Number(y);
      yearSet.add(yr);
      revenueByYear[yr] = (revenueByYear[yr] || 0) + v;
    }
  }
  const years = [...yearSet].filter((y) => y).sort((a, b) => a - b);
  const totalScheduledRevenue = Object.values(revenueByYear).reduce(
    (a, b) => a + b,
    0,
  );
  const totalContractValue = deals.reduce((a, d) => a + d.amount, 0);

  // Aggregati per fase + won/open (label parlanti).
  const byStageMap = new Map<
    string,
    { stageLabel: string; count: number; value: number }
  >();
  const won = { count: 0, value: 0 };
  const open = { count: 0, value: 0 };
  for (const d of deals) {
    const key = d.stageLabel;
    const entry = byStageMap.get(key) || {
      stageLabel: d.stageLabel,
      count: 0,
      value: 0,
    };
    entry.count += 1;
    entry.value += d.amount;
    byStageMap.set(key, entry);
    if (isWonLabel(d.stageLabel)) {
      won.count += 1;
      won.value += d.amount;
    }
    if (!isClosedLabel(d.stageLabel)) {
      open.count += 1;
      open.value += d.amount;
    }
  }
  const byStage = [...byStageMap.entries()].map(([stage, v]) => ({
    stage,
    stageLabel: v.stageLabel,
    count: v.count,
    value: v.value,
  }));

  logger.info(
    {
      deals: deals.length,
      years,
      totalScheduledRevenue,
      warnings: warnings.length,
    },
    "[pipeline-dataset] dataset canonico costruito",
  );

  return {
    deals,
    years,
    revenueByYear,
    totalScheduledRevenue,
    totalContractValue,
    byStage,
    won,
    open,
    warnings,
  };
}
