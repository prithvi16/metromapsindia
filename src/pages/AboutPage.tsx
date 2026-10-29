import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import { MODE_META, MODE_ORDER } from "../lib/cities";
import { countryStats } from "../lib/cityData";
import { usePageMeta } from "../lib/meta";

const TIMELINE = [
  { year: "1853", text: "First suburban train runs from Bori Bunder to Thane — Asia’s first commuter railway." },
  { year: "1873", text: "Horse-drawn trams begin in Kolkata; electric trams follow in Chennai in 1895." },
  { year: "1984", text: "Kolkata Metro opens between Esplanade and Bhowanipore — India’s first metro." },
  { year: "1995", text: "Chennai MRTS opens as the country’s first fully elevated suburban corridor." },
  { year: "2002", text: "Delhi Metro begins service; it is now the largest network in the country." },
  { year: "2011", text: "Namma Metro opens in Bengaluru." },
  { year: "2014", text: "Mumbai Metro Line 1 and the Mumbai Monorail enter service." },
  { year: "2023", text: "Navi Mumbai Metro opens; the Delhi–Meerut RRTS priority corridor starts running." },
  { year: "2026", text: "Meerut Metro opens and the full Delhi–Meerut RRTS corridor is commissioned." },
];

const MODE_NOTES: Record<string, string> = {
  metro: "High-capacity rapid transit on a fully segregated right of way.",
  suburban:
    "Commuter rail on the Indian Railways network, connecting suburbs to a city centre. Every suburban route is drawn as one solid teal line, with no per-line colours or overlays.",
  rrts: "Higher-speed regional rapid rail linking a metropolis with nearby cities.",
  monorail: "Single-beam elevated transit, used where a full metro will not fit.",
  light_rail: "Metrolite: lighter rolling stock, mostly fenced, cheaper than a metro.",
  tram: "Street-running rail; Kolkata’s is the only surviving system in India.",
  funicular: "Cable-hauled cars on a steep slope, such as the Malanggad line near Thane.",
  water_metro: "Integrated ferry services, as in Kochi.",
};

export default function AboutPage() {
  usePageMeta(
    "About — MetroMaps India",
    "How MetroMaps India combines OpenStreetMap and the India Rail Info atlas into one atlas of Indian urban rail.",
  );
  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Home", to: "/" }, { label: "About" }]} />

      <main className="page page--about">
        <h1>About MetroMaps India</h1>
        <p className="page__lede">
          A map-first index of urban rail in India: {countryStats.systems} systems across{" "}
          {countryStats.cities} mapped cities, covering{" "}
          {countryStats.stations.toLocaleString("en-IN")} stations and roughly{" "}
          {countryStats.km.toLocaleString("en-IN")} line-km — plus{" "}
          {countryStats.listed - countryStats.cities} planned systems on the way.
        </p>

        <section>
          <h2>Why this exists</h2>
          <p>
            India’s urban rail networks are growing faster than any single map keeps up
            with. This site pulls metro and light-rail lines from OpenStreetMap and
            suburban routes from the India Rail Info atlas, draws them on a quiet basemap,
            and lets you filter by mode and construction status.
            Everything is generated from a reproducible data pipeline, so when a line opens
            the map can be refreshed with one command.
          </p>
        </section>

        <section>
          <h2>History</h2>
          <ol className="timeline">
            {TIMELINE.map((entry) => (
              <li key={entry.year}>
                <span className="timeline__year">{entry.year}</span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2>Modes</h2>
          <p>
            “Urban rail” covers more than metro. The map distinguishes eight modes, each
            with its own stroke treatment.
          </p>
          <dl className="mode-list">
            {MODE_ORDER.map((mode) => (
              <div key={mode}>
                <dt>{MODE_META[mode].label}</dt>
                <dd>{MODE_NOTES[mode]}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2>How the data is built</h2>
          <p>
            A Node script queries the Overpass API for every city region, stitches route
            relations into polylines, clusters stop positions into stations, and applies a
            small curation table for known OpenStreetMap tagging gaps. The result is one
            GeoJSON-style dataset per city, plus a generated SVG sketch for the home page.
          </p>
          <p>
            Coverage is uneven. Some cities are complete; others are missing stations or
            whole lines. Cards and city pages say so rather than filling the gaps with
            guesses.
          </p>
          <p>
            Suburban rail is imported separately from the{" "}
            <a href="https://indiarailinfo.com/atlas" target="_blank" rel="noreferrer">
              India Rail Info atlas
            </a>
            : its vector tiles carry every track and station, and a per-city manifest
            groups them into named corridors. Suburban lines are rendered as one solid
            teal stroke so the commuter network reads as a single layer beneath the metro.
          </p>
        </section>

        <section>
          <h2>Sources</h2>
          <ul className="sources">
            <li>
              Map data:{" "}
              <a href="https://www.openstreetmap.org/copyright">
                OpenStreetMap contributors
              </a>{" "}
              under the ODbL, fetched via the Overpass API.
            </li>
            <li>
              Suburban linework and station coordinates:{" "}
              <a href="https://indiarailinfo.com/atlas">India Rail Info atlas</a>, ©
              India Rail Info; used here with attribution.
            </li>
            <li>
              Basemap: <a href="https://openfreemap.org">OpenFreeMap</a> Positron, built
              from OpenMapTiles.
            </li>
            <li>
              Network figures and history:{" "}
              <a href="https://en.wikipedia.org/wiki/Urban_rail_transit_in_India">
                Wikipedia, “Urban rail transit in India”
              </a>
              , CC BY-SA 4.0, as of October 2026.
            </li>
          </ul>
        </section>

        <p>
          <Link to="/">← Back to all cities</Link>
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
