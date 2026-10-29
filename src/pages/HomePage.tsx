import { Link, useSearchParams } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import { MODE_META } from "../lib/cities";
import type { CitySummary } from "../lib/cities";
import { cityIndex, countryStats } from "../lib/cityData";

const REGION_TABS = ["All", "North", "West", "South", "East"] as const;

export default function HomePage() {
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
          <h1>Every metro, monorail and suburban line in India.</h1>
          <p className="hero__lede">
            {countryStats.systems} mapped systems across {cityIndex.cities.length} cities,
            drawn from OpenStreetMap. Filter by mode, jump between cities, and see what is
            running, building and planned.
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
              <dt>Network</dt>
              <dd>{countryStats.km.toLocaleString("en-IN")} km</dd>
            </div>
            <div>
              <dt>Cities</dt>
              <dd>{cityIndex.cities.length}</dd>
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
            {city.preview.paths.map((path, index) => (
              <path
                key={index}
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
          {city.system}
          {city.operator ? ` · ${city.operator}` : ""}
        </p>

        <dl className="city-card__stats">
          <div>
            <dt>Lines</dt>
            <dd>{city.counts.lines || city.stats.lines}</dd>
          </div>
          <div>
            <dt>Stations</dt>
            <dd>{city.counts.stations || city.stats.stations}</dd>
          </div>
          <div>
            <dt>km</dt>
            <dd>{city.stats.km.toFixed(1)}</dd>
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
