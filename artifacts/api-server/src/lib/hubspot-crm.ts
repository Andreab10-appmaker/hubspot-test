import https from "node:https";
import { callMCPTool } from "./mcp-client.js";
import { logger } from "./logger.js";

// GET diretto sull'API REST HubSpot (per dati non esposti dall'MCP, es. pipeline).
function hubspotApiGet(path: string): Promise<Record<string, unknown>> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error("HUBSPOT_ACCESS_TOKEN non impostato"));
    const req = https.request(
      {
        hostname: "api.hubapi.com",
        path,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`HubSpot API ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Servizio CRM "diretto": legge/scrive su HubSpot via @hubspot/mcp-server SENZA
 * passare dall'LLM. Alimenta le viste speculari (Aziende/Contatti/Trattative) e
 * gli export deterministici. Riusa il client MCP singleton (mcp-client.ts).
 *
 * Tool MCP usati (@hubspot/mcp-server ^0.4):
 *  - hubspot-list-objects     → lista paginata (/crm/v3/objects/:type)
 *  - hubspot-search-objects   → ricerca testuale / filtri
 *  - hubspot-batch-read-objects   → lettura per ID
 *  - hubspot-batch-update-objects → update (properties string→string)
 *  - hubspot-batch-create-objects → create
 */

export type CrmObjectType = "companies" | "contacts" | "deals";

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

const VALID_TYPES: CrmObjectType[] = ["companies", "contacts", "deals"];

export function isCrmObjectType(v: unknown): v is CrmObjectType {
  return typeof v === "string" && (VALID_TYPES as string[]).includes(v);
}

// Proprietà di default restituite per ogni tipo (colonne delle viste speculari).
export const DEFAULT_PROPERTIES: Record<CrmObjectType, string[]> = {
  companies: [
    "name",
    "domain",
    "industry",
    "numberofemployees",
    "city",
    "country",
    "phone",
    "hubspot_owner_id",
    "createdate",
  ],
  contacts: [
    "firstname",
    "lastname",
    "email",
    "phone",
    "company",
    "jobtitle",
    "lifecyclestage",
    "hubspot_owner_id",
    "createdate",
  ],
  deals: [
    "dealname",
    "amount",
    "dealstage",
    "pipeline",
    "closedate",
    "hubspot_owner_id",
    "createdate",
    // Campi custom Revenue Spreading (mostrati/sincronizzati nel frontend)
    "deal_code",
    "contract_owner",
    "contract_start",
    "contract_duration_years",
    "contract_type",
    "kpmg_note",
    "revenue_schedule",
    // Campi custom per le analisi del funnel (pagina Insight + assistente AI)
    "deal_source",
    "deal_country",
    "last_activity_date",
    "stage_history",
    "renewal_probability",
  ],
};

// Proprietà testualmente ricercabili per tipo (default HubSpot search).
const SEARCHABLE: Record<CrmObjectType, string[]> = {
  companies: ["name", "domain", "phone"],
  contacts: ["firstname", "lastname", "email", "company"],
  deals: ["dealname"],
};

// Estrae il payload JSON dal risultato del tool MCP (content[].text).
function parseMcpJson(result: unknown): Record<string, unknown> {
  const r = result as {
    content?: Array<{ text?: string }>;
    isError?: boolean;
  };
  if (r?.isError) {
    const msg = (r.content || []).map((c) => c.text || "").join("\n");
    throw new Error(msg || "Errore tool HubSpot MCP");
  }
  const text = Array.isArray(r?.content)
    ? r.content.map((c) => c.text || "").join("")
    : "";
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Alcuni tool antepongono testo discorsivo: estrai il primo blocco JSON.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Risposta HubSpot non in formato JSON");
  }
}

function toRecords(raw: unknown): CrmRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item as Record<string, unknown>;
    return {
      id: String(o.id ?? ""),
      properties: (o.properties as Record<string, string | null>) || {},
      createdAt: o.createdAt as string | undefined,
      updatedAt: o.updatedAt as string | undefined,
    };
  });
}

export interface ListParams {
  type: CrmObjectType;
  limit?: number;
  after?: string;
  search?: string;
  properties?: string[];
  sortBy?: string;
  sortDir?: "ASCENDING" | "DESCENDING";
}

// HubSpot CRM list/search accettano al massimo 100 oggetti per richiesta.
const HUBSPOT_MAX_LIMIT = 100;

export async function listObjects(params: ListParams): Promise<CrmListResult> {
  const { type } = params;
  const limit = Math.min(Math.max(params.limit ?? 100, 1), HUBSPOT_MAX_LIMIT);
  const properties = params.properties ?? DEFAULT_PROPERTIES[type];
  const search = params.search?.trim();

  // Ricerca → hubspot-search-objects; lista semplice → hubspot-list-objects.
  if (search || params.sortBy) {
    const args: Record<string, unknown> = {
      objectType: type,
      limit: Math.min(limit, 100),
      properties,
    };
    if (search) args.query = search;
    if (params.after) args.after = params.after;
    if (params.sortBy) {
      args.sorts = [
        {
          propertyName: params.sortBy,
          direction: params.sortDir ?? "DESCENDING",
        },
      ];
    }
    const json = parseMcpJson(await callMCPTool("hubspot-search-objects", args));
    return {
      results: toRecords(json.results),
      after: readAfter(json),
      total: typeof json.total === "number" ? json.total : undefined,
    };
  }

  const args: Record<string, unknown> = {
    objectType: type,
    limit,
    properties,
  };
  if (params.after) args.after = params.after;
  const json = parseMcpJson(await callMCPTool("hubspot-list-objects", args));
  return {
    results: toRecords(json.results),
    after: readAfter(json),
    total: typeof json.total === "number" ? json.total : undefined,
  };
}

// Il cursore di paginazione può arrivare come `paging.next.after` o `after`.
function readAfter(json: Record<string, unknown>): string | null {
  const paging = json.paging as
    | { next?: { after?: string } }
    | undefined;
  if (paging?.next?.after) return paging.next.after;
  if (typeof json.after === "string") return json.after;
  return null;
}

// Recupera TUTTE le pagine (cap di sicurezza) — usato da export e dashboard.
export async function listAll(
  type: CrmObjectType,
  properties?: string[],
  maxPages = 25,
): Promise<CrmRecord[]> {
  const out: CrmRecord[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await listObjects({ type, limit: HUBSPOT_MAX_LIMIT, after, properties });
    out.push(...page.results);
    if (!page.after) break;
    after = page.after;
  }
  return out;
}

export async function getObject(
  type: CrmObjectType,
  id: string,
  properties?: string[],
): Promise<CrmRecord | null> {
  const json = parseMcpJson(
    await callMCPTool("hubspot-batch-read-objects", {
      objectType: type,
      inputs: [{ id }],
      properties: properties ?? DEFAULT_PROPERTIES[type],
    }),
  );
  const recs = toRecords(json.results);
  return recs[0] ?? null;
}

// === Opzioni delle property enumeration (es. dealstage, lifecyclestage) =====
// Sono la FONTE DI VERITÀ per le label "parlanti" degli stati. Cache in memoria.

export interface PropertyOption {
  value: string;
  label: string;
  displayOrder: number;
}

const optionsCache = new Map<string, PropertyOption[]>();

// Le fasi deal (dealstage) hanno externalOptions=true: le opzioni NON sono sulla
// property ma nella definizione delle PIPELINE. Le leggiamo dall'API REST e
// uniamo gli stage di tutte le pipeline (value = id stage, label parlante).
async function getDealStageOptions(): Promise<PropertyOption[]> {
  const data = await hubspotApiGet("/crm/v3/pipelines/deals");
  const pipelines = Array.isArray(data.results) ? data.results : [];
  const out: PropertyOption[] = [];
  pipelines.forEach((pl, pi) => {
    const stages = (pl as { stages?: unknown }).stages;
    if (!Array.isArray(stages)) return;
    for (const st of stages) {
      const s = st as Record<string, unknown>;
      out.push({
        value: String(s.id ?? ""),
        label: String(s.label ?? s.id ?? ""),
        // offset per pipeline così le colonne restano raggruppate per pipeline
        displayOrder: pi * 100 + (typeof s.displayOrder === "number" ? s.displayOrder : 0),
      });
    }
  });
  return out.filter((o) => o.value).sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function getPropertyOptions(
  objectType: string,
  propertyName: string,
): Promise<PropertyOption[]> {
  const key = `${objectType}:${propertyName}`;
  const cached = optionsCache.get(key);
  if (cached) return cached;

  // dealstage: fonte = pipeline API (l'MCP get-property torna options vuote).
  if (objectType === "deals" && propertyName === "dealstage") {
    const opts = await getDealStageOptions();
    optionsCache.set(key, opts);
    return opts;
  }

  const json = parseMcpJson(
    await callMCPTool("hubspot-get-property", { objectType, propertyName }),
  );
  const rawOptions = Array.isArray(json.options) ? json.options : [];
  const options: PropertyOption[] = rawOptions
    .map((o) => {
      const opt = o as Record<string, unknown>;
      return {
        value: String(opt.value ?? ""),
        label: String(opt.label ?? opt.value ?? ""),
        displayOrder:
          typeof opt.displayOrder === "number" ? opt.displayOrder : 0,
      };
    })
    .filter((o) => o.value !== "")
    .sort((a, b) => a.displayOrder - b.displayOrder);

  optionsCache.set(key, options);
  return options;
}

// HubSpot vuole valori property come stringhe: normalizziamo.
function stringifyProps(
  properties: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(properties || {})) {
    if (v === null || v === undefined) continue;
    out[k] = String(v);
  }
  return out;
}

export async function updateObject(
  type: CrmObjectType,
  id: string,
  properties: Record<string, unknown>,
): Promise<CrmRecord> {
  const json = parseMcpJson(
    await callMCPTool("hubspot-batch-update-objects", {
      objectType: type,
      inputs: [{ id, properties: stringifyProps(properties) }],
    }),
  );
  const rec = toRecords(json.results)[0];
  if (!rec) throw new Error("Update HubSpot non ha restituito il record");
  return rec;
}

export async function createObject(
  type: CrmObjectType,
  properties: Record<string, unknown>,
): Promise<CrmRecord> {
  const json = parseMcpJson(
    await callMCPTool("hubspot-batch-create-objects", {
      objectType: type,
      inputs: [{ properties: stringifyProps(properties) }],
    }),
  );
  const rec = toRecords(json.results)[0];
  if (!rec) throw new Error("Create HubSpot non ha restituito il record");
  return rec;
}

// === Dashboard ============================================================

export interface DashboardSummary {
  counts: { companies: number; contacts: number; deals: number };
  pipelineValue: number; // somma amount dei deal aperti
  wonValue: number; // somma amount dei deal vinti
  openDeals: number;
  dealsByStage: Array<{
    stage: string;
    stageLabel: string;
    count: number;
    value: number;
  }>;
  // Fatturato canonico per anno (revenue spreading) — stessa fonte di Excel e AI.
  revenueByYear: Array<{ year: number; value: number }>;
  totalScheduledRevenue: number;
  // Fatturato proiettato oltre la durata dei contratti (stima rinnovi).
  projectedByYear: Array<{ year: number; value: number }>;
  recentContacts: Array<{
    id: string;
    name: string;
    email: string;
    createdAt?: string;
  }>;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  // Le KPI dei deal (pipeline aperta, vinto, per fase, fatturato per anno) vengono
  // dal DATASET CANONICO, così la dashboard coincide sempre con gli export Excel e
  // con l'assistente AI. Import dinamico per evitare cicli a load-time.
  const { buildPipelineDataset } = await import("./pipeline-dataset.js");

  const [companies, contacts, dataset] = await Promise.all([
    listAll("companies", ["name"]),
    listAll("contacts", DEFAULT_PROPERTIES.contacts),
    buildPipelineDataset(),
  ]);

  const recentContacts = [...contacts]
    .sort((a, b) =>
      String(b.properties.createdate || "").localeCompare(
        String(a.properties.createdate || ""),
      ),
    )
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      name:
        [c.properties.firstname, c.properties.lastname]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        c.properties.email ||
        "(senza nome)",
      email: c.properties.email || "",
      createdAt: c.properties.createdate || undefined,
    }));

  return {
    counts: {
      companies: companies.length,
      contacts: contacts.length,
      deals: dataset.deals.length,
    },
    pipelineValue: dataset.open.value,
    wonValue: dataset.won.value,
    openDeals: dataset.open.count,
    dealsByStage: dataset.byStage,
    revenueByYear: dataset.years.map((year) => ({
      year,
      value: dataset.revenueByYear[year] || 0,
    })),
    totalScheduledRevenue: dataset.totalScheduledRevenue,
    projectedByYear: dataset.projectionYears.map((year) => ({
      year,
      value: dataset.projectedByYear[year] || 0,
    })),
    recentContacts,
  };
}

export function logToolNames(): void {
  // Diagnostica opzionale: i nomi tool sono fissati sopra (@hubspot/mcp-server ^0.4).
  logger.debug("[hubspot-crm] tool MCP attesi: list/search/batch-read/batch-update/batch-create");
}
