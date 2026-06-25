import { createContext, useContext } from "react";
import { useStageOptions, type PropertyOption } from "@/lib/api";

interface StageData {
  /** Mappa value→label per property key (es. dealstage, lifecyclestage). */
  maps: Record<string, Record<string, string>>;
  /** Opzioni ordinate (displayOrder) per property key. */
  ordered: Record<string, PropertyOption[]>;
}

const StageContext = createContext<StageData>({ maps: {}, ordered: {} });

export function StageOptionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dealStages = useStageOptions("deals", "dealstage");
  const lifecycle = useStageOptions("contacts", "lifecyclestage");
  const contractType = useStageOptions("deals", "contract_type");

  const toMap = (opts?: PropertyOption[]) =>
    Object.fromEntries((opts ?? []).map((o) => [o.value, o.label]));

  const value: StageData = {
    maps: {
      dealstage: toMap(dealStages.data),
      lifecyclestage: toMap(lifecycle.data),
      contract_type: toMap(contractType.data),
    },
    ordered: {
      dealstage: dealStages.data ?? [],
      lifecyclestage: lifecycle.data ?? [],
      contract_type: contractType.data ?? [],
    },
  };

  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

/** Mappa value→label per una property (es. "dealstage"). */
export function useStageMap(prop: string): Record<string, string> {
  return useContext(StageContext).maps[prop] ?? {};
}

/** Opzioni ordinate per una property (es. "dealstage"). */
export function useStageOrdered(prop: string): PropertyOption[] {
  return useContext(StageContext).ordered[prop] ?? [];
}
