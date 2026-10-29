import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SearchDialog from "./SearchDialog";

export type Crumb = { label: string; to?: string };

type Props = {
  breadcrumbs?: Crumb[];
};

export default function SiteHeader({ breadcrumbs }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand" aria-label="MetroMaps India home">
            <span className="brand__mark" aria-hidden="true">
              ◉
            </span>
            <span className="brand__text">
              <span className="brand__name">MetroMaps India</span>
              <span className="brand__tag">Urban rail, mapped</span>
            </span>
          </Link>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="crumbs" aria-label="Breadcrumb">
              <ol>
                {breadcrumbs.map((crumb, index) => {
                  const last = index === breadcrumbs.length - 1;
                  return (
                    <li key={`${crumb.label}-${index}`}>
                      {crumb.to && !last ? (
                        <Link to={crumb.to}>{crumb.label}</Link>
                      ) : (
                        <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                      )}
                      {!last && (
                        <span className="crumbs__sep" aria-hidden="true">
                          /
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          <nav className="site-nav" aria-label="Main">
            <button type="button" className="site-nav__search" onClick={() => setSearchOpen(true)}>
              <span aria-hidden="true">⌕</span>
              <span className="site-nav__search-label">Search</span>
              <kbd>⌘K</kbd>
            </button>
            <Link to="/about">About</Link>
          </nav>
        </div>
      </header>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
