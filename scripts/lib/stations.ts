/**
 * Station names arrive from different operators: "Anand Vihar (Blue Line)",
 * "Dahisar (East) [Line 2]", "Andheri L1", "Vikhroli Station". Canonicalise
 * them before clustering so one physical interchange becomes one dot.
 */
const STATION_ALIASES = new Map<string, string>([
  ["chitpur", "kolkata"],
  ["new garia", "kavi subhash"],
  ["yeshwantpur", "yesvantpur"],
  ["belgatchia", "belgachia"],
  ["poonamalle bypass", "poonamallee bypass"],
  ["dum dum cantt", "dum dum cantonment"],
  ["central metro", "mgr central"],
  ["chennai central", "mgr central"],
  ["mgr chennai ctrl", "mgr central"],
  ["csm terminus", "mumbai csmt"],
  ["chhatrapati shivaji maharaj terminus", "mumbai csmt"],
  ["csmt", "mumbai csmt"],
]);

const STATION_DISPLAY = new Map<string, string>([
  ["chitpur", "Kolkata"],
  ["new garia", "Kavi Subhash"],
  ["yeshwantpur", "Yesvantpur"],
  ["belgatchia", "Belgachia"],
  ["poonamalle bypass", "Poonamallee Bypass"],
  ["dum dum cantt", "Dum Dum Cantonment"],
  ["central metro", "MGR Central"],
  ["chennai central", "MGR Central"],
  ["mgr chennai ctrl", "MGR Central"],
  ["csm terminus", "Mumbai CSMT"],
  ["chhatrapati shivaji maharaj terminus", "Mumbai CSMT"],
  ["csmt", "Mumbai CSMT"],
]);

const LINE_SUFFIX =
  /\s*\((?:[^)]*\b(line|blue|pink|magenta|yellow|red|green|violet|orange|grey|gray|aqua|west|east|north|south)\b[^)]*)\)\s*$/i;

function clean(value: string): string {
  return value
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .replace(LINE_SUFFIX, "")
    .replace(/\s+\bL\d+\b$/i, "");
}

export function stationKey(value: string): string {
  const key = clean(value)
    .replace(/\b(metro|station|halt|railway)\b/gi, " ")
    .replace(/\b(jn|junction)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return STATION_ALIASES.get(key) ?? key;
}

export function stationDisplay(value: string): string {
  const cleaned = clean(value)
    .replace(/\s+(station|metro)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const key = cleaned
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return (
    STATION_DISPLAY.get(key) ??
    STATION_ALIASES.get(key)?.replace(/\b\w/g, (character) => character.toUpperCase()) ??
    cleaned
  );
}

/** Prefer a shorter, unqualified name when two records merge. */
export function cleanerName(candidate: string, current: string): boolean {
  const score = (name: string) =>
    (name.includes("(") ? 2 : 0) + (name.length > 28 ? 1 : 0) + name.length / 100;
  return score(candidate) < score(current);
}
