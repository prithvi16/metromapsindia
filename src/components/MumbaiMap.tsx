import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  Popup,
  type ExpressionSpecification,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { MetroStatus } from "../lib/metro";
import { linesGeoJson, metro, stationsGeoJson } from "../lib/metro";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Churchgate / Fort, the historic centre of the network. */
const CENTER: [number, number] = [72.8777, 19.076];
const ZOOM = 11;

const LINE_CASING = "metro-lines-casing";
const LINE_SOLID = "metro-lines-operational";
const LINE_UC = "metro-lines-construction";
const LINE_PLANNED = "metro-lines-planned";
const STATIONS = "metro-stations";
const STATION_DOTS = "metro-stations-dot";
const STATION_LABELS = "metro-station-labels";

const LINE_LAYERS: Record<MetroStatus, string> = {
  operational: LINE_SOLID,
  "under-construction": LINE_UC,
  planned: LINE_PLANNED,
};

type Props = {
  hidden: MetroStatus[];
};

export default function MumbaiMap({ hidden }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: CENTER,
      zoom: ZOOM,
      minZoom: 8,
      maxZoom: 18,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("error", (event) => {
      console.error("Map error:", event.error?.message ?? event);
    });

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    map.on("load", () => {
      const lines = linesGeoJson(metro.lines);
      const stations = stationsGeoJson(metro.stations, metro.lines);

      map.addSource("metro-lines", { type: "geojson", data: lines });
      map.addSource("metro-stations", { type: "geojson", data: stations });

      // White casing under every line keeps the network legible on any basemap.
      map.addLayer({
        id: LINE_CASING,
        type: "line",
        source: "metro-lines",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 9, 18, 14],
          "line-opacity": 0.9,
        },
      });

      map.addLayer({
        id: LINE_SOLID,
        type: "line",
        source: "metro-lines",
        filter: ["==", ["get", "status"], "operational"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "colour"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 5, 18, 8],
        },
      });

      map.addLayer({
        id: LINE_UC,
        type: "line",
        source: "metro-lines",
        filter: ["==", ["get", "status"], "under-construction"],
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": ["get", "colour"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 5, 18, 8],
          "line-dasharray": [2, 1.4],
          "line-opacity": 0.95,
        },
      });

      map.addLayer({
        id: LINE_PLANNED,
        type: "line",
        source: "metro-lines",
        filter: ["==", ["get", "status"], "planned"],
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": ["get", "colour"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 4, 18, 7],
          "line-dasharray": [0.8, 1.8],
          "line-opacity": 0.6,
        },
      });

      // Station dots, hidden until the network is readable at city zoom.
      map.addLayer({
        id: STATIONS,
        type: "circle",
        source: "metro-stations",
        minzoom: 11,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, ["case", ["get", "interchange"], 2.6, 2.2],
            13, ["case", ["get", "interchange"], 5.5, 4],
            16, ["case", ["get", "interchange"], 8, 6],
          ],
          "circle-color": "#ffffff",
          "circle-stroke-color": ["get", "colour"],
          "circle-stroke-width": [
            "interpolate", ["linear"], ["zoom"],
            10, ["case", ["get", "interchange"], 2, 1.6],
            14, ["case", ["get", "interchange"], 3, 2.4],
          ],
        },
      });

      // A second, smaller dot gives the interchange stations a ringed look.
      map.addLayer({
        id: STATION_DOTS,
        type: "circle",
        source: "metro-stations",
        minzoom: 11,
        filter: ["==", ["get", "interchange"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2.2, 16, 3],
          "circle-color": ["get", "colour"],
        },
      });

      map.addLayer({
        id: STATION_LABELS,
        type: "symbol",
        source: "metro-stations",
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

      const popup = new Popup({
        closeButton: false,
        offset: 10,
        className: "metro-popup",
      });

      map.on("click", STATIONS, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties ?? {};
        const geometry = feature.geometry;
        if (!geometry || geometry.type !== "Point") return;
        const [lon, lat] = geometry.coordinates as [number, number];
        popup
          .setLngLat([lon, lat])
          .setHTML(
            `<strong>${escapeHtml(String(props.name))}</strong>` +
              `<span class="metro-popup__lines">${escapeHtml(String(props.lines))}</span>`,
          )
          .addTo(map);
      });

      for (const layer of [STATIONS, STATION_LABELS]) {
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
  }, []);

  // Status toggles from the legend.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const status of Object.keys(LINE_LAYERS) as MetroStatus[]) {
      map.setLayoutProperty(
        LINE_LAYERS[status],
        "visibility",
        hidden.includes(status) ? "none" : "visible",
      );
    }

    const visible = (Object.keys(LINE_LAYERS) as MetroStatus[]).filter(
      (s) => !hidden.includes(s),
    );

    map.setLayoutProperty(LINE_CASING, "visibility", visible.length ? "visible" : "none");

    const stationFilter: ExpressionSpecification =
      visible.length === 0
        ? ["==", ["get", "id"], "__none__"]
        : ([
            "any",
            ...visible.map((s) => ["==", ["get", `is-${s}`], true]),
          ] as unknown as ExpressionSpecification);

    for (const layer of [STATIONS, STATION_LABELS]) {
      map.setFilter(layer, stationFilter);
    }
    map.setFilter(STATION_DOTS, ["all", ["==", ["get", "interchange"], true], stationFilter]);
  }, [hidden, ready]);

  return <div ref={containerRef} className="map" role="application" aria-label="Map of Mumbai" />;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
