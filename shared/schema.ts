/**
 * The single source of truth for the generated dataset, curation patches and
 * suburban manifests.
 *
 * Both the build pipeline (scripts/) and the app (src/) import these schemas, so
 * a shape change breaks the type check on both sides instead of silently
 * producing a blank map. Generated JSON is parsed with these schemas before it
 * is written and again when it is validated in CI.
 */
import { z } from "zod";

export const MODE_IDS = [
  "metro",
  "suburban",
  "rrts",
  "bullet_train",
  "monorail",
  "light_rail",
  "tram",
  "funicular",
  "water_metro",
] as const;
export const ModeSchema = z.enum(MODE_IDS);
export type Mode = z.infer<typeof ModeSchema>;

export const MODE_LABELS: Record<Mode, string> = {
  metro: "Metro",
  suburban: "Suburban rail",
  rrts: "Regional rapid rail",
  bullet_train: "Bullet train",
  monorail: "Monorail",
  light_rail: "Light rail",
  tram: "Tram",
  funicular: "Funicular",
  water_metro: "Water metro",
};

export const MODE_SHORT_LABELS: Record<Mode, string> = {
  metro: "Metro",
  suburban: "Suburban",
  rrts: "RRTS",
  bullet_train: "Bullet",
  monorail: "Monorail",
  light_rail: "Light rail",
  tram: "Tram",
  funicular: "Funicular",
  water_metro: "Water",
};

export const STATUS_IDS = ["operational", "under-construction", "planned"] as const;
export const StatusSchema = z.enum(STATUS_IDS);
export type Status = z.infer<typeof StatusSchema>;

export const STATUS_LABELS: Record<Status, string> = {
  operational: "Operational",
  "under-construction": "Under construction",
  planned: "Planned",
};

export const REGION_IDS = ["North", "West", "South", "East"] as const;
export const RegionSchema = z.enum(REGION_IDS);
export type Region = z.infer<typeof RegionSchema>;

export const COVERAGE_IDS = ["full", "partial", "none"] as const;
export const CoverageSchema = z.enum(COVERAGE_IDS);
export type Coverage = z.infer<typeof CoverageSchema>;

export const StationRefSchema = z.object({
  name: z.string().min(1),
  lat: z.number().finite(),
  lon: z.number().finite(),
});
export type StationRef = z.infer<typeof StationRefSchema>;

/** A polyline is [lat, lon] pairs; a line can have disconnected stretches. */
export const PolylineSchema = z.array(z.tuple([z.number().finite(), z.number().finite()]));
export const GeometrySchema = z.array(PolylineSchema);
export type Geometry = z.infer<typeof GeometrySchema>;

export const CityLineSchema = z.object({
  osmId: z.union([z.number(), z.string()]),
  /** Set when the line is merged into a city view. */
  city: z.string().optional(),
  system: z.string(),
  mode: ModeSchema,
  name: z.string().min(1),
  ref: z.string().nullable(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  from: z.string().nullable(),
  to: z.string().nullable(),
  operator: z.string().nullable(),
  status: StatusSchema,
  openingDate: z.string().nullable(),
  geometry: GeometrySchema,
  stations: z.array(StationRefSchema),
  curated: z.boolean().optional(),
  source: z.string().optional(),
  iriTracks: z.array(z.string()).optional(),
});
export type CityLine = z.infer<typeof CityLineSchema>;

export const CityStationSchema = StationRefSchema.extend({
  city: z.string().optional(),
  lines: z.array(z.string()),
  modes: z.array(ModeSchema),
});
export type CityStation = z.infer<typeof CityStationSchema>;

export const CityCountsSchema = z.object({
  lines: z.number().int().nonnegative(),
  stations: z.number().int().nonnegative(),
  km: z.number().nonnegative(),
  modes: z.array(ModeSchema),
  systems: z.number().int().nonnegative(),
  systemNames: z.array(z.string()),
});
export type CityCounts = z.infer<typeof CityCountsSchema>;

export const CityStatsSchema = z.object({
  lines: z.number().int().nonnegative(),
  stations: z.number().int().nonnegative(),
  km: z.number().nonnegative(),
  opened: z.string(),
  ridership: z.string().nullable(),
});
export type CityStats = z.infer<typeof CityStatsSchema>;

export const BoundsSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export type Bounds = z.infer<typeof BoundsSchema>;

export const PreviewPathSchema = z.object({
  colour: z.string(),
  d: z.string(),
});
export type PreviewPath = z.infer<typeof PreviewPathSchema>;

export const CityPreviewSchema = z.object({
  width: z.number(),
  height: z.number(),
  paths: z.array(PreviewPathSchema),
});
export type CityPreview = z.infer<typeof CityPreviewSchema>;

const CityBaseSchema = z.object({
  slug: z.string().min(1),
  city: z.string().min(1),
  system: z.string(),
  operator: z.string(),
  region: RegionSchema,
  bounds: BoundsSchema,
  minZoom: z.number(),
  coverage: CoverageSchema,
  stats: CityStatsSchema,
  counts: CityCountsSchema,
});

export const CitySummarySchema = CityBaseSchema.extend({
  /** Cities whose networks should be drawn alongside this one. */
  neighbours: z.array(z.string()).default([]),
  preview: CityPreviewSchema.nullable(),
});
export type CitySummary = z.infer<typeof CitySummarySchema>;

export const CityIndexSchema = z.object({
  generatedBy: z.string(),
  generatedAt: z.string(),
  source: z.string(),
  cities: z.array(CitySummarySchema),
});
export type CityIndex = z.infer<typeof CityIndexSchema>;

/** One shard per city, loaded lazily by the map. */
export const CityDataSchema = CityBaseSchema.extend({
  generatedBy: z.string(),
  generatedAt: z.string(),
  lines: z.array(CityLineSchema),
  stations: z.array(CityStationSchema),
});
export type CityData = z.infer<typeof CityDataSchema>;

/** An in-memory view: the current city plus its neighbours. */
export type AllData = {
  lines: CityLine[];
  stations: CityStation[];
};

export const SearchLineSchema = z.object({
  kind: z.literal("line"),
  city: z.string(),
  id: z.string(),
  label: z.string(),
  system: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  mode: ModeSchema,
  haystack: z.string(),
});
export const SearchStationSchema = z.object({
  kind: z.literal("station"),
  city: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  modes: z.array(ModeSchema),
  lines: z.array(z.string()),
  haystack: z.string(),
});
export const SearchEntrySchema = z.discriminatedUnion("kind", [
  SearchLineSchema,
  SearchStationSchema,
]);
export type SearchEntry = z.infer<typeof SearchEntrySchema>;

export const SearchIndexSchema = z.object({
  generatedBy: z.string(),
  generatedAt: z.string(),
  entries: z.array(SearchEntrySchema),
});
export type SearchIndex = z.infer<typeof SearchIndexSchema>;

export const PatchMatchSchema = z
  .object({
    ref: z.union([z.string(), z.number()]).optional(),
    mode: ModeSchema.optional(),
    nameIncludes: z.string().optional(),
  })
  .refine(
    (match) =>
      match.ref != null || match.mode != null || (match.nameIncludes?.trim().length ?? 0) > 0,
    { message: "match needs ref, mode or nameIncludes" },
  );
export type PatchMatch = z.infer<typeof PatchMatchSchema>;

export const CurationLineSchema = z.object({
  match: PatchMatchSchema,
  status: StatusSchema.optional(),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  stationsMode: z.enum(["replace", "append"]).optional(),
  stations: z.array(StationRefSchema).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().optional(),
});

export const AddLineSchema = z.object({
  osmId: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1),
  ref: z.string().nullable().optional(),
  mode: ModeSchema.optional(),
  system: z.string().optional(),
  status: StatusSchema.optional(),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  operator: z.string().nullable().optional(),
  openingDate: z.string().nullable().optional(),
  geometry: z.union([PolylineSchema, z.array(PolylineSchema)]),
  stations: z.array(StationRefSchema).optional(),
});

export const DropLineSchema = z.object({
  match: PatchMatchSchema,
});

export const CurationPatchSchema = z.object({
  checkedAt: z.string(),
  /** Every patch must cite at least one source that was actually read. */
  sources: z.array(z.string().url()).min(1),
  notes: z.string().optional(),
  /** Legacy per-relation fixes, previously hard-coded in the build script. */
  dropOsmIds: z.array(z.number().int()).optional(),
  refOverrides: z.record(z.string(), z.string()).optional(),
  statusOverrides: z.record(z.string(), StatusSchema).optional(),
  lines: z.array(CurationLineSchema).optional(),
  addLines: z.array(AddLineSchema).optional(),
  dropLines: z.array(DropLineSchema).optional(),
});
export type CurationPatch = z.infer<typeof CurationPatchSchema>;

export const SuburbanLineSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  ref: z.string().nullable().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: StatusSchema.optional(),
  tracks: z.array(z.union([z.string(), z.number()])),
});

export const SuburbanManifestSchema = z.object({
  build: z.union([z.string(), z.number()]).optional(),
  checkedAt: z.string().optional(),
  system: z.string().optional(),
  operator: z.string().optional(),
  stationAliases: z.record(z.string(), z.string()).optional(),
  lines: z.array(SuburbanLineSchema),
});
export type SuburbanManifest = z.infer<typeof SuburbanManifestSchema>;

export function formatZodError(error: z.ZodError, label: string): string {
  const issues = error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n  ");
  return `${label} failed schema validation:\n  ${issues}`;
}
