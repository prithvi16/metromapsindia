import { useEffect } from "react";

export const SITE_URL = "https://metromapsindia.netlify.app";

function siteOrigin(): string {
  return typeof window === "undefined" ? SITE_URL : window.location.origin;
}

export type PageMetaOptions = {
  /** Route path without a query string. Defaults to the current pathname. */
  path?: string;
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
  breadcrumbs?: Array<{ name: string; path: string }>;
};

function setMeta(key: string, content: string, attribute: "name" | "property" = "name") {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

function setJsonLd(id: string, value: Record<string, unknown> | null) {
  let element = document.getElementById(id) as HTMLScriptElement | null;
  if (!value) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("script");
    element.type = "application/ld+json";
    element.id = id;
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(value);
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${clean}`;
}

/** Keep the document title, social cards, canonical URL and JSON-LD in sync. */
export function usePageMeta(title: string, description: string, options: PageMetaOptions = {}) {
  const path = options.path ?? (typeof window === "undefined" ? "/" : window.location.pathname);
  const canonicalPath = path === "/" ? "/" : path.replace(/\/+$/, "");
  const image = options.image ?? `${siteOrigin()}/og-image.png`;
  const breadcrumbKey =
    options.breadcrumbs?.map((crumb) => `${crumb.name}|${crumb.path}`).join("~") ?? "";

  useEffect(() => {
    const canonical = absoluteUrl(canonicalPath);
    document.title = title;
    setMeta("description", description);
    setMeta(
      "robots",
      options.noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large",
    );

    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:url", canonical, "property");
    setMeta("og:type", options.type ?? "website", "property");
    setMeta("og:image", image, "property");
    setMeta("og:image:width", "1200", "property");
    setMeta("og:image:height", "630", "property");
    setMeta("og:image:alt", `${title} — MetroMaps India`, "property");

    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    setMeta("twitter:image", image);
    setMeta("twitter:image:alt", `${title} — MetroMaps India`);

    setLink("canonical", canonical);

    setJsonLd("page-schema", {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      inLanguage: "en-IN",
      isPartOf: {
        "@type": "WebSite",
        "@id": `${siteOrigin()}/#website`,
        name: "MetroMaps India",
        url: `${siteOrigin()}/`,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: image,
        width: 1200,
        height: 630,
      },
    });

    setJsonLd(
      "breadcrumb-schema",
      options.breadcrumbs && options.breadcrumbs.length > 0
        ? {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: options.breadcrumbs.map((crumb, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: crumb.name,
              item: absoluteUrl(crumb.path),
            })),
          }
        : null,
    );
    // breadcrumbKey makes an inline array stable without re-running on every render.
  }, [title, description, canonicalPath, image, options.type, options.noindex, breadcrumbKey]);
}
