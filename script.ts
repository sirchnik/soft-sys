import fs from "fs/promises";
import { fileURLToPath } from "url";

fs.cp(
  fileURLToPath(import.meta.resolve("./client/")),
  fileURLToPath(import.meta.resolve("./dest/")),
  {
    recursive: true,
  }
);
