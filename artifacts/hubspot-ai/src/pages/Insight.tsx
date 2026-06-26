import { useDealAnalytics, type DealAnalytics } from "@/lib/api";
import ChartView from "@/components/ChartView";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyCompact } from "@/lib/format";
import type { ChartSpec } from "@/lib/types";
import {
  Gauge,
  TimerReset,
  BellOff,
  Clock,
  Globe2,
  GitBranch,
  Info,
} from "lucide-react";

/** Riquadro di una sezione con titolo, spiegazione e contenuto. */
function Section({
  icon: Icon,
  title,
  question,
  how,
  children,
}: {
  icon: typeof Gauge;
  title: string;
  question: string;
  how: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-card-border bg-card p-4 shadow-xs sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-secondary text-foreground">
          <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
        </span>
        <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
      </div>
      <p className="text-[12.5px] font-medium text-foreground/80">{question}</p>
      <p className="mb-3 text-[11.5px] text-muted-foreground">{how}</p>
      {children}
    </section>
  );
}

const fmtDays = (n: number | null) => (n == null ? "—" : `${n} g`);
const fmtPct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export default function Insight() {
  const { data, isLoading, error } = useDealAnalytics();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Insight pipeline</h1>
        <p className="text-[13px] text-muted-foreground">
          Analisi del funnel calcolate dal vivo da HubSpot. Gli stessi numeri che
          ottieni dall'assistente AI: chiedi pure in chat, le risposte coincidono.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <p className="font-semibold text-destructive">Dati non disponibili</p>
          <p className="mt-1 text-muted-foreground">
            {String((error as Error).message)}
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Suggerimento: esegui gli script <code>setup:deal-fields</code> e{" "}
            <code>seed:deals</code> per creare i campi e popolare i dati su HubSpot.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[220px] w-full rounded-2xl" />
          ))}
        </div>
      )}

      {data && <InsightBody data={data} />}
    </div>
  );
}

function InsightBody({ data }: { data: DealAnalytics }) {
  // --- Spec dei grafici ---
  const winChart: ChartSpec = {
    id: "win-by-country",
    type: "bar",
    title: "Win rate per paese",
    valueFormat: "percent",
    data: data.winRateByCountry.countries
      .filter((c) => c.winRate != null)
      .map((c) => ({ label: c.country, value: c.winRate as number })),
  };
  const cycleChart: ChartSpec = {
    id: "cycle-by-value",
    type: "bar",
    title: "Ciclo di vendita medio (giorni) per valore",
    valueFormat: "number",
    data: data.salesCycleByValue.buckets.map((b) => ({
      label: b.label,
      value: b.avgCycleDays,
    })),
  };
  const stuckChart: ChartSpec = {
    id: "stuck-stages",
    type: "bar",
    title: "Tempo medio per fase (giorni)",
    valueFormat: "number",
    data: data.stuckStages
      .filter((s) => s.avgDaysInStage > 0)
      .map((s) => ({ label: s.stage, value: s.avgDaysInStage })),
  };
  const velocityChart: ChartSpec = {
    id: "velocity-by-source",
    type: "bar",
    title: "Giorni medi alla chiusura per sorgente",
    valueFormat: "number",
    data: data.funnelVelocityBySource
      .filter((s) => s.avgDaysToClose != null)
      .map((s) => ({ label: s.source, value: s.avgDaysToClose as number })),
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Q5 — Win rate per paese */}
        <Section
          icon={Globe2}
          title="Win rate per paese"
          question="Quale paese ha il miglior tasso di vittoria?"
          how="Win rate = deal vinti / (vinti + persi) per paese. I deal aperti non contano."
        >
          {winChart.data.length > 0 ? <ChartView spec={winChart} /> : <Empty />}
          <Table
            head={["Paese", "Vinti", "Persi", "Aperti", "Win rate"]}
            rows={data.winRateByCountry.countries.map((c) => [
              c.country,
              String(c.won),
              String(c.lost),
              String(c.open),
              fmtPct(c.winRate),
            ])}
          />
          <Foot>
            Win rate complessivo:{" "}
            <b>{fmtPct(data.winRateByCountry.overallWinRate)}</b>
          </Foot>
        </Section>

        {/* Q1 — Velocità funnel per sorgente */}
        <Section
          icon={Gauge}
          title="Velocità nel funnel per sorgente"
          question="Quanto velocemente i deal avanzano nel funnel in base alla sorgente?"
          how="Giorni medi dall'ingresso alla chiusura, e tempo medio per fase, raggruppati per deal source."
        >
          {velocityChart.data.length > 0 ? (
            <ChartView spec={velocityChart} />
          ) : (
            <Empty />
          )}
          <Table
            head={["Sorgente", "Deal", "Giorni a chiusura"]}
            rows={data.funnelVelocityBySource.map((s) => [
              s.source,
              String(s.deals),
              fmtDays(s.avgDaysToClose),
            ])}
          />
        </Section>

        {/* Q2 — Fasi dove i deal si bloccano */}
        <Section
          icon={TimerReset}
          title="Fasi dove i deal si bloccano"
          question="In quali fasi le trattative restano ferme più a lungo?"
          how="Tempo medio trascorso in ciascuna fase (transizioni completate) e deal attualmente fermi oltre 30 giorni."
        >
          {stuckChart.data.length > 0 ? (
            <ChartView spec={stuckChart} />
          ) : (
            <Empty />
          )}
          <Table
            head={["Fase", "Giorni medi", "Fermi ora"]}
            rows={data.stuckStages.map((s) => [
              s.stage,
              fmtDays(s.avgDaysInStage),
              String(s.currentlyStuck),
            ])}
          />
        </Section>

        {/* Q4 — Ciclo di vendita per valore */}
        <Section
          icon={Clock}
          title="Ciclo di vendita per valore"
          question="Qual è il ciclo di vendita medio in base al valore del deal?"
          how="Giorni dall'apertura alla vittoria, sui soli deal vinti, raggruppati per fascia di importo."
        >
          {cycleChart.data.length > 0 ? (
            <ChartView spec={cycleChart} />
          ) : (
            <Empty />
          )}
          <Foot>
            Media complessiva:{" "}
            <b>{fmtDays(data.salesCycleByValue.overallAvgDays)}</b>
          </Foot>
        </Section>
      </div>

      {/* Q3 — Deal senza attività */}
      <Section
        icon={BellOff}
        title="Deal senza attività recenti"
        question={`Quali deal non hanno attività da oltre ${data.inactiveDeals.thresholdDays} giorni?`}
        how="Deal aperti la cui ultima attività è più vecchia della soglia. Ordinati dal più fermo."
      >
        {data.inactiveDeals.count === 0 ? (
          <Empty text="Nessun deal inattivo: ottimo presidio." />
        ) : (
          <Table
            head={["Deal", "Owner", "Fase", "Valore", "Ferma da"]}
            rows={data.inactiveDeals.deals.map((d) => [
              d.name,
              d.owner || "—",
              d.stage,
              formatCurrencyCompact(d.amount),
              `${d.daysSinceActivity} g`,
            ])}
          />
        )}
        <Foot>
          {data.inactiveDeals.count} deal senza attività da ≥{" "}
          {data.inactiveDeals.thresholdDays} giorni.
        </Foot>
      </Section>

      {/* Q6 — Discovery → Closed Lost */}
      <Section
        icon={GitBranch}
        title="Discovery call → Closed Lost (diretto)"
        question="Quanti deal passano dalla Discovery call direttamente a Closed Lost?"
        how="Trattative la cui fase successiva alla Discovery call è stata, senza tappe intermedie, Closed Lost."
      >
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">
            {data.stageTransitions.discoveryToClosedLost.count}
          </span>
          <span className="text-[13px] text-muted-foreground">
            deal persi subito dopo la discovery
          </span>
        </div>
        {data.stageTransitions.discoveryToClosedLost.deals.length > 0 && (
          <Table
            head={["Deal"]}
            rows={data.stageTransitions.discoveryToClosedLost.deals.map((d) => [
              d.name,
            ])}
          />
        )}
      </Section>

      {data.notes.length > 0 && (
        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-[12px] text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground/80">
            <Info className="h-3.5 w-3.5" /> Note metodologiche
          </div>
          <ul className="list-disc space-y-0.5 pl-5">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className="py-1.5 pr-3 font-semibold last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-3 last:pr-0 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Foot({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[12px] text-muted-foreground">{children}</p>;
}

function Empty({ text = "Dati insufficienti per questa analisi." }: { text?: string }) {
  return (
    <div className="grid h-[120px] place-items-center rounded-xl bg-muted/40 text-[12.5px] text-muted-foreground">
      {text}
    </div>
  );
}
