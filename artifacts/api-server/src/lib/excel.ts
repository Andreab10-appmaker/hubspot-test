import ExcelJS from 'exceljs';

export interface ExcelColumnSpec {
  header: string;
  numberFormat?: string;
  width?: number;
}

export interface ExcelSheetSpec {
  name: string;
  columns: ExcelColumnSpec[];
  rows: Array<Array<string | number | null>>;
}

export interface ExcelSpec {
  filename: string;
  sheets: ExcelSheetSpec[];
}

const HEADER_FILL = 'FF2D3E50';
const ZEBRA_FILL = 'FFF7F8FA';
const BORDER_COLOR = 'FFE5E7EB';

// Genera un .xlsx ben formattato: intestazione in evidenza, righe a zebra,
// formati numerici per colonna, larghezze auto, riga intestazione bloccata,
// e supporto a FORMULE Excel (una cella stringa che inizia con "=").
export async function generateExcel(spec: ExcelSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HubSpot AI Interface';

  const sheets =
    Array.isArray(spec.sheets) && spec.sheets.length > 0
      ? spec.sheets
      : [{ name: 'Foglio1', columns: [], rows: [] }];

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name || 'Foglio1', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const columns = Array.isArray(sheet.columns) ? sheet.columns : [];

    // Intestazione
    const headerRow = ws.addRow(columns.map((c) => c.header ?? ''));
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: 'middle' };
    });

    // Righe dati: una cella stringa che inizia con "=" diventa una formula.
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    for (const row of rows) {
      const cells: ExcelJS.CellValue[] = (Array.isArray(row) ? row : []).map((cell) => {
        if (typeof cell === 'string' && cell.startsWith('=')) {
          return { formula: cell.slice(1) } as ExcelJS.CellValue;
        }
        return cell as ExcelJS.CellValue;
      });
      ws.addRow(cells);
    }

    // Formati numerici e larghezze colonna
    columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.numberFormat) col.numFmt = c.numberFormat;
      if (typeof c.width === 'number' && c.width > 0) {
        col.width = c.width;
      } else {
        let max = (c.header ?? '').length;
        col.eachCell({ includeEmpty: false }, (cell) => {
          const v = cell.value;
          let s = '';
          if (v != null) {
            if (typeof v === 'object' && 'formula' in v) {
              s = String((v as { result?: unknown }).result ?? '');
            } else {
              s = String(v);
            }
          }
          if (s.length > max) max = s.length;
        });
        col.width = Math.min(Math.max(max + 2, 10), 60);
      }
    });

    // Bordi leggeri + zebra sulle righe dati
    ws.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.border = { bottom: { style: 'thin', color: { argb: BORDER_COLOR } } };
      });
      if (rowNumber > 1 && rowNumber % 2 === 1) {
        row.eachCell({ includeEmpty: false }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
        });
      }
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
