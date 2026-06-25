import { Router } from "express";
import {
  isCrmObjectType,
  listAll,
  getPropertyOptions,
  DEFAULT_PROPERTIES,
  type CrmObjectType,
} from "../../lib/hubspot-crm.js";
import {
  generatePipelineExport,
  type PipelineExportDeal,
} from "../../lib/pipeline-export.js";
import {
  generateRevenueSpreading,
  type RevenueDeal,
} from "../../lib/revenue-spreading.js";
import { generateCsv } from "../../lib/csv.js";
import { logger } from "../../lib/logger.js";

// Proprietà deal (incluse le custom) necessarie al Revenue Spreading export.
const REVENUE_DEAL_PROPS = [
  "deal_code",
  "dealname",
  "contract_owner",
  "dealstage",
  "closedate",
  "contract_start",
  "amount",
  "contract_duration_years",
  "contract_type",
  "kpmg_note",
  "revenue_schedule",
];

function parseSchedule(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function stageKind(label: string): RevenueDeal["stageKind"] {
  const l = label.toLowerCase();
  if (/won/.test(l)) return "won";
  if (/proposal/.test(l)) return "proposal";
  if (/discovery/.test(l)) return "discovery";
  return "other";
}

const router = Router();

// Deal d'esempio se HubSpot non è raggiungibile (mostra comunque il formato).
const SAMPLE_DEALS: PipelineExportDeal[] = [
  { name: "Esempio A", amount: 120000, closeDate: "2026-06-30" },
  { name: "Esempio B", amount: 80000, closeDate: "2027-03-31" },
  { name: "Esempio C", amount: 45000, closeDate: "2028-12-31" },
];

/**
 * GET /api/exports/pipeline.xlsx
 * Esporta la Pipeline ufficiale (.xlsx) DIRETTAMENTE: legge i deal da HubSpot e
 * genera il template aziendale. Nessun LLM, nessun prompt — è un download.
 */
router.get("/pipeline.xlsx", async (_req, res) => {
  let deals: PipelineExportDeal[];
  try {
    const records = await listAll("deals", DEFAULT_PROPERTIES.deals);
    deals = records.map((d) => ({
      name: d.properties.dealname || "(senza nome)",
      amount: d.properties.amount ?? null,
      closeDate: d.properties.closedate ?? null,
    }));
    if (deals.length === 0) deals = SAMPLE_DEALS;
  } catch (err) {
    logger.warn({ err }, "[export] HubSpot non disponibile: uso deal d'esempio");
    deals = SAMPLE_DEALS;
  }

  try {
    const buffer = await generatePipelineExport({
      filename: "pipeline-export",
      deals,
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="pipeline-export.xlsx"',
    );
    res.send(buffer);
  } catch (err) {
    logger.error({ err }, "[export] generazione pipeline fallita");
    res.status(500).json({ error: String((err as Error)?.message || err) });
  }
});

/**
 * GET /api/exports/revenue-spreading.xlsx
 * Genera il workbook a 3 fogli (HubSpot Export / Revenue Spreading / Cash Flow)
 * dai deal HubSpot e dai loro campi custom (contract_start, durata,
 * revenue_schedule). Download diretto, nessun LLM.
 */
router.get("/revenue-spreading.xlsx", async (_req, res) => {
  try {
    const [records, stageOpts, typeOpts] = await Promise.all([
      listAll("deals", REVENUE_DEAL_PROPS),
      getPropertyOptions("deals", "dealstage").catch(() => []),
      getPropertyOptions("deals", "contract_type").catch(() => []),
    ]);
    const stageMap = new Map(stageOpts.map((o) => [o.value, o.label]));
    const typeMap = new Map(typeOpts.map((o) => [o.value, o.label]));

    const deals: RevenueDeal[] = records
      .map((rec) => {
        const p = rec.properties;
        const stageLabel = stageMap.get(p.dealstage || "") || p.dealstage || "—";
        return {
          code: p.deal_code || rec.id,
          name: p.dealname || "(senza nome)",
          owner: p.contract_owner || "",
          stageLabel,
          closingDate: p.closedate || "",
          contractStart: p.contract_start || "",
          amount: Number(p.amount) || 0,
          durationYears: Number(p.contract_duration_years) || 0,
          typeLabel: typeMap.get(p.contract_type || "") || p.contract_type || "",
          kpmgNote: p.kpmg_note || "",
          schedule: parseSchedule(p.revenue_schedule),
          stageKind: stageKind(stageLabel),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const buffer = await generateRevenueSpreading({ deals, cashYear: 2026 });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="revenue-spreading.xlsx"',
    );
    res.send(buffer);
  } catch (err) {
    logger.error({ err }, "[export] revenue-spreading fallito");
    res.status(503).json({ error: String((err as Error)?.message || err) });
  }
});

/**
 * GET /api/exports/:type.csv
 * Esporta la vista corrente (companies/contacts/deals) in CSV. Download diretto.
 */
router.get("/:file", async (req, res) => {
  const file = req.params.file;
  const m = file.match(/^(companies|contacts|deals)\.csv$/);
  if (!m) {
    res.status(404).json({ error: "Export non trovato" });
    return;
  }
  const type = m[1] as CrmObjectType;
  if (!isCrmObjectType(type)) {
    res.status(400).json({ error: "Tipo non valido" });
    return;
  }
  try {
    const props = DEFAULT_PROPERTIES[type];
    const records = await listAll(type, props);
    const rows = records.map((r) => props.map((p) => r.properties[p] ?? ""));
    const buffer = generateCsv({ filename: type, headers: props, rows });
    res.setHeader("Content-Type", "text/csv;charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${type}.csv"`,
    );
    res.send(buffer);
  } catch (err) {
    logger.error({ err, type }, "[export] CSV fallito");
    res.status(503).json({ error: String((err as Error)?.message || err) });
  }
});

export default router;
