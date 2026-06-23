import Anthropic from '@anthropic-ai/sdk';
import { RunOptions, executeTool, CHART_TOOL_NAME } from './shared';

// Agentic loop con Anthropic (Messages API + tool use). Emette gli stessi
// eventi SSE del provider OpenAI.
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

    if (res.stop_reason === 'tool_use' && toolUses.length > 0) {
      if (turnText) buffered += (buffered ? '\n' : '') + turnText;
      conv.push({ role: 'assistant', content: res.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (tu.name !== CHART_TOOL_NAME) {
          send({ type: 'tool_call', toolCall: { id: tu.id, name: tu.name, input: tu.input } });
          send({ type: 'tool_executing', name: tu.name });
        }

        const { content, isError } = await executeTool(
          tu.name,
          tu.input as Record<string, unknown>,
          tu.id,
          send
        );

        if (tu.name !== CHART_TOOL_NAME) {
          send({ type: 'tool_result', id: tu.id, result: content });
        }
        results.push({ type: 'tool_result', tool_use_id: tu.id, content, is_error: isError });
      }

      conv.push({ role: 'user', content: results });
      continue;
    }

    send({ type: 'text', text: turnText || buffered || 'Operazione completata.' });
    return;
  }

  send({
    type: 'text',
    text: buffered || '⚠️ Numero massimo di passaggi raggiunto senza completare la richiesta.',
  });
}
