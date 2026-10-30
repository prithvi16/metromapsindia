import { Link, useSearchParams } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import type { CitySummary } from "../lib/cities";
import { MODE_META } from "../lib/cities";
import { cityIndex, countryStats } from "../lib/cityData";
import { usePageMeta } from "../lib/meta";

const REGION_TABS = ["All", "North", "West", "South", "East"] as const;

export default function HomePage() {
  usePageMeta(
    "MetroMaps India — India's urban rail atlas",
    `${countryStats.systems} systems across ${countryStats.cities} cities: ${countryStats.lines} metro, suburban, monorail, tram, RRTS and bullet-train lines on one map.`,
    { path: "/" },
  );
  const [params, setParams] = useSearchParams();
  const requested = params.get("region");
  const region: (typeof REGION_TABS)[number] = REGION_TABS.includes(
    requested as (typeof REGION_TABS)[number],
  )
    ? (requested as (typeof REGION_TABS)[number])
    : "All";

  const setRegion = (next: (typeof REGION_TABS)[number]) => {
    if (next === "All") setParams({}, { replace: true });
    else setParams({ region: next }, { replace: true });
  };

  const cities = cityIndex.cities.filter((city) => region === "All" || city.region === region);

  return (
    <>
      <SiteHeader />

      <main className="home">
        <section className="hero">
          <p className="hero__eyebrow">India · urban rail</p>
          <h1>India’s metro, suburban and bullet-train lines, on one map.</h1>
          <p className="hero__lede">
            {countryStats.systems} systems across {countryStats.cities} mapped cities —{" "}
            {countryStats.lines} lines, {countryStats.stations.toLocaleString("en-IN")} mapped
            stations and {countryStats.km.toLocaleString("en-IN")} line-km — with{" "}
            {countryStats.listed - countryStats.cities} more planned systems on the way. Metro and
            bullet train from OpenStreetMap, suburban from the India Rail Info atlas. Filter by
            mode, jump between cities, and see what is running, building and planned.
          </p>

          <dl className="hero__stats">
            <div>
              <dt>Systems</dt>
              <dd>{countryStats.systems}</dd>
            </div>
            <div>
              <dt>Stations</dt>
              <dd>{countryStats.stations.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>Line-km</dt>
              <dd>{countryStats.km.toLocaleString("en-IN")} km</dd>
            </div>
            <div>
              <dt>Cities</dt>
              <dd>{countryStats.cities}</dd>
            </div>
          </dl>
        </section>

        <section className="city-index" aria-labelledby="cities-heading">
          <div className="city-index__head">
            <h2 id="cities-heading">Cities</h2>
            <div className="tabs" role="tablist" aria-label="Filter by region">
              {REGION_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={region === tab}
                  className="tab"
                  onClick={() => setRegion(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <ul className="city-grid">
            {cities.map((city) => (
              <li key={city.slug}>
                <CityCard city={city} />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function CityCard({ city }: { city: CitySummary }) {
  const comingSoon = city.coverage === "none";
  const year = city.stats.opened.slice(0, 4);

  const inner = (
    <>
      <div className="city-card__preview">
        {city.preview ? (
          <svg
            viewBox={`0 0 ${city.preview.width} ${city.preview.height}`}
            role="img"
            aria-label={`${city.city} network sketch`}
          >
            {city.preview.paths.map((path) => (
              <path
                key={path.d}
                d={path.d}
                fill="none"
                stroke={path.colour}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        ) : (
          <span className="city-card__soon">Coming soon</span>
        )}
      </div>

      <div className="city-card__body">
        <div className="city-card__title">
          <h3>{city.city}</h3>
          <span className={`badge badge--${city.coverage}`}>
            {city.coverage === "full" ? "Mapped" : city.coverage === "partial" ? "Partial" : "Soon"}
          </span>
        </div>
        <p className="city-card__system">
          {city.counts.systemNames.length > 0 ? city.counts.systemNames.join(" · ") : city.system}
          {city.operator ? ` · ${city.operator}` : ""}
        </p>

        <dl className="city-card__stats">
          <div>
            <dt>Lines</dt>
            <dd>{city.counts.lines || city.stats.lines}</dd>
          </div>
          <div>
            <dt>Stations</dt>
            <dd>
              {city.counts.stations || city.stats.stations}
              {city.coverage === "partial" && city.stats.stations > 0 && (
                <span className="is-muted"> / {city.stats.stations}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>km</dt>
            <dd>{(city.coverage === "none" ? city.stats.km : city.counts.km).toFixed(1)}</dd>
          </div>
          <div>
            <dt>Open</dt>
            <dd>{year}</dd>
          </div>
        </dl>

        {city.counts.modes.length > 0 && (
          <p className="city-card__modes">
            {city.counts.modes.map((mode) => MODE_META[mode].short).join(" · ")}
          </p>
        )}
      </div>
    </>
  );

  if (comingSoon) {
    return <div className="city-card city-card--soon">{inner}</div>;
  }

  return (
    <Link to={`/city/${city.slug}`} className="city-card">
      {inner}
    </Link>
  );
}
