const net = require("node:net");

// Packaging owns a separate Metro process; never reuse a preview server.
async function chooseMetroPort(configuredPort) {
  const port = configuredPort === undefined ? 0 : Number(configuredPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535 ||
      (configuredPort !== undefined && port === 0)) {
    throw new Error("MOBILE_BUILD_METRO_PORT must be an integer from 1 to 65535");
  }
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => reject(new Error(
      `Cannot use mobile build Metro port ${port}: ${error.message}`,
    )));
    server.listen(port, "127.0.0.1", () => {
      const selectedPort = server.address().port;
      server.close((error) => error ? reject(error) : resolve(selectedPort));
    });
  });
}

async function checkMetroHealth(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/status`, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok && (await response.text()).trim() === "packager-status:running";
  } catch {
    return false;
  }
}

module.exports = { chooseMetroPort, checkMetroHealth };
