import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PackContextInput } from "@stackcanon/ai-engine";
import { renderAgentsDocument, renderAiRulezConfig, renderClaudeDocument } from "@stackcanon/ai-engine";
import { detectProject, getExistingFileOwnership } from "@stackcanon/detectors";
import type { RunAiRulezResult } from "../run-ai-rulez.js";
import { runAiRulezGenerate } from "../run-ai-rulez.js";

export interface GenerateOptions {
  readonly root: string;
  readonly target?: "agents" | "claude" | "ai-rulez" | "all";
  readonly runAiRulezGenerate?: boolean;
  readonly aiRulezRunner?: (input: { readonly root: string }) => Promise<RunAiRulezResult>;
}

interface PersistedManifest {
  readonly framework: string;
  readonly quality: string;
  readonly pack?: PackContextInput;
}

export interface GenerateResult {
  readonly writtenFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly aiRulezCommand?: string;
}

async function writeAiRulezFile(options: {
  readonly detection: Awaited<ReturnType<typeof detectProject>>;
  readonly root: string;
  readonly relativePath: string;
  readonly content: string;
  readonly writtenFiles: string[];
  readonly skippedFiles: string[];
}): Promise<void> {
  const ownership = getExistingFileOwnership(options.detection, options.relativePath);
  if (ownership && ownership !== "stackcn-managed") {
    options.skippedFiles.push(options.relativePath);
    return;
  }

  await mkdir(path.dirname(path.join(options.root, options.relativePath)), { recursive: true });
  await writeFile(path.join(options.root, options.relativePath), options.content, "utf8");
  options.writtenFiles.push(options.relativePath);
}

async function readManifest(root: string): Promise<PersistedManifest> {
  const manifestPath = path.join(root, ".stackcn/manifest.json");
  const rawManifest = await readFile(manifestPath, "utf8");
  return JSON.parse(rawManifest) as PersistedManifest;
}

export async function generateOutputs(options: GenerateOptions): Promise<GenerateResult> {
  const manifest = await readManifest(options.root);
  const detection = await detectProject(options.root);
  const contextFiles = [
    "ai/rules/stackcanon-core.md",
    "ai/context/framework.md",
    "ai/context/quality.md"
  ];
  const writtenFiles: string[] = [];
  const skippedFiles: string[] = [];
  const target = options.target ?? "all";
  let aiRulezCommand: string | undefined;

  if (options.runAiRulezGenerate && target !== "ai-rulez" && target !== "all") {
    throw new Error("runAiRulezGenerate requires target ai-rulez or all.");
  }

  if (target === "all" || target === "agents") {
    const ownership = getExistingFileOwnership(detection, "AGENTS.md");
    if (ownership && ownership !== "stackcn-managed") {
      skippedFiles.push("AGENTS.md");
    } else {
      await writeFile(
        path.join(options.root, "AGENTS.md"),
        renderAgentsDocument({
          framework: manifest.framework,
          quality: manifest.quality,
          ...(manifest.pack ? { pack: manifest.pack } : {}),
          contextFiles
        }),
        "utf8"
      );
      writtenFiles.push("AGENTS.md");
    }
  }

  if (target === "all" || target === "claude") {
    const ownership = getExistingFileOwnership(detection, "CLAUDE.md");
    if (ownership && ownership !== "stackcn-managed") {
      skippedFiles.push("CLAUDE.md");
    } else {
      await writeFile(
        path.join(options.root, "CLAUDE.md"),
        renderClaudeDocument({
          framework: manifest.framework,
          quality: manifest.quality,
          ...(manifest.pack ? { pack: manifest.pack } : {}),
          contextFiles
        }),
        "utf8"
      );
      writtenFiles.push("CLAUDE.md");
    }
  }

  if (target === "all" || target === "ai-rulez") {
    const projectName = path.basename(options.root);
    const frameworkContext = await readFile(path.join(options.root, "ai/context/framework.md"), "utf8");
    const qualityContext = await readFile(path.join(options.root, "ai/context/quality.md"), "utf8");
    const coreRules = await readFile(path.join(options.root, "ai/rules/stackcanon-core.md"), "utf8");

    await writeAiRulezFile({
      detection,
      root: options.root,
      relativePath: ".ai-rulez/config.yaml",
      content: renderAiRulezConfig({ projectName }),
      writtenFiles,
      skippedFiles
    });
    await writeAiRulezFile({
      detection,
      root: options.root,
      relativePath: ".ai-rulez/context/framework.md",
      content: frameworkContext,
      writtenFiles,
      skippedFiles
    });
    await writeAiRulezFile({
      detection,
      root: options.root,
      relativePath: ".ai-rulez/context/quality.md",
      content: qualityContext,
      writtenFiles,
      skippedFiles
    });
    await writeAiRulezFile({
      detection,
      root: options.root,
      relativePath: ".ai-rulez/rules/stackcanon-core.md",
      content: coreRules,
      writtenFiles,
      skippedFiles
    });
    await writeAiRulezFile({
      detection,
      root: options.root,
      relativePath: ".ai-rulez/agents/stackcanon.md",
      content: renderAgentsDocument({
        framework: manifest.framework,
        quality: manifest.quality,
        ...(manifest.pack ? { pack: manifest.pack } : {}),
        contextFiles
      }),
      writtenFiles,
      skippedFiles
    });
    await writeAiRulezFile({
      detection,
      root: options.root,
      relativePath: ".ai-rulez/commands/README.md",
      content: `<!-- generated by stackcn -->
# Commands

- Run \`stackcn generate --target ai-rulez\` after changing canonical files under \`ai/\`.
- Use ai-rulez profiles only after validating generated StackCanon context.
`,
      writtenFiles,
      skippedFiles
    });

    if (options.runAiRulezGenerate) {
      const runner = options.aiRulezRunner ?? runAiRulezGenerate;
      const result = await runner({ root: options.root });
      aiRulezCommand = result.command;
    }
  }

  return {
    writtenFiles,
    skippedFiles,
    ...(aiRulezCommand ? { aiRulezCommand } : {})
  };
}
