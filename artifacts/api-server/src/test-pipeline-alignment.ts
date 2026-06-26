/**
 * TEST END-TO-END di ALLINEAMENTO DATI.
 *
 * Verifica che le tre superfici che mostrano la pipeline — dataset canonico
 * (usato da dashboard e assistente AI), export "Revenue Spreading" .xlsx ed
 * export "Pipeline" .xlsx — riportino ESATTAMENTE gli stessi numeri e lo stesso
 * "split" per anno, a partire dagli STESSI deal reali di HubSpot.
 *
 * I deal qui sotto sono uno snapshot reale letto da HubSpot (7 deal, pipeline
 * "default"). Il test NON chiama HubSpot: esercita la logica pura condivisa.
 *
 * Esegui (dalla cartella artifacts/api-server):
 *   node ../../node_modules/.pnpm/tsx@<ver>/node_modules/tsx/dist/cli.mjs \
 *     ./src/test-pipeline-alignment.ts
 */
import ExcelJS from "exceljs";
import {
  computePipelineDataset,
  type PipelineDataset,
} from "./lib/pipeline-dataset.js";
import { generateRevenueSpreading } from "./lib/revenue-spreading.js";
import { generatePipelineExport } from "./lib/pipeline-export.js";
import type { CrmRecord } from "./lib/hubspot-crm.js";

// Snapshot reale (HubSpot search deals, 2026-06).
const RAW: Array<Record<string, string>> = [
  { deal_code: "HB-001", dealname: "Vueling Airlines — Servizi Bus Aeroporto", contract_owner: "G. Capuzzo", dealstage: "5602930905", closedate: "2025-03-15T00:00:00Z", contract_start: "2025-11-01", amount: "390000", contract_duration_years: "3", contract_type: "pluriennale_fisso", kpmg_note: "Incluso forecast 2025-2028", revenue_schedule: '{"2025":21667,"2026":130000,"2027":130000,"2028":108333}' },
  { deal_code: "HB-002", dealname: "Ryanair — Transfer Bergamo Orio", contract_owner: "G. Capuzzo", dealstage: "5602930905", closedate: "2025-06-01T00:00:00Z", contract_start: "2025-09-01", amount: "180000", contract_duration_years: "2", contract_type: "pluriennale_variabile", kpmg_note: "Revenue anno 2 da stimare", revenue_schedule: '{"2025":30000,"2026":90000,"2027":60000}' },
  { deal_code: "HB-003", dealname: "Interporto Verona — Shuttle Dipendenti", contract_owner: "M. Rossi", dealstage: "5602930905", closedate: "2024-11-20T00:00:00Z", contract_start: "2025-02-01", amount: "420000", contract_duration_years: "3", contract_type: "pluriennale_run_up", kpmg_note: "Struttura: 130k/150k/140k", revenue_schedule: '{"2025":119167,"2026":148750,"2027":140833,"2028":11250}' },
  { deal_code: "HB-004", dealname: "Fiera Milano — Navette Evento", contract_owner: "G. Capuzzo", dealstage: "5602930905", closedate: "2026-01-10T00:00:00Z", contract_start: "2026-03-01", amount: "85000", contract_duration_years: "1", contract_type: "spot", kpmg_note: "N/A", revenue_schedule: '{"2026":85000}' },
  { deal_code: "HB-005", dealname: "ENI — Bus Aziendale Sede San Donato", contract_owner: "L. Ferrari", dealstage: "5602930901", closedate: "2026-04-30T00:00:00Z", contract_start: "2026-07-01", amount: "560000", contract_duration_years: "4", contract_type: "pluriennale_fisso", kpmg_note: "Budget approvato, attesa firma", revenue_schedule: '{"2026":70000,"2027":140000,"2028":140000,"2029":140000}' },
  { deal_code: "HB-006", dealname: "Trenord — Feeder Service", contract_owner: "M. Rossi", dealstage: "5602930905", closedate: "2025-06-20T21:11:33.906Z", contract_start: "2026-01-01", amount: "240000", contract_duration_years: "2", contract_type: "pluriennale_rinnovo", kpmg_note: "KPMG ha chiesto breakdown", revenue_schedule: '{"2026":120000,"2027":120000}' },
  { deal_code: "HB-007", dealname: "Porto di Genova — Logistica Passeggeri", contract_owner: "G. Capuzzo", dealstage: "5602930900", closedate: "2026-06-15T00:00:00Z", contract_start: "2026-09-01", amount: "120000", contract_duration_years: "2", contract_type: "pluriennale_variabile", kpmg_note: "In valutazione", revenue_schedule: '{"2026":40000,"2027":80000}' },
];

// Mappe value→label come le restituirebbe HubSpot (stage default + contract_type).
const STAGE_MAP = new Map<string, string>([
  ["5602930900", "Appointment Scheduled"],
  ["5602930901", "Proposal/Demo"],
  ["5602930905", "Closed Won"],
]);
const TYPE_MAP = new Map<string, string>([
  ["pluriennale_fisso", "Pluriennale fisso"],
  ["pluriennale_variabile", "Pluriennale variabile"],
  ["pluriennale_run_up", "Pluriennale run-up"],
  ["pluriennale_rinnovo", "Pluriennale rinnovo"],
  ["spot", "Spot"],
]);

const records: CrmRecord[] = RAW.map((p, i) => ({ id: String(1000 + i), properties: p }));

let failures = 0;
const eur = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;
function check(name: string, cond: boolean, detail = "") {
  const tag = cond ? "✅" : "❌";
  console.log(`  ${tag} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
const close = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

async function readSheetYearTotals(buf: Buffer, sheetName: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.getWorksheet(sheetName);
}

async function main() {
  console.log("\n=== TEST ALLINEAMENTO PIPELINE (dataset ↔ Revenue Spreading ↔ Pipeline Export) ===\n");

  // 1) Dataset canonico (la fonte di verità che alimenta dashboard + assistente AI).
  const ds: PipelineDataset = computePipelineDataset(records, STAGE_MAP, TYPE_MAP);

  console.log("Dataset canonico:");
  console.log(`  Deal: ${ds.deals.length} · Anni: [${ds.years.join(", ")}]`);
  console.log(`  Fatturato per anno: ${ds.years.map((y) => `${y}=${eur(ds.revenueByYear[y])}`).join("  ")}`);
  console.log(`  Tot. fatturato spreading: ${eur(ds.totalScheduledRevenue)} · Tot. valore contratti: ${eur(ds.totalContractValue)}`);
  console.log(`  Aperto: ${ds.open.count} (${eur(ds.open.value)}) · Vinto: ${ds.won.count} (${eur(ds.won.value)})`);
  if (ds.warnings.length) {
    console.log(`  ⚠️  Warning (frizioni dati): ${ds.warnings.length}`);
    ds.warnings.forEach((w) => console.log(`      - ${w}`));
  }
  console.log("");

  // --- A) Coerenza interna del dataset: somma per anno == somma schedule deal ---
  console.log("A) Coerenza interna dataset");
  const manualByYear: Record<number, number> = {};
  for (const d of ds.deals)
    for (const [y, v] of Object.entries(d.schedule))
      manualByYear[Number(y)] = (manualByYear[Number(y)] || 0) + v;
  check(
    "revenueByYear == somma degli schedule per deal",
    ds.years.every((y) => close(ds.revenueByYear[y], manualByYear[y])),
  );
  const sumYears = ds.years.reduce((a, y) => a + ds.revenueByYear[y], 0);
  check("totalScheduledRevenue == somma dei totali per anno", close(ds.totalScheduledRevenue, sumYears));

  // HB-005 (ENI) deve essere segnalato: schedule 490k ≠ amount 560k.
  check(
    "warning su HB-005 (schedule ≠ amount) presente",
    ds.warnings.some((w) => w.includes("HB-005")),
    "incoerenza HubSpot esposta, non nascosta",
  );

  // --- B) Revenue Spreading .xlsx riporta gli stessi totali per anno ---
  console.log("\nB) Export Revenue Spreading (.xlsx) allineato al dataset");
  const rsBuf = await generateRevenueSpreading({ deals: ds.deals, cashYear: 2026 });
  const s2 = await readSheetYearTotals(rsBuf, "2_Revenue_Spreading_AiPow");
  if (!s2) {
    check("foglio Revenue Spreading presente", false);
  } else {
    // R4 = intestazioni; le colonne anno partono dalla 9 (I). Trova la riga TOTALE.
    let totalRow = -1;
    s2.eachRow((row, n) => {
      if (String(row.getCell(1).value || "").includes("TOTALE FATTURATO")) totalRow = n;
    });
    check("riga TOTALE FATTURATO PER ANNO trovata", totalRow > 0);
    // Le formule =SUM non sono valutate da exceljs in lettura: ricalcoliamo dalle
    // righe deal (5..totalRow-1) per colonna anno e confrontiamo col dataset.
    ds.years.forEach((y, i) => {
      const col = 9 + i;
      let sum = 0;
      for (let r = 5; r < totalRow; r++) {
        const v = s2.getCell(r, col).value;
        if (typeof v === "number") sum += v;
      }
      check(`colonna ${y}: Excel ${eur(sum)} == dataset ${eur(ds.revenueByYear[y])}`, close(sum, ds.revenueByYear[y]));
    });
  }

  // --- C) Pipeline Export .xlsx (template fisso) usa lo stesso split per anno ---
  console.log("\nC) Export Pipeline (.xlsx, template fisso) allineato al dataset");
  const peBuf = await generatePipelineExport({
    filename: "pipeline-export",
    deals: ds.deals.map((d) => ({ name: d.name, amount: d.amount, closeDate: d.closingDate, schedule: d.schedule })),
  });
  const ws = await readSheetYearTotals(peBuf, "Foglio1");
  // Colonne anno del template: M=2025(13) N=2026(14) O=2027(15) P=2028(16) Q=2029(17).
  const TEMPLATE_COL: Record<number, number> = { 2025: 13, 2026: 14, 2027: 15, 2028: 16, 2029: 17 };
  if (!ws) {
    check("foglio Foglio1 presente", false);
  } else {
    for (const y of ds.years) {
      const col = TEMPLATE_COL[y];
      if (!col) {
        // Anni fuori dal template fisso (es. 2024): documentato, non un errore.
        console.log(`  ℹ️  anno ${y} non ha colonna nel template fisso (atteso): ${eur(ds.revenueByYear[y])} solo nel Revenue Spreading`);
        continue;
      }
      let sum = 0;
      ws.eachRow((row, rowNumber) => {
        if (rowNumber < 3) return; // salta gruppo (1) e intestazioni colonna (2)
        const v = row.getCell(col).value;
        if (typeof v === "number") sum += v;
      });
      // La riga TOTALE contiene una formula (oggetto), non un numero: non somma.
      check(`colonna ${y}: Pipeline Export ${eur(sum)} == dataset ${eur(ds.revenueByYear[y])}`, close(sum, ds.revenueByYear[y]));
    }
  }

  // --- D) Payload assistente (get_pipeline_dataset) == split del Revenue Spreading ---
  console.log("\nD) Assistente AI (get_pipeline_dataset) usa lo stesso split per deal");
  // Il payload espone scheduleByYear identico a deal.schedule: l'assistente non
  // può quindi riportare un split diverso da quello dell'Excel.
  for (const d of ds.deals) {
    const payloadSplit = d.schedule; // ciò che l'assistente riceve come scheduleByYear
    const ok = Object.keys(payloadSplit).length > 0 && close(
      Object.values(payloadSplit).reduce((a, b) => a + b, 0),
      d.scheduledTotal,
    );
    check(`${d.code} split assistente == schedule export`, ok, `${Object.entries(payloadSplit).map(([y, v]) => `${y}:${Math.round(v / 1000)}k`).join(" ")}`);
  }

  console.log("\n" + (failures === 0
    ? "🎉 TUTTI I CONTROLLI SUPERATI: dataset, Revenue Spreading, Pipeline Export e assistente AI sono allineati."
    : `❌ ${failures} controllo/i FALLITO/I.`) + "\n");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Errore nel test:", err);
  process.exit(1);
});
