import app from "./app";
import { logger } from "./lib/logger";
import { recoverInterruptedParentDocumentScans } from "./lib/parentDocuments";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  try {
    const recoveredCount = await recoverInterruptedParentDocumentScans();
    if (recoveredCount > 0) {
      logger.warn(
        { recoveredCount },
        "Marked interrupted parent document scans retryable",
      );
    }
  } catch (err) {
    logger.error({ err }, "Could not recover interrupted parent document scans");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start();
