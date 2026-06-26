import { Router } from "express";
import { getMCPTools } from "../../lib/mcp-client.js";
import {
  runAgent,
  resolveModel,
  isProviderId,
  DEFAULT_PROVIDER,
  PROVIDER_ENV_KEY,
} from "../../lib/providers/index.js";
import {
  CHART_TOOL,
  EXCEL_TOOL,
  PIPELINE_EXPORT_TOOL,
  REVENUE_SPREADING_TOOL,
  PIPELINE_DATASET_TOOL,
  DEAL_ANALYTICS_TOOL,
  CSV_TOOL,
  PDF_TOOL,
  PPTX_TOOL,
  buildSystemPrompt,
  executeTool,
  isWriteTool,
  NormalizedTool,
  type AgentMode,
} from "../../lib/providers/shared.js";

const router = Router();

interface ApprovedAction {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ChatRequest {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: string;
  model?: string;
  mode?: string;
  approvedActions?: ApprovedAction[];
}

router.post("/completions", async (req, res) => {
  const body = req.body as ChatRequest;

  const openSSE = () => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
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
        send({
          type: "tool_call",
          toolCall: { id: a.id, name: a.name, input: a.input || {} },
        });
        send({ type: "tool_executing", name: a.name });
        const { content, isError } = await executeTool(
          a.name,
          a.input || {},
          a.id,
          send,
        );
        send({ type: "tool_result", id: a.id, result: content });
        if (isError) anyError = true;
      }
      send({
        type: "text",
        text: anyError
          ? "⚠️ Una o più operazioni non sono andate a buon fine. Controlla i dettagli nei badge dei tool."
          : "✅ Operazioni eseguite con successo su HubSpot.",
      });
    } catch (err) {
      req.log.error({ err }, "[Chat API] Confirm error");
      send({ type: "error", message: String(err) });
    } finally {
      send({ type: "done" });
      res.end();
    }
    return;
  }

  // === Modalità NORMALE: agentic loop (con gating delle scritture) ===
  const provider = isProviderId(body.provider)
    ? body.provider
    : DEFAULT_PROVIDER;
  const model = resolveModel(provider, body.model);

  const envKey = PROVIDER_ENV_KEY[provider];
  if (!process.env[envKey]) {
    res
      .status(503)
      .json({
        error: `${envKey} non impostato: richiesto per il provider "${provider}".`,
      });
    return;
  }

  // HubSpot MCP è opzionale: se non parte (token mancante/scaduto), degradiamo
  // con grazia mantenendo i tool di output (grafici/Excel) invece di bloccare tutto.
  let mcpTools: Awaited<ReturnType<typeof getMCPTools>> = [];
  let mcpAvailable = true;
  try {
    mcpTools = await getMCPTools();
  } catch (err) {
    mcpAvailable = false;
    req.log.warn(
      { err },
      "[MCP] HubSpot non disponibile: proseguo con i soli tool di output (grafici/Excel)",
    );
  }

  const mode: AgentMode = body.mode === "plan" ? "plan" : "build";

  const mcpNormalized: NormalizedTool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description || "",
    inputSchema: (t.inputSchema as Record<string, unknown>) || {
      type: "object",
      properties: {},
    },
  }));
  // In modalità Piano (sola lettura) rimuoviamo del tutto i tool di scrittura:
  // il modello non può proprio invocarli, niente conferme, solo analisi.
  const mcpForMode =
    mode === "plan"
      ? mcpNormalized.filter((t) => !isWriteTool(t.name))
      : mcpNormalized;

  const tools: NormalizedTool[] = [
    ...mcpForMode,
    PIPELINE_DATASET_TOOL,
    DEAL_ANALYTICS_TOOL,
    CHART_TOOL,
    EXCEL_TOOL,
    REVENUE_SPREADING_TOOL,
    PIPELINE_EXPORT_TOOL,
    CSV_TOOL,
    PDF_TOOL,
    PPTX_TOOL,
  ];

  openSSE();
  try {
    await runAgent(provider, {
      model,
      system: buildSystemPrompt(mcpAvailable, mode),
      messages: body.messages || [],
      tools,
      send,
    });
  } catch (err) {
    req.log.error({ err }, "[Chat API] Error");
    send({ type: "error", message: String(err) });
  } finally {
    send({ type: "done" });
    res.end();
  }
});

export default router;
