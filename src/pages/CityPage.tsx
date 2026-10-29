import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import CityMap from "../components/CityMap";
import Legend from "../components/Legend";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import type { AllData, CityData, Mode, Status } from "../lib/cities";
import { DEFAULT_HIDDEN_MODES, MODE_META, STATUS_ORDER } from "../lib/cities";
import { findCity, loadCityView } from "../lib/cityData";

export default function CityPage() {
  const { slug } = useParams();
  const summary = findCity(slug);

  const [city, setCity] = useState<CityData | null>(null);
  const [all, setAll] = useState<AllData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleModes, setVisibleModes] = useState<Mode[]>([]);
  const [visibleStatuses, setVisibleStatuses] = useState<Status[]>(STATUS_ORDER);
  const [hiddenLines, setHiddenLines] = useState<string[]>([]);

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
        setVisibleModes(
          data.counts.modes.filter((mode) => !DEFAULT_HIDDEN_MODES.includes(mode)),
        );
        setVisibleStatuses(STATUS_ORDER);
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
    { label: summary.region, to: `/?region=${summary.region}` },
    { label: summary.city },
  ];

  if (summary.coverage === "none") {
    return (
      <>
        <SiteHeader breadcrumbs={breadcrumbs} />
        <main className="page">
          <h1>{summary.city}</h1>
          <p className="page__lede">
            {summary.system} is on the list, but OpenStreetMap does not have a mapped
            network for it yet. This page will appear once the lines and stations are
            traced.
          </p>
          <p>
            <Link to="/">Browse the cities that are ready</Link>
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader breadcrumbs={breadcrumbs} />
      <main className="city-page">
        <div className="city-page__head">
          <div>
            <h1>{summary.city}</h1>
            <p className="city-page__system">
              {summary.system}
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
              <dd>{summary.counts.stations}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>{summary.stats.km.toFixed(1)} km</dd>
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
              />
              <Legend
                modes={city.counts.modes}
                visibleModes={visibleModes}
                onToggleMode={(mode) =>
                  setVisibleModes((current) =>
                    current.includes(mode)
                      ? current.filter((m) => m !== mode)
                      : [...current, mode],
                  )
                }
                visibleStatuses={visibleStatuses}
                onToggleStatus={(status) =>
                  setVisibleStatuses((current) =>
                    current.includes(status)
                      ? current.filter((s) => s !== status)
                      : [...current, status],
                  )
                }
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
              Zoom is limited to the {summary.city} region; use the layer panel to switch
              modes and statuses on and off.
            </p>
            {summary.coverage === "partial" && (
              <p className="notice">
                OpenStreetMap coverage here is partial — some stations or lines are still
                missing from the map data.
              </p>
            )}
          </div>
          <div>
            <h2>Data</h2>
            <p>
              Lines and stations from OpenStreetMap contributors (ODbL). Network figures
              from Wikipedia’s “Urban rail transit in India”, as of October 2026.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
