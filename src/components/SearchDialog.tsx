import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import type { Mode, SearchIndex } from "../../shared/schema";
import { MODE_META } from "../lib/cities";
import { cityIndex, loadSearchIndex } from "../lib/cityData";

type Result = {
  kind: "city" | "line" | "station";
  label: string;
  sub: string;
  to: string;
};

const LIMIT = 18;

export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchIndex | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    if (!search) {
      loadSearchIndex()
        .then(setSearch)
        .catch(() => setSearch(null));
    }
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const cityName = useMemo(() => {
    const map = new Map<string, string>();
    for (const city of cityIndex.cities) map.set(city.slug, city.city);
    return map;
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return cityIndex.cities
        .filter((city) => city.coverage !== "none")
        .slice(0, 8)
        .map((city) => ({
          kind: "city" as const,
          label: city.city,
          sub: `${city.counts.lines} lines · ${city.counts.stations} stations`,
          to: `/city/${city.slug}`,
        }));
    }

    const out: Result[] = [];
    for (const city of cityIndex.cities) {
      const cityModes = city.counts.modes
        .map((mode) => `${MODE_META[mode].label} ${MODE_META[mode].short}`)
        .join(" ")
        .toLowerCase();
      if (
        city.city.toLowerCase().includes(q) ||
        city.system.toLowerCase().includes(q) ||
        cityModes.includes(q)
      ) {
        out.push({
          kind: "city",
          label: city.city,
          sub: city.system,
          to: `/city/${city.slug}`,
        });
      }
    }

    if (search) {
      for (const entry of search.entries) {
        if (entry.kind === "line") {
          if (!entry.haystack.includes(q)) continue;
          out.push({
            kind: "line",
            label: entry.label,
            sub: `${cityName.get(entry.city) ?? entry.city} · ${MODE_META[entry.mode].label}${entry.from && entry.to ? ` · ${entry.from} → ${entry.to}` : ""}`,
            to: `/city/${entry.city}?line=${encodeURIComponent(entry.id)}`,
          });
        } else {
          if (!entry.haystack.includes(q)) continue;
          out.push({
            kind: "station",
            label: entry.name,
            sub: `${cityName.get(entry.city) ?? entry.city} · ${entry.modes
              .map((mode: Mode) => MODE_META[mode].short)
              .join(", ")}`,
            to: `/city/${entry.city}?focus=${entry.lat.toFixed(5)},${entry.lon.toFixed(5)}&z=15&name=${encodeURIComponent(entry.name)}`,
          });
        }
      }
    }

    const rank = (result: Result) => {
      const label = result.label.toLowerCase();
      if (label === q) return 0;
      if (label.startsWith(q)) return 1;
      return 2;
    };
    return out.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).slice(0, LIMIT);
  }, [query, search, cityName]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const item = listRef.current?.children[active] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (result: Result) => {
    onClose();
    navigate(result.to);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search">
      <button
        type="button"
        className="search-overlay__scrim"
        aria-label="Close search"
        onClick={onClose}
      />
      <div className="search-panel">
        <input
          ref={inputRef}
          className="search-panel__input"
          type="search"
          placeholder="Search a city, line or station…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          aria-controls="search-results"
          aria-activedescendant={results[active] ? `search-result-${active}` : undefined}
        />
        <ul id="search-results" ref={listRef} className="search-results">
          {results.length === 0 && (
            <li className="search-results__empty">
              {search || query.trim() === "" ? "No matches." : "Loading network data…"}
            </li>
          )}
          {results.map((result, index) => (
            <li key={`${result.kind}-${result.to}-${result.label}`}>
              <button
                type="button"
                id={`search-result-${index}`}
                className={`search-result ${index === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
              >
                <span className={`search-result__kind search-result__kind--${result.kind}`}>
                  {result.kind === "station" ? "Station" : result.kind === "line" ? "Line" : "City"}
                </span>
                <span className="search-result__label">{result.label}</span>
                <span className="search-result__sub">{result.sub}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="search-panel__hint">↑↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>
  );
}
