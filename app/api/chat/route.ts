import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getMCPTools, callMCPTool } from '@/lib/mcp-client';
import { ChatRequest } from '@/lib/types';

// Deve girare su Node.js (non Edge): la route avvia un processo figlio via stdio.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Il PRD specifica esplicitamente Claude Sonnet 4.6. Per passare a un altro
// modello (es. 'claude-opus-4-8') basta cambiare questa costante.
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Sei un assistente CRM esperto per HubSpot connesso via MCP.
Rispondi SEMPRE in italiano.
Usa i tool MCP disponibili per leggere e scrivere dati reali nel CRM dell'utente.

Linee guida per la visualizzazione:
- Deal: mostra nome, valore (€), fase, proprietario, data chiusura
- Contatti: nome, email, azienda, data creazione
- Aziende: nome, settore, numero dipendenti
- Usa emoji e formattazione chiara con liste
- Conferma esplicitamente quando un'operazione (es. creazione deal) va a buon fine
- Suggerisci sempre possibili azioni successive
- Se stai per creare/modificare dati, descrivi cosa stai per fare PRIMA di farlo`;

export async function POST(req: NextRequest) {
  // Inizializzazione lazy: così `next build` non richiede le chiavi e l'app
  // legge i secret a runtime (locale: .env.local — Replit: tab Secrets).
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'Body JSON non valido' }, { status: 400 });
  }

  // Ottieni i tool da HubSpot MCP server.
  let mcpTools: Awaited<ReturnType<typeof getMCPTools>> = [];
  try {
    mcpTools = await getMCPTools();
  } catch (err) {
    console.error('[MCP] Recupero tool fallito:', err);
    return Response.json(
      {
        error:
          'HubSpot MCP non disponibile. Verifica HUBSPOT_ACCESS_TOKEN e che npx possa avviare @hubspot/mcp-server.',
      },
      { status: 503 }
    );
  }

  // Converte i tool MCP nel formato Anthropic.
  const anthropicTools: Anthropic.Tool[] = mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    input_schema:
      (tool.inputSchema as Anthropic.Tool['input_schema']) || {
        type: 'object',
        properties: {},
      },
  }));

  // Agentic loop con streaming via SSE (ReadableStream).
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const toolCallsForClient: Array<{
          id: string;
          name: string;
          input: unknown;
        }> = [];

        let finalized = false;

        // Loop agentico: max 10 iterazioni per sicurezza.
        for (let iteration = 0; iteration < 10; iteration++) {
          const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: anthropicTools,
            messages,
          });

          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
          );
          const textBlocks = response.content.filter(
            (b): b is Anthropic.TextBlock => b.type === 'text'
          );

          // Notifica al client i tool richiesti (per i badge).
          for (const tb of toolUseBlocks) {
            const tc = { id: tb.id, name: tb.name, input: tb.input };
            toolCallsForClient.push(tc);
            send({ type: 'tool_call', toolCall: tc });
          }

          // Se Claude vuole usare dei tool, eseguili e continua il loop.
          if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
            messages.push({ role: 'assistant', content: response.content });

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const toolUse of toolUseBlocks) {
              send({ type: 'tool_executing', name: toolUse.name });
              try {
                const result = await callMCPTool(
                  toolUse.name,
                  toolUse.input as Record<string, unknown>
                );

                const resultText = Array.isArray(result.content)
                  ? result.content
                      .map((c: { text?: string }) => c.text || '')
                      .join('\n')
                  : JSON.stringify(result);

                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: resultText,
                  is_error: result.isError === true,
                });
                send({ type: 'tool_result', id: toolUse.id, result: resultText });
              } catch (toolErr) {
                console.error(`[MCP] Tool ${toolUse.name} fallito:`, toolErr);
                const msg = `Errore esecuzione tool: ${String(toolErr)}`;
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: msg,
                  is_error: true,
                });
                send({ type: 'tool_result', id: toolUse.id, result: msg });
              }
            }

            messages.push({ role: 'user', content: toolResults });
            continue;
          }

          // Nessun tool richiesto (end_turn, max_tokens, refusal, ...): risposta finale.
          const finalText = textBlocks
            .map((b) => b.text)
            .join('\n')
            .trim();
          send({
            type: 'text',
            text: finalText || 'Operazione completata.',
            toolCalls: toolCallsForClient,
          });
          finalized = true;
          break;
        }

        // Raggiunto il limite di iterazioni senza una risposta finale.
        if (!finalized) {
          send({
            type: 'text',
            text: '⚠️ Ho raggiunto il numero massimo di passaggi senza completare la richiesta. Riprova con una richiesta più specifica.',
            toolCalls: toolCallsForClient,
          });
        }

        send({ type: 'done' });
      } catch (err) {
        console.error('[Chat API] Error:', err);
        send({ type: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Evita il buffering della risposta da parte di proxy (es. NGINX su Replit).
      'X-Accel-Buffering': 'no',
    },
  });
}
