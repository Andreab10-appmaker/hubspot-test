import { useState, useRef, useEffect } from 'react';
import { Sparkles, Settings2, ArrowUp, ShieldCheck, Zap, MessageSquarePlus } from 'lucide-react';
import { Message, ToolCall, ChartSpec, DownloadFile, ConfirmAction } from '../lib/types';
import {
  PROVIDER_CONFIG,
  DEFAULT_PROVIDER,
  ProviderId,
} from '../lib/providers/config';
import MessageBubble from './MessageBubble';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatBody {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  provider?: ProviderId;
  model?: string;
  mode?: 'build' | 'plan';
  approvedActions?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

// Suggerimenti sobri (chip), niente sidebar di prompt verbosi.
const SUGGESTIONS = [
  'Mostrami la pipeline 2026 con un grafico',
  'Incassi previsti questo mese',
  'Distribuzione dei lead per fonte',
];

const GREETING: Message = {
  role: 'assistant',
  content:
    'Ciao 👋 Sono il tuo assistente HubSpot. Posso leggere e scrivere su deal, contatti e note (con conferma), generare grafici ed esportare report. Chiedimi pure.',
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER);
  const [model, setModel] = useState<string>(PROVIDER_CONFIG[DEFAULT_PROVIDER].defaultModel);
  const [planMode, setPlanMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const changeProvider = (p: ProviderId) => {
    setProvider(p);
    setModel(PROVIDER_CONFIG[p].defaultModel);
  };

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

  const showSuggestions = messages.length <= 1 && !loading;

  return (
    <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-3xl flex-col md:h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" strokeWidth={2.1} />
        </span>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight leading-tight">
            Assistente
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {planMode ? 'Sola lettura · analizza e propone' : 'Operativo · può scrivere con conferma'}
          </p>
        </div>

        {/* Nuova chat: azzera la conversazione */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setMessages([GREETING]);
            setInput('');
          }}
          disabled={loading}
          data-testid="button-new-chat"
          title="Avvia una nuova chat"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuova chat</span>
        </Button>

        {/* Plan/Operativo toggle */}
        <Button
          variant={planMode ? 'secondary' : 'ghost'}
          size="sm"
          className="gap-1.5"
          onClick={() => setPlanMode((p) => !p)}
          disabled={loading}
          data-testid="button-mode"
        >
          {planMode ? <ShieldCheck className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          {planMode ? 'Piano' : 'Operativo'}
        </Button>

        {/* Settings popover (provider + modello) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-muted-foreground">
                Provider
              </label>
              <select
                value={provider}
                onChange={(e) => changeProvider(e.target.value as ProviderId)}
                disabled={loading}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                {(Object.keys(PROVIDER_CONFIG) as ProviderId[]).map((id) => (
                  <option key={id} value={id}>
                    {PROVIDER_CONFIG[id].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-muted-foreground">
                Modello
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={loading}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                {PROVIDER_CONFIG[provider].models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-card-border bg-card/60 p-4">
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
            </span>
            Sto interrogando HubSpot…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {showSuggestions && (
        <div className="flex flex-wrap gap-2 pt-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              data-testid="chip-suggestion"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="pt-3">
        <div
          className={cn(
            'flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-colors',
            'focus-within:border-primary/50',
          )}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={1}
            placeholder="Scrivi un messaggio… (es. «pipeline 2026»)"
            disabled={loading}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground"
            data-testid="input-message"
          />
          <Button
            size="icon"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="h-10 w-10 rounded-xl"
            data-testid="button-send"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
        <p className="pt-2 text-center text-[11px] text-muted-foreground">
          {PROVIDER_CONFIG[provider].label} · {model} · le scritture richiedono conferma
        </p>
      </div>
    </div>
  );
}
