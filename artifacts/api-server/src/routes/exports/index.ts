import { Router } from "express";
import {
  isCrmObjectType,
  listAll,
  DEFAULT_PROPERTIES,
  type CrmObjectType,
} from "../../lib/hubspot-crm.js";
import { generatePipelineExport } from "../../lib/pipeline-export.js";
import { generateRevenueSpreading } from "../../lib/revenue-spreading.js";
import { buildPipelineDataset } from "../../lib/pipeline-dataset.js";
import { generateCsv } from "../../lib/csv.js";
import { logger } from "../../lib/logger.js";

const router = Router();

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/exports/pipeline.xlsx
 * Esporta la Pipeline ufficiale (.xlsx) DIRETTAMENTE dal dataset canonico
 * HubSpot (stessa fonte del Revenue Spreading): ogni deal colloca il fatturato
 * di ciascun anno nella colonna corretta. Nessun LLM, nessun dato statico.
 */
router.get("/pipeline.xlsx", async (_req, res) => {
  try {
    const dataset = await buildPipelineDataset();
    const deals = dataset.deals.map((d) => ({
      name: d.name,
      amount: d.amount,
      closeDate: d.closingDate,
      schedule: d.schedule,
    }));
    const buffer = await generatePipelineExport({
      filename: "pipeline-export",
      deals,
    });
    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="pipeline-export.xlsx"',
    );
    res.send(buffer);
  } catch (err) {
    logger.error({ err }, "[export] generazione pipeline fallita");
    res.status(503).json({ error: String((err as Error)?.message || err) });
  }
});

/**
 * GET /api/exports/revenue-spreading.xlsx
 * Genera il workbook a 3 fogli (HubSpot Export / Revenue Spreading / Cash Flow)
 * dal dataset canonico della pipeline. Stessa fonte usata dall'assistente AI e
 * dalla dashboard, così i dati coincidono sempre. Download diretto, nessun LLM.
 */
router.get("/revenue-spreading.xlsx", async (_req, res) => {
  try {
    const dataset = await buildPipelineDataset();
    const buffer = await generateRevenueSpreading({
      deals: dataset.deals,
      cashYear: 2026,
    });
    res.setHeader("Content-Type", XLSX_MIME);
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
