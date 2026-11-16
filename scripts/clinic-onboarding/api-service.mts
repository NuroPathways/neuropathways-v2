import app from "../../artifacts/api-server/src/app.js";

const port = Number(process.env.NP_TEST_API_PORT);
let databaseHost = "";
try { databaseHost = new URL(process.env.DATABASE_URL || "").hostname; } catch { /* rejected below */ }
if (
  process.env.NODE_ENV !== "test" ||
  process.env.REPLIT_CONNECTORS_ENABLED !== "false" ||
  !Number.isInteger(port) ||
  port < 1024 ||
  databaseHost !== "127.0.0.1"
) {
  throw new Error("Isolated clinic onboarding API refused an unsafe environment.");
}

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Isolated API ready on loopback port ${port}`);
});

const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
