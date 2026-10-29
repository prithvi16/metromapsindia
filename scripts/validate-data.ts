/**
 * Validate every committed data artefact: the index, search index, per-city
 * shards, curation patches and suburban manifests. Run in CI and before a data
 * PR; it is fast and needs no network or raw cache.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CurationPatchSchema, formatZodError, SuburbanManifestSchema } from "../shared/schema";
import { loadAllShardsForValidation, shardDir } from "./build/dataset";
import { fail, hasFlag, parseArgs, printHelp } from "./lib/args";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const curationDir = path.join(__dirname, "curation");
const suburbanDir = path.join(__dirname, "suburban");

const HELP = `
Validate committed data files against the shared schemas.

Usage:
  npm run validate:data [--json]

Options:
  --json  Print a machine-readable summary
  --help  Show this message
`;

async function validateCuration(): Promise<{ files: number; errors: string[] }> {
  const files = (await readdir(curationDir).catch(() => [] as string[]))
    .filter((file) => file.endsWith(".json") && !file.startsWith("_"))
    .sort();
  const errors: string[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(path.join(curationDir, file), "utf8")) as unknown;
      const parsed = CurationPatchSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push(formatZodError(parsed.error, `scripts/curation/${file}`));
      }
    } catch (error) {
      errors.push(
        `scripts/curation/${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { files: files.length, errors };
}

async function validateSuburban(): Promise<{ files: number; errors: string[] }> {
  const files = (await readdir(suburbanDir).catch(() => [] as string[]))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const errors: string[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(path.join(suburbanDir, file), "utf8")) as unknown;
      const parsed = SuburbanManifestSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push(formatZodError(parsed.error, `scripts/suburban/${file}`));
      }
    } catch (error) {
      errors.push(
        `scripts/suburban/${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { files: files.length, errors };
}

async function main(): Promise<void> {
  const args = parseArgs(undefined, { booleans: ["json", "help"] });
  if (hasFlag(args, "help")) printHelp(HELP);

  const errors: string[] = [];
  const { index, search, shards } = await loadAllShardsForValidation();

  const indexedSlugs = new Set(index.cities.map((city) => city.slug));
  for (const summary of index.cities) {
    if (summary.coverage !== "none" && !shards.has(summary.slug)) {
      errors.push(`${summary.slug}: index says "${summary.coverage}" but the shard is missing`);
    }
    for (const neighbour of summary.neighbours) {
      if (neighbour === summary.slug) errors.push(`${summary.slug}: lists itself as a neighbour`);
      if (!indexedSlugs.has(neighbour)) {
        errors.push(`${summary.slug}: unknown neighbour "${neighbour}"`);
      }
    }
  }

  for (const [slug, shard] of shards) {
    if (!indexedSlugs.has(slug)) {
      errors.push(`${slug}: shard exists but is not in the index`);
    }
    if (shard.slug !== slug) {
      errors.push(`${slug}: shard slug is "${shard.slug}"`);
    }
    if (shard.coverage === "none") {
      errors.push(`${slug}: coverage "none" should not have a shard`);
    }
  }

  const shardFiles = (await readdir(shardDir).catch(() => [] as string[])).filter((file) =>
    file.endsWith(".json"),
  );
  if (shardFiles.length !== shards.size) {
    errors.push(`shard directory has ${shardFiles.length} files but ${shards.size} parsed`);
  }

  for (const entry of search.entries) {
    if (!indexedSlugs.has(entry.city)) {
      errors.push(`search entry "${entry.kind}" references unknown city "${entry.city}"`);
    }
  }

  const curation = await validateCuration();
  errors.push(...curation.errors);
  const suburban = await validateSuburban();
  errors.push(...suburban.errors);

  const summary = {
    cities: index.cities.length,
    mapped: index.cities.filter((city) => city.coverage !== "none").length,
    shards: shards.size,
    searchEntries: search.entries.length,
    curationFiles: curation.files,
    suburbanFiles: suburban.files,
    errors,
  };

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `Data OK: ${summary.cities} cities (${summary.mapped} mapped), ${summary.shards} shards, ` +
        `${summary.searchEntries} search entries, ${summary.curationFiles} curation files, ` +
        `${summary.suburbanFiles} suburban manifests.`,
    );
  }

  if (errors.length) {
    fail(
      `${errors.length} data validation error(s):\n${errors
        .slice(0, 30)
        .map((error) => `  - ${error}`)
        .join("\n")}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
