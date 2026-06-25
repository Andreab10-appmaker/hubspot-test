import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  loading?: boolean;
  accent?: boolean;
  testId?: string;
}

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  accent,
  testId,
}: StatCardProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-2xl border p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5",
        accent
          ? "border-primary/25 bg-primary/[0.06]"
          : "border-card-border bg-card",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg",
            accent
              ? "bg-primary/15 text-primary"
              : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div className="mt-2 text-2xl font-bold tracking-tight sm:text-[28px]">
          {value}
        </div>
      )}
      {hint && !loading && (
        <div className="mt-1 text-[12.5px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
