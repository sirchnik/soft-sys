import fs from "fs/promises";
import { fileURLToPath } from "url";

fs.cp(
  fileURLToPath(import.meta.resolve("./src/client/")),
  fileURLToPath(import.meta.resolve("./dist/")),
  {
    recursive: true,
  }
);
