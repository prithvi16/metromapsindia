import MumbaiMap from "./components/MumbaiMap";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◉
          </span>
          <div>
            <h1>MetroMaps India</h1>
            <p>Mumbai, Maharashtra</p>
          </div>
        </div>
        <a
          className="header-link"
          href="https://www.openstreetmap.org/#map=11/19.0760/72.8777"
          target="_blank"
          rel="noreferrer"
        >
          Open in OpenStreetMap
        </a>
      </header>

      <main className="map-wrapper">
        <MumbaiMap />
      </main>
    </div>
  );
}
