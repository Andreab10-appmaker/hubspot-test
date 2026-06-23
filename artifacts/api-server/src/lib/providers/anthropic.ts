import Anthropic from '@anthropic-ai/sdk';
import { RunOptions, executeTool, OUTPUT_TOOLS, isWriteTool, buildAction } from './shared.js';

export async function runAnthropic({ model, system, messages, tools, send }: RunOptions): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const aTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));

  const conv: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let buffered = '';

  for (let iteration = 0; iteration < 10; iteration++) {
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      tools: aTools,
      messages: conv,
    });

    const toolUses = res.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    const turnText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
      send({ type: 'text', text: turnText || buffered || 'Operazione completata.' });
      return;
    }

    // Gating: se ci sono tool di SCRITTURA, proponi e chiedi conferma all'utente.
    const writeUses = toolUses.filter((tu) => isWriteTool(tu.name));
    if (writeUses.length > 0) {
      const proposal = (turnText || buffered || '').trim();
      if (proposal) send({ type: 'text', text: proposal });
      send({
        type: 'confirm_required',
        actions: writeUses.map((tu) =>
          buildAction(tu.id, tu.name, tu.input as Record<string, unknown>)
        ),
      });
      return;
    }

    // Solo letture / output (grafici, excel): esegui e continua.
    if (turnText) buffered += (buffered ? '\n' : '') + turnText;
    conv.push({ role: 'assistant', content: res.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (!OUTPUT_TOOLS.has(tu.name)) {
        send({ type: 'tool_call', toolCall: { id: tu.id, name: tu.name, input: tu.input } });
        send({ type: 'tool_executing', name: tu.name });
      }

      const { content, isError } = await executeTool(
        tu.name,
        tu.input as Record<string, unknown>,
        tu.id,
        send
      );

      if (!OUTPUT_TOOLS.has(tu.name)) {
        send({ type: 'tool_result', id: tu.id, result: content });
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content, is_error: isError });
    }

    conv.push({ role: 'user', content: results });
  }

  send({
    type: 'text',
    text: buffered || '⚠️ Numero massimo di passaggi raggiunto senza completare la richiesta.',
  });
}
