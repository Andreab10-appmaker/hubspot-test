import { Building2, Users, Handshake, type LucideIcon } from "lucide-react";
import type { CrmType, CrmRecord } from "./api";

export type FieldKind =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "currency"
  | "date"
  | "stage"
  | "schedule" // distribuzione fatturato per anno (JSON anno→importo)
  | "history" // storico fasi (JSON array)
  | "percent"; // valore 0–1 mostrato come %

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
  /** Sottotitolo; riceve la mappa value→label degli stati per risolvere le fasi. */
  subtitle?: (r: CrmRecord, stageMap?: Record<string, string>) => string;
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
    subtitle: (r, m) => stageLabel(v(r, "dealstage"), m),
    fields: [
      { key: "deal_code", label: "Codice", column: true },
      { key: "dealname", label: "Nome", column: true, editable: true, create: true },
      { key: "amount", label: "Valore nominale", kind: "currency", column: true, editable: true, create: true },
      { key: "dealstage", label: "Fase", kind: "stage", column: true, editable: true },
      { key: "deal_source", label: "Sorgente", column: true, editable: true, create: true },
      { key: "deal_country", label: "Paese", column: true, editable: true, create: true },
      { key: "contract_owner", label: "Owner", editable: true, create: true },
      { key: "contract_start", label: "Inizio contratto", kind: "date", editable: true, create: true },
      { key: "contract_duration_years", label: "Durata (anni)", kind: "number", editable: true, create: true },
      { key: "contract_type", label: "Tipo contratto", kind: "stage", editable: true },
      { key: "closedate", label: "Chiusura", kind: "date", column: true, editable: true, create: true },
      { key: "last_activity_date", label: "Ultima attività", kind: "date", editable: true },
      { key: "renewal_probability", label: "Probabilità di rinnovo", kind: "percent", editable: true, create: true },
      { key: "kpmg_note", label: "Note", editable: true, create: true },
      { key: "revenue_schedule", label: "Distribuzione fatturato (per anno)", kind: "schedule", editable: true },
      { key: "stage_history", label: "Storico fasi", kind: "history" },
      { key: "createdate", label: "Creata", kind: "date" },
    ],
  },
};

// Umanizza gli slug di fase noti di HubSpot (best-effort).
// Fallback per slug noti HubSpot (usato solo se le opzioni live non coprono il
// valore). Stage pipeline di default in inglese, per coerenza con le label live.
const STAGE_LABELS: Record<string, string> = {
  appointmentscheduled: "Appointment Scheduled",
  qualifiedtobuy: "Qualified To Buy",
  presentationscheduled: "Presentation Scheduled",
  decisionmakerboughtin: "Decision Maker Bought-In",
  contractsent: "Contract Sent",
  closedwon: "Closed Won",
  closedlost: "Closed Lost",
  lead: "Lead",
  marketingqualifiedlead: "Marketing Qualified Lead",
  salesqualifiedlead: "Sales Qualified Lead",
  opportunity: "Opportunity",
  customer: "Customer",
  subscriber: "Subscriber",
  evangelist: "Evangelist",
  other: "Other",
};

/**
 * Risolve uno stato nella label "parlante". La fonte di verità è `options`
 * (value→label da HubSpot); fallback alla slug-map nota; ultimo fallback grezzo.
 */
export function stageLabel(
  stage: string,
  options?: Record<string, string> | null,
): string {
  if (!stage) return "—";
  if (options && options[stage]) return options[stage];
  const key = stage.toLowerCase();
  if (STAGE_LABELS[key]) return STAGE_LABELS[key];
  // ID numerici senza mappa: meglio un placeholder leggibile che il numero grezzo.
  if (/^\d+$/.test(stage)) return `Fase ${stage.slice(-4)}`;
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function stageTone(
  stage: string,
  options?: Record<string, string> | null,
): "won" | "lost" | "open" {
  // Determina il tono dalla LABEL risolta (gli ID non contengono "won"/"lost").
  const k = stageLabel(stage, options).toLowerCase();
  if (/won|customer|vinta|cliente/.test(k)) return "won";
  if (/lost|persa/.test(k)) return "lost";
  return "open";
}
