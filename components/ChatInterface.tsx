'use client';

import { useState, useRef, useEffect } from 'react';
import { Message, ToolCall } from '@/lib/types';
import MessageBubble from './MessageBubble';
import QuickActions from './QuickActions';

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '👋 Ciao! Sono connesso al tuo HubSpot via MCP.\n\nPosso:\n• 💰 Leggere e **creare deal**\n• 👤 Gestire contatti\n• 🏢 Consultare aziende\n• 📝 Creare note e attività\n\nCosa vuoi fare?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || loading) return;

    const userMsg: Message = { role: 'user', content: msgText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    // Aggiunge un placeholder per l'assistente.
    const assistantIdx = updatedMessages.length;
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', toolCalls: [] },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
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
              next[assistantIdx] = {
                ...next[assistantIdx],
                toolCalls: [...currentToolCalls],
              };
              return next;
            });
          }

          if (data.type === 'tool_result') {
            setMessages((prev) => {
              const next = [...prev];
              const tc = (next[assistantIdx].toolCalls || []).find(
                (t) => t.id === data.id
              );
              if (tc) tc.result = data.result;
              return [...next];
            });
          }

          if (data.type === 'text') {
            setMessages((prev) => {
              const next = [...prev];
              next[assistantIdx] = {
                ...next[assistantIdx],
                content: data.text,
                toolCalls: data.toolCalls || currentToolCalls,
              };
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
            <div className="font-semibold text-sm leading-tight">
              HubSpot AI Interface
            </div>
            <div className="text-[11px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              MCP attivo · @hubspot/mcp-server
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
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
              onKeyDown={(e) =>
                e.key === 'Enter' && !e.shiftKey && sendMessage()
              }
              placeholder='Es: "Crea un deal da 15.000€ per Friulair in fase Proposta inviata"'
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
            Connesso via MCP · @hubspot/mcp-server (stdio) · Enter per inviare
          </p>
        </footer>
      </main>
    </div>
  );
}
