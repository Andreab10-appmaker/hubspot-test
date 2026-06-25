const ACTIONS = [
  {
    icon: "📊",
    label: "Pipeline 2026",
    prompt:
      "Mostrami la pipeline di vendita per il 2026 con un grafico a barre del valore (€) per fase.",
  },
  {
    icon: "💶",
    label: "Incassi del mese",
    prompt:
      "Quali sono gli incassi previsti questo mese? Mostra il dettaglio con un grafico.",
  },
  {
    icon: "📈",
    label: "Forecast 3 anni",
    prompt:
      "Previsione incassi per i prossimi 3 anni, con un grafico per anno (valori in €).",
  },
  {
    icon: "🥧",
    label: "Lead per fonte",
    prompt:
      "Distribuzione dei contatti/lead per fonte di provenienza, con un grafico a torta.",
  },
  {
    icon: "💰",
    label: "Deal aperti",
    prompt: "Mostra i deal aperti nella pipeline, con un grafico per fase.",
  },
  {
    icon: "📥",
    label: "Esporta Excel",
    prompt:
      "Esporta in un file Excel scaricabile i deal aperti, con colonne Nome, Fase, Valore (€) e Data di chiusura, e una riga TOTALE che usa una formula di somma sulla colonna Valore. Usa il tool create_excel. Se HubSpot non è raggiungibile, genera comunque un foglio d'esempio con 3 righe fittizie per mostrarmi il formato.",
  },
  {
    icon: "🗂️",
    label: "Pipeline Export",
    prompt:
      "Genera la Pipeline Export ufficiale (.xlsx) nel template aziendale. Recupera da HubSpot TUTTI i deal della pipeline (per ciascuno: nome, importo/amount e data di chiusura/closedate) e chiama il tool create_pipeline_export passandoli in 'deals'. Il tool riproduce automaticamente il template (gruppo 'Revenue', colonne anno 2023B/2023A/2025–2030 con formati € e riga TOTALE con formula =SUM) e colloca l'importo di ogni deal nella colonna del suo anno di chiusura. Se HubSpot non è raggiungibile, usa 3 deal d'esempio per mostrarmi il formato.",
  },
  {
    icon: "📄",
    label: "Report PDF",
    prompt:
      "Genera un report PDF scaricabile dei deal aperti, con titolo, colonne Nome, Fase e Valore (€) e una riga TOTALE. Usa il tool create_pdf. Se HubSpot non è raggiungibile, usa 3 righe d'esempio per mostrarmi il formato.",
  },
  {
    icon: "📑",
    label: "Presentazione",
    prompt:
      "Crea una presentazione PowerPoint scaricabile sulla pipeline 2026: una slide di sintesi con 3 punti chiave e una slide con la tabella dei deal per fase (valori in €). Usa il tool create_pptx. Se HubSpot non è raggiungibile, usa dati d'esempio.",
  },
  {
    icon: "🧾",
    label: "Esporta CSV",
    prompt:
      "Esporta in un file CSV scaricabile i contatti recenti, con colonne Nome, Email e Azienda. Usa il tool create_csv. Se HubSpot non è raggiungibile, usa 3 righe d'esempio.",
  },
  {
    icon: "👤",
    label: "Contatti recenti",
    prompt: "Mostra i 5 contatti aggiunti più di recente",
  },
  {
    icon: "➕",
    label: "Crea deal",
    prompt: "Voglio creare un nuovo deal. Chiedimi i dettagli.",
  },
  {
    icon: "📝",
    label: "Crea nota",
    prompt: "Voglio aggiungere una nota a un contatto. Di chi si tratta?",
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
