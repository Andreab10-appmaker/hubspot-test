import { ChevronRight, Inbox } from "lucide-react";
import type { EntityConfig } from "@/lib/schema";
import type { CrmRecord } from "@/lib/api";
import { initials, colorFromString, textColorFromString } from "@/lib/format";
import FieldValue from "@/components/FieldValue";
import { useStageMap } from "@/lib/stage-context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DataTableProps {
  config: EntityConfig;
  records: CrmRecord[];
  loading?: boolean;
  error?: string | null;
  onSelect: (record: CrmRecord) => void;
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold"
      style={{ background: colorFromString(name), color: textColorFromString(name) }}
    >
      {initials(name)}
    </span>
  );
}

export default function DataTable({
  config,
  records,
  loading,
  error,
  onSelect,
}: DataTableProps) {
  const columns = config.fields.filter((f) => f.column);
  // Mappa stati per risolvere i sottotitoli (deals→dealstage, contacts→lifecyclestage).
  const dealMap = useStageMap("dealstage");
  const lifeMap = useStageMap("lifecyclestage");
  const stageMap =
    config.type === "deals"
      ? dealMap
      : config.type === "contacts"
        ? lifeMap
        : undefined;

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-semibold text-destructive">
          Impossibile leggere da HubSpot
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-card-border bg-card p-3"
          >
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
        <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 font-semibold">Nessun {config.singular.toLowerCase()}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Non ci sono record da mostrare con i filtri attuali.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card list */}
      <ul className="space-y-2 md:hidden" data-testid="datatable-mobile">
        {records.map((r) => {
          const title = config.title(r);
          const sub = config.subtitle?.(r, stageMap);
          return (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r)}
                data-testid={`row-${r.id}`}
                className="flex w-full items-center gap-3 rounded-xl border border-card-border bg-card p-3 text-left shadow-xs transition-colors hover:bg-accent"
              >
                <Avatar name={title} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{title}</div>
                  {sub && (
                    <div className="truncate text-[13px] text-muted-foreground">
                      {sub}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-2xl border border-card-border bg-card shadow-xs md:block">
        <table className="w-full text-sm" data-testid="datatable-desktop">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-4 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground",
                    i === 0 && "pl-5",
                  )}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const title = config.title(r);
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r)}
                  data-testid={`row-${r.id}`}
                  className="group cursor-pointer border-b border-border/60 last:border-0 transition-colors hover:bg-accent/60"
                >
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-4 py-3", i === 0 && "pl-5")}>
                      {i === 0 ? (
                        <div className="flex items-center gap-3">
                          <Avatar name={title} />
                          <span className="font-semibold">
                            <FieldValue field={c} value={r.properties[c.key]} />
                          </span>
                        </div>
                      ) : (
                        <FieldValue field={c} value={r.properties[c.key]} />
                      )}
                    </td>
                  ))}
                  <td className="pr-4 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
