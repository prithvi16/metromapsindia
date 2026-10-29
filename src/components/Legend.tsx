import { useState } from "react";
import type { CityLine, Mode, Status } from "../lib/cities";
import {
  MODE_META,
  MODE_ORDER,
  STATUS_META,
  STATUS_ORDER,
  groupBySystem,
  lineEndpoints,
  lineLabel,
} from "../lib/cities";

type Props = {
  modes: Mode[];
  visibleModes: Mode[];
  onToggleMode: (mode: Mode) => void;
  visibleStatuses: Status[];
  onToggleStatus: (status: Status) => void;
  lines: CityLine[];
  hiddenLines: string[];
  onToggleLine: (id: string) => void;
  stationCount: number;
};

export default function Legend({
  modes,
  visibleModes,
  onToggleMode,
  visibleStatuses,
  onToggleStatus,
  lines,
  hiddenLines,
  onToggleLine,
  stationCount,
}: Props) {
  const [open, setOpen] = useState(true);
  const systems = groupBySystem(lines);

  return (
    <aside className={`legend ${open ? "" : "legend--closed"}`} aria-label="Map layers">
      <button
        type="button"
        className="legend__handle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Layers</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="legend__body">
          <section className="legend__section">
            <h3>Mode</h3>
            <div className="legend__chips">
              {MODE_ORDER.filter((mode) => modes.includes(mode)).map((mode) => {
                const on = visibleModes.includes(mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    className="chip chip--mode"
                    aria-pressed={on}
                    onClick={() => onToggleMode(mode)}
                    title={MODE_META[mode].label}
                  >
                    <ModeSample mode={mode} />
                    {MODE_META[mode].short}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="legend__section">
            <h3>Status</h3>
            <div className="legend__chips">
              {STATUS_ORDER.map((status) => {
                const on = visibleStatuses.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    onClick={() => onToggleStatus(status)}
                  >
                    <StatusSample status={status} />
                    {STATUS_META[status].short}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="legend__section legend__section--lines">
            <h3>Lines</h3>
            {systems.map(([system, systemLines]) => (
              <div key={system} className="legend__system">
                <h4>{system}</h4>
                <ul>
                  {systemLines.map((line) => {
                    const id = String(line.osmId);
                    const visible = !hiddenLines.includes(id);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className="legend__line"
                          aria-pressed={visible}
                          onClick={() => onToggleLine(id)}
                          title={lineEndpoints(line)}
                        >
                          <span
                            className={`legend__swatch legend__swatch--${line.status}`}
                            style={{ background: line.colour }}
                            aria-hidden="true"
                          />
                          <span className="legend__line-name">{lineLabel(line)}</span>
                          <span className="legend__line-meta">{lineEndpoints(line)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <p className="legend__source">{stationCount} stations · © OpenStreetMap</p>
        </div>
      )}
    </aside>
  );
}

function ModeSample({ mode }: { mode: Mode }) {
  const meta = MODE_META[mode];
  const strokeWidth = Math.max(1.5, meta.width * 0.55);
  return (
    <svg className="mode-sample" width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">
      <line x1="1" y1="5" x2="23" y2="5" stroke="#334155" strokeWidth={strokeWidth} strokeLinecap="round" />
      {meta.overlay && (
        <line
          x1="1"
          y1="5"
          x2="23"
          y2="5"
          stroke="#ffffff"
          strokeWidth={Math.max(0.8, strokeWidth * 0.35)}
          strokeDasharray={meta.overlay.join(" ")}
        />
      )}
    </svg>
  );
}

function StatusSample({ status }: { status: Status }) {
  const dash =
    status === "operational" ? undefined : status === "under-construction" ? "4 3" : "1.5 3";
  return (
    <svg className="status-sample" width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
      <line
        x1="1"
        y1="4"
        x2="21"
        y2="4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}
