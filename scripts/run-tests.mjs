import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const dir = path.join(process.cwd(), "src/lib");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

let failed = 0;
for (const file of files) {
  const result = spawnSync("tsx", [path.join("src/lib", file)], { stdio: "inherit" });
  if (result.status === 0) {
    console.log(`PASS ${file}`);
  } else {
    console.log(`FAIL ${file}`);
    failed += 1;
  }
}

if (files.length === 0) {
  console.error("FAIL no test files");
  process.exit(1);
}

process.exit(failed === 0 ? 0 : 1);
