import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

async function getFolderHash(directory: string) {
  const files = await fs.readdir(directory, { withFileTypes: true });
  const hash = createHash("md5");

  for (const file of files) {
    const filePath = path.join(directory, file.name);
    if (file.isDirectory()) {
      hash.update(await getFolderHash(filePath));
    } else {
      const content = await fs.readFile(filePath);
      hash.update(content);
    }
  }

  return hash.digest("hex");
}

async function copyFilesWithHash(srcDir, destDir, folderHash) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(
      destDir,
      entry.name.replace(/(\.[\w\d_-]+)$/i, `-${folderHash}$1`)
    );

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyFilesWithHash(srcPath, destPath, folderHash);
    } else if (entry.isFile() && entry.name !== "index.html") {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  const clientDir = fileURLToPath(import.meta.resolve("./src/client/"));
  const distDir = fileURLToPath(import.meta.resolve("./dist/"));
  const folderHash = await getFolderHash(clientDir);

  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  const indexPath = path.join(clientDir, "index.html");
  let indexContent = await fs.readFile(indexPath, "utf-8");
  indexContent = indexContent.replace(/__HASH__/g, folderHash);
  await fs.writeFile(path.join(distDir, "index.html"), indexContent, {
    flag: "w+",
  });

  await copyFilesWithHash(clientDir, distDir, folderHash);
}

main().catch((err) => console.error(err));
