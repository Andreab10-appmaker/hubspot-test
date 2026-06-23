'use client';

import { useState } from 'react';
import { ToolCall } from '@/lib/types';

const TOOL_ICONS: Record<string, string> = {
  search_contacts: '🔍',
  get_contacts: '👤',
  create_contact: '➕',
  search_deals: '💰',
  get_deals: '💰',
  create_deal: '➕',
  update_deal: '✏️',
  search_companies: '🏢',
  get_companies: '🏢',
  create_note: '📝',
  create_task: '✅',
  get_engagements: '📅',
};

function iconFor(name: string): string {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  const n = name.toLowerCase();
  if (n.includes('deal')) return '💰';
  if (n.includes('contact')) return '👤';
  if (n.includes('compan')) return '🏢';
  if (n.includes('note')) return '📝';
  if (n.includes('task') || n.includes('engagement')) return '✅';
  if (n.includes('search') || n.includes('list') || n.includes('get')) return '🔍';
  if (n.includes('create') || n.includes('add')) return '➕';
  if (n.includes('update') || n.includes('patch')) return '✏️';
  return '🔧';
}

export default function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const [open, setOpen] = useState(false);
  const icon = iconFor(toolCall.name);
  const label = toolCall.name.replace(/[_-]/g, ' ');

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-600
          text-[11px] font-semibold rounded-full px-2.5 py-0.5 cursor-pointer hover:bg-orange-100 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
        {icon} {label}
        {toolCall.result != null && <span className="text-green-600">✓</span>}
        <span className="text-[9px] opacity-60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-1 ml-2 p-2 bg-orange-50 border border-orange-100 rounded-lg text-[11px] font-mono text-gray-700 overflow-auto max-h-36">
          <div className="font-semibold text-gray-500 mb-1">INPUT:</div>
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
          {toolCall.result != null && (
            <>
              <div className="font-semibold text-gray-500 mt-2 mb-1">OUTPUT:</div>
              <pre className="text-green-700 whitespace-pre-wrap break-words">
                {typeof toolCall.result === 'string'
                  ? toolCall.result.slice(0, 500)
                  : JSON.stringify(toolCall.result, null, 2).slice(0, 500)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
