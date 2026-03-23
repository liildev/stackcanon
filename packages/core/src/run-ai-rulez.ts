import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export interface AiRulezGeneratePlan {
  readonly command: string;
  readonly args: readonly string[];
  readonly note: string;
}

export interface RunAiRulezOptions {
  readonly root: string;
  readonly plan?: AiRulezGeneratePlan;
}

export interface RunAiRulezResult {
  readonly command: string;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveAiRulezGeneratePlan(root: string): Promise<AiRulezGeneratePlan> {
  const localBinary = path.join(root, "node_modules", ".bin", "ai-rulez");

  if (await fileExists(localBinary)) {
    return {
      command: localBinary,
      args: ["generate"],
      note: "use project-local ai-rulez binary"
    };
  }

  return {
    command: "npx",
    args: ["ai-rulez@latest", "generate"],
    note: "fallback to npx ai-rulez@latest generate"
  };
}

export async function runAiRulezGenerate(options: RunAiRulezOptions): Promise<RunAiRulezResult> {
  const plan = options.plan ?? await resolveAiRulezGeneratePlan(options.root);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(plan.command, [...plan.args], {
      cwd: options.root,
      stdio: "inherit"
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${plan.command} ${plan.args.join(" ")} failed with exit code ${code}.`));
    });
  });

  return {
    command: `${plan.command} ${plan.args.join(" ")}`
  };
}
