const { log, retry } = require("builder-util");
const { getSignToolPath } = require("app-builder-lib/out/toolsets/windows");
const { VmManager } = require("app-builder-lib/out/vm/vm");

const SIGNTOOL_TIMEOUT_MS = 10 * 60 * 1000;

function getPathSegments(file) {
  return file
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

function isRuntimeResourceSigningTarget(file) {
  const segments = getPathSegments(file);
  const resourcesIndex = segments.lastIndexOf("resources");

  return resourcesIndex >= 0 && segments[resourcesIndex + 1] === "runtime";
}

async function signWindowsFile(configuration, packager) {
  if (isRuntimeResourceSigningTarget(configuration.path)) {
    log.info({ file: log.filePath(configuration.path) }, "skipped signing bundled runtime file");
    return;
  }

  if (configuration.cscInfo == null) {
    log.debug({ file: log.filePath(configuration.path) }, "no signing info identified, signing is skipped");
    return;
  }

  const timeout = Number.parseInt(process.env.SIGNTOOL_TIMEOUT || "", 10) || SIGNTOOL_TIMEOUT_MS;
  const useWindowsVm = configuration.path.endsWith(".appx") || !("file" in configuration.cscInfo);
  const isWin = process.platform === "win32" || useWindowsVm;
  const winCodeSign = packager?.config?.toolsets?.winCodeSign;
  const toolInfo = await getSignToolPath(winCodeSign, isWin);
  const args = configuration.computeSignToolArgs(isWin);
  const vm = new VmManager();

  await retry(() => vm.exec(toolInfo.path, args, { timeout, env: { ...process.env, ...(toolInfo.env || {}) } }), {
    retries: 2,
    interval: 15000,
    backoff: 10000,
    shouldRetry: (error) => {
      const message = error.message || "";
      if (
        message.includes("The file is being used by another process") ||
        message.includes("The specified timestamp server either could not be reached") ||
        message.includes("No certificates were found that met all the given criteria.")
      ) {
        log.warn(`Attempt to code sign failed, another attempt will be made in 15 seconds: ${message}`);
        return true;
      }

      return false;
    }
  });
}

module.exports = signWindowsFile;
module.exports.default = signWindowsFile;
module.exports.sign = signWindowsFile;
module.exports.isRuntimeResourceSigningTarget = isRuntimeResourceSigningTarget;
