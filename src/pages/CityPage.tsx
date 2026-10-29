import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import CityMap from "../components/CityMap";
import Legend from "../components/Legend";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import type { AllData, CityData, Mode, Status } from "../lib/cities";
import { DEFAULT_HIDDEN_MODES, MODE_META, STATUS_ORDER } from "../lib/cities";
import { findCity, loadCityView } from "../lib/cityData";
import { usePageMeta } from "../lib/meta";

export default function CityPage() {
  const { slug } = useParams();
  const summary = findCity(slug);
  const [params, setParams] = useSearchParams();
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [city, setCity] = useState<CityData | null>(null);
  const [all, setAll] = useState<AllData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleModes, setVisibleModes] = useState<Mode[]>([]);
  const [visibleStatuses, setVisibleStatuses] = useState<Status[]>(STATUS_ORDER);
  const [hiddenLines, setHiddenLines] = useState<string[]>([]);

  const updateParams = (updates: Record<string, string | null>) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(updates)) {
          if (value == null || value === "") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  usePageMeta(
    summary ? `${summary.city} — MetroMaps India` : "MetroMaps India",
    summary
      ? summary.coverage === "none"
        ? `${summary.city}: ${summary.system}, planned opening ${summary.stats.opened.slice(0, 4)}.`
        : `${summary.city}: ${summary.counts.lines} mapped lines and ${summary.counts.stations} stations across ${summary.counts.km.toFixed(0)} line-km of metro, suburban and light rail.`
      : "An atlas of urban rail in India.",
  );

  useEffect(() => {
    if (!slug || !summary || summary.coverage === "none") return;
    let cancelled = false;
    setCity(null);
    setError(null);

    loadCityView(slug)
      .then(({ city: data, all: allData }) => {
        if (cancelled) return;
        setCity(data);
        setAll(allData);

        const rawModes = paramsRef.current.get("mode");
        const requestedModes =
          rawModes == null
            ? null
            : rawModes === "none"
              ? []
              : rawModes
                  .split(",")
                  .filter((mode): mode is Mode => data.counts.modes.includes(mode as Mode));
        const rawStatuses = paramsRef.current.get("status");
        const requestedStatuses =
          rawStatuses == null
            ? null
            : rawStatuses.split(",").filter((status): status is Status =>
                STATUS_ORDER.includes(status as Status),
              );

        let nextModes =
          requestedModes ??
          data.counts.modes.filter((mode) => !DEFAULT_HIDDEN_MODES.includes(mode));
        let nextStatuses = requestedStatuses ?? STATUS_ORDER;

        // A deep link to a line or station must reveal that feature even when
        // its mode/status is hidden by default or filtered out in the URL.
        const lineId = paramsRef.current.get("line");
        const linkedLine = lineId
          ? data.lines.find((line) => String(line.osmId) === lineId)
          : undefined;
        if (linkedLine) {
          if (!nextModes.includes(linkedLine.mode)) nextModes = [...nextModes, linkedLine.mode];
          if (!nextStatuses.includes(linkedLine.status)) {
            nextStatuses = [...nextStatuses, linkedLine.status];
          }
        }
        const focusRaw = paramsRef.current.get("focus");
        if (focusRaw) {
          const [lat, lng] = focusRaw.split(",").map(Number);
          const station = data.stations.find(
            (candidate) =>
              Math.abs(candidate.lat - lat) < 0.001 && Math.abs(candidate.lon - lng) < 0.001,
          );
          if (station) {
            for (const mode of station.modes) {
              if (!nextModes.includes(mode)) nextModes = [...nextModes, mode];
            }
          }
        }

        setVisibleModes(nextModes);
        setVisibleStatuses(nextStatuses);
        setHiddenLines([]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [slug, summary]);

  if (!summary) {
    return (
      <>
        <SiteHeader breadcrumbs={[{ label: "Home", to: "/" }, { label: "Not found" }]} />
        <main className="page">
          <h1>City not found</h1>
          <p>
            <Link to="/">Back to all cities</Link>
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const breadcrumbs = [
    { label: "Home", to: "/" },
    { label: summary.city },
  ];

  if (summary.coverage === "none") {
    return (
      <>
        <SiteHeader breadcrumbs={breadcrumbs} />
        <main className="page">
          <h1>{summary.city}</h1>
          <p className="page__lede">
            {summary.system} is on the list, but its network is not mapped yet. Planned
            opening: {summary.stats.opened.slice(0, 4)}. This page will appear once the
            lines and stations are traced.
          </p>
          <p>
            <Link to="/">Browse the cities that are ready</Link>
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const focusRaw = params.get("focus");
  const focusLat = Number(focusRaw?.split(",")[0]);
  const focusLng = Number(focusRaw?.split(",")[1]);
  const focus =
    Number.isFinite(focusLat) && Number.isFinite(focusLng)
      ? {
          lat: focusLat,
          lng: focusLng,
          name: params.get("name") ?? undefined,
          z: Number(params.get("z") ?? 15),
        }
      : null;
  const focusLineId = params.get("line");
  const rawZ = params.get("z");
  const rawLat = params.get("lat");
  const rawLng = params.get("lng");
  const viewZ = Number(rawZ);
  const viewLat = Number(rawLat);
  const viewLng = Number(rawLng);
  // Number(null) is 0, so test the raw params before trusting the numbers.
  const view =
    rawZ != null &&
    rawLat != null &&
    rawLng != null &&
    Number.isFinite(viewZ) &&
    Number.isFinite(viewLat) &&
    Number.isFinite(viewLng)
      ? { z: viewZ, lat: viewLat, lng: viewLng }
      : null;

  return (
    <>
      <SiteHeader breadcrumbs={breadcrumbs} />
      <main className="city-page">
        <div className="city-page__head">
          <div>
            <h1>{summary.city}</h1>
            <p className="city-page__system">
              {city
                ? [...new Set(city.lines.map((line) => line.system))].join(" · ")
                : summary.counts.systemNames.length > 0
                  ? summary.counts.systemNames.join(" · ")
                  : summary.system}
              {summary.operator ? ` · ${summary.operator}` : ""}
            </p>
          </div>
          <dl className="city-page__stats">
            <div>
              <dt>Lines</dt>
              <dd>{summary.counts.lines}</dd>
            </div>
            <div>
              <dt>Stations</dt>
              <dd>
                {summary.counts.stations}
                {summary.coverage === "partial" && summary.stats.stations > 0 && (
                  <span className="is-muted"> / {summary.stats.stations}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Line-km</dt>
              <dd>{summary.counts.km.toFixed(1)} km</dd>
            </div>
            <div>
              <dt>Since</dt>
              <dd>{summary.stats.opened.slice(0, 4)}</dd>
            </div>
            {summary.stats.ridership && (
              <div>
                <dt>Ridership</dt>
                <dd>{summary.stats.ridership}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="city-page__map">
          {error && <p className="city-page__error">Could not load map data: {error}</p>}
          {!city && !error && <p className="city-page__loading">Loading network…</p>}
          {city && all && (
            <>
              <CityMap
                city={city}
                all={all}
                visibleModes={visibleModes}
                visibleStatuses={visibleStatuses}
                hiddenLines={hiddenLines}
                focus={focus}
                focusLineId={focusLineId}
                view={view}
                onViewChange={(next) => {
                  // A late map event must not rewrite the URL after the user
                  // has navigated away from this city.
                  if (window.location.pathname !== `/city/${summary.slug}`) return;
                  updateParams({
                    z: next.z.toFixed(2),
                    lat: next.lat.toFixed(5),
                    lng: next.lng.toFixed(5),
                  });
                }}
              />
              <Legend
                modes={city.counts.modes}
                visibleModes={visibleModes}
                onToggleMode={(mode) => {
                  const next = visibleModes.includes(mode)
                    ? visibleModes.filter((m) => m !== mode)
                    : [...visibleModes, mode];
                  setVisibleModes(next);
                  updateParams({ mode: next.length ? next.join(",") : "none" });
                }}
                visibleStatuses={visibleStatuses}
                onToggleStatus={(status) => {
                  const next = visibleStatuses.includes(status)
                    ? visibleStatuses.filter((s) => s !== status)
                    : [...visibleStatuses, status];
                  setVisibleStatuses(next);
                  updateParams({ status: next.join(",") });
                }}
                lines={city.lines}
                hiddenLines={hiddenLines}
                onToggleLine={(id) =>
                  setHiddenLines((current) =>
                    current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
                  )
                }
                stationCount={city.stations.length}
              />
            </>
          )}
        </div>

        <section className="city-page__notes">
          <div>
            <h2>About this network</h2>
            <p>
              {city?.lines.length ?? summary.counts.lines} mapped lines serving{" "}
              {city?.stations.length ?? summary.counts.stations} stations across{" "}
              {summary.counts.modes.map((mode) => MODE_META[mode].label).join(", ") || "—"}.
              Zoom out to see neighbouring networks, or click another city's line to open
              it. The layer panel switches modes and statuses on and off.
            </p>
            <p className="city-page__official">
              Official {summary.system} figures: {summary.stats.lines} lines,{" "}
              {summary.stats.stations} stations and {summary.stats.km.toFixed(1)} km
              (Wikipedia, October 2026).
            </p>
            {summary.coverage === "partial" && (
              <p className="notice">
                Coverage here is partial — {summary.counts.stations} of{" "}
                {summary.stats.stations} stations are mapped so far.
              </p>
            )}
          </div>
          <div>
            <h2>Data</h2>
            <p>
              Metro, monorail and light-rail lines from OpenStreetMap contributors
              (ODbL). Suburban linework and station coordinates from the{" "}
              <a href="https://indiarailinfo.com/atlas" target="_blank" rel="noreferrer">
                India Rail Info atlas
              </a>
              , drawn as a single teal line. Network figures from Wikipedia’s “Urban
              rail transit in India”, as of October 2026.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
