import {
  STACKCANON_JSON_SCHEMA_VERSION,
  type DoctorJsonOutput,
  type GenerateJsonOutput,
  type InitJsonOutput,
  type RevertJsonOutput,
  type SyncJsonOutput
} from "@stackcanon/contracts";
import {
  applyInitPlan,
  createDoctorReport,
  createInitPlan,
  generateOutputs,
  revertLatestApply,
  syncSources
} from "@stackcanon/core";
import type { InitOptions } from "@stackcanon/core";
import { access } from "node:fs/promises";
import path from "node:path";

function getFlagValue(flagName: string, args: readonly string[]): string | undefined {
  const index = args.indexOf(flagName);
  return index >= 0 ? args[index + 1] : undefined;
}

async function hasFile(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findWorkspaceRoot(startDirectory: string): Promise<string> {
  let currentDirectory = startDirectory;

  while (true) {
    if (
      (await hasFile(path.join(currentDirectory, "pnpm-workspace.yaml"))) ||
      (await hasFile(path.join(currentDirectory, "nx.json")))
    ) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return startDirectory;
    }

    currentDirectory = parentDirectory;
  }
}

function createInitOptions(args: readonly string[], resolvedRoot: string): InitOptions {
  const framework = getFlagValue("--framework", args);
  const quality = getFlagValue("--quality", args);
  const allowCompat = args.includes("--allow-compat");

  if (framework && quality) {
    return {
      root: resolvedRoot,
      allowCompat,
      framework: framework as NonNullable<InitOptions["framework"]>,
      quality: quality as NonNullable<InitOptions["quality"]>
    };
  }

  if (framework) {
    return {
      root: resolvedRoot,
      allowCompat,
      framework: framework as NonNullable<InitOptions["framework"]>
    };
  }

  if (quality) {
    return {
      root: resolvedRoot,
      allowCompat,
      quality: quality as NonNullable<InitOptions["quality"]>
    };
  }

  return {
    root: resolvedRoot,
    allowCompat
  };
}

async function runSetupCommand(
  command: "init" | "add",
  args: readonly string[],
  resolvedRoot: string,
  shouldOutputJson: boolean
): Promise<number> {
  const framework = getFlagValue("--framework", args);
  const quality = getFlagValue("--quality", args);
  const shouldApply = args.includes("--apply");
  const shouldInstall = args.includes("--install");
  const shouldRunVendorInit = args.includes("--vendor-init");
  const options = createInitOptions(args, resolvedRoot);

  if (command === "add" && !framework && !quality) {
    console.error("stackcn add expects at least one explicit target: --framework or --quality.");
    return 1;
  }

  const plan = await createInitPlan(options);

  if (shouldRunVendorInit && !shouldApply) {
    console.error("--vendor-init requires --apply.");
    return 1;
  }

  if (shouldRunVendorInit && plan.quality !== "ultracite") {
    console.error("--vendor-init is currently supported only when quality=ultracite.");
    return 1;
  }

  if (shouldOutputJson) {
    const output: InitJsonOutput = shouldApply
      ? {
          schemaVersion: STACKCANON_JSON_SCHEMA_VERSION,
          command,
          mode: "apply",
          plan,
          apply: await applyInitPlan(plan, {
            installDependencies: shouldInstall,
            runVendorInit: shouldRunVendorInit
          })
        }
      : {
          schemaVersion: STACKCANON_JSON_SCHEMA_VERSION,
          command,
          mode: "plan",
          plan
        };
    console.log(JSON.stringify(output, null, 2));
    return 0;
  }

  console.log(`stackcn ${command} plan`);
  console.log("");
  console.log(`framework: ${plan.framework}`);
  console.log(`quality:   ${plan.quality}`);
  console.log(`manager:   ${plan.detection.packageManager}`);
  console.log(`root:      ${plan.detection.root}`);
  console.log("");
  console.log("actions:");
  for (const action of plan.actions) {
    console.log(`- ${action}`);
  }
  console.log("");
  console.log("files:");
  for (const file of plan.files) {
    console.log(`- [${file.mode}] ${file.path} (${file.ownership})`);
    console.log(`  ${file.reason}`);
  }
  console.log("");
  console.log("backups:");
  for (const backup of plan.backups) {
    console.log(`- ${backup}`);
  }
  console.log("");
  console.log("package.json:");
  for (const dependency of plan.packageJson.devDependencies) {
    console.log(`- devDependency: ${dependency}`);
  }
  for (const script of plan.packageJson.scripts) {
    console.log(`- script: ${script}`);
  }
  console.log("");
  console.log("manifest:");
  console.log(`- schemaVersion: ${plan.manifest.schemaVersion}`);
  console.log(`- framework: ${plan.manifest.framework}`);
  console.log(`- quality: ${plan.manifest.quality}`);
  console.log(`- packageManager: ${plan.manifest.packageManager}`);
  if (plan.manifest.pack?.name) {
    console.log(`- pack: ${plan.manifest.pack.name}`);
  }
  if (plan.manifest.pack?.sources?.length) {
    console.log(`- packSources: ${plan.manifest.pack.sources.length}`);
  }
  console.log(`- generatedFiles: ${plan.manifest.generatedFiles.length}`);
  console.log("");
  console.log("ai targets:");
  for (const target of plan.aiEngine.targets) {
    console.log(`- ${target.name}: ${target.command.join(" ")}`);
  }

  if (shouldApply) {
    console.log("");
    const result = await applyInitPlan(plan, {
      installDependencies: shouldInstall,
      runVendorInit: shouldRunVendorInit
    });
    console.log("apply:");
    console.log(`- backup: ${result.backupDirectory}`);
    if (result.vendorInitCommand) {
      console.log(`- vendor-init: ${result.vendorInitCommand}`);
    }
    if (result.installCommand) {
      console.log(`- install: ${result.installCommand}`);
    }
    for (const writtenFile of result.writtenFiles) {
      console.log(`- wrote: ${writtenFile}`);
    }
    for (const skippedFile of result.skippedFiles) {
      console.log(`- skipped: ${skippedFile}`);
    }
  }

  return 0;
}

export async function runCli(args: readonly string[], cwd: string): Promise<number> {
  const [command] = args;

  if (!command || command === "help" || command === "--help") {
    console.log("stackcn <command>");
    console.log("");
    console.log("Commands:");
    console.log("  init        plan the v0.1 install flow for an existing project");
    console.log("  add         apply one explicit framework or quality layer onto an existing project");
    console.log("  doctor      inspect framework and quality-provider compatibility");
    console.log("  generate    regenerate tool-specific outputs from canonical ai/");
    console.log("  sync        fetch and normalize official docs into .stackcn/sources/");
    console.log("  revert      restore the latest or a named StackCanon backup");
    console.log("");
    console.log("Flags:");
    console.log("  --root <path>       analyze another project root");
    console.log("  --framework <name>  override detected framework");
    console.log("  --quality <name>    override quality provider");
    console.log("  --target <name>     generation target: agents, claude, ai-rulez, all");
    console.log("  --source <id>       sync only one source document from the registry");
    console.log("  --backup <id>       backup directory name or .stackcn/backups/<id> for revert");
    console.log("  --json              structured JSON output (supported by doctor, init, generate, sync, and revert)");
    console.log("  --apply             write generated files instead of only printing a plan");
    console.log("  --install           run the detected package manager after apply");
    console.log("  --vendor-init       run supported vendor init after apply (Ultracite only)");
    console.log("  --run-ai-rulez      run ai-rulez generate after writing derived .ai-rulez files");
    console.log("  --allow-compat      continue when only an unsupported framework major is detected");
    return 0;
  }

  const targetRoot = getFlagValue("--root", args);
  const shouldOutputJson = args.includes("--json");
  const workspaceRoot = await findWorkspaceRoot(cwd);
  const resolvedRoot = targetRoot
    ? path.resolve(workspaceRoot, targetRoot)
    : cwd;

  if (command === "doctor") {
    const report = await createDoctorReport({ root: resolvedRoot });

    if (shouldOutputJson) {
      const output: DoctorJsonOutput = report;
      console.log(JSON.stringify(output, null, 2));
      return report.summary.status === "error" ? 1 : 0;
    }

    console.log("stackcn doctor");
    console.log("");
    console.log(`root:    ${report.detection.root}`);
    console.log(`manager: ${report.detection.packageManager}`);
    console.log(`docs:    ${report.context.docsSyncState}`);
    console.log("");
    console.log("findings:");
    for (const finding of report.findings) {
      console.log(`- [${finding.severity}] ${finding.message}`);
    }

    return report.summary.status === "error" ? 1 : 0;
  }

  if (command === "generate") {
    const target = getFlagValue("--target", args) as "agents" | "claude" | "ai-rulez" | "all" | undefined;
    const shouldRunAiRulez = args.includes("--run-ai-rulez");

    if (shouldRunAiRulez && target && target !== "ai-rulez" && target !== "all") {
      console.error("--run-ai-rulez requires --target ai-rulez or --target all.");
      return 1;
    }

    const result = await generateOutputs({
      root: resolvedRoot,
      ...(target ? { target } : {}),
      ...(shouldRunAiRulez ? { runAiRulezGenerate: true } : {})
    });

    if (shouldOutputJson) {
      const output: GenerateJsonOutput = {
        schemaVersion: STACKCANON_JSON_SCHEMA_VERSION,
        command: "generate",
        root: resolvedRoot,
        target: target ?? "all",
        result
      };
      console.log(JSON.stringify(output, null, 2));
      return 0;
    }

    console.log("stackcn generate");
    console.log("");
    for (const writtenFile of result.writtenFiles) {
      console.log(`- wrote: ${writtenFile}`);
    }
    for (const skippedFile of result.skippedFiles) {
      console.log(`- skipped: ${skippedFile}`);
    }
    if (result.aiRulezCommand) {
      console.log(`- ai-rulez: ${result.aiRulezCommand}`);
    }

    return 0;
  }

  if (command === "sync") {
    const sourceId = getFlagValue("--source", args);
    const result = await syncSources({
      root: resolvedRoot,
      ...(sourceId ? { sourceId } : {})
    });

    if (shouldOutputJson) {
      const output: SyncJsonOutput = {
        schemaVersion: STACKCANON_JSON_SCHEMA_VERSION,
        command: "sync",
        root: resolvedRoot,
        result
      };
      console.log(JSON.stringify(output, null, 2));
      return 0;
    }

    console.log("stackcn sync");
    console.log("");
    for (const source of result.syncedSources) {
      console.log(`- synced: ${source.id} -> ${source.normalizedPath}`);
    }
    console.log(`- index: ${result.indexPath}`);

    return 0;
  }

  if (command === "init") {
    return runSetupCommand("init", args, resolvedRoot, shouldOutputJson);
  }

  if (command === "add") {
    return runSetupCommand("add", args, resolvedRoot, shouldOutputJson);
  }

  if (command === "revert") {
    const backup = getFlagValue("--backup", args);
    const result = await revertLatestApply({
      root: resolvedRoot,
      ...(backup ? { backup } : {})
    });

    if (shouldOutputJson) {
      const output: RevertJsonOutput = {
        schemaVersion: STACKCANON_JSON_SCHEMA_VERSION,
        command: "revert",
        root: resolvedRoot,
        result
      };
      console.log(JSON.stringify(output, null, 2));
      return 0;
    }

    console.log("stackcn revert");
    console.log("");
    console.log(`backup: ${result.backupDirectory}`);
    console.log("");
    for (const restoredPath of result.restoredPaths) {
      console.log(`- restored: ${restoredPath}`);
    }
    for (const removedPath of result.removedPaths) {
      console.log(`- removed: ${removedPath}`);
    }
    for (const warning of result.warnings) {
      console.log(`- warning: ${warning}`);
    }

    return 0;
  }

  console.error(`Unknown command: ${command}`);
  return 1;
}
