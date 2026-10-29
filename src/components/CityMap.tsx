import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  ScaleControl,
  type ExpressionSpecification,
  type FilterSpecification,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { CityData, Mode, Status } from "../lib/cities";
import { linesGeoJson, stationsGeoJson } from "../lib/cities";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

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
const STATION_DOTS = "rail-station-dots";
const LABELS = "rail-station-labels";

type Props = {
  city: CityData;
  visibleModes: Mode[];
  visibleStatuses: Status[];
  hiddenLines: string[];
};

export default function CityMap({ city, visibleModes, visibleStatuses, hiddenLines }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

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
      minZoom: city.minZoom,
      maxZoom: 18,
      maxBounds: [
        [west - 0.25, south - 0.25],
        [east + 0.25, north + 0.25],
      ],
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("error", (event) => {
      console.error("Map error:", event.error?.message ?? event);
    });

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    map.on("load", () => {
      const stationMinZoom = Math.max(8.5, city.minZoom - 0.2);
      map.addSource("rail-lines", { type: "geojson", data: linesGeoJson(city.lines) });
      map.addSource("rail-stations", {
        type: "geojson",
        data: stationsGeoJson(city.stations, city.lines),
      });

      const width = [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["*", ["get", "w"], 0.5],
        13,
        ["get", "w"],
        17,
        ["*", ["get", "w"], 1.8],
      ] as unknown as ExpressionSpecification;

      const casingWidth = [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["+", ["*", ["get", "w"], 0.5], 3],
        13,
        ["+", ["get", "w"], 3],
        17,
        ["+", ["*", ["get", "w"], 1.8], 3],
      ] as unknown as ExpressionSpecification;

      map.addLayer({
        id: CASING,
        type: "line",
        source: "rail-lines",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": casingWidth,
          "line-opacity": 0.92,
        },
      });

      map.addLayer({
        id: STATUS_LAYERS.operational,
        type: "line",
        source: "rail-lines",
        filter: ["==", ["get", "status"], "operational"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "colour"], "line-width": width },
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
          "line-opacity": 0.6,
        },
      });

      // White centre stripe marks regional rapid rail.
      map.addLayer({
        id: RRTS_CORE,
        type: "line",
        source: "rail-lines",
        filter: ["all", ["==", ["get", "mode"], "rrts"], ["==", ["get", "status"], "operational"]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 13, 1.6, 17, 2.6],
          "line-opacity": 0.9,
        },
      });

      // Segmented / dotted overlays give each non-metro mode a distinct texture.
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
            "line-opacity": 0.85,
          },
        });
      }

      map.addLayer({
        id: STATIONS,
        type: "circle",
        source: "rail-stations",
        minzoom: stationMinZoom,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10.5,
            ["case", ["get", "interchange"], 3, 2.2],
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
            10.5,
            ["case", ["get", "interchange"], 2, 1.6],
            14,
            ["case", ["get", "interchange"], 3, 2.4],
          ],
        },
      });

      map.addLayer({
        id: STATION_DOTS,
        type: "circle",
        source: "rail-stations",
        minzoom: stationMinZoom,
        filter: ["==", ["get", "interchange"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 1, 14, 2.2, 16, 3],
          "circle-color": ["get", "colour"],
        },
      });

      map.addLayer({
        id: LABELS,
        type: "symbol",
        source: "rail-stations",
        minzoom: 13,
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

      const popup = new Popup({ closeButton: false, offset: 10, className: "station-popup" });

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

      for (const layer of [STATIONS, LABELS]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [city]);

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

    const statusCondition = (status: Status) =>
      ["==", ["get", "status"], status] as ExpressionSpecification;

    const lineFilter = (status: Status): FilterSpecification | null => {
      if (!visibleStatuses.includes(status) || visibleModes.length === 0) return null;
      const parts: ExpressionSpecification[] = [statusCondition(status)];
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

    const rrtsFilter = lineFilter("operational");
    map.setLayoutProperty(
      RRTS_CORE,
      "visibility",
      rrtsFilter && visibleModes.includes("rrts") ? "visible" : "none",
    );

    for (const overlay of OVERLAY_LAYERS) {
      map.setLayoutProperty(
        overlay.id,
        "visibility",
        rrtsFilter && visibleModes.includes(overlay.mode) ? "visible" : "none",
      );
    }

    // Stations follow the mode and status filters, not per-line toggles.
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
    const stationFilter: FilterSpecification = parts.length
      ? ((["all", ...parts] as unknown) as FilterSpecification)
      : (["==", ["get", "id"], "__none__"] as FilterSpecification);

    for (const layer of [STATIONS, LABELS]) {
      map.setFilter(layer, parts.length ? stationFilter : null);
      map.setLayoutProperty(layer, "visibility", parts.length ? "visible" : "none");
    }
    map.setFilter(
      STATION_DOTS,
      parts.length
        ? (["all", ["==", ["get", "interchange"], true], ...parts] as unknown as FilterSpecification)
        : null,
    );
    map.setLayoutProperty(STATION_DOTS, "visibility", parts.length ? "visible" : "none");
  }, [ready, visibleModes, visibleStatuses, hiddenLines]);

  return <div ref={containerRef} className="map" role="application" aria-label={`Map of ${city.city}`} />;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
