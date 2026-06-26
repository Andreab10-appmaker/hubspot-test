import type { FieldDef } from "@/lib/schema";
import { stageLabel, stageTone } from "@/lib/schema";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/format";
import { useStageMap } from "@/lib/stage-context";
import { cn } from "@/lib/utils";

/** Distribuzione fatturato per anno: da JSON {anno:importo} a vista leggibile. */
export function ScheduleValue({ raw }: { raw: string }) {
  let obj: Record<string, number> = {};
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && !Array.isArray(p)) obj = p as Record<string, number>;
  } catch {
    return <span className="text-muted-foreground">{raw}</span>;
  }
  const years = Object.keys(obj)
    .filter((y) => /^\d{4}$/.test(y))
    .sort();
  if (years.length === 0) return <span className="text-muted-foreground/60">—</span>;
  const total = years.reduce((a, y) => a + (Number(obj[y]) || 0), 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5">
        {years.map((y) => (
          <span
            key={y}
            className="inline-flex items-baseline gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[12px]"
          >
            <span className="font-semibold text-muted-foreground">{y}</span>
            <span className="tabular-nums">{formatCurrencyCompact(Number(obj[y]) || 0)}</span>
          </span>
        ))}
      </div>
      <span className="text-[11.5px] text-muted-foreground">
        Totale {formatCurrency(total)}
      </span>
    </div>
  );
}

/** Storico fasi: da JSON array a timeline leggibile con durate. */
export function HistoryValue({ raw }: { raw: string }) {
  let arr: Array<{ stage?: string; enteredAt?: string; exitedAt?: string | null }> = [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) arr = p;
  } catch {
    return <span className="text-muted-foreground">{raw}</span>;
  }
  if (arr.length === 0) return <span className="text-muted-foreground/60">—</span>;
  const days = (a?: string, b?: string | null) => {
    if (!a) return null;
    const end = b ? Date.parse(b) : Date.now();
    const start = Date.parse(a);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return Math.max(0, Math.round((end - start) / 86_400_000));
  };
  return (
    <ol className="flex flex-col gap-1.5">
      {arr.map((e, i) => {
        const d = days(e.enteredAt, e.exitedAt);
        const open = !e.exitedAt;
        return (
          <li key={i} className="flex items-start gap-2 text-[12.5px]">
            <span
              className={cn(
                "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                open ? "bg-primary" : "bg-muted-foreground/40",
              )}
            />
            <span className="flex-1">
              <span className="font-medium">{e.stage}</span>
              <span className="text-muted-foreground">
                {" · "}
                {formatDate(e.enteredAt)}
                {e.exitedAt ? ` → ${formatDate(e.exitedAt)}` : " → in corso"}
                {d != null ? ` (${d} g)` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Probabilità 0–1 → percentuale con barra. */
export function PercentValue({ raw }: { raw: string }) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return <span className="text-muted-foreground/60">—</span>;
  const pct = Math.round(Math.min(1, Math.max(0, n)) * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[13px] font-semibold tabular-nums">{pct}%</span>
    </span>
  );
}

export function StageBadge({
  stage,
  prop = "dealstage",
}: {
  stage: string;
  /** Property a cui appartiene lo stato (dealstage | lifecyclestage). */
  prop?: string;
}) {
  const map = useStageMap(prop);
  const tone = stageTone(stage, map);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
        tone === "won" && "bg-emerald-100 text-emerald-700",
        tone === "lost" && "bg-rose-100 text-rose-700",
        tone === "open" && "bg-secondary text-secondary-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "won" && "bg-emerald-500",
          tone === "lost" && "bg-rose-500",
          tone === "open" && "bg-primary",
        )}
      />
      {stageLabel(stage, map)}
    </span>
  );
}

export default function FieldValue({
  field,
  value,
}: {
  field: FieldDef;
  value: string | null | undefined;
}) {
  const v = (value ?? "").toString().trim();
  if (!v) return <span className="text-muted-foreground/60">—</span>;

  switch (field.kind) {
    case "currency":
      return <span className="font-semibold tabular-nums">{formatCurrency(v)}</span>;
    case "date":
      return <span className="tabular-nums text-muted-foreground">{formatDate(v)}</span>;
    case "number":
      return <span className="tabular-nums">{v}</span>;
    case "stage":
      return <StageBadge stage={v} prop={field.key} />;
    case "schedule":
      return <ScheduleValue raw={v} />;
    case "history":
      return <HistoryValue raw={v} />;
    case "percent":
      return <PercentValue raw={v} />;
    case "email":
      return (
        <a
          href={`mailto:${v}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary hover:underline"
        >
          {v}
        </a>
      );
    case "phone":
      return (
        <a
          href={`tel:${v}`}
          onClick={(e) => e.stopPropagation()}
          className="hover:underline"
        >
          {v}
        </a>
      );
    default:
      return <span>{v}</span>;
  }
}
