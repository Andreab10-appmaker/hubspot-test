import OpenAI from 'openai';
import { RunOptions, executeTool, OUTPUT_TOOLS, isWriteTool, buildAction } from './shared.js';

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

    const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function');
    if (calls.length === 0) {
      send({ type: 'text', text: msg.content || buffered || 'Operazione completata.' });
      return;
    }

    // Gating: se ci sono tool di SCRITTURA, proponi e chiedi conferma all'utente.
    const writeCalls = calls.filter((c) => isWriteTool(c.function.name));
    if (writeCalls.length > 0) {
      const proposal = (msg.content || buffered || '').trim();
      if (proposal) send({ type: 'text', text: proposal });
      send({
        type: 'confirm_required',
        actions: writeCalls.map((c) => {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(c.function.arguments || '{}');
          } catch {
            /* argomenti non validi */
          }
          return buildAction(c.id, c.function.name, input);
        }),
      });
      return;
    }

    // Solo letture / output (grafici, excel): esegui e continua.
    if (msg.content) buffered += (buffered ? '\n' : '') + msg.content;
    conv.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });

    for (const call of calls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        /* argomenti non validi */
      }

      if (!OUTPUT_TOOLS.has(name)) {
        send({ type: 'tool_call', toolCall: { id: call.id, name, input: args } });
        send({ type: 'tool_executing', name });
      }

      const { content } = await executeTool(name, args, call.id, send);

      if (!OUTPUT_TOOLS.has(name)) {
        send({ type: 'tool_result', id: call.id, result: content });
      }
      conv.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }

  send({
    type: 'text',
    text: buffered || '⚠️ Numero massimo di passaggi raggiunto senza completare la richiesta.',
  });
}
