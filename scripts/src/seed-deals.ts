/**
 * Popola HubSpot con dati DEAL credibili per le analisi del funnel.
 *
 * - Arricchisce i 7 deal esistenti (HB-001..HB-007) con i nuovi campi.
 * - Crea ~18 deal demo (HB-008..HB-025) con varietà: Closed Won/Lost su più
 *   paesi e sorgenti, alcuni bloccati in fase, alcuni senza attività da settimane,
 *   alcuni passati da Discovery call direttamente a Closed Lost.
 *
 * Idempotente: fa UPSERT per `deal_code` (aggiorna se esiste, crea altrimenti).
 * Richiede prima `setup:deal-fields` (le proprietà devono esistere) e un token
 * App Privata con scope deals read/write.
 *
 * Uso:
 *   HUBSPOT_ACCESS_TOKEN=pat-... pnpm --filter @workspace/scripts seed:deals
 *   HUBSPOT_ACCESS_TOKEN=pat-... DRY_RUN=1 pnpm --filter @workspace/scripts seed:deals
 */

const HUBSPOT_API = "https://api.hubapi.com";

// Fasi (label) della pipeline default.
const APP = "Appointment Scheduled";
const DISC = "Discovery call";
const PROP = "Proposal/Demo";
const TEND = "Tenders";
const DEC = "Decision maker brought-in";
const SENT = "Contract Sent";
const WON = "Closed Won";
const LOST = "Closed Lost";

interface Spec {
  code: string;
  name: string;
  owner: string;
  source: string;
  country: string;
  amount: number;
  durationYears: number;
  renewal?: number;
  schedule: Record<string, number>;
  contractStart: string; // YYYY-MM-DD
  lastActivityDaysAgo: number;
  historyStart: string; // YYYY-MM-DD
  // [label, giorni in fase]; l'ultima fase ha giorni = null (fase corrente/chiusura).
  history: Array<[string, number | null]>;
}

// ---- Helper date ----------------------------------------------------------
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
}
function buildHistory(spec: Spec): { json: string; stageLabel: string; closeDate: string } {
  const entries: Array<{ stage: string; enteredAt: string; exitedAt: string | null }> = [];
  let cur = spec.historyStart;
  spec.history.forEach(([stage, days], i) => {
    const last = i === spec.history.length - 1;
    const exitedAt = last || days == null ? null : addDays(cur, days);
    entries.push({ stage, enteredAt: cur, exitedAt });
    if (exitedAt) cur = exitedAt;
  });
  const lastStage = spec.history[spec.history.length - 1][0];
  return { json: JSON.stringify(entries), stageLabel: lastStage, closeDate: cur };
}

// ---- Specifiche deal ------------------------------------------------------
// 7 esistenti (arricchiti) + 18 nuovi.
const SPECS: Spec[] = [
  // === Esistenti (HB-001..007): manteniamo amount/schedule, aggiungiamo campi ===
  { code: "HB-001", name: "Vueling Airlines — Servizi Bus Aeroporto", owner: "G. Capuzzo", source: "Inbound", country: "Spagna", amount: 390000, durationYears: 3, renewal: 0.7, schedule: { "2025": 21667, "2026": 130000, "2027": 130000, "2028": 108333 }, contractStart: "2025-11-01", lastActivityDaysAgo: 95, historyStart: "2025-01-10", history: [[APP, 18], [DISC, 25], [PROP, 30], [DEC, 20], [SENT, 22], [WON, null]] },
  { code: "HB-002", name: "Ryanair — Transfer Bergamo Orio", owner: "G. Capuzzo", source: "Outbound", country: "UK", amount: 180000, durationYears: 2, renewal: 0.6, schedule: { "2025": 30000, "2026": 90000, "2027": 60000 }, contractStart: "2025-09-01", lastActivityDaysAgo: 70, historyStart: "2025-02-01", history: [[APP, 20], [DISC, 30], [PROP, 35], [SENT, 25], [WON, null]] },
  { code: "HB-003", name: "Interporto Verona — Shuttle Dipendenti", owner: "M. Rossi", source: "Referral", country: "Italia", amount: 420000, durationYears: 3, renewal: 0.8, schedule: { "2025": 119167, "2026": 148750, "2027": 140833, "2028": 11250 }, contractStart: "2025-02-01", lastActivityDaysAgo: 130, historyStart: "2024-09-15", history: [[APP, 22], [DISC, 28], [PROP, 40], [TEND, 30], [DEC, 25], [SENT, 20], [WON, null]] },
  { code: "HB-004", name: "Fiera Milano — Navette Evento", owner: "G. Capuzzo", source: "Event", country: "Italia", amount: 85000, durationYears: 1, renewal: 0, schedule: { "2026": 85000 }, contractStart: "2026-03-01", lastActivityDaysAgo: 40, historyStart: "2025-11-20", history: [[APP, 15], [DISC, 20], [WON, null]] },
  { code: "HB-005", name: "ENI — Bus Aziendale Sede San Donato", owner: "L. Ferrari", source: "Outbound", country: "Italia", amount: 560000, durationYears: 4, renewal: 0.75, schedule: { "2026": 70000, "2027": 140000, "2028": 140000, "2029": 140000, "2030": 70000 }, contractStart: "2026-07-01", lastActivityDaysAgo: 12, historyStart: "2026-02-10", history: [[APP, 20], [DISC, 30], [PROP, null]] },
  { code: "HB-006", name: "Trenord — Feeder Service", owner: "M. Rossi", source: "Inbound", country: "Italia", amount: 240000, durationYears: 2, renewal: 0.7, schedule: { "2026": 120000, "2027": 120000 }, contractStart: "2026-01-01", lastActivityDaysAgo: 60, historyStart: "2025-02-15", history: [[APP, 18], [DISC, 24], [PROP, 30], [SENT, 20], [WON, null]] },
  { code: "HB-007", name: "Porto di Genova — Logistica Passeggeri", owner: "G. Capuzzo", source: "Partner", country: "Italia", amount: 120000, durationYears: 2, renewal: 0.6, schedule: { "2026": 40000, "2027": 80000 }, contractStart: "2026-09-01", lastActivityDaysAgo: 5, historyStart: "2026-05-20", history: [[APP, null]] },

  // === Nuovi: Closed Won (vari paesi/sorgenti) ===
  { code: "HB-008", name: "Air France — Navetta CDG Staff", owner: "L. Ferrari", source: "Outbound", country: "Francia", amount: 310000, durationYears: 3, renewal: 0.7, schedule: { "2025": 80000, "2026": 120000, "2027": 110000 }, contractStart: "2025-06-01", lastActivityDaysAgo: 50, historyStart: "2025-01-20", history: [[APP, 18], [DISC, 27], [PROP, 33], [DEC, 22], [SENT, 18], [WON, null]] },
  { code: "HB-009", name: "Lufthansa — Crew Transfer Frankfurt", owner: "M. Rossi", source: "Referral", country: "Germania", amount: 480000, durationYears: 3, renewal: 0.8, schedule: { "2025": 120000, "2026": 180000, "2027": 180000 }, contractStart: "2025-04-01", lastActivityDaysAgo: 110, historyStart: "2024-11-10", history: [[APP, 24], [DISC, 30], [PROP, 45], [TEND, 28], [DEC, 24], [SENT, 22], [WON, null]] },
  { code: "HB-010", name: "Iberia — Shuttle Barajas", owner: "G. Capuzzo", source: "Inbound", country: "Spagna", amount: 95000, durationYears: 1, renewal: 0, schedule: { "2026": 95000 }, contractStart: "2026-02-01", lastActivityDaysAgo: 35, historyStart: "2025-12-05", history: [[APP, 14], [DISC, 18], [PROP, 20], [WON, null]] },
  { code: "HB-011", name: "SBB — Personale Zurigo HB", owner: "L. Ferrari", source: "Partner", country: "Svizzera", amount: 540000, durationYears: 4, renewal: 0.85, schedule: { "2026": 130000, "2027": 140000, "2028": 140000, "2029": 130000 }, contractStart: "2026-01-15", lastActivityDaysAgo: 18, historyStart: "2025-07-01", history: [[APP, 20], [DISC, 26], [PROP, 38], [DEC, 24], [SENT, 20], [WON, null]] },

  // === Nuovi: Closed Lost (alcuni Discovery → Closed Lost diretto) ===
  { code: "HB-012", name: "EasyJet — Transfer Malpensa", owner: "G. Capuzzo", source: "Outbound", country: "UK", amount: 160000, durationYears: 2, schedule: { "2026": 80000, "2027": 80000 }, contractStart: "2026-03-01", lastActivityDaysAgo: 140, historyStart: "2025-09-01", history: [[APP, 20], [DISC, 35], [LOST, null]] },
  { code: "HB-013", name: "Volotea — Navetta Verona", owner: "M. Rossi", source: "Inbound", country: "Italia", amount: 70000, durationYears: 1, schedule: { "2026": 70000 }, contractStart: "2026-04-01", lastActivityDaysAgo: 100, historyStart: "2025-11-15", history: [[APP, 18], [DISC, 28], [LOST, null]] },
  { code: "HB-014", name: "Renfe — Shuttle Madrid", owner: "L. Ferrari", source: "Outbound", country: "Spagna", amount: 220000, durationYears: 2, schedule: { "2026": 110000, "2027": 110000 }, contractStart: "2026-05-01", lastActivityDaysAgo: 160, historyStart: "2025-08-10", history: [[APP, 22], [DISC, 30], [PROP, 40], [LOST, null]] },
  { code: "HB-015", name: "Deutsche Bahn — Crew Munich", owner: "M. Rossi", source: "Referral", country: "Germania", amount: 300000, durationYears: 3, schedule: { "2026": 100000, "2027": 100000, "2028": 100000 }, contractStart: "2026-06-01", lastActivityDaysAgo: 90, historyStart: "2025-10-01", history: [[APP, 25], [DISC, 32], [LOST, null]] },
  { code: "HB-016", name: "Brussels Airlines — Staff Transfer", owner: "G. Capuzzo", source: "Outbound", country: "Francia", amount: 130000, durationYears: 2, schedule: { "2026": 65000, "2027": 65000 }, contractStart: "2026-04-15", lastActivityDaysAgo: 75, historyStart: "2025-12-01", history: [[APP, 20], [TEND, 30], [LOST, null]] },

  // === Nuovi: Aperti, alcuni BLOCCATI (molto tempo nella fase corrente) ===
  { code: "HB-017", name: "Aeroporti di Roma — Bus Apron", owner: "L. Ferrari", source: "Inbound", country: "Italia", amount: 350000, durationYears: 3, renewal: 0.7, schedule: { "2026": 110000, "2027": 120000, "2028": 120000 }, contractStart: "2026-10-01", lastActivityDaysAgo: 48, historyStart: "2026-01-10", history: [[APP, 25], [DISC, 30], [PROP, null]] },
  { code: "HB-018", name: "Swissport — Ground Handling Geneva", owner: "M. Rossi", source: "Partner", country: "Svizzera", amount: 410000, durationYears: 3, renewal: 0.75, schedule: { "2026": 130000, "2027": 140000, "2028": 140000 }, contractStart: "2026-11-01", lastActivityDaysAgo: 55, historyStart: "2026-02-01", history: [[APP, 28], [TEND, null]] },
  { code: "HB-019", name: "Aena — Servizi Palma", owner: "G. Capuzzo", source: "Outbound", country: "Spagna", amount: 175000, durationYears: 2, renewal: 0.6, schedule: { "2026": 85000, "2027": 90000 }, contractStart: "2026-09-15", lastActivityDaysAgo: 30, historyStart: "2026-03-01", history: [[APP, 22], [DISC, 28], [DEC, null]] },
  { code: "HB-020", name: "Trenitalia — Navetta AV", owner: "M. Rossi", source: "Inbound", country: "Italia", amount: 260000, durationYears: 2, renewal: 0.7, schedule: { "2026": 130000, "2027": 130000 }, contractStart: "2026-12-01", lastActivityDaysAgo: 8, historyStart: "2026-04-20", history: [[APP, 20], [DISC, null]] },

  // === Nuovi: Aperti recenti / vari ===
  { code: "HB-021", name: "ITA Airways — Crew Fiumicino", owner: "L. Ferrari", source: "Referral", country: "Italia", amount: 290000, durationYears: 3, renewal: 0.7, schedule: { "2026": 90000, "2027": 100000, "2028": 100000 }, contractStart: "2027-01-01", lastActivityDaysAgo: 6, historyStart: "2026-05-10", history: [[APP, 18], [DISC, 22], [PROP, null]] },
  { code: "HB-022", name: "Flixbus — Hub Torino", owner: "G. Capuzzo", source: "Inbound", country: "Italia", amount: 110000, durationYears: 1, renewal: 0, schedule: { "2026": 110000 }, contractStart: "2026-08-01", lastActivityDaysAgo: 3, historyStart: "2026-06-01", history: [[APP, null]] },
  { code: "HB-023", name: "Austrian Airlines — Vienna Staff", owner: "M. Rossi", source: "Outbound", country: "Germania", amount: 230000, durationYears: 2, renewal: 0.6, schedule: { "2026": 115000, "2027": 115000 }, contractStart: "2026-10-15", lastActivityDaysAgo: 26, historyStart: "2026-03-15", history: [[APP, 24], [DISC, 30], [PROP, null]] },
  { code: "HB-024", name: "TGV Lyria — Transfer Genève", owner: "L. Ferrari", source: "Partner", country: "Svizzera", amount: 150000, durationYears: 2, renewal: 0.65, schedule: { "2026": 75000, "2027": 75000 }, contractStart: "2026-09-01", lastActivityDaysAgo: 22, historyStart: "2026-04-01", history: [[APP, 20], [DISC, null]] },
  { code: "HB-025", name: "Eurostar — London Staff Shuttle", owner: "G. Capuzzo", source: "Outbound", country: "UK", amount: 200000, durationYears: 2, renewal: 0.6, schedule: { "2026": 100000, "2027": 100000 }, contractStart: "2026-11-15", lastActivityDaysAgo: 38, historyStart: "2026-02-20", history: [[APP, 25], [DISC, 33], [PROP, null]] },
];

// Tipo contratto (valori enum HubSpot esistenti) + nota per ogni deal, coerenti
// con i 7 originali. Tenuti qui così un seed da zero li ripristina identici.
const EXTRA: Record<string, { contractType: string; note: string }> = {
  "HB-001": { contractType: "pluriennale_fisso", note: "Incluso forecast 2025-2028" },
  "HB-002": { contractType: "pluriennale_variabile", note: "Revenue anno 2 da stimare" },
  "HB-003": { contractType: "pluriennale_run_up", note: "Struttura: 130k/150k/140k" },
  "HB-004": { contractType: "spot", note: "N/A" },
  "HB-005": { contractType: "pluriennale_fisso", note: "Budget approvato, attesa firma" },
  "HB-006": { contractType: "pluriennale_rinnovo", note: "KPMG ha chiesto breakdown" },
  "HB-007": { contractType: "pluriennale_variabile", note: "In valutazione" },
  "HB-008": { contractType: "pluriennale_fisso", note: "Forecast 2025-2027 incluso" },
  "HB-009": { contractType: "pluriennale_rinnovo", note: "Rinnovo triennale atteso" },
  "HB-010": { contractType: "spot", note: "Servizio stagionale una tantum" },
  "HB-011": { contractType: "pluriennale_fisso", note: "Budget pluriennale approvato" },
  "HB-012": { contractType: "pluriennale_variabile", note: "Perso su prezzo, scelto competitor" },
  "HB-013": { contractType: "spot", note: "Budget non confermato dal cliente" },
  "HB-014": { contractType: "pluriennale_variabile", note: "Stop dopo proposta, no budget" },
  "HB-015": { contractType: "pluriennale_fisso", note: "Perso in fase discovery" },
  "HB-016": { contractType: "pluriennale_variabile", note: "Gara annullata dal cliente" },
  "HB-017": { contractType: "pluriennale_fisso", note: "Proposta inviata, attesa risposta" },
  "HB-018": { contractType: "pluriennale_run_up", note: "In gara, struttura a run-up" },
  "HB-019": { contractType: "pluriennale_variabile", note: "Decisore coinvolto, follow-up in corso" },
  "HB-020": { contractType: "pluriennale_rinnovo", note: "Discovery in corso" },
  "HB-021": { contractType: "pluriennale_fisso", note: "Proposta in valutazione" },
  "HB-022": { contractType: "spot", note: "Primo contatto, hub singolo" },
  "HB-023": { contractType: "pluriennale_variabile", note: "Demo effettuata, attesa feedback" },
  "HB-024": { contractType: "pluriennale_rinnovo", note: "Discovery, possibile rinnovo" },
  "HB-025": { contractType: "pluriennale_variabile", note: "Proposta inviata" },
};

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// Mappa label→id delle fasi (serve per impostare dealstage).
async function getStageIds(token: string): Promise<Map<string, string>> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/pipelines/deals/default`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`GET pipeline fallita: HTTP ${res.status}\n${await res.text()}`);
  const data = (await res.json()) as { stages?: Array<{ id: string; label: string }> };
  const map = new Map<string, string>();
  for (const s of data.stages ?? []) map.set(s.label.trim().toLowerCase(), s.id);
  return map;
}

// Mappa deal_code→id dei deal esistenti.
async function getExistingByCode(token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let after: string | undefined;
  for (let i = 0; i < 25; i++) {
    const body = {
      limit: 100,
      properties: ["deal_code"],
      ...(after ? { after } : {}),
    };
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...body, filterGroups: [], sorts: [] }),
    });
    if (!res.ok) throw new Error(`search deals fallita: HTTP ${res.status}\n${await res.text()}`);
    const json = (await res.json()) as {
      results?: Array<{ id: string; properties?: { deal_code?: string } }>;
      paging?: { next?: { after?: string } };
    };
    for (const r of json.results ?? []) {
      const code = r.properties?.deal_code;
      if (code) map.set(code, r.id);
    }
    after = json.paging?.next?.after;
    if (!after) break;
  }
  return map;
}

function propsFor(spec: Spec, stageIds: Map<string, string>): Record<string, string> {
  const { json, stageLabel, closeDate } = buildHistory(spec);
  const stageId = stageIds.get(stageLabel.trim().toLowerCase());
  if (!stageId) throw new Error(`Fase non trovata in pipeline: "${stageLabel}" (${spec.code})`);
  const isOpenLast = spec.history[spec.history.length - 1][1] === null && ![WON, LOST].includes(stageLabel);
  const props: Record<string, string> = {
    deal_code: spec.code,
    dealname: spec.name,
    contract_owner: spec.owner,
    deal_source: spec.source,
    deal_country: spec.country,
    amount: String(spec.amount),
    dealstage: stageId,
    contract_start: spec.contractStart,
    contract_duration_years: String(spec.durationYears),
    revenue_schedule: JSON.stringify(spec.schedule),
    stage_history: json,
    last_activity_date: daysAgo(spec.lastActivityDaysAgo),
    // closedate: per i chiusi è la data di chiusura; per gli aperti una stima.
    closedate: isOpenLast ? addDays(closeDate, 60) : closeDate,
  };
  // renewal_probability solo se definita: un numero vuoto fa fallire la POST.
  if (spec.renewal != null) props.renewal_probability = String(spec.renewal);
  // contract_type + nota coerenti.
  const extra = EXTRA[spec.code];
  if (extra) {
    props.contract_type = extra.contractType;
    props.kpmg_note = extra.note;
  }
  return props;
}

async function upsert(
  token: string,
  spec: Spec,
  id: string | undefined,
  stageIds: Map<string, string>,
  dryRun: boolean,
): Promise<"created" | "updated" | "dry"> {
  const properties = propsFor(spec, stageIds);
  if (dryRun) return "dry";
  if (id) {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) throw new Error(`PATCH ${spec.code} fallita: HTTP ${res.status}\n${await res.text()}`);
    return "updated";
  }
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`POST ${spec.code} fallita: HTTP ${res.status}\n${await res.text()}`);
  return "created";
}

async function main(): Promise<void> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.error("❌ HUBSPOT_ACCESS_TOKEN non impostato (token App Privata pat-...).");
    process.exit(1);
    return;
  }
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

  console.log("🔎 Leggo fasi pipeline e deal esistenti...");
  const [stageIds, existing] = await Promise.all([getStageIds(token), getExistingByCode(token)]);
  console.log(`   Fasi: ${stageIds.size} · Deal esistenti: ${existing.size}`);
  console.log(`\n🌱 Upsert di ${SPECS.length} deal${dryRun ? " (DRY_RUN)" : ""}...\n`);

  let created = 0, updated = 0;
  for (const spec of SPECS) {
    const r = await upsert(token, spec, existing.get(spec.code), stageIds, dryRun);
    if (r === "created") created++;
    else if (r === "updated") updated++;
    console.log(`   ${r === "dry" ? "·" : "✅"} ${spec.code} ${spec.name} — ${r}`);
  }

  console.log(
    dryRun
      ? "\n🟡 DRY_RUN: nessuna modifica inviata."
      : `\n✅ Fatto. Creati ${created}, aggiornati ${updated}. Apri la dashboard / pagina Insight.`,
  );
}

main().catch((err) => {
  console.error("\n❌ Errore:", err instanceof Error ? err.message : err);
  process.exit(1);
});

export {};
