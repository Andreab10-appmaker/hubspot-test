import { Router } from 'express';
import { getMCPTools } from '../../lib/mcp-client.js';
import {
  runAgent,
  resolveModel,
  isProviderId,
  DEFAULT_PROVIDER,
  PROVIDER_ENV_KEY,
} from '../../lib/providers/index.js';
import {
  CHART_TOOL,
  EXCEL_TOOL,
  buildSystemPrompt,
  executeTool,
  NormalizedTool,
} from '../../lib/providers/shared.js';

const router = Router();

interface ApprovedAction {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ChatRequest {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  provider?: string;
  model?: string;
  approvedActions?: ApprovedAction[];
}

router.post('/completions', async (req, res) => {
  const body = req.body as ChatRequest;

  const openSSE = () => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  };
  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // === Modalità CONFERMA: esegui ESATTAMENTE le operazioni approvate dall'utente ===
  if (Array.isArray(body.approvedActions) && body.approvedActions.length > 0) {
    openSSE();
    let anyError = false;
    try {
      for (const a of body.approvedActions) {
        send({ type: 'tool_call', toolCall: { id: a.id, name: a.name, input: a.input || {} } });
        send({ type: 'tool_executing', name: a.name });
        const { content, isError } = await executeTool(a.name, a.input || {}, a.id, send);
        send({ type: 'tool_result', id: a.id, result: content });
        if (isError) anyError = true;
      }
      send({
        type: 'text',
        text: anyError
          ? '⚠️ Una o più operazioni non sono andate a buon fine. Controlla i dettagli nei badge dei tool.'
          : '✅ Operazioni eseguite con successo su HubSpot.',
      });
    } catch (err) {
      req.log.error({ err }, '[Chat API] Confirm error');
      send({ type: 'error', message: String(err) });
    } finally {
      send({ type: 'done' });
      res.end();
    }
    return;
  }

  // === Modalità NORMALE: agentic loop (con gating delle scritture) ===
  const provider = isProviderId(body.provider) ? body.provider : DEFAULT_PROVIDER;
  const model = resolveModel(provider, body.model);

  const envKey = PROVIDER_ENV_KEY[provider];
  if (!process.env[envKey]) {
    res
      .status(503)
      .json({ error: `${envKey} non impostato: richiesto per il provider "${provider}".` });
    return;
  }

  let mcpTools: Awaited<ReturnType<typeof getMCPTools>> = [];
  try {
    mcpTools = await getMCPTools();
  } catch (err) {
    req.log.error({ err }, '[MCP] Recupero tool fallito');
    res.status(503).json({
      error:
        'HubSpot MCP non disponibile. Verifica HUBSPOT_ACCESS_TOKEN e che npx possa avviare @hubspot/mcp-server.',
    });
    return;
  }

  const tools: NormalizedTool[] = [
    ...mcpTools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema:
        (t.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
    })),
    CHART_TOOL,
    EXCEL_TOOL,
  ];

  openSSE();
  try {
    await runAgent(provider, {
      model,
      system: buildSystemPrompt(),
      messages: body.messages || [],
      tools,
      send,
    });
  } catch (err) {
    req.log.error({ err }, '[Chat API] Error');
    send({ type: 'error', message: String(err) });
  } finally {
    send({ type: 'done' });
    res.end();
  }
});

export default router;
