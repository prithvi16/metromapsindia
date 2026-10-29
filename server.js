import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
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
    },
  }),
);

// Single-page app fallback: any non-asset route serves index.html.
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.listen(port, () => {
  console.log(`MetroMaps India running at http://localhost:${port}`);
});
