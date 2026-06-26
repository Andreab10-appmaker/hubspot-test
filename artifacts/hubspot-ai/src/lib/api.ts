import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

export type CrmType = "companies" | "contacts" | "deals";

export interface CrmRecord {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CrmListResult {
  results: CrmRecord[];
  after?: string | null;
  total?: number;
}

export interface PropertyOption {
  value: string;
  label: string;
  displayOrder: number;
}

export interface DashboardSummary {
  counts: { companies: number; contacts: number; deals: number };
  pipelineValue: number;
  wonValue: number;
  openDeals: number;
  dealsByStage: Array<{
    stage: string;
    stageLabel: string;
    count: number;
    value: number;
  }>;
  // Fatturato canonico per anno (revenue spreading) — stessa fonte di Excel e AI.
  revenueByYear?: Array<{ year: number; value: number }>;
  totalScheduledRevenue?: number;
  // Fatturato proiettato oltre la durata dei contratti (stima rinnovi).
  projectedByYear?: Array<{ year: number; value: number }>;
  recentContacts: Array<{
    id: string;
    name: string;
    email: string;
    createdAt?: string;
  }>;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// === Query hooks ==========================================================

export function useCrmList(type: CrmType, search: string) {
  return useQuery({
    queryKey: ["crm", type, search],
    queryFn: () => {
      const qs = search ? `?q=${encodeURIComponent(search)}` : "";
      return getJSON<CrmListResult>(`/api/crm/${type}${qs}`);
    },
    staleTime: 15_000,
  });
}

export function useCrmRecord(type: CrmType, id: string | null) {
  return useQuery({
    queryKey: ["crm", type, "record", id],
    queryFn: () => getJSON<CrmRecord>(`/api/crm/${type}/${id}`),
    enabled: !!id,
  });
}

// Opzioni (value→label, ordinate) di una property enumeration, es. dealstage.
export function useStageOptions(type: CrmType, prop: string) {
  return useQuery({
    queryKey: ["crm", "meta", type, prop],
    queryFn: () =>
      getJSON<{ options: PropertyOption[] }>(`/api/crm/meta/${type}/${prop}`),
    staleTime: 5 * 60_000,
    select: (d) => d.options,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getJSON<DashboardSummary>("/api/crm/dashboard/summary"),
    staleTime: 30_000,
  });
}

// === Analisi funnel (pagina Insight) ======================================

export interface DealAnalytics {
  generatedAt: string;
  totals: { deals: number; closed: number; won: number; lost: number; open: number };
  funnelVelocityBySource: Array<{
    source: string;
    deals: number;
    avgDaysToClose: number | null;
    stages: Array<{ stage: string; avgDays: number; count: number }>;
  }>;
  stuckStages: Array<{
    stage: string;
    avgDaysInStage: number;
    completedTransitions: number;
    currentlyInStage: number;
    currentlyStuck: number;
    stuckDeals: Array<{ code: string; name: string; owner: string; daysInStage: number }>;
  }>;
  inactiveDeals: {
    thresholdDays: number;
    count: number;
    deals: Array<{
      code: string;
      name: string;
      owner: string;
      stage: string;
      amount: number;
      lastActivityDate: string;
      daysSinceActivity: number;
    }>;
  };
  salesCycleByValue: {
    buckets: Array<{ bucket: string; label: string; avgCycleDays: number; count: number }>;
    overallAvgDays: number;
  };
  winRateByCountry: {
    countries: Array<{
      country: string;
      won: number;
      lost: number;
      open: number;
      decided: number;
      winRate: number | null;
    }>;
    overallWinRate: number | null;
  };
  stageTransitions: {
    transitions: Array<{ from: string; to: string; count: number }>;
    discoveryToClosedLost: { count: number; deals: Array<{ code: string; name: string }> };
  };
  notes: string[];
}

export function useDealAnalytics() {
  return useQuery({
    queryKey: ["deal-analytics"],
    queryFn: () => getJSON<DealAnalytics>("/api/crm/analytics"),
    staleTime: 60_000,
  });
}

// === Fatturato: contrattualizzato + proiezione (grafico drill-down) ========

export interface RevenueDealDetail {
  code: string;
  name: string;
  country: string;
  stage: string;
  owner: string;
  amount: number;
  scheduledTotal: number;
  renewalProbability: number;
  schedule: Record<string, number>;
  projectedSchedule: Record<string, number>;
}

export interface RevenueDetail {
  years: number[];
  projectionYears: number[];
  revenueByYear: Array<{ year: number; value: number }>;
  projectedByYear: Array<{ year: number; value: number }>;
  totalScheduled: number;
  totalProjected: number;
  assumptions: string;
  deals: RevenueDealDetail[];
}

export function useRevenue() {
  return useQuery({
    queryKey: ["revenue"],
    queryFn: () => getJSON<RevenueDetail>("/api/crm/revenue"),
    staleTime: 60_000,
  });
}

// === Mutations ============================================================

export function useUpdateRecord(type: CrmType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      properties: Record<string, string>;
    }) => {
      const res = await fetch(`/api/crm/${type}/${vars.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: vars.properties }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<CrmRecord>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", type] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreateRecord(type: CrmType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (properties: Record<string, string>) => {
      const res = await fetch(`/api/crm/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<CrmRecord>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", type] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
