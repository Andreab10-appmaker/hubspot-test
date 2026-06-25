import type { FieldDef } from "@/lib/schema";
import { stageLabel, stageTone } from "@/lib/schema";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StageBadge({ stage }: { stage: string }) {
  const tone = stageTone(stage);
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
      {stageLabel(stage)}
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
      return <StageBadge stage={v} />;
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
