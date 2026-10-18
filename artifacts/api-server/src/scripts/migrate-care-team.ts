import fs from "node:fs/promises";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
if (process.env.REPLIT_DEPLOYMENT) throw new Error("Run development migration here; production requires an explicit deployment migration.");
await pool.query(await fs.readFile(new URL("../../../../lib/db/migrations/20261018_care_team_assignments.sql", import.meta.url), "utf8"));
logger.info("Additive care-team migration applied");
await pool.end();
