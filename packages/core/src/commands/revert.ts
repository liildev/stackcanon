import { cp, lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

export interface RevertOptions {
  readonly root: string;
  readonly backup?: string;
}

export interface RevertResult {
  readonly backupDirectory: string;
  readonly restoredPaths: readonly string[];
  readonly removedPaths: readonly string[];
  readonly warnings: readonly string[];
}

interface BackupMetadata {
  readonly schemaVersion: 1;
  readonly managedBy: "stackcn";
  readonly root: string;
  readonly createdAt: string;
  readonly backupDirectory: string;
  readonly backedUpPaths: readonly string[];
  readonly writtenFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly createdPaths: readonly string[];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readBackupMetadata(backupRoot: string): Promise<BackupMetadata | undefined> {
  const metadataPath = path.join(backupRoot, "meta.json");

  try {
    const raw = await readFile(metadataPath, "utf8");
    return JSON.parse(raw) as BackupMetadata;
  } catch {
    return undefined;
  }
}

async function resolveBackupDirectory(options: RevertOptions): Promise<string> {
  const backupsRoot = path.join(options.root, ".stackcn", "backups");

  if (options.backup) {
    return options.backup.startsWith(".stackcn/backups/")
      ? options.backup
      : `.stackcn/backups/${options.backup}`;
  }

  let entries;
  try {
    entries = await readdir(backupsRoot, { withFileTypes: true });
  } catch {
    throw new Error("No StackCanon backups were found.");
  }

  const latestDirectory = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))[0];

  if (!latestDirectory) {
    throw new Error("No StackCanon backups were found.");
  }

  return `.stackcn/backups/${latestDirectory}`;
}

async function restorePath(root: string, backupRoot: string, relativePath: string): Promise<void> {
  const sourcePath = path.join(backupRoot, relativePath);
  const targetPath = path.join(root, relativePath);
  const sourceStats = await lstat(sourcePath);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, {
    force: true,
    recursive: sourceStats.isDirectory()
  });
}

async function removePathIfPresent(root: string, relativePath: string): Promise<boolean> {
  const targetPath = path.join(root, relativePath);

  try {
    await rm(targetPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function pruneEmptyParents(root: string, relativePath: string): Promise<void> {
  let currentDirectory = path.dirname(path.join(root, relativePath));

  while (currentDirectory.startsWith(root) && currentDirectory !== root) {
    const entries = await readdir(currentDirectory);
    if (entries.length > 0) {
      return;
    }

    await rm(currentDirectory, { recursive: true, force: true });
    currentDirectory = path.dirname(currentDirectory);
  }
}

async function resolveFallbackRestorePaths(backupRoot: string): Promise<readonly string[]> {
  const entries = await readdir(backupRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name !== "meta.json")
    .map((entry) => entry.name)
    .sort();
}

export async function revertLatestApply(options: RevertOptions): Promise<RevertResult> {
  const backupDirectory = await resolveBackupDirectory(options);
  const backupRoot = path.join(options.root, backupDirectory);

  if (!(await pathExists(backupRoot))) {
    throw new Error(`Backup directory not found: ${backupDirectory}`);
  }

  const metadata = await readBackupMetadata(backupRoot);
  const restoredPaths: string[] = [];
  const removedPaths: string[] = [];
  const warnings: string[] = [];
  const restoreTargets = metadata
    ? [...metadata.backedUpPaths].sort()
    : await resolveFallbackRestorePaths(backupRoot);

  for (const relativePath of restoreTargets) {
    await restorePath(options.root, backupRoot, relativePath);
    restoredPaths.push(relativePath);
  }

  if (!metadata) {
    warnings.push("Backup metadata is missing. Restored backed up files, but generated-only files were not removed automatically.");
    return {
      backupDirectory,
      restoredPaths,
      removedPaths,
      warnings
    };
  }

  for (const relativePath of metadata.createdPaths) {
    if (await pathExists(path.join(options.root, relativePath))) {
      if (await removePathIfPresent(options.root, relativePath)) {
        removedPaths.push(relativePath);
        await pruneEmptyParents(options.root, relativePath);
      }
    }
  }

  return {
    backupDirectory,
    restoredPaths,
    removedPaths,
    warnings
  };
}
