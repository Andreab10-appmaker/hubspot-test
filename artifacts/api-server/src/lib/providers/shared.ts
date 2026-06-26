import { callMCPTool } from "../mcp-client.js";
import { generateExcel, type ExcelSpec } from "../excel.js";
import {
  generatePipelineExport,
  type PipelineExportSpec,
} from "../pipeline-export.js";
import { generateRevenueSpreading } from "../revenue-spreading.js";
import { buildPipelineDataset } from "../pipeline-dataset.js";
import { buildDealAnalytics } from "../deal-analytics.js";
import { generateCsv, type CsvSpec } from "../csv.js";
import { generatePdf, type PdfSpec } from "../pdf.js";
import { generatePptx, type PptxSpec } from "../pptx.js";
import { logger } from "../logger.js";

export type SendFn = (data: object) => void;

export interface NormalizedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface RunOptions {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: NormalizedTool[];
  send: SendFn;
}

export const CHART_TOOL_NAME = "render_chart";
export const EXCEL_TOOL_NAME = "create_excel";
export const PIPELINE_EXPORT_TOOL_NAME = "create_pipeline_export";
export const REVENUE_SPREADING_TOOL_NAME = "create_revenue_spreading";
export const PIPELINE_DATASET_TOOL_NAME = "get_pipeline_dataset";
export const DEAL_ANALYTICS_TOOL_NAME = "get_deal_analytics";
export const CSV_TOOL_NAME = "create_csv";
export const PDF_TOOL_NAME = "create_pdf";
export const PPTX_TOOL_NAME = "create_pptx";

// Tool di "output": non modificano il CRM e non passano dalla conferma.
export const OUTPUT_TOOLS = new Set<string>([
  CHART_TOOL_NAME,
  EXCEL_TOOL_NAME,
  PIPELINE_EXPORT_TOOL_NAME,
  REVENUE_SPREADING_TOOL_NAME,
  CSV_TOOL_NAME,
  PDF_TOOL_NAME,
  PPTX_TOOL_NAME,
]);

export const CHART_TOOL: NormalizedTool = {
  name: CHART_TOOL_NAME,
  description:
    "Mostra un grafico interattivo nell'interfaccia dell'utente. Usalo OGNI VOLTA " +
    "che la risposta ha una dimensione quantitativa, temporale o di confronto: " +
    "pipeline per fase, incassi/forecast per mese/trimestre/anno, andamento o " +
    "conteggio lead nel tempo, distribuzione per fonte, ecc. Recupera SEMPRE " +
    "prima i dati reali con i tool HubSpot e poi passa i valori aggregati a " +
    "questo tool. Puoi chiamarlo più volte per mostrare più grafici.",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["bar", "line", "area", "pie"],
        description:
          "Tipo: 'line'/'area' per serie temporali, 'bar' per confronti fra categorie/fasi, 'pie' per composizioni.",
      },
      title: { type: "string", description: "Titolo del grafico." },
      data: {
        type: "array",
        description:
          'Punti dati già aggregati, es. [{"label":"Proposta inviata","value":42000}].',
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "number" },
          },
          required: ["label", "value"],
        },
      },
      valueFormat: {
        type: "string",
        enum: ["number", "currency", "percent"],
        description: "Formato dei valori. Usa 'currency' per importi in €.",
      },
      xLabel: { type: "string", description: "Etichetta asse X (opzionale)." },
      yLabel: { type: "string", description: "Etichetta asse Y (opzionale)." },
    },
    required: ["type", "title", "data"],
  },
};

export const EXCEL_TOOL: NormalizedTool = {
  name: EXCEL_TOOL_NAME,
  description:
    "Genera un file Excel (.xlsx) scaricabile e ben formattato e lo mostra " +
    "all'utente come pulsante di download. DEVI usare questo tool OGNI VOLTA che " +
    "l'utente chiede di ESPORTARE, SCARICARE, generare un EXCEL / XLSX / foglio " +
    "di calcolo o un REPORT tabellare (anche se non scrive esplicitamente la " +
    'parola "excel"). NON limitarti a elencare i dati nel testo: mettili nel file. ' +
    "Dati: preferisci dati REALI da HubSpot (recuperali prima con i tool MCP); se " +
    "HubSpot non è raggiungibile, usa i dati già presenti nella conversazione o " +
    "forniti dall'utente — non bloccarti. USA FORMULE Excel reali per totali e " +
    "aggregati: una cella stringa che inizia con '=' è una formula (es. " +
    "'=SUM(B2:B10)'). NON incollare totali calcolati a mano. Imposta numberFormat " +
    "per importi (€), percentuali e date. Puoi creare più fogli nello stesso file.",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Nome file SENZA estensione, es. 'pipeline-2026'.",
      },
      sheets: {
        type: "array",
        description: "Uno o più fogli del workbook.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nome del foglio." },
            columns: {
              type: "array",
              description: "Colonne, in ordine.",
              items: {
                type: "object",
                properties: {
                  header: {
                    type: "string",
                    description: "Intestazione colonna.",
                  },
                  numberFormat: {
                    type: "string",
                    description:
                      "Formato Excel della colonna. Es. '#,##0.00\\ \"€\"' per euro, '0%' per percentuali, 'dd/mm/yyyy' per date.",
                  },
                  width: {
                    type: "number",
                    description: "Larghezza colonna (opzionale).",
                  },
                },
                required: ["header"],
              },
            },
            rows: {
              type: "array",
              description:
                "Righe dati. Ogni riga è un array di celle nello stesso ordine delle colonne (numero o stringa). Una cella stringa che inizia con '=' è una formula Excel.",
              items: { type: "array" },
            },
          },
          required: ["name", "columns", "rows"],
        },
      },
    },
    required: ["filename", "sheets"],
  },
};

export const PIPELINE_EXPORT_TOOL: NormalizedTool = {
  name: PIPELINE_EXPORT_TOOL_NAME,
  description:
    'Genera lo specifico export ufficiale "Pipeline Export" (.xlsx) della pipeline ' +
    "vendite, riproducendo ESATTAMENTE il template finanziario aziendale: " +
    'intestazione di gruppo "Revenue", colonne descrittive (Client Type, Business ' +
    "unit, Venue Type, Country, ecc.) e colonne anno 2023B/2023A/2025–2030 con " +
    "formati € contabili e riga TOTALE con formule =SUM. USA QUESTO TOOL (non " +
    'create_excel) quando l\'utente chiede la "Pipeline Export" o di esportare la ' +
    "pipeline nel formato/template ufficiale. " +
    "PROCEDURA: recupera prima i deal REALI della pipeline da HubSpot (nome, " +
    'amount, data di chiusura/closedate) e passali in "deals". Il tool si occupa ' +
    "di TUTTA la formattazione: tu fornisci solo i dati grezzi. Ogni deal finisce " +
    "su una riga e il suo importo viene collocato AUTOMATICAMENTE nella colonna " +
    "dell'anno della sua data di chiusura. Le colonne descrittive restano vuote " +
    "(struttura da compilare). Se HubSpot non è raggiungibile, usa i deal già in " +
    "conversazione o 2-3 deal di esempio per mostrare il formato.",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Nome file SENZA estensione, es. 'pipeline-export'.",
      },
      title: {
        type: "string",
        description:
          'Etichetta del gruppo in riga 1 (opzionale, default "Revenue").',
      },
      deals: {
        type: "array",
        description:
          "I deal della pipeline da esportare (dati grezzi da HubSpot).",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: 'Nome del deal (colonna "Name").',
            },
            amount: {
              type: "number",
              description:
                "Importo del deal in € (numero grezzo, senza formattazione).",
            },
            closeDate: {
              type: "string",
              description:
                "Data di chiusura ISO (es. '2026-12-31'): ne viene ricavato l'anno per collocare l'importo.",
            },
            closeYear: {
              type: "number",
              description:
                "Anno di chiusura, in alternativa a closeDate (es. 2026).",
            },
          },
          required: ["name"],
        },
      },
    },
    required: ["filename", "deals"],
  },
};

export const PIPELINE_DATASET_TOOL: NormalizedTool = {
  name: PIPELINE_DATASET_TOOL_NAME,
  description:
    "FONTE DI VERITÀ della pipeline. Restituisce il dataset canonico dei deal " +
    "calcolato DIRETTAMENTE dal server (stessa identica logica degli export Excel " +
    "'Revenue Spreading'/'Pipeline' e della dashboard): per ogni deal il fatturato " +
    "è già suddiviso per anno (revenue spreading), più i totali per anno, per fase, " +
    "vinto/aperto e le eventuali incoerenze. USA SEMPRE questo tool per QUALSIASI " +
    "domanda su pipeline, fatturato/incassi per anno, forecast, split pluriennale, " +
    "valore per fase: NON ricavare i numeri a mano dai tool MCP e NON inventare una " +
    "tua suddivisione. I numeri che riporti all'utente DEVONO essere questi, così " +
    "coincidono con l'Excel scaricabile. Lo split per anno = campo revenue_schedule " +
    "del deal (con fallback deterministico se assente).",
  inputSchema: { type: "object", properties: {} },
};

export const DEAL_ANALYTICS_TOOL: NormalizedTool = {
  name: DEAL_ANALYTICS_TOOL_NAME,
  description:
    "Analisi del FUNNEL deal, calcolata dal server in modo deterministico (stessi " +
    "numeri della pagina Insight dell'interfaccia). USA SEMPRE questo tool per " +
    "domande su: velocità di avanzamento nel funnel per SORGENTE del deal; in quali " +
    "FASI i deal si BLOCCANO (tempo medio per fase e deal fermi); deal SENZA ATTIVITÀ " +
    "da N giorni/settimane; CICLO DI VENDITA medio per fascia di VALORE; WIN RATE per " +
    "PAESE; TRANSIZIONI di fase incl. quante trattative passano da Discovery call " +
    "direttamente a Closed Lost. Restituisce funnelVelocityBySource, stuckStages, " +
    "inactiveDeals, salesCycleByValue, winRateByCountry e stageTransitions. NON " +
    "calcolare queste metriche a mano dai tool MCP: usa SOLO questi numeri, così le " +
    "tue risposte coincidono con l'interfaccia. Tempi in giorni, win rate 0–1.",
  inputSchema: { type: "object", properties: {} },
};

export const REVENUE_SPREADING_TOOL: NormalizedTool = {
  name: REVENUE_SPREADING_TOOL_NAME,
  description:
    'Genera l\'export ufficiale "Revenue Spreading" (.xlsx, 3 fogli: HubSpot ' +
    "Export, Revenue Spreading per anno, Cash Flow mensile) — IDENTICO al file che " +
    "l'utente scarica dal pulsante 'Esporta Revenue Spreading' dell'interfaccia. " +
    "I dati vengono letti dal server dal dataset canonico HubSpot: NON devi passare " +
    "i deal, ci pensa il tool. USA QUESTO TOOL quando l'utente chiede di esportare/" +
    "scaricare la pipeline, il revenue spreading, il fatturato pluriennale o il cash " +
    "flow. È l'unico modo per garantire che il file coincida con interfaccia e " +
    "assistente. NON usare create_excel o create_pipeline_export per il revenue spreading.",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Nome file SENZA estensione (default 'revenue-spreading').",
      },
      cashYear: {
        type: "number",
        description: "Anno del foglio Cash Flow mensile (default 2026).",
      },
    },
  },
};

export const CSV_TOOL: NormalizedTool = {
  name: CSV_TOOL_NAME,
  description:
    "Genera un file CSV scaricabile (separatore virgola, UTF-8). Usalo quando " +
    "l'utente vuole i dati grezzi/tabellari da reimportare altrove o aprire in " +
    "Excel. Recupera prima i dati reali da HubSpot (o usa quelli in conversazione).",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Nome file SENZA estensione, es. 'contatti'.",
      },
      headers: {
        type: "array",
        description: "Intestazioni di colonna (opzionale ma consigliato).",
        items: { type: "string" },
      },
      rows: {
        type: "array",
        description: "Righe: ogni riga è un array di celle (stringa o numero).",
        items: { type: "array" },
      },
    },
    required: ["filename", "rows"],
  },
};

export const PDF_TOOL: NormalizedTool = {
  name: PDF_TOOL_NAME,
  description:
    "Genera un report PDF scaricabile e ben formattato (titolo, tabella con " +
    "intestazione evidenziata, righe a zebra, totali in grassetto). Usalo quando " +
    "l'utente chiede un report/PDF stampabile. Una riga la cui prima cella contiene " +
    '"TOTALE" viene evidenziata. Recupera prima i dati reali da HubSpot o usa quelli ' +
    "già presenti in conversazione.",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Nome file SENZA estensione, es. 'report-pipeline'.",
      },
      title: { type: "string", description: "Titolo del report (opzionale)." },
      subtitle: {
        type: "string",
        description: "Sottotitolo, es. periodo (opzionale).",
      },
      columns: {
        type: "array",
        description: "Colonne in ordine.",
        items: {
          type: "object",
          properties: {
            header: { type: "string", description: "Intestazione colonna." },
            align: {
              type: "string",
              enum: ["left", "right", "center"],
              description: "Allineamento (numeri: 'right').",
            },
            width: {
              type: "number",
              description: "Larghezza in punti (opzionale).",
            },
          },
          required: ["header"],
        },
      },
      rows: {
        type: "array",
        description:
          "Righe: ogni riga è un array di celle (stringa o numero) nello stesso ordine delle colonne.",
        items: { type: "array" },
      },
    },
    required: ["filename", "columns", "rows"],
  },
};

export const PPTX_TOOL: NormalizedTool = {
  name: PPTX_TOOL_NAME,
  description:
    "Genera una presentazione PowerPoint (.pptx) scaricabile e formattata. Usala " +
    "quando l'utente chiede una presentazione/slide/deck. Ogni slide può avere " +
    "titolo, elenco puntato e/o una tabella. Recupera prima i dati reali da HubSpot " +
    "o usa quelli già in conversazione.",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Nome file SENZA estensione, es. 'review-q1'.",
      },
      title: {
        type: "string",
        description: "Titolo della slide di copertina (opzionale).",
      },
      subtitle: {
        type: "string",
        description: "Sottotitolo di copertina (opzionale).",
      },
      slides: {
        type: "array",
        description: "Le slide di contenuto.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Titolo della slide." },
            bullets: {
              type: "array",
              description: "Punti elenco (opzionale).",
              items: { type: "string" },
            },
            table: {
              type: "object",
              description: "Tabella opzionale nella slide.",
              properties: {
                columns: {
                  type: "array",
                  items: { type: "string" },
                  description: "Intestazioni.",
                },
                rows: {
                  type: "array",
                  items: { type: "array" },
                  description: "Righe (array di celle).",
                },
              },
              required: ["columns", "rows"],
            },
          },
        },
      },
    },
    required: ["filename", "slides"],
  },
};

// Riconosce i tool di SCRITTURA (mutano il CRM) da gating con conferma utente.
export function isWriteTool(name: string): boolean {
  if (OUTPUT_TOOLS.has(name)) return false;
  const n = name.toLowerCase();
  if (/(^|[-_])(list|get|search|read|fetch|describe)([-_]|$)/.test(n))
    return false;
  return /(create|update|delete|archive|merge|remove|associat|upsert|write|send|patch|put)/.test(
    n,
  );
}

function objectLabel(objectType: unknown): string {
  const map: Record<string, string> = {
    deals: "deal",
    contacts: "contatti",
    companies: "aziende",
    notes: "note",
    tickets: "ticket",
    tasks: "attività",
    engagements: "engagement",
    products: "prodotti",
    line_items: "righe",
  };
  const k = String(objectType ?? "").toLowerCase();
  return map[k] || k || "oggetti";
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
  input: Record<string, unknown>,
): ConfirmAction {
  const n = name.toLowerCase();
  let verb = "⚙️ Operazione";
  if (/delete|archive|remove/.test(n)) verb = "🗑️ Eliminazione";
  else if (/update|patch|put/.test(n)) verb = "✏️ Modifica";
  else if (/associat/.test(n)) verb = "🔗 Associazione";
  else if (/create|add|upsert/.test(n)) verb = "➕ Creazione";

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

PIPELINE E FATTURATO — FONTE DI VERITÀ UNICA (REGOLA FERREA):
Per QUALSIASI domanda su pipeline, fatturato/incassi per anno, forecast, "split"
pluriennale, revenue spreading, valore per fase o cash flow, DEVI prima chiamare
"get_pipeline_dataset". Quel tool restituisce i dati canonici calcolati dal server
con la STESSA identica logica degli export Excel e della dashboard. I numeri e lo
SPLIT per anno che riporti all'utente devono essere ESATTAMENTE quelli del dataset
(campo scheduleByYear di ogni deal e revenueByYear per i totali). NON ricavare il
fatturato per anno a mano dall'amount o dalla data di chiusura, NON applicare criteri
tuoi: lo split è già fatto (revenue_schedule). Così le tue risposte coincidono
sempre con l'Excel che l'utente scarica. Se il dataset segnala warning (es. schedule
che non somma all'amount), puoi menzionarli.
Quando l'utente vuole SCARICARE/esportare la pipeline o il revenue spreading, usa
"create_revenue_spreading" (genera lo stesso file del pulsante dell'interfaccia):
NON costruirlo a mano con create_excel.
Il dataset include anche "projectedRevenueByYear": il fatturato STIMATO oltre la
durata dei contratti (rinnovi). Tienilo distinto dal fatturato contrattualizzato e,
se lo citi, spiega che è una proiezione (vedi projectionAssumptions).

ANALISI DEL FUNNEL (REGOLA FERREA):
Per domande su velocità nel funnel per sorgente, fasi dove i deal si bloccano, deal
senza attività da X settimane, ciclo di vendita medio per valore, win rate per paese,
o quante trattative passano da Discovery a Closed Lost, DEVI usare il tool
"get_deal_analytics". Riporta ESATTAMENTE i suoi numeri (tempi in giorni, win rate in
0–1 → mostrali in %), così le risposte coincidono con la pagina Insight. Non stimare
a mano dai tool MCP. Se il tool segnala "notes" (es. deal senza stage_history esclusi),
puoi menzionarle.

EXPORT E FILE SCARICABILI:
Hai tool che generano file scaricabili mostrati come pulsante di download:
- create_revenue_spreading → export UFFICIALE "Revenue Spreading" (.xlsx, 3 fogli):
  IDENTICO al download dell'interfaccia. È la scelta giusta per esportare pipeline,
  fatturato pluriennale, revenue spreading o cash flow. I dati li legge il server.
- create_excel → foglio Excel (.xlsx) generico con formule e formati (per tabelle
  NON legate alla pipeline/revenue spreading).
- create_pipeline_export → export "Pipeline Export" (.xlsx) nel template a colonne
  anno fisse 2023B/2023A/2025–2030. Se lo usi, passa per ogni deal anche "schedule"
  (anno→importo) preso da get_pipeline_dataset, così coincide col Revenue Spreading.
- create_csv → dati grezzi tabellari (.csv)
- create_pdf → report PDF stampabile (titolo + tabella formattata)
- create_pptx → presentazione PowerPoint (.pptx) con slide, elenchi e tabelle
REGOLA FERREA: se l'utente chiede di "esportare", "scaricare", un file, un report,
un foglio di calcolo, un PDF o una presentazione, DEVI chiamare il tool adatto — non
limitarti a elencare i dati nel testo. Scegli il formato dall'intento: pipeline/
revenue/forecast → create_revenue_spreading; "excel/foglio" generico → create_excel;
"csv/dati grezzi" → create_csv; "report/pdf/stampabile" → create_pdf;
"presentazione/slide/deck" → create_pptx. Preferisci dati reali da HubSpot; se il CRM
non è disponibile, usa i dati già in conversazione o forniti dall'utente, senza
bloccarti. Per Excel: intestazioni chiare, numberFormat adeguato (€, %, date) e
FORMULE reali (celle che iniziano con '=') per i totali, mai calcolati a mano. Dopo
la generazione, accompagna sempre con un breve commento testuale.

ETICHETTE DI STATO LEGGIBILI (REGOLA FERREA):
I valori di fase/stato in HubSpot sono spesso ID interni o chiavi tecniche
(es. dealstage = "5602930905" o "appointmentscheduled", lifecyclestage =
"salesqualifiedlead"). NON mostrarli MAI così all'utente. PRIMA di presentare
qualsiasi fase deal (dealstage), lifecycle (lifecyclestage) o altra property di
tipo enumeration — in TESTO, TABELLE e soprattutto nelle ETICHETTE dei GRAFICI
(render_chart) — risolvi SEMPRE il valore nella sua label "parlante" usando le
opzioni della property (chiama hubspot-get-property con objectType e propertyName,
campo "options": ogni voce ha value→label, in displayOrder). Esempi: "5602930905"
→ "Closed Won"; "appointmentscheduled" → "Appointment Scheduled"; mantieni anche
l'ordine di displayOrder quando elenchi/raggruppi per fase. Se non riesci a
risolvere una label, dillo, ma non incollare l'ID grezzo come se fosse il nome.

Linee guida generali:
- Deal: nome, valore (€), fase, proprietario, data chiusura
- Contatti: nome, email, azienda, data creazione
- Aziende: nome, settore, numero dipendenti
- Usa emoji e liste per chiarezza
- Conferma esplicitamente quando un'operazione di scrittura va a buon fine
- Suggerisci sempre possibili azioni successive`;

export type AgentMode = "build" | "plan";

export function buildSystemPrompt(
  mcpAvailable = true,
  mode: AgentMode = "build",
): string {
  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Rome",
  });
  let prompt = `${SYSTEM_BASE}\n\nData odierna: ${today} (fuso Europe/Rome).`;
  if (mode === "plan") {
    prompt +=
      `\n\nMODALITÀ PIANO (SOLA LETTURA): sei in modalità di analisi. NON modificare ` +
      `il CRM: niente creazioni, modifiche, eliminazioni o associazioni (i tool di ` +
      `scrittura sono disabilitati). Limitati a LEGGERE i dati, analizzarli e proporre ` +
      `un piano d'azione chiaro e concreto (cosa faresti, su quali oggetti e perché), ` +
      `con eventuali grafici o file di supporto. Concludi indicando che, per eseguire, ` +
      `l'utente può passare alla modalità Operativa.`;
  }
  if (!mcpAvailable) {
    prompt +=
      `\n\nATTENZIONE: la connessione a HubSpot (MCP) NON è al momento disponibile. ` +
      `Puoi comunque generare GRAFICI ed EXPORT (Excel/CSV/PDF/PowerPoint) a partire ` +
      `dai dati forniti dall'utente o già presenti nella conversazione. Se per ` +
      `rispondere servono dati dal CRM, spiega che HubSpot non è raggiungibile e ` +
      `invita l'utente a verificare il token di accesso — non inventare numeri.`;
  }
  return prompt;
}

// Registro estensibile dei generatori di file scaricabili (Excel/CSV/PDF/PPTX).
// Aggiungere un nuovo formato = aggiungere una voce qui + il NormalizedTool sopra.
interface FileGenerator {
  ext: string;
  mimeType: string;
  label: string;
  gen: (args: Record<string, unknown>) => Promise<Buffer> | Buffer;
}

const FILE_GENERATORS: Record<string, FileGenerator> = {
  [EXCEL_TOOL_NAME]: {
    ext: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel",
    gen: (a) => generateExcel(a as unknown as ExcelSpec),
  },
  [PIPELINE_EXPORT_TOOL_NAME]: {
    ext: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Pipeline Export",
    gen: (a) => generatePipelineExport(a as unknown as PipelineExportSpec),
  },
  [REVENUE_SPREADING_TOOL_NAME]: {
    ext: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Revenue Spreading",
    // Ignora eventuali dati passati dall'LLM: legge SEMPRE il dataset canonico
    // dal server, così il file è identico a quello scaricato dall'interfaccia.
    gen: async (a) => {
      const dataset = await buildPipelineDataset();
      const cashYear = Number((a as { cashYear?: unknown }).cashYear);
      return generateRevenueSpreading({
        deals: dataset.deals,
        cashYear: Number.isFinite(cashYear) ? cashYear : 2026,
      });
    },
  },
  [CSV_TOOL_NAME]: {
    ext: "csv",
    mimeType: "text/csv;charset=utf-8",
    label: "CSV",
    gen: (a) => generateCsv(a as unknown as CsvSpec),
  },
  [PDF_TOOL_NAME]: {
    ext: "pdf",
    mimeType: "application/pdf",
    label: "PDF",
    gen: (a) => generatePdf(a as unknown as PdfSpec),
  },
  [PPTX_TOOL_NAME]: {
    ext: "pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    label: "PowerPoint",
    gen: (a) => generatePptx(a as unknown as PptxSpec),
  },
};

function sanitizeFileBase(filename: unknown): string {
  const base = String(filename ?? "export").replace(/[^\w.-]+/g, "-");
  return base || "export";
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  id: string,
  send: SendFn,
): Promise<{ content: string; isError: boolean }> {
  if (name === CHART_TOOL_NAME) {
    logger.info({ tool: name }, "[tool] render_chart invocato");
    send({ type: "chart", chart: { id, ...args } });
    return {
      content: "Grafico mostrato correttamente nell'interfaccia utente.",
      isError: false,
    };
  }

  if (name === PIPELINE_DATASET_TOOL_NAME) {
    logger.info({ tool: name }, "[tool] get_pipeline_dataset invocato");
    try {
      const ds = await buildPipelineDataset();
      // Payload compatto e già "parlante" per il modello: gli stessi numeri
      // dell'Excel. Lo split per anno è in `schedule` di ogni deal.
      const payload = {
        methodology:
          "Split del fatturato per anno = campo revenue_schedule del deal " +
          "(fallback deterministico se assente). Stessa logica degli export " +
          "Excel e della dashboard. Usa SOLO questi numeri.",
        totals: {
          deals: ds.deals.length,
          totalContractValue: ds.totalContractValue,
          totalScheduledRevenue: ds.totalScheduledRevenue,
          open: ds.open,
          won: ds.won,
        },
        revenueByYear: ds.years.map((year) => ({
          year,
          value: ds.revenueByYear[year] || 0,
        })),
        // Proiezione del fatturato OLTRE la durata dei contratti (stima).
        projectedRevenueByYear: ds.projectionYears.map((year) => ({
          year,
          value: ds.projectedByYear[year] || 0,
        })),
        projectionAssumptions: ds.projectionAssumptions,
        byStage: ds.byStage,
        deals: ds.deals.map((d) => ({
          code: d.code,
          name: d.name,
          owner: d.owner,
          stage: d.stageLabel,
          type: d.typeLabel,
          closingDate: d.closingDate,
          contractStart: d.contractStart,
          durationYears: d.durationYears,
          amount: d.amount,
          scheduleByYear: d.schedule,
          scheduledTotal: d.scheduledTotal,
          scheduleSource: d.scheduleSource,
        })),
        warnings: ds.warnings,
      };
      return { content: JSON.stringify(payload), isError: false };
    } catch (err) {
      logger.error({ err, tool: name }, "[tool] get_pipeline_dataset fallito");
      return {
        content: `Errore lettura dataset pipeline: ${String(err)}`,
        isError: true,
      };
    }
  }

  if (name === DEAL_ANALYTICS_TOOL_NAME) {
    logger.info({ tool: name }, "[tool] get_deal_analytics invocato");
    try {
      const analytics = await buildDealAnalytics();
      return { content: JSON.stringify(analytics), isError: false };
    } catch (err) {
      logger.error({ err, tool: name }, "[tool] get_deal_analytics fallito");
      return {
        content: `Errore lettura analisi funnel: ${String(err)}`,
        isError: true,
      };
    }
  }

  const fileGen = FILE_GENERATORS[name];
  if (fileGen) {
    try {
      const buffer = await fileGen.gen(args);
      const fileName = `${sanitizeFileBase((args as { filename?: unknown }).filename)}.${fileGen.ext}`;
      logger.info(
        { tool: name, fileName, bytes: buffer.length },
        `[tool] ${name}: file generato`,
      );
      send({
        type: "file",
        file: {
          id,
          name: fileName,
          mimeType: fileGen.mimeType,
          dataBase64: buffer.toString("base64"),
        },
      });
      return {
        content: `File ${fileGen.label} "${fileName}" generato e pronto per il download.`,
        isError: false,
      };
    } catch (err) {
      logger.error({ err, tool: name }, `[tool] ${name}: generazione fallita`);
      return {
        content: `Errore generazione ${fileGen.label}: ${String(err)}`,
        isError: true,
      };
    }
  }

  logger.info({ tool: name }, "[tool] chiamata MCP HubSpot");
  try {
    const result = await callMCPTool(name, args);
    const content = Array.isArray(result.content)
      ? result.content.map((c: { text?: string }) => c.text || "").join("\n")
      : JSON.stringify(result);
    return {
      content: content || "(nessun risultato)",
      isError: result.isError === true,
    };
  } catch (err) {
    return { content: `Errore esecuzione tool: ${String(err)}`, isError: true };
  }
}
