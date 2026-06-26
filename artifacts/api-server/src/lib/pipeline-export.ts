import ExcelJS from "exceljs";

/**
 * Generatore dell'export "Pipeline Export": riproduce ESATTAMENTE il template
 * finanziario di riferimento (CRM_to_Excel.xlsx) a partire dai deal HubSpot.
 *
 * Struttura del template:
 *  - Riga 1: intestazione di gruppo "Revenue" (merge K1:R1) sopra le colonne anno.
 *  - Riga 2: 18 colonne — descrittive (A–J, azzurre) + colonne anno (K arancio,
 *    L–R verdi): 2023B, 2023A, 2025, 2026, 2027, 2028, 2029, 2030.
 *  - Righe dati: una per deal. Le colonne descrittive restano VUOTE (struttura da
 *    compilare), l'unica popolata è "Name" (= nome deal). L'importo del deal va
 *    nella colonna dell'ANNO della sua data di chiusura.
 *  - Riga TOTALE: somma per colonna anno con FORMULA Excel reale (=SUM).
 *
 * I formati numerici (€ contabile, interi tra parentesi, ecc.) replicano quelli
 * del file originale, colonna per colonna.
 */

export interface PipelineExportDeal {
  /** Nome del deal → colonna "Name" (H). */
  name?: string | null;
  /** Importo (€). Numero o stringa numerica grezza (es. "100000"). */
  amount?: number | string | null;
  /** Anno di chiusura (alternativa a closeDate). */
  closeYear?: number | string | null;
  /** Data di chiusura ISO (es. "2026-12-31..."): se presente, ne ricavo l'anno. */
  closeDate?: string | null;
  /**
   * Suddivisione canonica del fatturato per anno (anno→importo), dal dataset
   * pipeline (revenue_schedule). Se presente è LA verità: ogni importo va nella
   * colonna del suo anno. Così questo export coincide con il Revenue Spreading.
   * Se assente, si ripiega su amount+closeDate (comportamento storico).
   */
  schedule?: Record<string, number> | null;
}

export interface PipelineExportSpec {
  filename?: string;
  /** Etichetta del gruppo in riga 1 (default "Revenue"). */
  title?: string;
  /** Nome del foglio (default "Foglio1", come nell'originale). */
  sheetName?: string;
  deals?: PipelineExportDeal[];
}

// Fills (ARGB) — identici al file di riferimento.
const FILL_BLUE = "FFD9E2F3"; // colonne descrittive A–J
const FILL_ORANGE = "FFFBE4D5"; // colonna 2023B (K)
const FILL_GREEN = "FFC5E0B3"; // colonne 2023A + anni (L–R)
const BORDER_COLOR = "FFBFBFBF";

// Formati numerici per colonna anno (come nell'originale).
const FMT_ACC_PLAIN = '_-* #,##0_-;\\-* #,##0_-;_-* "-"??_-;_-@'; // K 2023B
const FMT_INT_PAREN = "#,##0;\\(#,##0\\);\\-"; // L 2023A, M 2025
const FMT_EUR = '_-[$€-2]* #,##0_-;_-[$€-2]* \\-#,##0_-;_-[$€-2]* "-"??_-;_-@'; // N–R

// Intestazioni descrittive (A–J) e anni (K–R), nell'ordine esatto del template.
const DESC_HEADERS = [
  "Client Type",
  "Business unit",
  "Venue Type",
  "Format/Venue Group",
  "Country",
  "International",
  "Intercompany (w/ CH)",
  "Name",
  "Old Name",
  "Type of service and underline assumptions",
];
// Etichette delle colonne anno (riga 2). 2023B/2023A sono testo; gli altri numeri.
const YEAR_HEADERS: Array<string | number> = [
  "2023B",
  "2023A",
  2025,
  2026,
  2027,
  2028,
  2029,
  2030,
];

// Larghezza dell'1ª colonna anno (K) = indice 11 (A=1).
const FIRST_YEAR_COL = 11; // K
const NAME_COL = 8; // H

// Mappa anno → indice colonna (1-based). K=11 (2023B/budget) resta vuota.
const YEAR_TO_COL: Record<number, number> = {
  2023: 12, // L = 2023A (Actual)
  2025: 13, // M
  2026: 14, // N
  2027: 15, // O
  2028: 16, // P
  2029: 17, // Q
  2030: 18, // R
};

// Formato numerico per ciascuna colonna anno (indice 1-based → fmt).
const COL_FMT: Record<number, string> = {
  11: FMT_ACC_PLAIN, // K 2023B
  12: FMT_INT_PAREN, // L 2023A
  13: FMT_INT_PAREN, // M 2025
  14: FMT_EUR, // N 2026
  15: FMT_EUR, // O 2027
  16: FMT_EUR, // P 2028
  17: FMT_EUR, // Q 2029
  18: FMT_EUR, // R 2030
};

// Larghezze colonna (descrittive + anni).
const COL_WIDTHS = [
  14, 14, 14, 18, 12, 12, 18, 28, 16, 34, 12, 12, 12, 14, 14, 14, 14, 14,
];

function colLetter(index1: number): string {
  // 1 → A, 26 → Z, 27 → AA ...
  let n = index1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function resolveYear(deal: PipelineExportDeal): number | null {
  if (deal.closeYear != null && deal.closeYear !== "") {
    const y = Number(deal.closeYear);
    if (Number.isFinite(y)) return Math.trunc(y);
  }
  if (deal.closeDate) {
    const m = /(\d{4})/.exec(String(deal.closeDate));
    if (m) return Number(m[1]);
  }
  return null;
}

export async function generatePipelineExport(
  spec: PipelineExportSpec,
): Promise<Buffer> {
  const title = spec.title?.trim() || "Revenue";
  const sheetName = spec.sheetName?.trim() || "Foglio1";
  const deals = Array.isArray(spec.deals) ? spec.deals : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "HubSpot AI Interface";

  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", xSplit: 0, ySplit: 2 }],
  });

  // Larghezze colonna.
  COL_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // --- Riga 1: gruppo "Revenue" sopra le colonne anno (K1:R1) ---
  ws.mergeCells(1, FIRST_YEAR_COL, 1, FIRST_YEAR_COL + YEAR_HEADERS.length - 1); // K1:R1
  const groupCell = ws.getCell(1, FIRST_YEAR_COL);
  groupCell.value = title;
  groupCell.font = { bold: true };
  groupCell.alignment = { horizontal: "center", vertical: "middle" };

  // --- Riga 2: intestazioni di colonna ---
  const headerRow = ws.getRow(2);
  headerRow.height = 30;
  const allHeaders: Array<string | number> = [...DESC_HEADERS, ...YEAR_HEADERS];
  allHeaders.forEach((h, i) => {
    const idx = i + 1;
    const cell = headerRow.getCell(idx);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    let fill = FILL_BLUE;
    if (idx === FIRST_YEAR_COL)
      fill = FILL_ORANGE; // K
    else if (idx > FIRST_YEAR_COL) fill = FILL_GREEN; // L–R
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.border = { bottom: { style: "thin", color: { argb: BORDER_COLOR } } };
  });

  // --- Righe dati: una per deal ---
  const firstDataRow = 3;
  let r = firstDataRow;
  for (const deal of deals) {
    const row = ws.getRow(r);
    row.getCell(NAME_COL).value = (deal.name ?? "").toString();

    const schedule = deal.schedule || undefined;
    const hasSchedule = schedule && Object.keys(schedule).length > 0;
    if (hasSchedule) {
      // Verità canonica: colloca il fatturato di ciascun anno nella sua colonna.
      for (const [yStr, vRaw] of Object.entries(schedule)) {
        const y = Number(yStr);
        const v = toAmount(vRaw);
        if (v == null) continue;
        const col = YEAR_TO_COL[y];
        if (col) row.getCell(col).value = v;
        // Anni fuori dal template fisso (es. 2024) non hanno colonna: ignorati
        // nel layout ufficiale ma comunque presenti nel Revenue Spreading.
      }
    } else {
      // Fallback storico: importo intero nell'anno di chiusura.
      const year = resolveYear(deal);
      const amount = toAmount(deal.amount);
      if (year != null && amount != null && YEAR_TO_COL[year]) {
        row.getCell(YEAR_TO_COL[year]).value = amount;
      }
    }

    // Formati numerici su tutte le colonne anno (anche se vuote).
    for (
      let c = FIRST_YEAR_COL;
      c <= FIRST_YEAR_COL + YEAR_HEADERS.length - 1;
      c++
    ) {
      row.getCell(c).numFmt = COL_FMT[c];
    }
    r++;
  }
  const lastDataRow = r - 1; // < firstDataRow se non ci sono deal

  // --- Riga TOTALE con FORMULE =SUM per ogni colonna anno ---
  const totalRow = ws.getRow(r);
  const totalLabelCell = totalRow.getCell(NAME_COL);
  totalLabelCell.value = "TOTALE";
  totalLabelCell.font = { bold: true };
  for (
    let c = FIRST_YEAR_COL;
    c <= FIRST_YEAR_COL + YEAR_HEADERS.length - 1;
    c++
  ) {
    const cell = totalRow.getCell(c);
    const letter = colLetter(c);
    if (lastDataRow >= firstDataRow) {
      cell.value = {
        formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
      };
    } else {
      cell.value = 0;
    }
    cell.font = { bold: true };
    cell.numFmt = COL_FMT[c];
    cell.border = { top: { style: "thin", color: { argb: BORDER_COLOR } } };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
