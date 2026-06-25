import { useMemo, useState } from "react";
import { ChevronDown, Inbox } from "lucide-react";
import type { CrmRecord } from "@/lib/api";
import { useStageOrdered } from "@/lib/stage-context";
import { stageTone, stageLabel } from "@/lib/schema";
import { formatCurrency, formatCurrencyCompact, formatDate, toNumber } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Column {
  value: string;
  label: string;
  records: CrmRecord[];
  total: number;
}

const UNASSIGNED = "__none__";

function toneDot(tone: "won" | "lost" | "open") {
  return tone === "won"
    ? "bg-emerald-500"
    : tone === "lost"
      ? "bg-rose-500"
      : "bg-primary";
}

function DealCard({
  record,
  onSelect,
}: {
  record: CrmRecord;
  onSelect: (r: CrmRecord) => void;
}) {
  const name = record.properties.dealname || "(senza nome)";
  const amount = record.properties.amount;
  const close = record.properties.closedate;
  return (
    <button
      onClick={() => onSelect(record)}
      data-testid={`deal-card-${record.id}`}
      className="w-full rounded-xl border border-card-border bg-card p-3 text-left shadow-xs transition-colors hover:bg-accent"
    >
      <div className="line-clamp-2 text-[13.5px] font-semibold leading-snug">
        {name}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[13px] font-bold tabular-nums text-primary">
          {amount ? formatCurrency(amount) : "—"}
        </span>
        {close && (
          <span className="text-[11.5px] text-muted-foreground">
            {formatDate(close)}
          </span>
        )}
      </div>
    </button>
  );
}

export default function KanbanBoard({
  records,
  loading,
  error,
  onSelect,
}: {
  records: CrmRecord[];
  loading?: boolean;
  error?: string | null;
  onSelect: (r: CrmRecord) => void;
}) {
  const ordered = useStageOrdered("dealstage");
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const columns = useMemo<Column[]>(() => {
    const byStage = new Map<string, CrmRecord[]>();
    for (const r of records) {
      const k = r.properties.dealstage || UNASSIGNED;
      const arr = byStage.get(k) || [];
      arr.push(r);
      byStage.set(k, arr);
    }
    const cols: Column[] = ordered.map((o) => ({
      value: o.value,
      label: o.label,
      records: byStage.get(o.value) || [],
      total: (byStage.get(o.value) || []).reduce(
        (s, r) => s + toNumber(r.properties.amount),
        0,
      ),
    }));
    // Eventuali stati non presenti nelle opzioni (es. slug legacy): risolvi
    // comunque una label leggibile, mai l'ID/slug grezzo.
    const labelMap = Object.fromEntries(ordered.map((o) => [o.value, o.label]));
    for (const [k, recs] of byStage) {
      if (k !== UNASSIGNED && !ordered.some((o) => o.value === k)) {
        cols.push({
          value: k,
          label: stageLabel(k, labelMap),
          records: recs,
          total: recs.reduce((s, r) => s + toNumber(r.properties.amount), 0),
        });
      }
    }
    const none = byStage.get(UNASSIGNED);
    if (none && none.length) {
      cols.push({
        value: UNASSIGNED,
        label: "Senza fase",
        records: none,
        total: none.reduce((s, r) => s + toNumber(r.properties.amount), 0),
      });
    }
    return cols;
  }, [records, ordered]);

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-semibold text-destructive">
          Impossibile leggere le trattative da HubSpot
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
        <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 font-semibold">Nessuna trattativa</p>
      </div>
    );
  }

  // === Mobile: gruppi impilati comprimibili =================================
  if (isMobile) {
    return (
      <div className="space-y-3">
        {columns.map((c) => {
          const isClosed = collapsed[c.value];
          const tone = stageTone(c.value, Object.fromEntries(ordered.map((o) => [o.value, o.label])));
          return (
            <div
              key={c.value}
              className="overflow-hidden rounded-2xl border border-card-border bg-card"
            >
              <button
                onClick={() =>
                  setCollapsed((s) => ({ ...s, [c.value]: !s[c.value] }))
                }
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
                data-testid={`kanban-group-${c.value}`}
              >
                <span className={cn("h-2 w-2 rounded-full", toneDot(tone))} />
                <span className="font-semibold">{c.label}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {c.records.length}
                </span>
                <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-muted-foreground">
                  {formatCurrencyCompact(c.total)}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    !isClosed && "rotate-180",
                  )}
                />
              </button>
              {!isClosed && (
                <div className="space-y-2 px-3 pb-3">
                  {c.records.length === 0 ? (
                    <p className="px-1 py-2 text-[12.5px] text-muted-foreground">
                      Nessuna trattativa in questa fase.
                    </p>
                  ) : (
                    c.records.map((r) => (
                      <DealCard key={r.id} record={r} onSelect={onSelect} />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // === Desktop: colonne orizzontali stile HubSpot ===========================
  const toneMap = Object.fromEntries(ordered.map((o) => [o.value, o.label]));
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {columns.map((c) => {
        const tone = stageTone(c.value, toneMap);
        return (
          <div
            key={c.value}
            className="flex w-72 shrink-0 flex-col rounded-2xl bg-secondary/40"
            data-testid={`kanban-col-${c.value}`}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <span className={cn("h-2 w-2 rounded-full", toneDot(tone))} />
              <span className="truncate text-[13px] font-bold">{c.label}</span>
              <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {c.records.length}
              </span>
              <span className="ml-auto shrink-0 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                {formatCurrencyCompact(c.total)}
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
              {c.records.map((r) => (
                <DealCard key={r.id} record={r} onSelect={onSelect} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
