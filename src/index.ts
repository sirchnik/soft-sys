import express from "express";
import { fileURLToPath } from "url";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  "/assets",
  express.static(
    path.resolve(fileURLToPath(import.meta.resolve("../dist/assets")))
  )
);

app.get("/api/data", (_, res) => {
  res.json({ message: "Hello from API" });
});

app.get("*", (_, res) => {
  res.sendFile(fileURLToPath(import.meta.resolve("../dist/index.html")));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
