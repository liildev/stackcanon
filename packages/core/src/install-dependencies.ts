import { spawn } from "node:child_process";

export interface InstallDependenciesOptions {
  readonly root: string;
  readonly packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
}

export interface InstallDependenciesResult {
  readonly command: string;
}

function resolveCommand(options: InstallDependenciesOptions): {
  command: string;
  args: readonly string[];
} {
  switch (options.packageManager) {
    case "pnpm":
      return {
        command: "pnpm",
        args: ["install"]
      };
    case "npm":
      return {
        command: "npm",
        args: ["install"]
      };
    case "yarn":
      return {
        command: "yarn",
        args: ["install"]
      };
    case "bun":
      return {
        command: "bun",
        args: ["install"]
      };
    default:
      throw new Error("Cannot install dependencies because the package manager could not be detected.");
  }
}

export async function installDependencies(options: InstallDependenciesOptions): Promise<InstallDependenciesResult> {
  const command = resolveCommand(options);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, [...command.args], {
      cwd: options.root,
      stdio: "pipe"
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command.command} ${command.args.join(" ")} failed with exit code ${code}.`));
    });
  });

  return {
    command: `${command.command} ${command.args.join(" ")}`
  };
}
