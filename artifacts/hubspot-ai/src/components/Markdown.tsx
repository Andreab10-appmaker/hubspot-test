import { createElement, Fragment, type ReactNode } from "react";

/**
 * Renderer Markdown leggero e SENZA dipendenze esterne (niente react-markdown):
 * così funziona ovunque senza reinstallare pacchetti. Copre ciò che produce
 * l'assistente: heading, grassetto/corsivo, code inline e a blocco, liste
 * (ordinate/non), tabelle GFM, citazioni, link, righe orizzontali.
 * Costruisce elementi React (niente HTML grezzo ⇒ niente rischio injection).
 */

// --- Inline: **bold**, *italic*, `code`, [text](url) ----------------------
const INLINE_RULES: Array<{
  re: RegExp;
  el: (m: RegExpExecArray, key: string) => ReactNode;
}> = [
  { re: /`([^`]+)`/, el: (m, k) => <code key={k}>{m[1]}</code> },
  { re: /\*\*([^*]+)\*\*/, el: (m, k) => <strong key={k}>{m[1]}</strong> },
  { re: /\*([^*\n]+)\*/, el: (m, k) => <em key={k}>{m[1]}</em> },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    el: (m, k) => (
      <a key={k} href={m[2]} target="_blank" rel="noreferrer">
        {m[1]}
      </a>
    ),
  },
];

function renderInline(text: string, keyBase: string): ReactNode[] {
  let nodes: ReactNode[] = [text];
  INLINE_RULES.forEach((rule, ri) => {
    const next: ReactNode[] = [];
    nodes.forEach((node, ni) => {
      if (typeof node !== "string") {
        next.push(node);
        return;
      }
      let rest = node;
      let idx = 0;
      // re globale clonato per scorrere tutte le occorrenze nella stringa
      const re = new RegExp(rule.re.source, "g");
      let m: RegExpExecArray | null;
      let last = 0;
      while ((m = re.exec(rest)) !== null) {
        if (m.index > last) next.push(rest.slice(last, m.index));
        next.push(rule.el(m, `${keyBase}-${ri}-${ni}-${idx++}`));
        last = m.index + m[0].length;
      }
      if (last < rest.length) next.push(rest.slice(last));
    });
    nodes = next;
  });
  return nodes;
}

// --- Blocchi --------------------------------------------------------------
function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export default function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => `md-${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // riga vuota
    if (!line.trim()) {
      i++;
      continue;
    }

    // code fence ```
    if (/^```/.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // chiusura fence
      blocks.push(
        <pre key={k()}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(h[1].length + 1, 6);
      blocks.push(
        createElement(`h${level}`, { key: k() }, renderInline(h[2], k())),
      );
      i++;
      continue;
    }

    // riga orizzontale
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={k()} />);
      i++;
      continue;
    }

    // tabella GFM
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <table key={k()}>
          <thead>
            <tr>
              {header.map((c, ci) => (
                <th key={ci}>{renderInline(c, k())}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{renderInline(c, k())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // citazione
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={k()}>{renderInline(buf.join(" "), k())}</blockquote>,
      );
      continue;
    }

    // lista non ordinata
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={k()}>
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, k())}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // lista ordinata (con eventuali sotto-voci indentate, es. "  - Owner: ...")
    if (/^\s*\d+\.\s+/.test(line)) {
      const baseIndent = (/^(\s*)/.exec(line) as RegExpExecArray)[1].length;
      const startNum = parseInt(line.trim(), 10);
      const items: Array<{ main: string; subs: string[] }> = [];
      while (i < lines.length && lines[i].trim()) {
        const cur = lines[i];
        const indent = (/^(\s*)/.exec(cur) as RegExpExecArray)[1].length;
        const om = /^\s*\d+\.\s+(.*)$/.exec(cur);
        if (om && indent <= baseIndent + 1) {
          items.push({ main: om[1], subs: [] });
          i++;
          continue;
        }
        // riga più indentata → sotto-voce della voce numerata corrente
        if (indent > baseIndent && items.length) {
          items[items.length - 1].subs.push(cur.replace(/^\s*(?:[-*+]\s+)?/, ""));
          i++;
          continue;
        }
        break;
      }
      // `start` preserva la numerazione anche se il blocco viene spezzato.
      blocks.push(
        <ol key={k()} start={Number.isFinite(startNum) ? startNum : 1}>
          {items.map((it, ii) => (
            <li key={ii}>
              {renderInline(it.main, k())}
              {it.subs.length > 0 && (
                <ul>
                  {it.subs.map((s, si) => (
                    <li key={si}>{renderInline(s, k())}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // paragrafo (righe consecutive non vuote, non-blocco)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      blocks.push(
        <p key={k()}>
          {para.map((ln, li) => (
            <Fragment key={li}>
              {li > 0 && <br />}
              {renderInline(ln, k())}
            </Fragment>
          ))}
        </p>,
      );
    }
  }

  return <>{blocks}</>;
}
