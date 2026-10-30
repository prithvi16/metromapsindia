import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import { usePageMeta } from "../lib/meta";

export default function NotFoundPage() {
  usePageMeta(
    "Page not found — MetroMaps India",
    "The page you requested is not on the map. Browse every mapped city and urban rail network in India.",
    { noindex: true },
  );

  return (
    <>
      <SiteHeader breadcrumbs={[{ label: "Home", to: "/" }, { label: "Not found" }]} />
      <main className="page">
        <h1>Page not found</h1>
        <p className="page__lede">
          That route is not on the map. The link may be old, or the city may have a different
          address.
        </p>
        <p>
          <Link to="/">Browse every city</Link> or open the <Link to="/about">about page</Link>.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
