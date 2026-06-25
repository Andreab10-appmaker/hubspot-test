import { Building2, Users, Handshake, type LucideIcon } from "lucide-react";
import type { CrmType, CrmRecord } from "./api";

export type FieldKind =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "currency"
  | "date"
  | "stage";

export interface FieldDef {
  key: string;
  label: string;
  kind?: FieldKind;
  /** Mostrato come colonna nella tabella/lista. */
  column?: boolean;
  /** Modificabile nel pannello di dettaglio. */
  editable?: boolean;
  /** Mostrato nel form di creazione. */
  create?: boolean;
}

export interface EntityConfig {
  type: CrmType;
  singular: string;
  plural: string;
  icon: LucideIcon;
  /** Costruisce il titolo leggibile di un record. */
  title: (r: CrmRecord) => string;
  subtitle?: (r: CrmRecord) => string;
  fields: FieldDef[];
}

function v(r: CrmRecord, k: string): string {
  return (r.properties[k] ?? "").toString();
}

export const ENTITIES: Record<CrmType, EntityConfig> = {
  companies: {
    type: "companies",
    singular: "Azienda",
    plural: "Aziende",
    icon: Building2,
    title: (r) => v(r, "name") || "(senza nome)",
    subtitle: (r) => v(r, "domain") || v(r, "industry"),
    fields: [
      { key: "name", label: "Nome", column: true, editable: true, create: true },
      { key: "domain", label: "Dominio", column: true, editable: true, create: true },
      { key: "industry", label: "Settore", column: true, editable: true, create: true },
      {
        key: "numberofemployees",
        label: "Dipendenti",
        kind: "number",
        column: true,
        editable: true,
        create: true,
      },
      { key: "city", label: "Città", editable: true, create: true },
      { key: "country", label: "Paese", column: true, editable: true, create: true },
      { key: "phone", label: "Telefono", kind: "phone", editable: true, create: true },
      { key: "createdate", label: "Creata", kind: "date", column: true },
    ],
  },
  contacts: {
    type: "contacts",
    singular: "Contatto",
    plural: "Contatti",
    icon: Users,
    title: (r) =>
      [v(r, "firstname"), v(r, "lastname")].filter(Boolean).join(" ").trim() ||
      v(r, "email") ||
      "(senza nome)",
    subtitle: (r) => v(r, "email") || v(r, "company"),
    fields: [
      { key: "firstname", label: "Nome", column: true, editable: true, create: true },
      { key: "lastname", label: "Cognome", column: true, editable: true, create: true },
      { key: "email", label: "Email", kind: "email", column: true, editable: true, create: true },
      { key: "phone", label: "Telefono", kind: "phone", column: true, editable: true, create: true },
      { key: "company", label: "Azienda", column: true, editable: true, create: true },
      { key: "jobtitle", label: "Ruolo", editable: true, create: true },
      { key: "lifecyclestage", label: "Fase", kind: "stage", column: true, editable: true },
      { key: "createdate", label: "Creato", kind: "date", column: true },
    ],
  },
  deals: {
    type: "deals",
    singular: "Trattativa",
    plural: "Trattative",
    icon: Handshake,
    title: (r) => v(r, "dealname") || "(senza nome)",
    subtitle: (r) => v(r, "dealstage"),
    fields: [
      { key: "dealname", label: "Nome", column: true, editable: true, create: true },
      { key: "amount", label: "Importo", kind: "currency", column: true, editable: true, create: true },
      { key: "dealstage", label: "Fase", kind: "stage", column: true, editable: true },
      { key: "closedate", label: "Chiusura", kind: "date", column: true, editable: true, create: true },
      { key: "pipeline", label: "Pipeline", column: false },
      { key: "createdate", label: "Creata", kind: "date", column: true },
    ],
  },
};

// Umanizza gli slug di fase noti di HubSpot (best-effort).
const STAGE_LABELS: Record<string, string> = {
  appointmentscheduled: "Appuntamento",
  qualifiedtobuy: "Qualificato",
  presentationscheduled: "Presentazione",
  decisionmakerboughtin: "Decisore coinvolto",
  contractsent: "Contratto inviato",
  closedwon: "Vinta",
  closedlost: "Persa",
  lead: "Lead",
  marketingqualifiedlead: "MQL",
  salesqualifiedlead: "SQL",
  opportunity: "Opportunità",
  customer: "Cliente",
  subscriber: "Iscritto",
  evangelist: "Evangelist",
  other: "Altro",
};

export function stageLabel(stage: string): string {
  if (!stage) return "—";
  const key = stage.toLowerCase();
  if (STAGE_LABELS[key]) return STAGE_LABELS[key];
  // Stage personalizzati arrivano come ID numerici: lasciali leggibili.
  if (/^\d+$/.test(stage)) return `Fase ${stage.slice(-4)}`;
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function stageTone(stage: string): "won" | "lost" | "open" {
  const k = stage.toLowerCase();
  if (/won|customer|vinta/.test(k)) return "won";
  if (/lost|persa/.test(k)) return "lost";
  return "open";
}
