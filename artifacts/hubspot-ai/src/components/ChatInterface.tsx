import { useState, useRef, useEffect } from 'react';
import { Message, ToolCall, ChartSpec, DownloadFile, ConfirmAction } from '../lib/types';
import {
  PROVIDER_CONFIG,
  DEFAULT_PROVIDER,
  ProviderId,
} from '../lib/providers/config';
import MessageBubble from './MessageBubble';
import QuickActions from './QuickActions';

interface ChatBody {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  provider?: ProviderId;
  model?: string;
  mode?: 'build' | 'plan';
  approvedActions?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '👋 Ciao! Sono il tuo assistente HubSpot via MCP.\n\nPosso:\n• 💰 Leggere e creare deal, contatti, note (con conferma prima di scrivere)\n• 📊 Generare grafici in tempo reale\n• 📄 Esportare report Excel scaricabili\n\nProva: "Mostrami la pipeline 2026" o "Esporta i deal aperti in Excel".',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER);
  const [model, setModel] = useState<string>(PROVIDER_CONFIG[DEFAULT_PROVIDER].defaultModel);
  const [customModel, setCustomModel] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const changeProvider = (p: ProviderId) => {
    setProvider(p);
    setModel(PROVIDER_CONFIG[p].defaultModel);
    setCustomModel(false);
  };

  // Esegue una richiesta SSE e aggiorna il messaggio assistente all'indice dato.
  const streamChat = async (assistantIdx: number, body: ChatBody) => {
    const res = await fetch('/api/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) detail = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    if (!res.body) throw new Error('Nessuno stream di risposta');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const currentToolCalls: ToolCall[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));

        if (data.type === 'tool_call') {
          currentToolCalls.push({
            id: data.toolCall.id,
            name: data.toolCall.name,
            input: data.toolCall.input,
          });
          setMessages((prev) => {
            const next = [...prev];
            next[assistantIdx] = { ...next[assistantIdx], toolCalls: [...currentToolCalls] };
            return next;
          });
        }

        if (data.type === 'tool_result') {
          setMessages((prev) => {
            const next = [...prev];
            const tc = (next[assistantIdx].toolCalls || []).find((t) => t.id === data.id);
            if (tc) tc.result = data.result;
            return [...next];
          });
        }

        if (data.type === 'chart') {
          const spec = data.chart as ChartSpec;
          setMessages((prev) => {
            const next = [...prev];
            const existing = next[assistantIdx].charts || [];
            next[assistantIdx] = { ...next[assistantIdx], charts: [...existing, spec] };
            return next;
          });
        }

        if (data.type === 'file') {
          const file = data.file as DownloadFile;
          setMessages((prev) => {
            const next = [...prev];
            const existing = next[assistantIdx].files || [];
            next[assistantIdx] = { ...next[assistantIdx], files: [...existing, file] };
            return next;
          });
        }

        if (data.type === 'confirm_required') {
          const actions = data.actions as ConfirmAction[];
          setMessages((prev) => {
            const next = [...prev];
            next[assistantIdx] = {
              ...next[assistantIdx],
              pendingConfirm: { actions, status: 'pending' },
            };
            return next;
          });
        }

        if (data.type === 'text') {
          setMessages((prev) => {
            const next = [...prev];
            next[assistantIdx] = { ...next[assistantIdx], content: data.text };
            return next;
          });
        }

        if (data.type === 'error') {
          setMessages((prev) => {
            const next = [...prev];
            next[assistantIdx] = {
              ...next[assistantIdx],
              content: `⚠️ Errore: ${data.message}`,
              isError: true,
            };
            return next;
          });
        }
      }
    }
  };

  const sendMessage = async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || loading) return;

    const userMsg: Message = { role: 'user', content: msgText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    const assistantIdx = updatedMessages.length;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      await streamChat(assistantIdx, {
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        provider,
        model,
        mode: planMode ? 'plan' : 'build',
      });
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[assistantIdx] = {
          ...next[assistantIdx],
          content: `⚠️ Errore di connessione: ${String(err)}`,
          isError: true,
        };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmMessage = async (i: number) => {
    if (loading) return;
    const pc = messages[i].pendingConfirm;
    if (!pc || pc.status !== 'pending') return;

    setMessages((prev) => {
      const next = [...prev];
      const cur = next[i].pendingConfirm;
      if (cur) next[i] = { ...next[i], pendingConfirm: { ...cur, status: 'confirmed' } };
      return next;
    });

    setLoading(true);
    const assistantIdx = messages.length;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      await streamChat(assistantIdx, {
        approvedActions: pc.actions.map((a) => ({ id: a.id, name: a.name, input: a.input })),
        provider,
        model,
        mode: planMode ? 'plan' : 'build',
      });
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[assistantIdx] = {
          ...next[assistantIdx],
          content: `⚠️ Errore: ${String(err)}`,
          isError: true,
        };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const cancelMessage = (i: number) => {
    if (loading) return;
    setMessages((prev) => {
      const next = [...prev];
      const cur = next[i].pendingConfirm;
      if (cur) next[i] = { ...next[i], pendingConfirm: { ...cur, status: 'cancelled' } };
      return [
        ...next,
        {
          role: 'assistant',
          content: '✖ Operazione annullata. Nessuna modifica è stata apportata a HubSpot.',
        },
      ];
    });
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <aside className="w-52 bg-white border-r border-gray-200 flex flex-col p-3 gap-1 overflow-y-auto">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">
          Azioni rapide
        </p>
        <QuickActions onAction={sendMessage} disabled={loading} />
      </aside>

      {/* Main chat */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-[#2D3E50] text-white px-5 h-14 flex items-center gap-3 shadow-md">
          <div className="w-8 h-8 rounded-lg bg-[#FF7A59] flex items-center justify-center text-base">
            ⚡
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">HubSpot AI Interface</div>
            <div className="text-[11px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              MCP attivo · @hubspot/mcp-server
            </div>
          </div>

          {/* Toggle modalità + selettore provider + modello */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPlanMode((p) => !p)}
              disabled={loading}
              title={
                planMode
                  ? 'Modalità Piano (sola lettura): analizza e propone, nessuna scrittura sul CRM'
                  : 'Modalità Operativa: può scrivere sul CRM previa conferma'
              }
              className={`text-[11px] font-semibold rounded-md px-2 py-1 border transition-colors disabled:opacity-50 ${
                planMode
                  ? 'bg-amber-400/25 border-amber-300/70 text-amber-100'
                  : 'bg-emerald-400/20 border-emerald-300/50 text-emerald-50'
              }`}
            >
              {planMode ? '🔍 Piano' : '⚡ Operativo'}
            </button>
            <select
              value={provider}
              onChange={(e) => changeProvider(e.target.value as ProviderId)}
              disabled={loading}
              className="bg-white/10 text-white text-[11px] rounded-md px-2 py-1 outline-none border border-white/20 disabled:opacity-50"
              title="Provider AI"
            >
              {(Object.keys(PROVIDER_CONFIG) as ProviderId[]).map((id) => (
                <option key={id} value={id} className="text-black">
                  {PROVIDER_CONFIG[id].label}
                </option>
              ))}
            </select>
            <select
              value={customModel ? '__custom__' : model}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom__') {
                  setCustomModel(true);
                } else {
                  setCustomModel(false);
                  setModel(v);
                }
              }}
              disabled={loading}
              title="Modello"
              className="bg-white/10 text-white text-[11px] rounded-md px-2 py-1 outline-none border border-white/20 disabled:opacity-50 max-w-[160px]"
            >
              {PROVIDER_CONFIG[provider].models.map((m) => (
                <option key={m} value={m} className="text-black">
                  {m}
                </option>
              ))}
              <option value="__custom__" className="text-black">
                ✏️ Personalizzato…
              </option>
            </select>
            {customModel && (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={loading}
                placeholder="ID modello"
                title="Inserisci un ID modello custom"
                className="bg-white/10 text-white text-[11px] rounded-md px-2 py-1 w-32 outline-none border border-white/20 placeholder-white/50 disabled:opacity-50"
              />
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              disabled={loading}
              onConfirm={() => confirmMessage(i)}
              onCancel={() => cancelMessage(i)}
            />
          ))}
          {loading && (
            <div className="flex items-end gap-2">
              <div className="w-7 h-7 rounded-full bg-[#FF7A59] flex items-center justify-center text-white text-xs font-bold">
                HS
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-gray-400 text-sm">
                Sto interrogando HubSpot...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <footer className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder='Es: "Qual è la mia pipeline per il 2026?"'
              disabled={loading}
              className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#FF7A59] outline-none transition-colors"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="w-11 h-11 rounded-xl bg-[#FF7A59] disabled:bg-gray-200 text-white flex items-center justify-center text-lg transition-colors"
            >
              ↑
            </button>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-2">
            {planMode ? '🔍 Piano' : '⚡ Operativo'} · {PROVIDER_CONFIG[provider].label} ·{' '}
            {model || '—'} · MCP @hubspot/mcp-server · Enter per inviare
          </p>
        </footer>
      </main>
    </div>
  );
}
