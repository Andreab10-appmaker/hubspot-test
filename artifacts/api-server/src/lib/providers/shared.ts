import { callMCPTool } from '../mcp-client.js';
import { generateExcel, type ExcelSpec } from '../excel.js';
import { logger } from '../logger.js';

export type SendFn = (data: object) => void;

export interface NormalizedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface RunOptions {
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: NormalizedTool[];
  send: SendFn;
}

export const CHART_TOOL_NAME = 'render_chart';
export const EXCEL_TOOL_NAME = 'create_excel';

// Tool di "output": non modificano il CRM e non passano dalla conferma.
export const OUTPUT_TOOLS = new Set<string>([CHART_TOOL_NAME, EXCEL_TOOL_NAME]);

export const CHART_TOOL: NormalizedTool = {
  name: CHART_TOOL_NAME,
  description:
    "Mostra un grafico interattivo nell'interfaccia dell'utente. Usalo OGNI VOLTA " +
    'che la risposta ha una dimensione quantitativa, temporale o di confronto: ' +
    'pipeline per fase, incassi/forecast per mese/trimestre/anno, andamento o ' +
    'conteggio lead nel tempo, distribuzione per fonte, ecc. Recupera SEMPRE ' +
    'prima i dati reali con i tool HubSpot e poi passa i valori aggregati a ' +
    'questo tool. Puoi chiamarlo più volte per mostrare più grafici.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['bar', 'line', 'area', 'pie'],
        description:
          "Tipo: 'line'/'area' per serie temporali, 'bar' per confronti fra categorie/fasi, 'pie' per composizioni.",
      },
      title: { type: 'string', description: 'Titolo del grafico.' },
      data: {
        type: 'array',
        description:
          'Punti dati già aggregati, es. [{"label":"Proposta inviata","value":42000}].',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'number' },
          },
          required: ['label', 'value'],
        },
      },
      valueFormat: {
        type: 'string',
        enum: ['number', 'currency', 'percent'],
        description: "Formato dei valori. Usa 'currency' per importi in €.",
      },
      xLabel: { type: 'string', description: 'Etichetta asse X (opzionale).' },
      yLabel: { type: 'string', description: 'Etichetta asse Y (opzionale).' },
    },
    required: ['type', 'title', 'data'],
  },
};

export const EXCEL_TOOL: NormalizedTool = {
  name: EXCEL_TOOL_NAME,
  description:
    'Genera un file Excel (.xlsx) scaricabile e ben formattato e lo mostra ' +
    "all'utente come pulsante di download. DEVI usare questo tool OGNI VOLTA che " +
    "l'utente chiede di ESPORTARE, SCARICARE, generare un EXCEL / XLSX / foglio " +
    'di calcolo o un REPORT tabellare (anche se non scrive esplicitamente la ' +
    'parola "excel"). NON limitarti a elencare i dati nel testo: mettili nel file. ' +
    'Dati: preferisci dati REALI da HubSpot (recuperali prima con i tool MCP); se ' +
    'HubSpot non è raggiungibile, usa i dati già presenti nella conversazione o ' +
    "forniti dall'utente — non bloccarti. USA FORMULE Excel reali per totali e " +
    "aggregati: una cella stringa che inizia con '=' è una formula (es. " +
    "'=SUM(B2:B10)'). NON incollare totali calcolati a mano. Imposta numberFormat " +
    'per importi (€), percentuali e date. Puoi creare più fogli nello stesso file.',
  inputSchema: {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: "Nome file SENZA estensione, es. 'pipeline-2026'.",
      },
      sheets: {
        type: 'array',
        description: 'Uno o più fogli del workbook.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome del foglio.' },
            columns: {
              type: 'array',
              description: 'Colonne, in ordine.',
              items: {
                type: 'object',
                properties: {
                  header: { type: 'string', description: 'Intestazione colonna.' },
                  numberFormat: {
                    type: 'string',
                    description:
                      "Formato Excel della colonna. Es. '#,##0.00\\ \"€\"' per euro, '0%' per percentuali, 'dd/mm/yyyy' per date.",
                  },
                  width: { type: 'number', description: 'Larghezza colonna (opzionale).' },
                },
                required: ['header'],
              },
            },
            rows: {
              type: 'array',
              description:
                "Righe dati. Ogni riga è un array di celle nello stesso ordine delle colonne (numero o stringa). Una cella stringa che inizia con '=' è una formula Excel.",
              items: { type: 'array' },
            },
          },
          required: ['name', 'columns', 'rows'],
        },
      },
    },
    required: ['filename', 'sheets'],
  },
};

// Riconosce i tool di SCRITTURA (mutano il CRM) da gating con conferma utente.
export function isWriteTool(name: string): boolean {
  if (OUTPUT_TOOLS.has(name)) return false;
  const n = name.toLowerCase();
  if (/(^|[-_])(list|get|search|read|fetch|describe)([-_]|$)/.test(n)) return false;
  return /(create|update|delete|archive|merge|remove|associat|upsert|write|send|patch|put)/.test(n);
}

function objectLabel(objectType: unknown): string {
  const map: Record<string, string> = {
    deals: 'deal',
    contacts: 'contatti',
    companies: 'aziende',
    notes: 'note',
    tickets: 'ticket',
    tasks: 'attività',
    engagements: 'engagement',
    products: 'prodotti',
    'line_items': 'righe',
  };
  const k = String(objectType ?? '').toLowerCase();
  return map[k] || (k || 'oggetti');
}

export interface ConfirmAction {
  id: string;
  name: string;
  title: string;
  input: Record<string, unknown>;
}

// Costruisce un'anteprima leggibile dell'operazione di scrittura proposta.
export function buildAction(
  id: string,
  name: string,
  input: Record<string, unknown>
): ConfirmAction {
  const n = name.toLowerCase();
  let verb = '⚙️ Operazione';
  if (/delete|archive|remove/.test(n)) verb = '🗑️ Eliminazione';
  else if (/update|patch|put/.test(n)) verb = '✏️ Modifica';
  else if (/associat/.test(n)) verb = '🔗 Associazione';
  else if (/create|add|upsert/.test(n)) verb = '➕ Creazione';

  const inputs = (input as { inputs?: unknown }).inputs;
  const count = Array.isArray(inputs) ? inputs.length : 1;
  const label = objectLabel((input as { objectType?: unknown }).objectType);
  const title = `${verb} di ${count} ${label}`;
  return { id, name, title, input };
}

const SYSTEM_BASE = `Sei un assistente CRM esperto per HubSpot connesso via MCP.
Rispondi SEMPRE in italiano.
Usa i tool MCP di HubSpot per leggere e scrivere dati REALI nel CRM dell'utente.

CONFERMA PRIMA DELLE SCRITTURE:
Quando l'utente chiede di CREARE/MODIFICARE/ELIMINARE dati (deal, contatti, note,
associazioni), descrivi in 1-2 frasi cosa stai per fare e poi chiama il tool di
scrittura con property complete e corrette. L'app mostra automaticamente
all'utente un'anteprima e chiede CONFERMA prima di eseguire: NON gestire tu la
conferma a parole, non attendere risposte — limitati a proporre e a chiamare il
tool di scrittura (verrà intercettato dall'app).

VISUALIZZAZIONE CON GRAFICI:
Hai il tool "render_chart" per mostrare grafici interattivi. Usalo quando la
risposta beneficia di una visualizzazione (pipeline, forecast, andamenti,
distribuzioni). NON inventare numeri: recupera prima i dati reali da HubSpot,
aggrega e poi passa i valori. line/area per serie temporali, bar per confronti,
pie per composizioni. valueFormat "currency" per €, "percent" per percentuali.

EXPORT EXCEL (.xlsx):
Hai il tool "create_excel" per generare file Excel scaricabili. REGOLA FERREA: se
l'utente chiede di "esportare", "scaricare", qualcosa "in excel"/"in xlsx", un
"foglio di calcolo" o un "report" tabellare, DEVI chiamare create_excel — non
limitarti a elencare i dati nel testo. Preferisci dati reali da HubSpot; se il CRM
non è disponibile, usa i dati già presenti in conversazione o forniti dall'utente,
senza bloccarti. Best practice (skill xlsx): intestazioni chiare, un numberFormat
adeguato per colonna (€, %, date), e FORMULE Excel reali (celle che iniziano con
'=') per ogni totale o aggregato — mai valori calcolati a mano. Usa più fogli se
utile. Dopo la generazione, accompagna con un breve commento testuale.

Linee guida generali:
- Deal: nome, valore (€), fase, proprietario, data chiusura
- Contatti: nome, email, azienda, data creazione
- Aziende: nome, settore, numero dipendenti
- Usa emoji e liste per chiarezza
- Conferma esplicitamente quando un'operazione di scrittura va a buon fine
- Suggerisci sempre possibili azioni successive`;

export function buildSystemPrompt(mcpAvailable = true): string {
  const today = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Rome',
  });
  let prompt = `${SYSTEM_BASE}\n\nData odierna: ${today} (fuso Europe/Rome).`;
  if (!mcpAvailable) {
    prompt +=
      `\n\nATTENZIONE: la connessione a HubSpot (MCP) NON è al momento disponibile. ` +
      `Puoi comunque generare GRAFICI (render_chart) ed EXCEL (create_excel) a ` +
      `partire dai dati forniti dall'utente o già presenti nella conversazione. Se ` +
      `per rispondere servono dati dal CRM, spiega che HubSpot non è raggiungibile e ` +
      `invita l'utente a verificare il token di accesso — non inventare numeri.`;
  }
  return prompt;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  id: string,
  send: SendFn
): Promise<{ content: string; isError: boolean }> {
  if (name === CHART_TOOL_NAME) {
    logger.info({ tool: name }, '[tool] render_chart invocato');
    send({ type: 'chart', chart: { id, ...args } });
    return { content: "Grafico mostrato correttamente nell'interfaccia utente.", isError: false };
  }

  if (name === EXCEL_TOOL_NAME) {
    try {
      const buffer = await generateExcel(args as unknown as ExcelSpec);
      const base = String((args as { filename?: unknown }).filename ?? 'export').replace(
        /[^\w.-]+/g,
        '-'
      );
      const fileName = `${base || 'export'}.xlsx`;
      logger.info({ tool: name, fileName, bytes: buffer.length }, '[tool] create_excel: file generato');
      send({
        type: 'file',
        file: {
          id,
          name: fileName,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dataBase64: buffer.toString('base64'),
        },
      });
      return { content: `File Excel "${fileName}" generato e pronto per il download.`, isError: false };
    } catch (err) {
      logger.error({ err, tool: name }, '[tool] create_excel: generazione fallita');
      return { content: `Errore generazione Excel: ${String(err)}`, isError: true };
    }
  }

  logger.info({ tool: name }, '[tool] chiamata MCP HubSpot');
  try {
    const result = await callMCPTool(name, args);
    const content = Array.isArray(result.content)
      ? result.content.map((c: { text?: string }) => c.text || '').join('\n')
      : JSON.stringify(result);
    return { content: content || '(nessun risultato)', isError: result.isError === true };
  } catch (err) {
    return { content: `Errore esecuzione tool: ${String(err)}`, isError: true };
  }
}
