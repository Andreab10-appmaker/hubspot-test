import PptxGenJS from 'pptxgenjs';

export interface PptxTableSpec {
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

export interface PptxSlideSpec {
  title?: string;
  bullets?: string[];
  table?: PptxTableSpec;
}

export interface PptxSpec {
  filename: string;
  title?: string;
  subtitle?: string;
  slides: PptxSlideSpec[];
}

const DARK = '2D3E50';
const ACCENT = 'FF7A59';
const MUTED = '6B7280';
const BORDER = 'E5E7EB';
const ZEBRA = 'F7F8FA';

// Genera un .pptx (PowerPoint) formattato: slide titolo opzionale, poi una slide
// per ogni voce con titolo, elenco puntato e/o tabella con intestazione evidenziata.
export async function generatePptx(spec: PptxSpec): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.author = 'HubSpot AI Interface';

  // Slide titolo
  if (spec.title) {
    const s = pptx.addSlide();
    s.background = { color: DARK };
    s.addText(spec.title, {
      x: 0.6, y: 2.6, w: 12.1, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF', align: 'left',
    });
    if (spec.subtitle) {
      s.addText(spec.subtitle, { x: 0.6, y: 3.9, w: 12.1, h: 0.8, fontSize: 18, color: 'E5E7EB' });
    }
    s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.45, w: 1.6, h: 0.08, fill: { color: ACCENT } });
  }

  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  for (const spec1 of slides) {
    const s = pptx.addSlide();
    let y = 0.5;

    if (spec1.title) {
      s.addText(spec1.title, { x: 0.6, y, w: 12.1, h: 0.7, fontSize: 26, bold: true, color: DARK });
      s.addShape(pptx.ShapeType.line, {
        x: 0.6, y: y + 0.72, w: 12.1, h: 0, line: { color: ACCENT, width: 2 },
      });
      y += 1.0;
    }

    if (Array.isArray(spec1.bullets) && spec1.bullets.length > 0) {
      s.addText(
        spec1.bullets.map((b) => ({ text: String(b), options: { bullet: true, color: DARK, fontSize: 16 } })),
        { x: 0.7, y, w: 12.0, h: Math.min(0.4 * spec1.bullets.length + 0.2, 5), valign: 'top' }
      );
      y += Math.min(0.4 * spec1.bullets.length + 0.4, 5.2);
    }

    const t = spec1.table;
    if (t && Array.isArray(t.columns) && t.columns.length > 0) {
      const header = t.columns.map((c) => ({
        text: String(c),
        options: { bold: true, color: 'FFFFFF', fill: { color: DARK }, align: 'left' as const },
      }));
      const dataRows = (Array.isArray(t.rows) ? t.rows : []).map((row, ri) =>
        (Array.isArray(row) ? row : []).map((cell) => ({
          text: cell == null ? '' : String(cell),
          options: {
            color: DARK,
            align: (typeof cell === 'number' ? 'right' : 'left') as 'right' | 'left',
            fill: { color: ri % 2 === 1 ? ZEBRA : 'FFFFFF' },
          },
        }))
      );
      s.addTable([header, ...dataRows], {
        x: 0.6, y, w: 12.1,
        border: { type: 'solid', pt: 0.5, color: BORDER },
        fontSize: 12, fontFace: 'Arial', valign: 'middle',
        margin: [3, 4, 3, 4],
      });
    }

    if (!spec1.title && !spec1.bullets && !t) {
      s.addText('(slide vuota)', { x: 0.6, y: 0.6, w: 12, h: 1, fontSize: 14, color: MUTED });
    }
  }

  if (!spec.title && slides.length === 0) {
    const s = pptx.addSlide();
    s.addText('Nessun contenuto', { x: 0.6, y: 0.6, w: 12, h: 1, fontSize: 18, color: MUTED });
  }

  const data = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return Buffer.from(data);
}
