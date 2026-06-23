import { NextRequest } from 'next/server';
import { getMCPTools } from '@/lib/mcp-client';
import { ChatRequest } from '@/lib/types';
import {
  runAgent,
  resolveModel,
  isProviderId,
  DEFAULT_PROVIDER,
  PROVIDER_ENV_KEY,
} from '@/lib/providers';
import { CHART_TOOL, buildSystemPrompt, NormalizedTool } from '@/lib/providers/shared';

// Deve girare su Node.js (non Edge): la route avvia un processo figlio via stdio.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'Body JSON non valido' }, { status: 400 });
  }

  const provider = isProviderId(body.provider) ? body.provider : DEFAULT_PROVIDER;
  const model = resolveModel(provider, body.model);

  // Controllo precoce della API key del provider scelto, per un errore chiaro.
  const envKey = PROVIDER_ENV_KEY[provider];
  if (!process.env[envKey]) {
    return Response.json(
      { error: `${envKey} non impostato: richiesto per il provider "${provider}".` },
      { status: 503 }
    );
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

  // Tool neutri = tool HubSpot + il tool di visualizzazione grafici.
  const tools: NormalizedTool[] = [
    ...mcpTools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema:
        (t.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
    })),
    CHART_TOOL,
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await runAgent(provider, {
          model,
          system: buildSystemPrompt(),
          messages: body.messages,
          tools,
          send,
        });
      } catch (err) {
        console.error('[Chat API] Error:', err);
        send({ type: 'error', message: String(err) });
      } finally {
        send({ type: 'done' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
