import { spawn } from "node:child_process";

const target = process.argv[2];

if (!target) {
  console.error("Usage: node ./scripts/run-workspace-target.mjs <target>");
  process.exit(1);
}

const projectDirectories = [
  "packages/tooling-registry",
  "packages/ai-engine",
  "packages/detectors",
  "packages/framework-adapters",
  "packages/quality-adapters",
  "packages/packs",
  "packages/core",
  "packages/contracts",
  "packages/cli",
  "apps/web"
];

for (const directory of projectDirectories) {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", [target], {
      cwd: directory,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${directory}: pnpm ${target} failed with exit code ${code}`));
    });
  });
}
