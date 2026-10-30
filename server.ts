import path from "node:path";
import express from "express";

const distDir = path.resolve(process.cwd(), "dist");
const port = Number(process.env.PORT) || 3000;

const app = express();

app.disable("x-powered-by");
app.use(
  express.static(distDir, {
    maxAge: "1y",
    setHeaders(res, filePath) {
      // Hashed assets are safe to cache forever; the HTML shell never is.
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
      // MapLibre loads its worker through a blob module, which is an opaque
      // origin in some browsers, so the worker script needs to be CORS-readable.
      res.setHeader("Access-Control-Allow-Origin", "*");
    },
  }),
);

// Serve the crawler-facing shells generated after the Vite build. Missing
// routes fall through to the SPA shell and the client-side 404 page.
app.get("/about", (_req, res, next) => {
  res.sendFile(path.join(distDir, "about.html"), (error) => {
    if (error) next();
  });
});

app.get("/city/:slug", (req, res, next) => {
  const slug = req.params.slug;
  if (!/^[a-z0-9-]+$/.test(slug)) return next();
  res.sendFile(path.join(distDir, "city", `${slug}.html`), (error) => {
    if (error) next();
  });
});

// Single-page app fallback: any non-asset route serves index.html.
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(distDir, "index.html"), (error) => {
    if (error) next(error);
  });
});

const server = app.listen(port, () => {
  console.log(`MetroMaps India running at http://localhost:${port}`);
});

// Keep-alive must outlast the browser's idle timeout, otherwise Chrome can reuse
// a socket the server has already closed and the request hangs.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
