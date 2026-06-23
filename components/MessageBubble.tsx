'use client';

import { Message } from '@/lib/types';
import ToolCallBadge from './ToolCallBadge';

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold
        ${isUser ? 'bg-[#33475B]' : 'bg-[#FF7A59]'}`}
      >
        {isUser ? 'TU' : 'HS'}
      </div>
      <div className="max-w-[76%]">
        {/* Tool call badges */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.toolCalls.map((tc, i) => (
              <ToolCallBadge key={i} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
            ${
              isUser
                ? 'bg-[#FF7A59] text-white rounded-br-sm'
                : `bg-white border border-gray-200 text-[#2D3E50] rounded-bl-sm shadow-sm ${
                    message.isError ? 'border-red-200 bg-red-50' : ''
                  }`
            }`}
          >
            {message.content || (
              <span className="text-gray-400 animate-pulse">...</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
