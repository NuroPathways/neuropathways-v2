import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import entitiesRouter from "./entities";
import aiRouter from "./ai";
import uploadRouter from "./upload";
import importRouter from "./import";
import mobileRouter from "./mobile";
import clinicianEmailAuthRouter from "./clinician-email-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(clinicianEmailAuthRouter);
router.use(entitiesRouter);
router.use(aiRouter);
router.use(uploadRouter);
router.use(importRouter);
router.use(mobileRouter);

router.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default router;
