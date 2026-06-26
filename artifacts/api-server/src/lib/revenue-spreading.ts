import ExcelJS from "exceljs";

/**
 * Generatore "Revenue Spreading" (3 fogli, output professionale e neutro).
 *
 * Il valore nominale del deal (amount) non riflette il fatturato pluriennale:
 * la closing date non coincide con l'inizio fatturazione e gli importi variano
 * per anno. A partire dai campi HubSpot del deal (contract_start, durata,
 * importo, revenue_schedule per-anno) produce:
 *   1) Deal — pipeline HubSpot (anagrafica e importo nominale)
 *   2) Revenue Spreading — fatturato per anno
 *   3) Cash Flow Mensile — fatturato per mese dell'anno target (default 2026)
 */

export interface RevenueDeal {
  code: string; // "HB-001"
  name: string;
  owner: string;
  stageLabel: string;
  closingDate: string; // ISO/yyyy-mm-dd
  contractStart: string; // ISO/yyyy-mm-dd
  amount: number; // valore nominale deal
  durationYears: number;
  typeLabel: string; // "Pluriennale fisso", "Spot", ...
  kpmgNote: string;
  schedule: Record<string, number>; // anno -> fatturato
  stageKind?: "won" | "proposal" | "discovery" | "other";
}

export interface RevenueSpreadingSpec {
  filename?: string;
  deals: RevenueDeal[];
  cashYear?: number; // anno del foglio cash flow (default 2026)
}

// Formato € a due sezioni (positivo;negativo). Le virgolette DEVONO essere
// bilanciate in entrambe le sezioni: un literal non terminato rende il formato
// invalido e Google Sheets mostra #VALUE! su tutte le celle.
const EUR = '#,##0" €";(#,##0" €")';
const C = {
  navy: "FF1F3864",
  amber: "FFFFF0CD",
  amberText: "FF7B2D00",
  rowRed: "FFFDECEA",
  orange: "FFE8622A",
  green: "FF1E6B2E",
  greenMid: "FF2E7D32",
  greenLight: "FFE2EFDA",
  greenCell: "FFE8F5E9",
  greenText: "FF1E4620",
  red: "FFC0392B",
  redText: "FF5D0000",
  zebra: "FFFFF5F5",
  white: "FFFFFFFF",
};

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}
function setRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  values: Array<string | number>,
  opts: {
    bg?: string;
    fontColor?: string;
    bold?: boolean;
    size?: number;
    height?: number;
    align?: Partial<ExcelJS.Alignment>;
    eurCols?: number[];
  } = {},
) {
  const row = ws.getRow(rowNumber);
  if (opts.height) row.height = opts.height;
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = v as ExcelJS.CellValue;
    if (opts.bg) fill(cell, opts.bg);
    cell.font = {
      bold: opts.bold ?? false,
      size: opts.size ?? 9,
      color: opts.fontColor ? { argb: opts.fontColor } : undefined,
    };
    if (opts.align) cell.alignment = opts.align;
    if (opts.eurCols?.includes(i + 1)) cell.numFmt = EUR;
  });
  return row;
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function isoDate(v: string): string {
  return (v || "").slice(0, 10);
}
function startParts(iso: string): { y: number; m: number } {
  const d = isoDate(iso);
  const [y, m] = d.split("-").map((x) => parseInt(x, 10));
  return { y: y || 0, m: m || 1 };
}

// Mesi dell'anno target in cui il contratto è attivo (1..12), in base a
// contract_start e durata. end = start + durata anni (esclusivo).
function activeMonths(deal: RevenueDeal, year: number): number[] {
  const s = startParts(deal.contractStart);
  const startIdx = s.y * 12 + (s.m - 1);
  const endIdx = startIdx + Math.round(deal.durationYears * 12); // esclusivo
  const out: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const idx = year * 12 + (m - 1);
    if (idx >= startIdx && idx < endIdx) out.push(m);
  }
  return out;
}

export async function generateRevenueSpreading(
  spec: RevenueSpreadingSpec,
): Promise<Buffer> {
  const deals = spec.deals || [];
  const cashYear = spec.cashYear ?? 2026;
  const wb = new ExcelJS.Workbook();

  // Anni coperti = unione delle chiavi di schedule (ordinate).
  const yearSet = new Set<number>();
  for (const d of deals)
    for (const y of Object.keys(d.schedule || {})) yearSet.add(parseInt(y, 10));
  const years = [...yearSet].filter((y) => y).sort((a, b) => a - b);

  // ===== Foglio 1: Deal dalla pipeline HubSpot =============================
  const s1 = wb.addWorksheet("1_Deal_HubSpot");
  s1.columns = [10, 28, 16, 14, 14, 14, 16, 10, 16, 22].map((w) => ({ width: w }));
  s1.mergeCells("A1:J1");
  setRow(s1, 1, ["Deal — Pipeline HubSpot"], {
    bg: C.navy, fontColor: C.white, bold: true, size: 13, height: 27.75,
    align: { horizontal: "center", vertical: "middle", wrapText: true },
  });
  setRow(s1, 2, [
    "Deal ID", "Deal Name", "Owner", "Stage", "Closing Date", "Contract Start",
    "Deal Amount (€)", "Duration\n(anni)", "Tipo Contratto", "Note",
  ], { bg: C.navy, fontColor: C.white, bold: true, height: 36, align: { horizontal: "center", vertical: "middle", wrapText: true } });

  let r = 3;
  for (const d of deals) {
    setRow(s1, r++, [
      d.code, d.name, d.owner, d.stageLabel, isoDate(d.closingDate),
      isoDate(d.contractStart), d.amount, d.durationYears, d.typeLabel, d.kpmgNote,
    ], { bg: C.white, height: 21.75, align: { vertical: "middle" }, eurCols: [7] });
  }
  s1.mergeCells(`A${r}:F${r}`);
  const t1 = setRow(s1, r, [
    "TOTALE (valore contrattuale nominale)",
  ], { bg: C.navy, fontColor: C.white, bold: true, height: 18, align: { horizontal: "right", vertical: "middle" } });
  const g1 = t1.getCell(7);
  g1.value = { formula: `SUM(G3:G${r - 1})` };
  fill(g1, C.navy);
  g1.font = { bold: true, size: 9, color: { argb: C.white } };
  g1.numFmt = EUR;

  // ===== Foglio 2: Revenue Spreading per anno =============================
  const s2 = wb.addWorksheet("2_Revenue_Spreading");
  const infoW = [10, 28, 14, 14, 13, 13, 9, 16];
  s2.columns = [...infoW, ...years.map(() => 14), 16].map((w) => ({ width: w }));
  const lastCol2 = 8 + years.length + 1; // colonne totali
  const colLetter = (n: number) => s2.getColumn(n).letter;
  const L = (n: number) => colLetter(n);

  s2.mergeCells(1, 1, 1, lastCol2);
  setRow(s2, 1, ["Revenue Spreading — Fatturato pluriennale per anno"], {
    bg: C.green, fontColor: C.white, bold: true, size: 13, height: 27.75,
    align: { horizontal: "center", vertical: "middle", wrapText: true },
  });
  s2.mergeCells(2, 1, 2, lastCol2);
  setRow(s2, 2, ["Fatturato di ogni deal suddiviso per anno (campo revenue_schedule di HubSpot)."], {
    bg: C.greenLight, fontColor: C.greenText, height: 21.75,
    align: { horizontal: "center", vertical: "middle", wrapText: true },
  });

  // R3: gruppo info (A:H) + anni + TOTALE
  s2.mergeCells(3, 1, 3, 8);
  const r3 = s2.getRow(3);
  r3.height = 21.75;
  const g3 = r3.getCell(1);
  g3.value = "INFO DEAL (da HubSpot)";
  fill(g3, C.green);
  g3.font = { bold: true, size: 9, color: { argb: C.white } };
  g3.alignment = { horizontal: "center", vertical: "middle" };
  years.forEach((y, i) => {
    const cell = r3.getCell(9 + i);
    cell.value = String(y);
    fill(cell, C.greenMid);
    cell.font = { bold: true, size: 9, color: { argb: C.white } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  const totHdr = r3.getCell(lastCol2);
  totHdr.value = "TOTALE";
  fill(totHdr, C.greenMid);
  totHdr.font = { bold: true, size: 9, color: { argb: C.white } };
  totHdr.alignment = { horizontal: "center", vertical: "middle" };

  // R4: intestazioni colonne
  const head2 = [
    "Deal ID", "Deal Name", "Owner", "Stage", "Closing\nDate", "Contract\nStart",
    "Durata\n(anni)", "Tipo", ...years.map((y) => `Rev ${y}\n(€)`), "Totale\nContratto (€)",
  ];
  setRow(s2, 4, head2, { bg: C.navy, fontColor: C.white, bold: true, height: 36, align: { horizontal: "center", vertical: "middle", wrapText: true } });

  let r2 = 5;
  for (const d of deals) {
    const row = s2.getRow(r2);
    row.height = 21.75;
    const base = [d.code, d.name, d.owner, d.stageLabel, isoDate(d.closingDate), isoDate(d.contractStart), d.durationYears, d.typeLabel];
    base.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v as ExcelJS.CellValue;
      fill(cell, C.white);
      cell.font = { size: 9 };
      cell.alignment = { vertical: "middle" };
    });
    let total = 0;
    years.forEach((y, i) => {
      const cell = row.getCell(9 + i);
      const v = d.schedule[String(y)];
      cell.value = v ? v : "-";
      if (v) total += v;
      fill(cell, C.greenCell);
      cell.font = { size: 9 };
      cell.numFmt = EUR;
      cell.alignment = { vertical: "middle" };
    });
    const tcell = row.getCell(lastCol2);
    tcell.value = total;
    fill(tcell, C.greenCell);
    tcell.font = { bold: true, size: 9 };
    tcell.numFmt = EUR;
    r2++;
  }
  // Totale per anno
  s2.mergeCells(r2, 1, r2, 8);
  const tr = s2.getRow(r2);
  tr.height = 24;
  const tlbl = tr.getCell(1);
  tlbl.value = "TOTALE FATTURATO PER ANNO";
  fill(tlbl, C.navy);
  tlbl.font = { bold: true, size: 9, color: { argb: C.white } };
  tlbl.alignment = { horizontal: "right", vertical: "middle" };
  for (let c = 9; c <= lastCol2; c++) {
    const cell = tr.getCell(c);
    cell.value = { formula: `SUM(${L(c)}5:${L(c)}${r2 - 1})` };
    fill(cell, C.navy);
    cell.font = { bold: true, size: 9, color: { argb: C.white } };
    cell.numFmt = EUR;
    cell.alignment = { horizontal: "right", vertical: "middle" };
  }

  // ===== Foglio 3: Cash Flow Mensile =====================================
  const s3 = wb.addWorksheet(`3_Cash_Flow_Mensile_${cashYear}`);
  s3.columns = [32, ...Array(12).fill(10), 12].map((w) => ({ width: w }));
  const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  s3.mergeCells("A1:N1");
  setRow(s3, 1, [`Cash Flow Mensile ${cashYear} — Fatturato atteso per mese`], {
    bg: C.red, fontColor: C.white, bold: true, size: 13, height: 27.75,
    align: { horizontal: "center", vertical: "middle", wrapText: true },
  });
  s3.mergeCells("A2:N2");
  setRow(s3, 2, ["Forecast mensile del fatturato per deal, derivato dal revenue spreading."], {
    bg: C.rowRed, fontColor: C.redText, height: 19.5, align: { horizontal: "center", vertical: "middle", wrapText: true },
  });
  setRow(s3, 3, ["Deal / Cliente", ...MONTHS, `TOT ${cashYear}`], {
    bg: C.red, fontColor: C.white, bold: true, height: 21.75, align: { horizontal: "center", vertical: "middle", wrapText: true },
  });

  let r3n = 4;
  for (const d of deals) {
    const months = activeMonths(d, cashYear);
    const yearRev = d.schedule[String(cashYear)] || 0;
    const per = months.length ? Math.round(yearRev / months.length) : 0;
    const short = d.name.split("—")[0].trim();
    const annot =
      d.stageKind === "proposal" ? " (proposal)" :
      d.stageKind === "discovery" ? " (discovery)" :
      d.typeLabel.toLowerCase() === "spot" ? " (spot)" : "";
    const row = s3.getRow(r3n);
    row.height = 19.5;
    const zebra = (r3n - 4) % 2 === 1;
    const a = row.getCell(1);
    a.value = `${d.code} — ${short}${annot}`;
    fill(a, zebra ? C.zebra : C.white);
    a.font = { size: 9 };
    a.alignment = { vertical: "middle" };
    for (let m = 1; m <= 12; m++) {
      const cell = row.getCell(m + 1);
      cell.value = months.includes(m) && per ? per : "-";
      fill(cell, zebra ? C.zebra : C.white);
      cell.font = { size: 9 };
      cell.numFmt = EUR;
      cell.alignment = { vertical: "middle" };
    }
    const tot = row.getCell(14);
    tot.value = { formula: `SUM(B${r3n}:M${r3n})` };
    fill(tot, zebra ? C.zebra : C.white);
    tot.font = { bold: true, size: 9 };
    tot.numFmt = EUR;
    r3n++;
  }
  const tm = s3.getRow(r3n);
  tm.height = 24;
  const tmA = tm.getCell(1);
  tmA.value = "TOTALE MESE (€)";
  fill(tmA, C.red);
  tmA.font = { bold: true, size: 9, color: { argb: C.white } };
  for (let c = 2; c <= 14; c++) {
    const cell = tm.getCell(c);
    const letter = s3.getColumn(c).letter;
    cell.value = { formula: `SUM(${letter}4:${letter}${r3n - 1})` };
    fill(cell, C.red);
    cell.font = { bold: true, size: 9, color: { argb: C.white } };
    cell.numFmt = EUR;
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
