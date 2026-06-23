import { Message, ConfirmAction, DownloadFile } from '../lib/types';
import ToolCallBadge from './ToolCallBadge';
import ChartView from './ChartView';

function downloadFile(file: DownloadFile) {
  const bin = atob(file.dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Estrae le property dagli input dei tool HubSpot (es. batch-create-objects),
// per mostrare un'anteprima leggibile invece del JSON grezzo.
function ActionDetails({ input }: { input: Record<string, unknown> }) {
  const inputs = (input as { inputs?: unknown }).inputs;
  if (Array.isArray(inputs) && inputs.length > 0) {
    return (
      <div className="space-y-1.5">
        {inputs.map((obj, i) => {
          const props = (obj as { properties?: Record<string, unknown> })?.properties || {};
          const entries = Object.entries(props);
          return (
            <div key={i} className="rounded-md bg-white border border-amber-200 p-2">
              {entries.length === 0 ? (
                <span className="text-gray-400 text-[11px]">(nessuna property)</span>
              ) : (
                <table className="w-full text-[11px]">
                  <tbody>
                    {entries.map(([k, v]) => (
                      <tr key={k}>
                        <td className="text-gray-500 pr-2 align-top whitespace-nowrap">{k}</td>
                        <td className="text-[#2D3E50] font-medium break-words">{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <pre className="text-[11px] bg-white border border-amber-200 rounded-md p-2 overflow-auto max-h-44 text-gray-700">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

function ConfirmCard({
  actions,
  status,
  onConfirm,
  onCancel,
  disabled,
}: {
  actions: ConfirmAction[];
  status: 'pending' | 'confirmed' | 'cancelled';
  onConfirm?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-2 rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800 mb-2">
        ⚠️ Conferma richiesta prima di scrivere su HubSpot
      </div>
      <div className="space-y-2">
        {actions.map((a) => (
          <div key={a.id}>
            <div className="text-[12.5px] font-semibold text-[#2D3E50] mb-1">{a.title}</div>
            <ActionDetails input={a.input} />
          </div>
        ))}
      </div>

      {status === 'pending' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={onConfirm}
            disabled={disabled}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[12px] font-semibold rounded-lg px-3 py-2 transition-colors"
          >
            ✅ Conferma ed esegui
          </button>
          <button
            onClick={onCancel}
            disabled={disabled}
            className="flex-1 bg-white hover:bg-gray-50 disabled:opacity-50 border border-gray-300 text-[#33475B] text-[12px] font-semibold rounded-lg px-3 py-2 transition-colors"
          >
            ✖ Annulla
          </button>
        </div>
      )}
      {status === 'confirmed' && (
        <div className="mt-2 text-[11px] font-semibold text-emerald-700">✅ Confermato ed eseguito.</div>
      )}
      {status === 'cancelled' && (
        <div className="mt-2 text-[11px] font-semibold text-gray-500">✖ Annullato. Nessuna modifica.</div>
      )}
    </div>
  );
}

export default function MessageBubble({
  message,
  onConfirm,
  onCancel,
  disabled,
}: {
  message: Message;
  onConfirm?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold
        ${isUser ? 'bg-[#33475B]' : 'bg-[#FF7A59]'}`}
      >
        {isUser ? 'TU' : 'HS'}
      </div>
      <div className="max-w-[78%] min-w-0">
        {/* Tool call badges */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.toolCalls.map((tc, i) => (
              <ToolCallBadge key={i} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Charts */}
        {!isUser && message.charts && message.charts.length > 0 && (
          <div className="mb-2 space-y-2">
            {message.charts.map((c) => (
              <ChartView key={c.id} spec={c} />
            ))}
          </div>
        )}

        {/* Conferma operazioni di scrittura */}
        {!isUser && message.pendingConfirm && (
          <ConfirmCard
            actions={message.pendingConfirm.actions}
            status={message.pendingConfirm.status}
            onConfirm={onConfirm}
            onCancel={onCancel}
            disabled={disabled}
          />
        )}

        {/* Download file (Excel, ecc.) */}
        {!isUser && message.files && message.files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.files.map((f) => (
              <button
                key={f.id}
                onClick={() => downloadFile(f)}
                className="inline-flex items-center gap-1.5 bg-[#1D6F42] hover:bg-[#185c37] text-white text-[12px] font-semibold rounded-lg px-3 py-2 transition-colors shadow-sm"
              >
                ⬇️ Scarica {f.name}
              </button>
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
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}
