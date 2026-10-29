import { Link } from "react-router-dom";
import { MODE_META, MODE_ORDER } from "../lib/cities";
import { citiesByRegion, cityIndex } from "../lib/cityData";

const MODE_HINTS: Record<string, string> = {
  metro: "High capacity",
  suburban: "Commuter rail",
  rrts: "160 km/h",
  monorail: "Single beam",
  light_rail: "Metrolite",
  tram: "Street level",
  funicular: "Cable-hauled",
  water_metro: "Ferry",
};

export default function SiteFooter() {
  const groups = citiesByRegion();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <section className="footer-cities" aria-label="All cities">
          <h2>All cities</h2>
          <div className="footer-cities__grid">
            {groups.map(([region, cities]) => (
              <div key={region} className="footer-cities__group">
                <h3>{region}</h3>
                <ul>
                  {cities.map((city) => (
                    <li key={city.slug}>
                      {city.coverage === "none" ? (
                        <span className="is-muted" title="Network data not available yet">
                          {city.city}
                        </span>
                      ) : (
                        <Link to={`/city/${city.slug}`}>{city.city}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="footer-about">
          <h2>Urban rail in India</h2>
          <p>
            India runs {cityIndex.cities.length} urban rail systems across{" "}
            {new Set(cityIndex.cities.map((c) => c.region)).size} regions — the third
            longest network in the world. It began with suburban rail in Mumbai in 1853
            and the first metro in Kolkata in 1984, and now spans metro, suburban rail,
            monorail, light rail, regional rapid rail, trams and funiculars.
          </p>
          <p>
            Metro and light-rail lines come from OpenStreetMap; suburban routes come
            from the India Rail Info atlas. Stations and alignments are only as complete
            as their source, so coverage varies by city.
          </p>

          <h3>Modes on this map</h3>
          <ul className="footer-modes">
            {MODE_ORDER.map((mode) => (
              <li key={mode}>
                <span className="footer-modes__name">{MODE_META[mode].label}</span>
                <span className="footer-modes__hint">{MODE_HINTS[mode]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="site-footer__legal">
        <p>
          Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{" "}
          contributors (ODbL). Suburban linework ©{" "}
          <a href="https://indiarailinfo.com/atlas">India Rail Info</a>. Basemap by{" "}
          <a href="https://openfreemap.org">OpenFreeMap</a>. Network figures from{" "}
          <a href="https://en.wikipedia.org/wiki/Urban_rail_transit_in_India">
            Wikipedia, “Urban rail transit in India”
          </a>{" "}
          (CC BY-SA 4.0), as of October 2026.
        </p>
        <p className="site-footer__meta">
          <Link to="/about">About this project</Link>
          <span aria-hidden="true">·</span>
          <span>Data updated {new Date(cityIndex.generatedAt).toLocaleDateString("en-IN")}</span>
        </p>
      </div>
    </footer>
  );
}
