/**
 * Find data problems that are worth researching: under-construction lines with
 * no stations, stations that sit far from their own line, broken geometry, and
 * lines missing termini.
 *
 * Usage:
 *   npm run data:gaps
 *   npm run data:gaps -- --city=mumbai
 *   npm run data:gaps -- --json
 */

import { readAllShards, readIndex } from "./build/dataset";
import { fail, getArg, hasFlag, parseArgs, printHelp } from "./lib/args";
import { distanceToPolyline, haversine } from "./lib/geo";

const HELP = `
Report data gaps for one city or all cities.

Usage:
  npm run data:gaps [options]

Options:
  --city=slug     Only report this city
  --json          Print the report as JSON
  --fail-on-high  Exit 1 when a high-severity gap exists
  --help          Show this message
`;

type GapIssue = {
  type: string;
  severity: "high" | "medium" | "low";
  line?: string;
  mode?: string;
  status?: string;
  detail: string;
  examples?: unknown[];
};

async function main(): Promise<void> {
  const args = parseArgs(undefined, { booleans: ["json", "fail-on-high", "help"] });
  if (hasFlag(args, "help")) printHelp(HELP);

  const onlyCity = getArg(args, "city");
  const index = await readIndex();
  if (!index) fail("Run `npm run data:build` first (index.json is missing).");
  if (onlyCity && !index.cities.some((city) => city.slug === onlyCity)) {
    fail(`Unknown city "${onlyCity}".`);
  }

  const shards = await readAllShards();
  const cities = index.cities.filter((city) => !onlyCity || city.slug === onlyCity);
  const report = [];

  for (const summary of cities) {
    const city = shards.get(summary.slug);
    if (!city) continue;
    const lines = city.lines;
    const stations = city.stations;
    if (!lines.length) continue;

    const issues: GapIssue[] = [];
    const lineByKey = new Map(lines.map((line) => [line.ref ?? line.name, line]));

    for (const line of lines) {
      const underConstruction = line.status !== "operational";
      if (underConstruction && line.stations.length === 0) {
        issues.push({
          type: "no-stations",
          severity: "high",
          line: line.ref ?? line.name,
          mode: line.mode,
          status: line.status,
          detail: "Under-construction line has no station coordinates",
        });
      } else if (underConstruction && line.stations.length < 5) {
        issues.push({
          type: "few-stations",
          severity: "medium",
          line: line.ref ?? line.name,
          mode: line.mode,
          status: line.status,
          detail: `Only ${line.stations.length} stations mapped`,
        });
      }

      if (line.geometry.length > 2) {
        issues.push({
          type: "split-geometry",
          severity: "medium",
          line: line.ref ?? line.name,
          mode: line.mode,
          status: line.status,
          detail: `${line.geometry.length} disconnected stretches`,
        });
      }

      if (!line.from || !line.to) {
        issues.push({
          type: "missing-termini",
          severity: "low",
          line: line.ref ?? line.name,
          mode: line.mode,
          status: line.status,
          detail: "No from/to tags",
        });
      }
    }

    let offLine = 0;
    const examples: { name: string; km: number }[] = [];
    for (const station of stations) {
      const candidates = station.lines
        .map((ref) => lineByKey.get(ref))
        .filter((line): line is NonNullable<typeof line> => Boolean(line));
      if (!candidates.length) continue;
      let best = Infinity;
      for (const line of candidates) {
        for (const segment of line.geometry) {
          const distance = distanceToPolyline(station, segment);
          if (distance < best) best = distance;
        }
      }
      if (best > 2) {
        offLine += 1;
        if (examples.length < 5) {
          examples.push({ name: station.name, km: Number(best.toFixed(1)) });
        }
      }
    }
    if (offLine) {
      issues.push({
        type: "stations-off-line",
        severity: "medium",
        detail: `${offLine} stations more than 2 km from their line`,
        examples,
      });
    }

    // Same name, close together: usually two operator records for one physical
    // interchange that the name canonicaliser did not merge.
    const duplicateNames: string[] = [];
    const byName = new Map<string, typeof stations>();
    for (const station of stations) {
      const key = station.name.toLowerCase();
      const bucket = byName.get(key) ?? [];
      bucket.push(station);
      byName.set(key, bucket);
    }
    for (const [name, bucket] of byName) {
      if (bucket.length < 2) continue;
      const close = bucket.some((a, index) =>
        bucket.slice(index + 1).some((b) => haversine(a, b) < 2),
      );
      if (close) duplicateNames.push(`${name} ×${bucket.length}`);
    }
    if (duplicateNames.length) {
      issues.push({
        type: "duplicate-station-names",
        severity: "low",
        detail: `${duplicateNames.length} station names reused by separate records`,
        examples: duplicateNames.slice(0, 5),
      });
    }

    const mapped = stations.length;
    const reported = summary.stats.stations;
    if (reported && mapped < reported * 0.75) {
      issues.push({
        type: "coverage",
        severity: "high",
        detail: `${mapped} mapped vs ${reported} reported stations`,
      });
    }

    report.push({
      slug: summary.slug,
      city: summary.city,
      coverage: summary.coverage,
      mappedStations: mapped,
      reportedStations: reported,
      lines: lines.length,
      issues,
    });
  }

  if (hasFlag(args, "json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    let total = 0;
    for (const city of report) {
      const high = city.issues.filter((issue) => issue.severity === "high").length;
      const medium = city.issues.filter((issue) => issue.severity === "medium").length;
      if (!city.issues.length) continue;
      total += city.issues.length;
      console.log(
        `\n${city.city} (${city.slug}) — ${city.lines} lines, ${city.mappedStations}/${city.reportedStations} stations  [${high} high, ${medium} medium]`,
      );
      for (const issue of city.issues) {
        const tag = issue.line ? `${issue.line}: ` : "";
        console.log(`  ${issue.severity.padEnd(6)} ${tag}${issue.detail}`);
      }
    }
    console.log(
      `\n${total} issues across ${report.filter((city) => city.issues.length).length} cities.`,
    );
  }

  if (hasFlag(args, "fail-on-high")) {
    const high = report.some((city) => city.issues.some((issue) => issue.severity === "high"));
    if (high) process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
