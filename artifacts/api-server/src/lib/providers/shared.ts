import { callMCPTool } from '../mcp-client.js';

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

const SYSTEM_BASE = `Sei un assistente CRM esperto per HubSpot connesso via MCP.
Rispondi SEMPRE in italiano.
Usa i tool MCP di HubSpot per leggere e scrivere dati REALI nel CRM dell'utente.

VISUALIZZAZIONE CON GRAFICI:
Hai il tool "render_chart" per mostrare grafici interattivi nell'interfaccia.
Usalo ogni volta che la risposta beneficia di una visualizzazione: pipeline per
fase, incassi/forecast nel tempo, andamento/conteggio lead, distribuzioni.
Regole:
1. NON inventare numeri. Recupera SEMPRE prima i dati reali con i tool HubSpot
   (es. cerca i deal con amount, closedate, dealstage, pipeline), aggrega tu i
   valori e poi passali a render_chart.
2. Scegli il tipo adatto: line/area per serie temporali, bar per confronti fra
   categorie/fasi, pie per composizioni.
3. Per importi in euro usa valueFormat "currency"; per percentuali "percent".
4. Etichette brevi (es. "Q1 2026", "Gen", "Proposta inviata").
5. Puoi mostrare più grafici nella stessa risposta.
6. Accompagna SEMPRE i grafici con un breve commento testuale (1-3 frasi).
7. Se non ci sono dati sufficienti, dillo invece di inventare un grafico.

Linee guida generali:
- Deal: nome, valore (€), fase, proprietario, data chiusura
- Contatti: nome, email, azienda, data creazione
- Aziende: nome, settore, numero dipendenti
- Usa emoji e liste per chiarezza
- Conferma esplicitamente quando un'operazione di scrittura va a buon fine
- Suggerisci sempre possibili azioni successive
- Se stai per creare/modificare dati, descrivi cosa stai per fare PRIMA di farlo`;

export function buildSystemPrompt(): string {
  const today = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Rome',
  });
  return `${SYSTEM_BASE}\n\nData odierna: ${today} (fuso Europe/Rome).`;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  id: string,
  send: SendFn
): Promise<{ content: string; isError: boolean }> {
  if (name === CHART_TOOL_NAME) {
    send({ type: 'chart', chart: { id, ...args } });
    return { content: "Grafico mostrato correttamente nell'interfaccia utente.", isError: false };
  }

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
