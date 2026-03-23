import { spawn } from "node:child_process";

const env = { ...process.env };
delete env.npm_config_recursive;

for (const key of Object.keys(env)) {
  const normalized = key.toLowerCase();
  if (normalized.includes("stackcanon") && normalized.includes("registry")) {
    delete env[key];
  }
}

await new Promise((resolve, reject) => {
  const child = spawn("npm", ["pack", "--dry-run", "--cache", "./.npm-cache"], {
    stdio: "inherit",
    env,
    shell: process.platform === "win32"
  });

  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`npm pack --dry-run failed with exit code ${code}`));
  });
});
