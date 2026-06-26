/**
 * TEST delle ANALISI FUNNEL + PROIEZIONE (logica pura, no HubSpot).
 *
 * Dataset sintetico ma realistico (8 deal) con risposte calcolate a mano, per
 * verificare che il motore risponda correttamente alle 6 domande target e che
 * la proiezione del fatturato sia coerente.
 *
 * Esegui (da artifacts/api-server):
 *   node ../../node_modules/.pnpm/tsx@<ver>/node_modules/tsx/dist/cli.mjs \
 *     ./src/test-deal-analytics.ts
 */
import { computePipelineDataset } from "./lib/pipeline-dataset.js";
import { computeDealAnalytics } from "./lib/deal-analytics.js";
import type { CrmRecord } from "./lib/hubspot-crm.js";

const NOW = "2026-06-26";
const STAGE_ORDER = [
  "Appointment Scheduled", "Discovery call", "Proposal/Demo", "Tenders",
  "Decision maker brought-in", "Contract Sent", "Closed Won", "Closed Lost",
];
const sh = (...t: Array<[string, string, string | null]>) =>
  JSON.stringify(t.map(([stage, enteredAt, exitedAt]) => ({ stage, enteredAt, exitedAt })));

// code, name, source, country, stage(corrente), amount, durata, lastActivity, renewal, schedule, history
const RAW: Array<Record<string, string>> = [
  { deal_code: "D1", dealname: "Deal 1", deal_source: "Inbound", deal_country: "Italia", dealstage: "Closed Won", amount: "400000", contract_duration_years: "2", last_activity_date: "2025-03-02", renewal_probability: "0.7", revenue_schedule: '{"2025":200000,"2026":200000}', stage_history: sh(["Appointment Scheduled","2025-01-01","2025-01-11"],["Discovery call","2025-01-11","2025-01-31"],["Proposal/Demo","2025-01-31","2025-03-02"],["Closed Won","2025-03-02",null]) },
  { deal_code: "D2", dealname: "Deal 2", deal_source: "Outbound", deal_country: "Francia", dealstage: "Closed Won", amount: "80000", contract_duration_years: "1", last_activity_date: "2026-06-20", revenue_schedule: '{"2025":80000}', stage_history: sh(["Appointment Scheduled","2025-02-01","2025-02-21"],["Discovery call","2025-02-21","2025-03-23"],["Closed Won","2025-03-23",null]) },
  { deal_code: "D3", dealname: "Deal 3", deal_source: "Inbound", deal_country: "Italia", dealstage: "Closed Lost", amount: "150000", contract_duration_years: "1", last_activity_date: "2025-04-10", revenue_schedule: '{"2025":150000}', stage_history: sh(["Appointment Scheduled","2025-03-01","2025-03-11"],["Discovery call","2025-03-11","2025-04-10"],["Closed Lost","2025-04-10",null]) },
  { deal_code: "D4", dealname: "Deal 4", deal_source: "Outbound", deal_country: "Francia", dealstage: "Closed Lost", amount: "120000", contract_duration_years: "1", last_activity_date: "2025-05-01", revenue_schedule: '{"2025":120000}', stage_history: sh(["Appointment Scheduled","2025-04-01","2025-05-01"],["Closed Lost","2025-05-01",null]) },
  { deal_code: "D5", dealname: "Deal 5", deal_source: "Referral", deal_country: "Spagna", dealstage: "Proposal/Demo", amount: "300000", contract_duration_years: "2", last_activity_date: "2026-02-25", renewal_probability: "0.6", revenue_schedule: '{"2026":150000,"2027":150000}', stage_history: sh(["Appointment Scheduled","2026-01-01","2026-01-21"],["Discovery call","2026-01-21","2026-02-20"],["Proposal/Demo","2026-02-20",null]) },
  { deal_code: "D6", dealname: "Deal 6", deal_source: "Inbound", deal_country: "Italia", dealstage: "Appointment Scheduled", amount: "90000", contract_duration_years: "1", last_activity_date: "2026-06-25", revenue_schedule: '{"2026":90000}', stage_history: sh(["Appointment Scheduled","2026-06-01",null]) },
  { deal_code: "D7", dealname: "Deal 7", deal_source: "Referral", deal_country: "Spagna", dealstage: "Closed Won", amount: "520000", contract_duration_years: "2", last_activity_date: "2025-08-19", renewal_probability: "0.5", revenue_schedule: '{"2025":260000,"2026":260000}', stage_history: sh(["Appointment Scheduled","2025-05-01","2025-05-21"],["Discovery call","2025-05-21","2025-06-20"],["Proposal/Demo","2025-06-20","2025-08-19"],["Closed Won","2025-08-19",null]) },
  { deal_code: "D8", dealname: "Deal 8", deal_source: "Outbound", deal_country: "Francia", dealstage: "Discovery call", amount: "200000", contract_duration_years: "2", last_activity_date: "2026-03-01", renewal_probability: "0.6", revenue_schedule: '{"2026":100000,"2027":100000}', stage_history: sh(["Appointment Scheduled","2026-01-05","2026-01-25"],["Discovery call","2026-01-25",null]) },
];

const records: CrmRecord[] = RAW.map((p, i) => ({ id: String(2000 + i), properties: p }));

let fails = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};

function main() {
  console.log("\n=== TEST ANALISI FUNNEL + PROIEZIONE ===\n");
  const ds = computePipelineDataset(records, new Map(), new Map());
  const a = computeDealAnalytics(ds.deals, { now: NOW, stageOrder: STAGE_ORDER, inactivityDays: 21, stuckDays: 30 });

  console.log("Totali:", JSON.stringify(a.totals));

  console.log("\nQ5) Win rate per paese");
  const best = a.winRateByCountry.countries[0];
  check("paese migliore = Spagna (100%)", best.country === "Spagna" && best.winRate === 1, `${best.country} ${best.winRate}`);
  check("win rate complessivo = 0.6", a.winRateByCountry.overallWinRate === 0.6, String(a.winRateByCountry.overallWinRate));

  console.log("\nQ6) Discovery → Closed Lost diretto");
  check("conteggio = 1 (D3)", a.stageTransitions.discoveryToClosedLost.count === 1, a.stageTransitions.discoveryToClosedLost.deals.map((d) => d.code).join(","));

  console.log("\nQ3) Deal senza attività da 3 settimane");
  check("count = 2 (D5, D8)", a.inactiveDeals.count === 2, a.inactiveDeals.deals.map((d) => `${d.code}:${d.daysSinceActivity}g`).join(" "));
  check("soglia = 21 giorni", a.inactiveDeals.thresholdDays === 21);

  console.log("\nQ4) Ciclo di vendita per fascia di valore");
  const byb = Object.fromEntries(a.salesCycleByValue.buckets.map((b) => [b.bucket, b.avgCycleDays]));
  check("<100k = 50g", byb["lt100k"] === 50, String(byb["lt100k"]));
  check("300–500k = 60g", byb["300-500k"] === 60, String(byb["300-500k"]));
  check("≥500k = 110g", byb["gte500k"] === 110, String(byb["gte500k"]));
  check("valore più alto → ciclo più lungo", byb["gte500k"] > byb["lt100k"]);
  check("media complessiva = 73g", a.salesCycleByValue.overallAvgDays === 73, String(a.salesCycleByValue.overallAvgDays));

  console.log("\nQ2) Fasi dove i deal si bloccano");
  check("fase più lenta = Proposal/Demo (45g medi)", a.stuckStages[0].stage === "Proposal/Demo" && a.stuckStages[0].avgDaysInStage === 45, `${a.stuckStages[0].stage} ${a.stuckStages[0].avgDaysInStage}g`);
  const stuckMap = Object.fromEntries(a.stuckStages.map((s) => [s.stage, s.currentlyStuck]));
  check("bloccati ora: Discovery 1 + Proposal 1", stuckMap["Discovery call"] === 1 && stuckMap["Proposal/Demo"] === 1, JSON.stringify(stuckMap));

  console.log("\nQ1) Velocità funnel per sorgente (giorni medi a chiusura)");
  const src = Object.fromEntries(a.funnelVelocityBySource.map((s) => [s.source, s.avgDaysToClose]));
  check("Inbound = 50g", src["Inbound"] === 50, String(src["Inbound"]));
  check("Outbound = 40g", src["Outbound"] === 40, String(src["Outbound"]));
  check("Referral = 110g", src["Referral"] === 110, String(src["Referral"]));

  console.log("\nProiezione fatturato oltre la durata del contratto");
  const p = ds.projectedByYear;
  console.log(`  proiettato: ${ds.projectionYears.map((y) => `${y}=${(p[y] / 1000)}k`).join("  ")}`);
  check("2027 = 270.000 €", p[2027] === 270000, String(p[2027]));
  check("2028 = 420.000 €", p[2028] === 420000, String(p[2028]));
  check("2029 = 420.000 €", p[2029] === 420000, String(p[2029]));
  check("2030 = 150.000 €", p[2030] === 150000, String(p[2030]));

  console.log("\n" + (fails === 0 ? "🎉 TUTTI I CONTROLLI SUPERATI: analisi e proiezione coerenti." : `❌ ${fails} controllo/i FALLITO/I.`) + "\n");
  process.exit(fails === 0 ? 0 : 1);
}
main();
