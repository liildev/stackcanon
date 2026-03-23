import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createPublishEnv } from "./publish-env.mjs";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      ...options
    });

    child.stdout?.on("data", (chunk) => {
      const value = String(chunk);
      stdout += value;
      process.stdout.write(value);
    });

    child.stderr?.on("data", (chunk) => {
      const value = String(chunk);
      stderr += value;
      process.stderr.write(value);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function createTarballName(name, version) {
  return `${name.replace("@", "").replace("/", "-")}-${version}.tgz`;
}

const root = process.cwd();
const env = createPublishEnv();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const tarballName = createTarballName(packageJson.name, packageJson.version);
const tarballPath = path.join(root, tarballName);
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "stackcn-root-cli-smoke-"));

try {
  await runCommand("npm", ["pack", "--cache", "./.npm-cache"], {
    cwd: root,
    env
  });

  await runCommand("npm", ["init", "-y"], {
    cwd: tempRoot,
    env
  });

  await runCommand("npm", ["install", tarballPath, "--cache", "./.npm-cache"], {
    cwd: tempRoot,
    env
  });

  await runCommand("node", ["./node_modules/@stackcanon/cli/dist/bin/stackcn.js", "help"], {
    cwd: tempRoot,
    env
  });
} finally {
  await rm(tempRoot, { recursive: true, force: true });
  await rm(tarballPath, { force: true });
}
