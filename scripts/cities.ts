/**
 * City registry — the hand-maintained source of truth for the 26 systems in the
 * index (22 mapped + 4 under construction). `scripts/build-cities.ts` merges
 * this with the OSM/IRI fetches to produce src/data/cities/index.json.
 *
 * bounds: [west, south, east, north] — the metro region, not the municipal limit.
 * patterns: case-insensitive regexes matched against the OSM `network` tag.
 *   Order matters: more specific systems (Navi Mumbai) must come before the
 *   system whose name they contain (Mumbai).
 * stats: from the Wikipedia "Urban rail transit in India" table, as of Oct 2026.
 */
import type { Bounds, CityStats, Mode, Region, Status } from "../shared/schema";

export type CityConfig = {
  slug: string;
  city: string;
  system: string;
  operator: string;
  region: Region;
  bounds: Bounds;
  /** Wider box used by the IRI suburban importer. */
  suburbanBounds?: Bounds;
  patterns: string[];
  stats: CityStats;
  /** OSM relation fetched directly instead of by bounding box. */
  osmRelation?: number;
  /** Pin a corridor to a continuous way chain. */
  alignmentWays?: number[];
};

export const CITIES: CityConfig[] = [
  {
    slug: "delhi",
    city: "Delhi NCR",
    system: "Delhi Metro",
    operator: "DMRC",
    region: "North",
    bounds: [76.8, 28.25, 77.6, 28.95],
    // Wider box used by the IRI suburban importer (Ghaziabad, Palwal, Rewari).
    suburbanBounds: [76.6, 27.95, 77.75, 29.15],
    patterns: ["delhi metro", "delhi suburban", "\\brrts\\b", "namo bharat"],
    stats: {
      lines: 10,
      stations: 271,
      km: 374.47,
      opened: "2002-12-24",
      ridership: "2,032.3M (2024)",
    },
  },
  {
    slug: "gurugram",
    city: "Gurugram",
    system: "Rapid Metro Gurgaon",
    operator: "DMRC",
    region: "North",
    bounds: [76.98, 28.36, 77.2, 28.55],
    patterns: ["rapid metro", "gurgaon", "gurugram"],
    stats: { lines: 1, stations: 11, km: 12.1, opened: "2013-11-14", ridership: "14.6M (2024)" },
  },
  {
    slug: "noida",
    city: "Noida & Greater Noida",
    system: "Noida Metro",
    operator: "NMRC",
    region: "North",
    bounds: [77.25, 28.38, 77.65, 28.65],
    patterns: ["noida metro", "noida–greater noida", "noida - greater noida"],
    stats: { lines: 1, stations: 21, km: 29.7, opened: "2019-01-25", ridership: "22.0M (2024)" },
  },
  {
    slug: "meerut",
    city: "Meerut",
    system: "Meerut Metro",
    operator: "NCRTC",
    region: "North",
    bounds: [77.55, 28.85, 77.85, 29.15],
    patterns: ["meerut metro"],
    stats: { lines: 1, stations: 13, km: 23.6, opened: "2026-02-22", ridership: null },
  },
  {
    slug: "lucknow",
    city: "Lucknow",
    system: "Lucknow Metro",
    operator: "UPMRC",
    region: "North",
    bounds: [80.75, 26.65, 81.15, 27.0],
    patterns: ["lucknow metro", "lucknow suburban"],
    stats: { lines: 1, stations: 21, km: 22.9, opened: "2017-09-05", ridership: "31.2M (2024)" },
  },
  {
    slug: "kanpur",
    city: "Kanpur",
    system: "Kanpur Metro",
    operator: "UPMRC",
    region: "North",
    bounds: [80.1, 26.3, 80.5, 26.65],
    patterns: ["kanpur metro", "lucknow–kanpur", "barabanki"],
    stats: { lines: 1, stations: 14, km: 16.0, opened: "2021-12-28", ridership: "11.1M (2024)" },
  },
  {
    slug: "agra",
    city: "Agra",
    system: "Agra Metro",
    operator: "UPMRC",
    region: "North",
    bounds: [77.9, 27.05, 78.2, 27.3],
    patterns: ["agra metro"],
    stats: { lines: 1, stations: 6, km: 5.2, opened: "2024-03-06", ridership: null },
  },
  {
    slug: "jaipur",
    city: "Jaipur",
    system: "Jaipur Metro",
    operator: "JMRC",
    region: "North",
    bounds: [75.6, 26.7, 76.0, 27.05],
    patterns: ["jaipur metro"],
    stats: { lines: 1, stations: 11, km: 11.98, opened: "2015-06-03", ridership: "20.1M (2024)" },
  },
  {
    slug: "mumbai",
    city: "Mumbai",
    system: "Mumbai Metro",
    operator: "MMRDA / MMRC",
    region: "West",
    bounds: [72.7, 18.82, 73.15, 19.4],
    // Western/Central/Harbour suburban extent: Virar to Kasara, Karjat, Roha.
    suburbanBounds: [72.75, 18.4, 73.55, 19.7],
    patterns: ["mumbai metro", "mumbai monorail", "mumbai suburban", "malanggad"],
    stats: { lines: 4, stations: 77, km: 91.48, opened: "2014-06-08", ridership: "273.8M (2024)" },
  },
  {
    slug: "navi-mumbai",
    city: "Navi Mumbai",
    system: "Navi Mumbai Metro",
    operator: "CIDCO",
    region: "West",
    bounds: [72.95, 18.95, 73.2, 19.2],
    patterns: ["navi mumbai metro"],
    stats: { lines: 1, stations: 11, km: 11.1, opened: "2023-11-17", ridership: "5.8M (2026)" },
  },
  {
    slug: "pune",
    city: "Pune",
    system: "Pune Metro",
    operator: "Maha Metro",
    region: "West",
    bounds: [73.65, 18.35, 74.05, 18.8],
    patterns: ["pune metro", "pune suburban"],
    stats: { lines: 2, stations: 28, km: 31.25, opened: "2022-03-06", ridership: "67.1M (2025)" },
  },
  {
    slug: "nagpur",
    city: "Nagpur",
    system: "Nagpur Metro",
    operator: "Maha Metro",
    region: "West",
    bounds: [78.9, 20.95, 79.3, 21.3],
    patterns: ["nagpur metro"],
    stats: { lines: 2, stations: 37, km: 38.22, opened: "2019-03-08", ridership: "33.9M (2024)" },
  },
  {
    slug: "ahmedabad",
    city: "Ahmedabad–Gandhinagar",
    system: "Ahmedabad Metro",
    operator: "GMRC",
    region: "West",
    bounds: [72.35, 22.85, 72.85, 23.35],
    patterns: ["ahmedabad metro", "gandhinagar metro", "gift city"],
    stats: { lines: 4, stations: 54, km: 67.56, opened: "2019-03-04", ridership: "51.0M (2025)" },
  },
  {
    slug: "indore",
    city: "Indore",
    system: "Indore Metro",
    operator: "MPMRCL",
    region: "West",
    bounds: [75.65, 22.6, 76.05, 22.95],
    patterns: ["indore metro"],
    stats: { lines: 1, stations: 16, km: 17.05, opened: "2025-05-31", ridership: null },
  },
  {
    slug: "bhopal",
    city: "Bhopal",
    system: "Bhoj Metro",
    operator: "MPMRCL",
    region: "West",
    bounds: [77.25, 23.05, 77.65, 23.4],
    patterns: ["bhopal metro", "bhoj metro"],
    stats: { lines: 1, stations: 8, km: 6.22, opened: "2025-12-21", ridership: null },
  },
  {
    slug: "bengaluru",
    city: "Bengaluru",
    system: "Namma Metro",
    operator: "BMRCL",
    region: "South",
    bounds: [77.3, 12.7, 77.9, 13.2],
    // Existing IR commuter corridors: Tumakuru, Bangarpet, Hosur directions.
    suburbanBounds: [77.0, 12.55, 78.3, 13.5],
    patterns: ["namma metro", "bengaluru metro", "bangalore metro", "bengaluru suburban"],
    stats: { lines: 3, stations: 85, km: 96.1, opened: "2011-10-20", ridership: "278.5M (2024)" },
  },
  {
    slug: "chennai",
    city: "Chennai",
    system: "Chennai Metro",
    operator: "CMRL",
    region: "South",
    bounds: [80.0, 12.8, 80.4, 13.3],
    // Suburban extent: Chengalpattu, Arakkonam, Gummidipoondi directions.
    suburbanBounds: [79.6, 12.55, 80.35, 13.55],
    patterns: ["chennai metro", "chennai suburban", "chennai mrts", "mass rapid transit"],
    stats: { lines: 3, stations: 52, km: 68.7, opened: "2015-06-29", ridership: "111.9M (2025)" },
  },
  {
    slug: "hyderabad",
    city: "Hyderabad",
    system: "Hyderabad Metro",
    operator: "HMRL",
    region: "South",
    bounds: [78.2, 17.2, 78.7, 17.65],
    // MMTS fan: Lingampalli, Medchal, Bolarum, Falaknuma, Umdanagar.
    suburbanBounds: [78.05, 17.2, 78.6, 17.7],
    patterns: ["hyderabad metro", "mmts", "multi-modal transport"],
    stats: { lines: 3, stations: 59, km: 65.9, opened: "2017-11-29", ridership: "178.0M (2024)" },
  },
  {
    slug: "kochi",
    city: "Kochi",
    system: "Kochi Metro",
    operator: "KMRL",
    region: "South",
    bounds: [76.1, 9.8, 76.5, 10.25],
    patterns: ["kochi metro", "kochi water metro"],
    stats: { lines: 1, stations: 25, km: 28.12, opened: "2017-06-17", ridership: "36.5M (2025)" },
  },
  {
    slug: "kolkata",
    city: "Kolkata",
    system: "Kolkata Metro",
    operator: "Metro Railway, Indian Railways",
    region: "East",
    bounds: [88.1, 22.3, 88.6, 22.8],
    // Howrah/Sealdah radials: Barddhaman, Ranaghat, Canning, Diamond Harbour.
    suburbanBounds: [87.95, 22.1, 88.7, 23.35],
    patterns: ["kolkata metro", "kolkata suburban", "kolkata tram", "trams in kolkata"],
    stats: { lines: 5, stations: 58, km: 73.42, opened: "1984-10-24", ridership: "225.5M (2025)" },
  },
  {
    slug: "patna",
    city: "Patna",
    system: "Patna Metro",
    operator: "PMRC",
    region: "East",
    bounds: [84.95, 25.4, 85.35, 25.75],
    patterns: ["patna metro"],
    stats: { lines: 1, stations: 4, km: 6.1, opened: "2025-10-06", ridership: null },
  },
  // Announced / under-construction systems: listed with official figures so the
  // index is honest about what is coming, but no OSM network yet.
  {
    slug: "surat",
    city: "Surat",
    system: "Surat Metro",
    operator: "GMRC",
    region: "West",
    bounds: [72.65, 21.05, 73.0, 21.35],
    patterns: ["surat metro"],
    stats: { lines: 2, stations: 38, km: 40.35, opened: "2027-12", ridership: null },
  },
  {
    slug: "bhubaneswar",
    city: "Bhubaneswar",
    system: "Bhubaneswar Metro",
    operator: "Government of Odisha",
    region: "East",
    bounds: [85.7, 20.15, 85.95, 20.4],
    patterns: ["bhubaneswar metro"],
    stats: { lines: 1, stations: 20, km: 26.024, opened: "2028", ridership: null },
  },
  {
    slug: "visakhapatnam",
    city: "Visakhapatnam",
    system: "Visakhapatnam Metro",
    operator: "APMRC",
    region: "South",
    bounds: [83.1, 17.6, 83.45, 17.9],
    patterns: ["visakhapatnam metro", "vizag metro"],
    stats: { lines: 4, stations: 54, km: 76.9, opened: "2029", ridership: null },
  },
  {
    slug: "coimbatore",
    city: "Coimbatore",
    system: "Coimbatore Metro",
    operator: "CMRL",
    region: "South",
    bounds: [76.85, 10.9, 77.1, 11.15],
    patterns: ["coimbatore metro", "kovai metro"],
    stats: { lines: 2, stations: 40, km: 73, opened: "TBD", ridership: null },
  },
  {
    slug: "mumbai-ahmedabad",
    city: "Mumbai–Ahmedabad",
    system: "Mumbai–Ahmedabad High Speed Rail",
    operator: "NHSRCL",
    region: "West",
    bounds: [72.55, 18.95, 73.25, 23.15],
    // OSM relation for the corridor; fetch-rail.ts queries it directly.
    // Source query: scripts/queries/mumbai-ahmedabad.overpass
    osmRelation: 8304354,
    // Relation 8304354 carries both up/down alignments plus a fence way. Use
    // the continuous northbound chain only so the line does not double back.
    alignmentWays: [
      916108435, 1125530002, 1125530005, 1487001679, 1487001682, 761703159, 1125530004, 849474580,
      1125530000,
    ],
    patterns: ["mumbai.{0,4}ahmedabad", "nhsrcl", "bullet train", "high.speed rail"],
    stats: { lines: 1, stations: 12, km: 508.18, opened: "2029", ridership: null },
  },
];

/** Modes in display order, with the label used by the legend. */
export const MODES: { id: Mode; label: string }[] = [
  { id: "metro", label: "Metro" },
  { id: "suburban", label: "Suburban rail" },
  { id: "rrts", label: "Regional rapid rail" },
  { id: "bullet_train", label: "Bullet train" },
  { id: "monorail", label: "Monorail" },
  { id: "light_rail", label: "Light rail" },
  { id: "tram", label: "Tram" },
  { id: "funicular", label: "Funicular" },
  { id: "water_metro", label: "Water metro" },
];

export const STATUSES: { id: Status; label: string }[] = [
  { id: "operational", label: "Operational" },
  { id: "under-construction", label: "Under construction" },
  { id: "planned", label: "Planned" },
];

export const REGIONS: Region[] = ["North", "West", "South", "East"];
