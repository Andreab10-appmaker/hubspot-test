import { Router } from "express";
import {
  isCrmObjectType,
  listObjects,
  getObject,
  updateObject,
  createObject,
  getDashboardSummary,
  getPropertyOptions,
} from "../../lib/hubspot-crm.js";

const router = Router();

// Traduce gli errori MCP/HubSpot in risposte HTTP pulite per il frontend.
function fail(res: import("express").Response, err: unknown) {
  const msg = String((err as Error)?.message || err);
  const status = /HUBSPOT_ACCESS_TOKEN|non impostato|MCP|ECONN|connect/i.test(
    msg,
  )
    ? 503
    : 500;
  res.status(status).json({ error: msg });
}

// GET /api/crm/dashboard/summary — KPI aggregati per la Dashboard.
router.get("/dashboard/summary", async (_req, res) => {
  try {
    res.json(await getDashboardSummary());
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/crm/meta/:type/:prop — opzioni (value→label, ordinate) di una property
// enumeration (es. dealstage, lifecyclestage). Fonte di verità per le label stato.
router.get("/meta/:type/:prop", async (req, res) => {
  const { type, prop } = req.params;
  if (!isCrmObjectType(type)) {
    res.status(400).json({ error: `Tipo non valido: ${type}` });
    return;
  }
  try {
    res.json({ options: await getPropertyOptions(type, prop) });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/crm/:type — lista paginata + ricerca (?q=, ?after=, ?limit=, ?sortBy=).
router.get("/:type", async (req, res) => {
  const { type } = req.params;
  if (!isCrmObjectType(type)) {
    res.status(400).json({ error: `Tipo non valido: ${type}` });
    return;
  }
  try {
    const result = await listObjects({
      type,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      after: typeof req.query.after === "string" ? req.query.after : undefined,
      search: typeof req.query.q === "string" ? req.query.q : undefined,
      sortBy:
        typeof req.query.sortBy === "string" ? req.query.sortBy : undefined,
      sortDir: req.query.sortDir === "ASCENDING" ? "ASCENDING" : "DESCENDING",
    });
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/crm/:type/:id — dettaglio record.
router.get("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  if (!isCrmObjectType(type)) {
    res.status(400).json({ error: `Tipo non valido: ${type}` });
    return;
  }
  try {
    const rec = await getObject(type, id);
    if (!rec) {
      res.status(404).json({ error: "Record non trovato" });
      return;
    }
    res.json(rec);
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/crm/:type — crea record (body: { properties }).
router.post("/:type", async (req, res) => {
  const { type } = req.params;
  if (!isCrmObjectType(type)) {
    res.status(400).json({ error: `Tipo non valido: ${type}` });
    return;
  }
  const properties = (req.body?.properties || {}) as Record<string, unknown>;
  if (!properties || Object.keys(properties).length === 0) {
    res.status(400).json({ error: "Nessuna proprietà da creare" });
    return;
  }
  try {
    res.status(201).json(await createObject(type, properties));
  } catch (err) {
    fail(res, err);
  }
});

// PATCH /api/crm/:type/:id — modifica inline (body: { properties }).
router.patch("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  if (!isCrmObjectType(type)) {
    res.status(400).json({ error: `Tipo non valido: ${type}` });
    return;
  }
  const properties = (req.body?.properties || {}) as Record<string, unknown>;
  if (!properties || Object.keys(properties).length === 0) {
    res.status(400).json({ error: "Nessuna proprietà da aggiornare" });
    return;
  }
  try {
    res.json(await updateObject(type, id, properties));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
