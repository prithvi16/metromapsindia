import { useState } from "react";
import Legend from "./components/Legend";
import MumbaiMap from "./components/MumbaiMap";
import type { MetroStatus } from "./lib/metro";
import { metro } from "./lib/metro";

export default function App() {
  const [hidden, setHidden] = useState<MetroStatus[]>([]);

  const toggle = (status: MetroStatus) => {
    setHidden((current) =>
      current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status],
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◉
          </span>
          <div>
            <h1>MetroMaps India</h1>
            <p>
              Mumbai · {metro.lines.length} lines · {metro.stations.length} stations
            </p>
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
        <MumbaiMap hidden={hidden} />
        <Legend hidden={hidden} onToggle={toggle} />
      </main>
    </div>
  );
}
