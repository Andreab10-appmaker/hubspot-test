import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Healthcheck deterministico. NB: NON importare @workspace/api-zod qui: la sua
// costruzione di schema a top-level (zod.object/zod.string) viene valutata al
// caricamento del modulo e, una volta inclusa nel bundle esbuild, può rompersi
// per ordine di inizializzazione (TDZ: "stringType is not a function"),
// impedendo l'avvio del server. La risposta è banale e non richiede validazione.
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
