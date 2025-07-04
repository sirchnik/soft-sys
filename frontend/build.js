import util from "util";
import { exec as execCall } from "child_process";
const exec = util.promisify(execCall);

const PROD = process.env.NODE_ENV === "production";

(async () => {
  await exec(
    `
      npx -y esbuild \
          --bundle \
          ${PROD ? "--minify" : ""} \
          ${PROD ? "" : "--sourcemap"} \
          --platform=browser \
          --target=esnext \
          --outfile=dist/index.js \
          --define:__WS_URL__="${
            process.env.WS_URL || "'http://localhost:8001'"
          }" \
          --define:__BACKEND_URL__="${
            process.env.BACKEND_URL || "'http://localhost:8000'"
          }" \
          ${PROD ? "" : "--watch"} \
          src/index.ts 
          `,
    (err, stdout, stderr) => {
      if (err) {
        console.error("Build failed:", err);
        process.exit(1);
      }
      if (stdout) {
        console.log("Build output:", stdout);
      }
      if (stderr) {
        console.error("Build errors:", stderr);
      }
      console.log("Build completed successfully.");
    }
  );
})();
