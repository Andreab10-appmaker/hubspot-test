import OpenAI from 'openai';
import { RunOptions, executeTool, CHART_TOOL_NAME } from './shared';

// Agentic loop con OpenAI (Chat Completions + function calling). Emette gli
// stessi eventi SSE del provider Anthropic, così il frontend è identico.
export async function runOpenAI({ model, system, messages, tools, send }: RunOptions): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const oaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));

  const conv: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
  ];
  for (const m of messages) {
    if (m.role === 'user') conv.push({ role: 'user', content: m.content });
    else conv.push({ role: 'assistant', content: m.content });
  }

  let buffered = '';

  for (let iteration = 0; iteration < 10; iteration++) {
    // Niente max_tokens/temperature: i modelli GPT-5.x usano i propri default e
    // rifiutano alcuni di questi parametri.
    const res = await client.chat.completions.create({
      model,
      messages: conv,
      tools: oaiTools,
      tool_choice: 'auto',
    });

    const msg = res.choices[0]?.message;
    if (!msg) {
      send({ type: 'text', text: 'Nessuna risposta dal modello.' });
      return;
    }

    const calls = msg.tool_calls ?? [];

    if (calls.length > 0) {
      if (msg.content) buffered += (buffered ? '\n' : '') + msg.content;
      conv.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });

      for (const call of calls) {
        if (call.type !== 'function') continue;
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          /* argomenti non validi: prosegui con oggetto vuoto */
        }

        if (name !== CHART_TOOL_NAME) {
          send({ type: 'tool_call', toolCall: { id: call.id, name, input: args } });
          send({ type: 'tool_executing', name });
        }

        const { content } = await executeTool(name, args, call.id, send);

        if (name !== CHART_TOOL_NAME) {
          send({ type: 'tool_result', id: call.id, result: content });
        }
        conv.push({ role: 'tool', tool_call_id: call.id, content });
      }
      continue;
    }

    send({ type: 'text', text: msg.content || buffered || 'Operazione completata.' });
    return;
  }

  send({
    type: 'text',
    text: buffered || '⚠️ Numero massimo di passaggi raggiunto senza completare la richiesta.',
  });
}
