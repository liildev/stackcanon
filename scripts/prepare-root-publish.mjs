import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const sourceDist = path.join(workspaceRoot, "packages/cli/dist");
const targetDist = path.join(workspaceRoot, "dist");

await rm(targetDist, { recursive: true, force: true });
await mkdir(path.dirname(targetDist), { recursive: true });
await cp(sourceDist, targetDist, { recursive: true });
