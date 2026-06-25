import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat/index.js";
import crmRouter from "./crm/index.js";
import exportsRouter from "./exports/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/chat", chatRouter);
router.use("/crm", crmRouter);
router.use("/exports", exportsRouter);

export default router;
