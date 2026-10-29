/** Small, dependency-free CLI parser shared by every script. */
export type ParsedArgs = {
  values: Map<string, string[]>;
  flags: Set<string>;
  positionals: string[];
};

export type ParseOptions = {
  /** Flags that never consume the next argument. */
  booleans?: string[];
};

export function parseArgs(
  argv: string[] = process.argv.slice(2),
  { booleans = [] }: ParseOptions = {},
): ParsedArgs {
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  const booleanSet = new Set(booleans);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      const key = body.slice(0, eq);
      values.set(key, [...(values.get(key) ?? []), body.slice(eq + 1)]);
      continue;
    }

    if (booleanSet.has(body)) {
      flags.add(body);
      continue;
    }

    const next = argv[i + 1];
    if (next != null && !next.startsWith("-")) {
      values.set(body, [...(values.get(body) ?? []), next]);
      i++;
    } else {
      flags.add(body);
    }
  }

  return { values, flags, positionals };
}

export function getArg(args: ParsedArgs, key: string): string | undefined {
  return args.values.get(key)?.at(-1);
}

export function getAllArgs(args: ParsedArgs, key: string): string[] {
  return args.values.get(key) ?? [];
}

export function hasFlag(args: ParsedArgs, key: string): boolean {
  return args.flags.has(key) || args.values.has(key);
}

export function requireArg(args: ParsedArgs, key: string, usage: string): string {
  const value = getArg(args, key);
  if (!value) fail(usage);
  return value;
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function printHelp(text: string): never {
  console.log(text.trim());
  process.exit(0);
}
