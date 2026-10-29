import type { MetroLine, MetroStatus } from "../lib/metro";
import { groupLinesByStatus, lineColour, lineLabel, metro, statusLabel } from "../lib/metro";

type Props = {
  hidden: MetroStatus[];
  onToggle: (status: MetroStatus) => void;
};

const ORDER: MetroStatus[] = ["operational", "under-construction", "planned"];

export default function Legend({ hidden, onToggle }: Props) {
  const groups = groupLinesByStatus(metro.lines);
  const visible = ORDER.filter((status) => !hidden.includes(status)).flatMap(
    (status) => groups[status],
  );

  return (
    <aside className="legend" aria-label="Metro network legend">
      <div className="legend__filters">
        {ORDER.map((status) => {
          const count = groups[status].length;
          const isOn = !hidden.includes(status);
          return (
            <button
              key={status}
              type="button"
              className="chip"
              aria-pressed={isOn}
              disabled={count === 0}
              onClick={() => onToggle(status)}
            >
              <span className={`chip__swatch chip__swatch--${status}`} aria-hidden="true" />
              {statusLabel(status)}
              <span className="chip__count">{count}</span>
            </button>
          );
        })}
      </div>

      <ul className="legend__lines">
        {visible.map((line) => (
          <LegendRow key={line.osmId} line={line} />
        ))}
      </ul>

      <p className="legend__source">
        {metro.stations.length} stations · data © OpenStreetMap contributors
      </p>
    </aside>
  );
}

function LegendRow({ line }: { line: MetroLine }) {
  const endpoints =
    line.from && line.to ? `${line.from} ↔ ${line.to}` : statusLabel(line.status);

  return (
    <li className="legend__line">
      <span
        className={`legend__swatch legend__swatch--${line.status}`}
        style={{ background: lineColour(line) }}
        aria-hidden="true"
      />
      <span className="legend__name">{lineLabel(line)}</span>
      <span className="legend__meta">{endpoints}</span>
    </li>
  );
}
