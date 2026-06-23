export interface CsvSpec {
  filename: string;
  headers?: string[];
  rows: Array<Array<string | number | null>>;
}

// Escape di un campo CSV secondo RFC 4180: racchiude tra virgolette se il
// valore contiene virgola, virgolette o a capo, raddoppiando le virgolette.
function escapeField(value: string | number | null): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Genera un CSV (UTF-8 con BOM, così Excel apre correttamente gli accenti).
export function generateCsv(spec: CsvSpec): Buffer {
  const lines: string[] = [];
  if (Array.isArray(spec.headers) && spec.headers.length > 0) {
    lines.push(spec.headers.map(escapeField).join(','));
  }
  const rows = Array.isArray(spec.rows) ? spec.rows : [];
  for (const row of rows) {
    lines.push((Array.isArray(row) ? row : []).map(escapeField).join(','));
  }
  const body = lines.join('\r\n');
  // BOM UTF-8 per compatibilità con Excel su Windows
  return Buffer.from('﻿' + body, 'utf8');
}
