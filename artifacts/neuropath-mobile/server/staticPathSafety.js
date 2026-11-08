const path = require("node:path");
const fs = require("node:fs");

function resolveStaticFilePath(staticRoot, requestPath) {
  if (
    typeof requestPath !== "string" ||
    !requestPath.startsWith("/") ||
    requestPath.includes("\0")
  ) {
    return null;
  }

  const root = path.resolve(staticRoot);
  const candidate = path.resolve(root, `.${requestPath}`);
  const relative = path.relative(root, candidate);

  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  return candidate;
}

function resolveRealStaticFilePath(staticRoot, candidatePath) {
  try {
    const realRoot = fs.realpathSync(path.resolve(staticRoot));
    const realCandidate = fs.realpathSync(path.resolve(candidatePath));
    const relative = path.relative(realRoot, realCandidate);

    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      return null;
    }

    return realCandidate;
  } catch {
    return null;
  }
}

module.exports = { resolveStaticFilePath, resolveRealStaticFilePath };
