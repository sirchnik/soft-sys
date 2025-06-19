import util from "util";
import { exec as execCall } from "child_process";
const exec = util.promisify(execCall);

const PROD = process.env.NODE_ENV === "production";

(async () => {
  let certHash = "";
  if (process.env.CERT_FILE) {
    const out = await exec(
      `openssl x509 -in ${process.env.CERT_FILE} -noout -fingerprint -sha256`
    );
    certHash = JSON.stringify(
      out.stdout
        .split("=")[1]
        .split(":")
        .map((e) => Number(`0x${e}`))
    );
  }

  await exec(
    `
      npx -y esbuild \
          --bundle \
          ${PROD ? "--minify" : ""} \
          ${PROD ? "" : "--sourcemap"} \
          --platform=browser \
          --target=esnext \
          --outfile=dist/index.js \
          --define:__WT_CERT_HASH__="'${certHash}'" \
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
