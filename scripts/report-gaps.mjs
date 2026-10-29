/**
 * Find data problems that are worth researching: under-construction lines with
 * no stations, stations that sit far from their own line, broken geometry, and
 * lines missing termini.
 *
 * Usage: node scripts/report-gaps.mjs [--json] [--city=mumbai]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "src", "data", "cities");

const args = process.argv.slice(2);
const onlyCity = args.find((a) => a.startsWith("--city="))?.slice("--city=".length);
const asJson = args.includes("--json");

const all = JSON.parse(await readFile(path.join(dataDir, "all.json"), "utf8"));
const index = JSON.parse(await readFile(path.join(dataDir, "index.json"), "utf8"));

const R = 6371;
function haversine(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Approximate distance in km from a point to a polyline (equirectangular). */
function distanceToPolyline(point, segment) {
  let best = Infinity;
  const latScale = 111.32;
  const lonScale = 111.32 * Math.cos((point.lat * Math.PI) / 180);
  for (let i = 1; i < segment.length; i += 1) {
    const ax = (segment[i - 1][1] - point.lon) * lonScale;
    const ay = (segment[i - 1][0] - point.lat) * latScale;
    const bx = (segment[i][1] - point.lon) * lonScale;
    const by = (segment[i][0] - point.lat) * latScale;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : -(ax * dx + ay * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(px, py);
    if (d < best) best = d;
  }
  return best;
}

const cities = index.cities.filter((c) => !onlyCity || c.slug === onlyCity);
const report = [];

for (const summary of cities) {
  const lines = all.lines.filter((line) => line.city === summary.slug);
  const stations = all.stations.filter((station) => station.city === summary.slug);
  if (!lines.length) continue;

  const issues = [];
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
  const examples = [];
  for (const station of stations) {
    const candidates = station.lines
      .map((ref) => lineByKey.get(ref))
      .filter(Boolean);
    if (!candidates.length) continue;
    let best = Infinity;
    for (const line of candidates) {
      for (const segment of line.geometry) {
        const d = distanceToPolyline(station, segment);
        if (d < best) best = d;
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
  const duplicateNames = [];
  const byName = new Map();
  for (const station of stations) {
    const key = station.name.toLowerCase();
    const bucket = byName.get(key) ?? [];
    bucket.push(station);
    byName.set(key, bucket);
  }
  for (const [name, bucket] of byName) {
    if (bucket.length < 2) continue;
    const close = bucket.some((a, i) =>
      bucket.slice(i + 1).some((b) => haversine(a, b) < 2),
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

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  let total = 0;
  for (const city of report) {
    const high = city.issues.filter((i) => i.severity === "high").length;
    const medium = city.issues.filter((i) => i.severity === "medium").length;
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
  console.log(`\n${total} issues across ${report.filter((c) => c.issues.length).length} cities.`);
}
