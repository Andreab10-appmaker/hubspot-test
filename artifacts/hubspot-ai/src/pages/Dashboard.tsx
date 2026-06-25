import { Link } from "wouter";
import {
  Wallet,
  Handshake,
  Users,
  Building2,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useDashboard } from "@/lib/api";
import { formatCurrencyCompact, relativeDate, initials, colorFromString, textColorFromString } from "@/lib/format";
import type { ChartSpec } from "@/lib/types";
import StatCard from "@/components/StatCard";
import ExportButton from "@/components/ExportButton";
import ChartView from "@/components/ChartView";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data, isLoading, error } = useDashboard();

  const chart: ChartSpec | null = data
    ? {
        id: "pipeline-by-stage",
        type: "bar",
        title: "Valore pipeline per fase",
        valueFormat: "currency",
        data: data.dealsByStage
          .filter((s) => s.value > 0)
          .map((s) => ({ label: s.stageLabel, value: s.value })),
      }
    : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-[13px] text-muted-foreground">
            Panoramica live del tuo CRM HubSpot.
          </p>
        </div>
        {/* Export Pipeline (vecchio) temporaneamente disattivato su richiesta:
        <ExportButton
          href="/api/exports/pipeline.xlsx"
          filename="pipeline-export.xlsx"
          label="Esporta Pipeline"
          testId="button-export-pipeline"
        /> */}
        <ExportButton
          href="/api/exports/revenue-spreading.xlsx"
          filename="revenue-spreading.xlsx"
          label="Esporta Revenue Spreading"
          testId="button-export-revenue"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <p className="font-semibold text-destructive">
            HubSpot non raggiungibile
          </p>
          <p className="mt-1 text-muted-foreground">
            {String((error as Error).message)}
          </p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pipeline aperta"
          value={data ? formatCurrencyCompact(data.pipelineValue) : "—"}
          hint={data ? `${data.openDeals} trattative aperte` : undefined}
          icon={Wallet}
          loading={isLoading}
          accent
          testId="stat-pipeline"
        />
        <StatCard
          label="Vinto"
          value={data ? formatCurrencyCompact(data.wonValue) : "—"}
          hint="Deal chiusi vinti"
          icon={TrendingUp}
          loading={isLoading}
          testId="stat-won"
        />
        <StatCard
          label="Trattative"
          value={data ? String(data.counts.deals) : "—"}
          icon={Handshake}
          loading={isLoading}
          testId="stat-deals"
        />
        <StatCard
          label="Contatti"
          value={data ? String(data.counts.contacts) : "—"}
          hint={data ? `${data.counts.companies} aziende` : undefined}
          icon={Users}
          loading={isLoading}
          testId="stat-contacts"
        />
      </div>

      {/* Chart + recent */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-xs lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : chart && chart.data.length > 0 ? (
            <ChartView spec={chart} />
          ) : (
            <div className="grid h-[260px] place-items-center text-sm text-muted-foreground">
              Nessun dato di pipeline da mostrare.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
              Contatti recenti
            </h2>
            <Link
              href="/contacts"
              className="flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
            >
              Tutti <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <ul className="space-y-1">
              {(data?.recentContacts ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg px-1.5 py-1.5"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    style={{
                      background: colorFromString(c.name),
                      color: textColorFromString(c.name),
                    }}
                  >
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c.name}</div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {c.email || "—"}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-muted-foreground">
                    {relativeDate(c.createdAt)}
                  </span>
                </li>
              ))}
              {data && data.recentContacts.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  Nessun contatto.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Quick links to mirror views */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { href: "/companies", label: "Aziende", icon: Building2, n: data?.counts.companies },
          { href: "/contacts", label: "Contatti", icon: Users, n: data?.counts.contacts },
          { href: "/deals", label: "Trattative", icon: Handshake, n: data?.counts.deals },
        ].map((q) => {
          const Icon = q.icon;
          return (
            <Link
              key={q.href}
              href={q.href}
              className="group flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4 shadow-xs transition-colors hover:bg-accent"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-foreground">
                <Icon className="h-5 w-5" strokeWidth={2.1} />
              </span>
              <div className="flex-1">
                <div className="font-semibold">{q.label}</div>
                <div className="text-[12.5px] text-muted-foreground">
                  {q.n ?? "—"} record
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
