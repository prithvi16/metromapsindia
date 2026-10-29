import { useEffect } from "react";

function setMeta(key: string, content: string, attribute: "name" | "property" = "name") {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

/** Keep the document title and social/SEO metadata in sync with the route. */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    setMeta("description", description);
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
  }, [title, description]);
}
