import { access } from "node:fs/promises";
import { spawn } from "node:child_process";

async function hasGitMetadata() {
  try {
    await access(".git");
    return true;
  } catch {
    return false;
  }
}

if (!(await hasGitMetadata())) {
  console.log("release:status skipped because this workspace has no .git metadata.");
  process.exit(0);
}

await new Promise((resolve, reject) => {
  const child = spawn("pnpm", ["exec", "changeset", "status", "--verbose"], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`changeset status failed with exit code ${code}`));
  });
});
