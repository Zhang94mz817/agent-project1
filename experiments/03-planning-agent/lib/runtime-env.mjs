import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env");

loadEnvFile();
configureProxy();

function loadEnvFile() {
  try {
    const envFile = readFileSync(envPath, "utf-8");

    for (const rawLine of envFile.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());

      if (key && process.env[key] == null) {
        process.env[key] = value;
      }
    }
  } catch {}
}

function configureProxy() {
  const proxyUrl = process.env.HTTPS_PROXY;
  if (!proxyUrl) {
    return;
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
