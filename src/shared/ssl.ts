import { readFileSync } from "node:fs";

export type SslEnv = {
  ssl?: string;
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized?: string;
};

export type SslOptions = {
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized: boolean;
};

export type SslResolution = { ssl?: SslOptions } | { error: string };

const SSL_INVALID_ERROR =
  "DB_SSL no es válido. Usa required o déjalo vacío para desactivar TLS.";
const SSL_MTLS_ERROR =
  "DB_SSL_CERT y DB_SSL_KEY deben definirse juntos para mTLS.";

function readPemFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function resolveDbSsl(
  env: SslEnv,
  readFile: (path: string) => string = readPemFile,
): SslResolution {
  const mode = (env.ssl ?? "").trim();
  if (mode === "") {
    return {};
  }
  if (mode !== "required") {
    return { error: SSL_INVALID_ERROR };
  }

  const caPath = (env.ca ?? "").trim();
  const certPath = (env.cert ?? "").trim();
  const keyPath = (env.key ?? "").trim();

  if ((certPath === "") !== (keyPath === "")) {
    return { error: SSL_MTLS_ERROR };
  }

  const ssl: SslOptions = {
    rejectUnauthorized: (env.rejectUnauthorized ?? "").trim() !== "false",
  };

  const files: Array<["ca" | "cert" | "key", string]> = [
    ["ca", caPath],
    ["cert", certPath],
    ["key", keyPath],
  ];
  for (const [option, path] of files) {
    if (path === "") continue;
    try {
      ssl[option] = readFile(path);
    } catch {
      return { error: `No se pudo leer el archivo SSL: ${path}` };
    }
  }

  return { ssl };
}
