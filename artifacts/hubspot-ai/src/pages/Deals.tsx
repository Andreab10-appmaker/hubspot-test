import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { CrmRecord } from "@/lib/api";
import { useCrmList } from "@/lib/api";
import { ENTITIES } from "@/lib/schema";
import KanbanBoard from "@/components/KanbanBoard";
import RecordPanel from "@/components/RecordPanel";
import CreateDialog from "@/components/CreateDialog";
import ExportButton from "@/components/ExportButton";
import { Input } from "@/components/ui/input";

export default function Deals() {
  const config = ENTITIES.deals;
  const Icon = config.icon;
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CrmRecord | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const { data, isLoading, error } = useCrmList("deals", search);
  const records = data?.results ?? [];

  const openRecord = (r: CrmRecord) => {
    setSelected(r);
    setPanelOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-foreground">
            <Icon className="h-5 w-5" strokeWidth={2.1} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{config.plural}</h1>
            <p className="text-[12.5px] text-muted-foreground">
              {isLoading
                ? "Caricamento da HubSpot…"
                : `${records.length} trattative · pipeline live`}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Export Pipeline (vecchio) disattivato; ora si usa Revenue Spreading. */}
          <ExportButton
            href="/api/exports/revenue-spreading.xlsx"
            filename="revenue-spreading.xlsx"
            label="Esporta Revenue Spreading"
            testId="button-export-revenue"
          />
          <ExportButton
            href="/api/exports/deals.csv"
            filename="deals.csv"
            label="CSV"
            variant="outline"
            testId="button-export-csv"
          />
          <CreateDialog config={config} type="deals" />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          placeholder="Cerca trattative…"
          className="h-11 pl-9"
          type="search"
          data-testid="input-search"
        />
      </div>

      <KanbanBoard
        records={records}
        loading={isLoading}
        error={error ? String((error as Error).message) : null}
        onSelect={openRecord}
      />

      <RecordPanel
        config={config}
        type="deals"
        record={selected}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
