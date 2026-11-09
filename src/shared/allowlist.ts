export type SchemaPolicy = "inherit" | "ro" | "rw";

export type Allowlist =
  | { kind: "unset" }
  | { kind: "invalid" }
  | { kind: "list"; entries: ReadonlyMap<string, SchemaPolicy> };

const NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const INVALID: Allowlist = { kind: "invalid" };

export function parseAllowlist(raw: string | undefined): Allowlist {
  if (raw === undefined || raw.trim() === "") return { kind: "unset" };

  const entries = new Map<string, SchemaPolicy>();
  for (const rawToken of raw.split(",")) {
    const token = rawToken.trim();
    if (token === "") return INVALID;

    const colon = token.indexOf(":");
    const name = colon === -1 ? token : token.slice(0, colon);
    const suffix = colon === -1 ? undefined : token.slice(colon + 1);

    if (!NAME_PATTERN.test(name)) return INVALID;
    if (entries.has(name)) return INVALID;

    let policy: SchemaPolicy;
    if (suffix === undefined) policy = "inherit";
    else if (suffix === "ro") policy = "ro";
    else if (suffix === "rw") policy = "rw";
    else return INVALID;

    entries.set(name, policy);
  }

  return { kind: "list", entries };
}
