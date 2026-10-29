import type { Mode, Status } from "../../shared/schema";
import type { LatLon } from "./geo";
import { haversine } from "./geo";

export type OsmTags = Record<string, string | undefined>;

export type OsmNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: OsmTags;
};

export type OsmWay = {
  type: "way";
  id: number;
  nodes: number[];
  tags?: OsmTags;
};

export type OsmMember = {
  type: "node" | "way" | "relation";
  ref: number;
  role?: string;
};

export type OsmRelation = {
  type: "relation";
  id: number;
  members: OsmMember[];
  tags?: OsmTags;
};

export type OsmElement = OsmNode | OsmWay | OsmRelation;

export type OsmResponse = {
  version?: number;
  generator?: string;
  elements: OsmElement[];
};

export type IndexedElements = {
  nodes: Map<number, OsmNode>;
  ways: Map<number, OsmWay>;
  relations: OsmRelation[];
};

/** Merge `out body` (tagged) and `>` (skeleton) duplicates without losing tags. */
export function indexElements(elements: OsmElement[]): IndexedElements {
  const nodes = new Map<number, OsmNode>();
  const ways = new Map<number, OsmWay>();
  const relations: OsmRelation[] = [];

  for (const el of elements) {
    if (el.type === "node") {
      const previous = nodes.get(el.id);
      nodes.set(el.id, previous ? { ...previous, ...el, tags: el.tags ?? previous.tags } : el);
    } else if (el.type === "way") {
      const previous = ways.get(el.id);
      ways.set(el.id, previous ? { ...previous, ...el, tags: el.tags ?? previous.tags } : el);
    } else {
      relations.push(el);
    }
  }
  return { nodes, ways, relations };
}

export const MODE_COLOURS: Record<Mode, string> = {
  metro: "#e11d48",
  suburban: "#0f766e",
  rrts: "#7c3aed",
  bullet_train: "#d97706",
  monorail: "#ea580c",
  light_rail: "#2563eb",
  tram: "#b45309",
  funicular: "#0e7490",
  water_metro: "#0284c7",
};

const NAMED_COLOURS: Record<string, string> = {
  aqua: "#00a3a1",
  blue: "#1f6feb",
  green: "#2e9e4f",
  orange: "#ef7c1a",
  pink: "#ec4899",
  purple: "#7c5cff",
  red: "#e63946",
  yellow: "#f0b429",
  violet: "#7c5cff",
  magenta: "#c026d3",
  grey: "#64748b",
  gray: "#64748b",
};

/** Light colours disappear on a pale basemap; darken anything above 82% luminance. */
function ensureContrast(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance <= 0.82) return hex;
  const scale = 0.72;
  const to = (value: number) =>
    Math.round(value * scale)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function colourFor(tags: OsmTags, mode: Mode): string {
  const raw = (tags.colour ?? tags.color ?? "").trim().toLowerCase();
  if (/^#([0-9a-f]{6})$/.test(raw)) return ensureContrast(raw);
  if (/^#([0-9a-f]{3})$/.test(raw)) {
    const [r, g, b] = raw.slice(1).split("");
    return ensureContrast(`#${r}${r}${g}${g}${b}${b}`);
  }
  return NAMED_COLOURS[raw] ?? MODE_COLOURS[mode];
}

export function modeFor(tags: OsmTags): Mode {
  const net = `${tags.network ?? ""} ${tags.name ?? ""}`;
  if (/\b(rrts|rapidx|namo bharat|rapid rail)\b/i.test(net)) return "rrts";
  if (/\b(bullet|high[- ]speed|hsr|nhsrcl)\b/i.test(net)) return "bullet_train";
  const route =
    tags.route === "construction"
      ? (tags.construction ?? tags["construction:route"] ?? "")
      : (tags["construction:route"] ?? tags.route);
  if (route === "subway") return "metro";
  if (route === "train") {
    return /\b(rrts|namo bharat|rapid rail)\b/i.test(net) ? "rrts" : "suburban";
  }
  if (route === "ferry") return "water_metro";
  if (route === "light_rail") return "light_rail";
  if (route === "monorail") return "monorail";
  if (route === "tram") return "tram";
  if (route === "funicular") return "funicular";
  return "metro";
}

export function statusFor(tags: OsmTags): Status {
  if (tags.route === "construction") return "under-construction";
  if (tags.state === "construction" || tags.construction || tags["construction:route"]) {
    return "under-construction";
  }
  if (tags.state === "proposed" || tags.proposed) return "planned";
  if (tags.opening_date && new Date(tags.opening_date) > new Date()) {
    return "under-construction";
  }
  return "operational";
}

/** Join the ordered way members of a route relation into one or more polylines. */
export function stitchGeometry(
  relation: OsmRelation,
  ways: Map<number, OsmWay>,
  nodes: Map<number, OsmNode>,
  onlyWays?: number[],
): [number, number][][] {
  const refs = onlyWays
    ? onlyWays.map(Number)
    : relation.members.filter((member) => member.type === "way").map((member) => member.ref);
  const segments: [number, number][][] = [];
  for (const ref of refs) {
    const way = ways.get(ref);
    if (!way?.nodes) continue;
    const coords = way.nodes
      .map((id) => nodes.get(id))
      .filter((node): node is OsmNode => Boolean(node))
      .map((node) => [node.lat, node.lon] as [number, number]);
    if (coords.length >= 2) segments.push(coords);
  }
  if (!segments.length) return [];

  // Keep disconnected stretches as separate polylines instead of joining them
  // with a straight line across the map.
  const lines: [number, number][][] = [];
  let current = [...segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const last = current[current.length - 1];
    const head = seg[0];
    const tail = seg[seg.length - 1];
    const dHead = haversine({ lat: head[0], lon: head[1] }, { lat: last[0], lon: last[1] });
    const dTail = haversine({ lat: tail[0], lon: tail[1] }, { lat: last[0], lon: last[1] });
    if (dTail < dHead) seg.reverse();

    if (Math.min(dHead, dTail) > 0.25) {
      lines.push(current);
      current = [...seg];
      continue;
    }

    const [firstLat, firstLon] = seg[0];
    if (Math.abs(firstLat - last[0]) < 1e-7 && Math.abs(firstLon - last[1]) < 1e-7) {
      seg.shift();
    }
    current.push(...seg);
  }
  lines.push(current);
  return lines.filter((line) => line.length >= 2);
}

export function stopNodes(relation: OsmRelation, nodes: Map<number, OsmNode>): OsmNode[] {
  return relation.members
    .filter((member) => member.type === "node" && (member.role ?? "").startsWith("stop"))
    .map((member) => nodes.get(member.ref))
    .filter((node): node is OsmNode => Boolean(node));
}

export function nearestName(
  target: LatLon,
  candidates: { name: string; lat: number; lon: number }[],
  maxKm: number,
): string | null {
  let best: string | null = null;
  let bestDistance = maxKm;
  for (const candidate of candidates) {
    const distance = haversine(target, candidate);
    if (distance < bestDistance) {
      best = candidate.name;
      bestDistance = distance;
    }
  }
  return best;
}
