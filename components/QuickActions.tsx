'use client';

const ACTIONS = [
  { icon: '💰', label: 'Deal aperti', prompt: 'Mostra i deal aperti nella pipeline' },
  {
    icon: '👤',
    label: 'Contatti recenti',
    prompt: 'Mostra i 5 contatti aggiunti più di recente',
  },
  { icon: '🏢', label: 'Aziende', prompt: 'Lista le prime 10 aziende nel CRM' },
  {
    icon: '📊',
    label: 'Pipeline',
    prompt: 'Analizza la pipeline di vendita raggruppata per fase',
  },
  {
    icon: '📅',
    label: 'Scadenze',
    prompt: 'Quali deal hanno la data di chiusura nelle prossime 4 settimane?',
  },
  {
    icon: '➕',
    label: 'Crea deal',
    prompt: 'Voglio creare un nuovo deal. Chiedimi i dettagli.',
  },
  {
    icon: '📝',
    label: 'Crea nota',
    prompt: 'Voglio aggiungere una nota a un contatto. Di chi si tratta?',
  },
  { icon: '🔍', label: 'Cerca contatto', prompt: 'Aiutami a cercare un contatto specifico' },
];

export default function QuickActions({
  onAction,
  disabled,
}: {
  onAction: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      {ACTIONS.map((a, i) => (
        <button
          key={i}
          onClick={() => onAction(a.prompt)}
          disabled={disabled}
          className="flex items-center gap-2 w-full text-left px-2 py-2 rounded-lg text-[12.5px] text-[#33475B]
            hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="text-base">{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </>
  );
}
