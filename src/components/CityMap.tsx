import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  ScaleControl,
  type ExpressionSpecification,
  type FilterSpecification,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { AllData, CityData, CitySummary, Mode, Status } from "../lib/cities";
import { linesGeoJson, stationsGeoJson } from "../lib/cities";
import { cityIndex } from "../lib/cityData";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Zoomed all the way out you still see India, not the world. */
const NATIONAL_MIN_ZOOM = 4.6;
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [67, 5],
  [98, 37],
];

const CASING = "rail-casing";
const STATUS_LAYERS: Record<Status, string> = {
  operational: "rail-operational",
  "under-construction": "rail-under-construction",
  planned: "rail-planned",
};
const OVERLAY_LAYERS: { mode: Mode; id: string; dash: number[] }[] = [
  { mode: "monorail", id: "rail-overlay-monorail", dash: [1.2, 2.2] },
  { mode: "light_rail", id: "rail-overlay-light-rail", dash: [3, 3] },
  { mode: "tram", id: "rail-overlay-tram", dash: [1.5, 1.5] },
  { mode: "funicular", id: "rail-overlay-funicular", dash: [0.8, 2.4] },
  { mode: "water_metro", id: "rail-overlay-water", dash: [1, 3] },
];
const RRTS_CORE = "rail-rrts-core";
const STATIONS = "rail-stations";
const STATIONS_OTHER = "rail-stations-other";
const STATION_DOTS = "rail-station-dots";
const LABELS = "rail-station-labels";
const LABELS_OTHER = "rail-station-labels-other";

type Props = {
  city: CityData;
  all: AllData;
  visibleModes: Mode[];
  visibleStatuses: Status[];
  hiddenLines: string[];
};

export default function CityMap({ city, all, visibleModes, visibleStatuses, hiddenLines }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [nearby, setNearby] = useState<CitySummary | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const [west, south, east, north] = city.bounds;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      bounds: [
        [west, south],
        [east, north],
      ],
      fitBoundsOptions: { padding: 40, maxZoom: 12.5 },
      minZoom: NATIONAL_MIN_ZOOM,
      maxZoom: 18,
      maxBounds: INDIA_BOUNDS,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __map?: MapLibreMap }).__map = map;
    }

    map.on("error", (event) => {
      console.error("Map error:", event.error?.message ?? event);
    });

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    const updateNearby = () => {
      if (map.getZoom() > 11.2) {
        setNearby(null);
        return;
      }
      const center = map.getCenter();
      const hit = cityIndex.cities.find((candidate) => {
        if (candidate.slug === city.slug) return false;
        const [w, s, e, n] = candidate.bounds;
        return center.lng >= w && center.lng <= e && center.lat >= s && center.lat <= n;
      });
      setNearby(hit ?? null);
    };
    map.on("moveend", updateNearby);

    map.on("load", () => {
      const isActive = ["==", ["get", "city"], city.slug] as unknown as ExpressionSpecification;
      const fade = (active: number, other: number) =>
        ["case", isActive, active, other] as unknown as ExpressionSpecification;

      map.addSource("rail-lines", { type: "geojson", data: linesGeoJson(all.lines) });
      map.addSource("rail-stations", {
        type: "geojson",
        data: stationsGeoJson(all.stations, all.lines),
      });

      const width = [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["*", ["get", "w"], ["case", isActive, 0.55, 0.4]],
        13,
        ["*", ["get", "w"], ["case", isActive, 1, 0.8]],
        17,
        ["*", ["get", "w"], ["case", isActive, 1.8, 1.3]],
      ] as unknown as ExpressionSpecification;

      const casingWidth = [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["+", ["*", ["get", "w"], ["case", isActive, 0.55, 0.4]], 2.4],
        13,
        ["+", ["*", ["get", "w"], ["case", isActive, 1, 0.8]], 3],
        17,
        ["+", ["*", ["get", "w"], ["case", isActive, 1.8, 1.3]], 3],
      ] as unknown as ExpressionSpecification;

      map.addLayer({
        id: CASING,
        type: "line",
        source: "rail-lines",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": casingWidth,
          "line-opacity": fade(0.92, 0.3),
        },
      });

      map.addLayer({
        id: STATUS_LAYERS.operational,
        type: "line",
        source: "rail-lines",
        filter: ["==", ["get", "status"], "operational"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "colour"],
          "line-width": width,
          "line-opacity": fade(1, 0.3),
        },
      });

      map.addLayer({
        id: STATUS_LAYERS["under-construction"],
        type: "line",
        source: "rail-lines",
        filter: ["==", ["get", "status"], "under-construction"],
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": ["get", "colour"],
          "line-width": width,
          "line-dasharray": [2, 1.4],
          "line-opacity": fade(1, 0.3),
        },
      });

      map.addLayer({
        id: STATUS_LAYERS.planned,
        type: "line",
        source: "rail-lines",
        filter: ["==", ["get", "status"], "planned"],
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": ["get", "colour"],
          "line-width": width,
          "line-dasharray": [0.8, 1.8],
          "line-opacity": fade(0.6, 0.2),
        },
      });

      map.addLayer({
        id: RRTS_CORE,
        type: "line",
        source: "rail-lines",
        filter: ["all", ["==", ["get", "mode"], "rrts"], ["==", ["get", "status"], "operational"]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 13, 1.6, 17, 2.6],
          "line-opacity": fade(0.9, 0.3),
        },
      });

      for (const overlay of OVERLAY_LAYERS) {
        map.addLayer({
          id: overlay.id,
          type: "line",
          source: "rail-lines",
          filter: [
            "all",
            ["==", ["get", "mode"], overlay.mode],
            ["==", ["get", "status"], "operational"],
          ],
          layout: { "line-join": "round", "line-cap": "butt" },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 13, 1.3, 17, 2.2],
            "line-dasharray": overlay.dash,
            "line-opacity": fade(0.85, 0.3),
          },
        });
      }

      map.addLayer({
        id: STATIONS,
        type: "circle",
        source: "rail-stations",
        minzoom: 9,
        filter: ["==", ["get", "city"], city.slug],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            ["case", ["get", "interchange"], 2.6, 2],
            13,
            ["case", ["get", "interchange"], 5.5, 4],
            16,
            ["case", ["get", "interchange"], 8, 6],
          ],
          "circle-color": "#ffffff",
          "circle-stroke-color": ["get", "colour"],
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            ["case", ["get", "interchange"], 1.8, 1.4],
            14,
            ["case", ["get", "interchange"], 3, 2.4],
          ],
        },
      });

      map.addLayer({
        id: STATIONS_OTHER,
        type: "circle",
        source: "rail-stations",
        minzoom: 11,
        filter: ["!=", ["get", "city"], city.slug],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.8, 14, 3, 17, 4.5],
          "circle-color": "#ffffff",
          "circle-stroke-color": ["get", "colour"],
          "circle-stroke-width": 1.4,
          "circle-opacity": 0.7,
        },
      });

      map.addLayer({
        id: STATION_DOTS,
        type: "circle",
        source: "rail-stations",
        minzoom: 9,
        filter: ["all", ["==", ["get", "interchange"], true], ["==", ["get", "city"], city.slug]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 2.2, 16, 3],
          "circle-color": ["get", "colour"],
        },
      });

      map.addLayer({
        id: LABELS,
        type: "symbol",
        source: "rail-stations",
        minzoom: 13,
        filter: ["==", ["get", "city"], city.slug],
        layout: {
          "text-field": ["get", "name"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12],
          "text-offset": [0, 0.9],
          "text-anchor": "top",
          "text-font": ["Noto Sans Regular"],
          "text-padding": 2,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "rgba(255,255,255,0.95)",
          "text-halo-width": 1.6,
        },
      });

      map.addLayer({
        id: LABELS_OTHER,
        type: "symbol",
        source: "rail-stations",
        minzoom: 13.5,
        filter: ["!=", ["get", "city"], city.slug],
        layout: {
          "text-field": ["get", "name"],
          "text-size": 10,
          "text-offset": [0, 0.9],
          "text-anchor": "top",
          "text-font": ["Noto Sans Regular"],
          "text-padding": 2,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#475569",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 1.4,
          "text-opacity": 0.8,
        },
      });

      const popup = new Popup({ closeButton: false, offset: 10, className: "station-popup" });

      for (const status of Object.keys(STATUS_LAYERS) as Status[]) {
        map.on("click", STATUS_LAYERS[status], (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const props = feature.properties ?? {};
          const slug = String(props.city ?? "");
          if (slug && slug !== city.slug) {
            navigate(`/city/${slug}`);
            return;
          }
          const geometry = feature.geometry;
          if (!geometry || geometry.type !== "MultiLineString") return;
          const first = geometry.coordinates[0]?.[0];
          if (!first) return;
          popup
            .setLngLat([first[0], first[1]])
            .setHTML(
              `<strong>${escapeHtml(String(props.name))}</strong>` +
                `<span class="station-popup__lines">${escapeHtml(String(props.system ?? ""))}</span>`,
            )
            .addTo(map);
        });
      }

      map.on("click", STATIONS, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const geometry = feature.geometry;
        if (!geometry || geometry.type !== "Point") return;
        const props = feature.properties ?? {};
        const [lon, lat] = geometry.coordinates as [number, number];
        popup
          .setLngLat([lon, lat])
          .setHTML(
            `<strong>${escapeHtml(String(props.name))}</strong>` +
              `<span class="station-popup__lines">${escapeHtml(String(props.lines))}</span>`,
          )
          .addTo(map);
      });

      map.on("click", STATIONS_OTHER, (event: MapLayerMouseEvent) => {
        const slug = String(event.features?.[0]?.properties?.city ?? "");
        if (slug) navigate(`/city/${slug}`);
      });

      for (const layer of [STATUS_LAYERS.operational, STATIONS, LABELS, STATIONS_OTHER]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      setReady(true);
      updateNearby();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [city, all, navigate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const modeCondition: ExpressionSpecification | null =
      visibleModes.length === 0
        ? null
        : (["in", ["get", "mode"], ["literal", visibleModes]] as unknown as ExpressionSpecification);

    const hiddenLineCondition: ExpressionSpecification | null =
      hiddenLines.length === 0
        ? null
        : (["!", ["in", ["get", "id"], ["literal", hiddenLines]]] as unknown as ExpressionSpecification);

    const lineFilter = (status: Status): FilterSpecification | null => {
      if (!visibleStatuses.includes(status) || visibleModes.length === 0) return null;
      const parts: ExpressionSpecification[] = [["==", ["get", "status"], status]];
      if (modeCondition) parts.push(modeCondition);
      if (hiddenLineCondition) parts.push(hiddenLineCondition);
      return (parts.length === 1 ? parts[0] : ["all", ...parts]) as FilterSpecification;
    };

    for (const status of Object.keys(STATUS_LAYERS) as Status[]) {
      const layer = STATUS_LAYERS[status];
      const filter = lineFilter(status);
      map.setLayoutProperty(layer, "visibility", filter ? "visible" : "none");
      if (filter) map.setFilter(layer, filter);
    }

    map.setLayoutProperty(CASING, "visibility", visibleStatuses.length ? "visible" : "none");

    const operationalFilter = lineFilter("operational");
    map.setLayoutProperty(
      RRTS_CORE,
      "visibility",
      operationalFilter && visibleModes.includes("rrts") ? "visible" : "none",
    );
    for (const overlay of OVERLAY_LAYERS) {
      map.setLayoutProperty(
        overlay.id,
        "visibility",
        operationalFilter && visibleModes.includes(overlay.mode) ? "visible" : "none",
      );
    }

    const modeAny: ExpressionSpecification | null =
      visibleModes.length === 0
        ? null
        : (["any", ...visibleModes.map((m) => ["in", m, ["get", "modes"]])] as unknown as ExpressionSpecification);

    const statusAny: ExpressionSpecification | null =
      visibleStatuses.length === 0
        ? null
        : (["any", ...visibleStatuses.map((s) => ["==", ["get", `is-${s}`], true])] as unknown as ExpressionSpecification);

    const parts = (
      visibleModes.length === 0 ? [] : [modeAny, statusAny].filter(Boolean)
    ) as ExpressionSpecification[];

    const cityCondition = (active: boolean) =>
      [active ? "==" : "!=", ["get", "city"], city.slug] as ExpressionSpecification;

    const stationFilter = (active: boolean): FilterSpecification =>
      (["all", cityCondition(active), ...parts] as unknown) as FilterSpecification;

    map.setFilter(STATIONS, stationFilter(true));
    map.setFilter(LABELS, stationFilter(true));
    map.setFilter(
      STATION_DOTS,
      (["all", ["==", ["get", "interchange"], true], cityCondition(true), ...parts] as unknown) as FilterSpecification,
    );
    map.setFilter(STATIONS_OTHER, stationFilter(false));
    map.setFilter(LABELS_OTHER, stationFilter(false));

    const visible = parts.length > 0;
    for (const layer of [STATIONS, STATION_DOTS, LABELS, STATIONS_OTHER, LABELS_OTHER]) {
      map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
    }
  }, [ready, visibleModes, visibleStatuses, hiddenLines, city.slug]);

  return (
    <div className="map-shell">
      <div
        ref={containerRef}
        className="map"
        role="application"
        aria-label={`Map of ${city.city} and neighbouring networks`}
      />
      {nearby && (
        <button
          type="button"
          className="nearby-city"
          onClick={() => navigate(`/city/${nearby.slug}`)}
        >
          <span className="nearby-city__label">Nearby network</span>
          <span className="nearby-city__name">
            {nearby.city} <span aria-hidden="true">→</span>
          </span>
        </button>
      )}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
