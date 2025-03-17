import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

function generateETag(content: string) {
  return crypto.createHash("md5").update(content).digest("hex");
}

const pages: Record<string, string> = {
  index: `
    <h1>Willkommen! 🎉</h1>
    <a href="hallo" class="nav-link start-button">Starte die Magie ✨</a>
  `,
  hallo: `
    <h1 id="greeting">Hallo, Welt! 👋</h1>
    <button class="fancy-button" onclick="changeGreeting()">Klick mich!</button>
    <a href="/" class="nav-link start-button">Zurück</a>
  `,
};

const etags: Record<string, string> = {
  index: generateETag(pages.index),
  hallo: generateETag(pages.hallo),
};

app.use(
  "/assets",
  express.static(
    path.resolve(fileURLToPath(import.meta.resolve("../dist/assets"))),
    {
      maxAge: "1y",
      setHeaders: (res, _filePath) => {
        res.setHeader("Cache-Control", "public, max-age=31536000");
      },
    }
  )
);

app.get(
  "/api/:page",
  //@ts-ignore
  (req, res) => {
    const page = req.params.page || "index";
    const html = pages[page] || pages.index;
    const etag = etags[page] || etags.index;

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    res.setHeader("ETag", etag);
    res.json({ html });
  }
);

app.get("*", (_, res) => {
  res.sendFile(fileURLToPath(import.meta.resolve("../dist/index.html")));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
