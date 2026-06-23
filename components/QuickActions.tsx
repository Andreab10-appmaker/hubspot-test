'use client';

const ACTIONS = [
  {
    icon: '📊',
    label: 'Pipeline 2026',
    prompt:
      'Mostrami la pipeline di vendita per il 2026 con un grafico a barre del valore (€) per fase.',
  },
  {
    icon: '💶',
    label: 'Incassi del mese',
    prompt:
      'Quali sono gli incassi previsti questo mese? Mostra il dettaglio con un grafico.',
  },
  {
    icon: '📈',
    label: 'Forecast 3 anni',
    prompt:
      'Previsione incassi per i prossimi 3 anni, con un grafico per anno (valori in €).',
  },
  {
    icon: '🥧',
    label: 'Lead per fonte',
    prompt:
      'Distribuzione dei contatti/lead per fonte di provenienza, con un grafico a torta.',
  },
  {
    icon: '💰',
    label: 'Deal aperti',
    prompt: 'Mostra i deal aperti nella pipeline, con un grafico per fase.',
  },
  {
    icon: '👤',
    label: 'Contatti recenti',
    prompt: 'Mostra i 5 contatti aggiunti più di recente',
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
