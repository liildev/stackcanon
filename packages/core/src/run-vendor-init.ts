import { spawn } from "node:child_process";

export interface VendorInitPlan {
  readonly command: string;
  readonly args: readonly string[];
  readonly note: string;
}

export interface RunVendorInitOptions {
  readonly root: string;
  readonly plan: VendorInitPlan;
}

export interface RunVendorInitResult {
  readonly command: string;
}

export async function runVendorInit(options: RunVendorInitOptions): Promise<RunVendorInitResult> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.plan.command, [...options.plan.args], {
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

      reject(new Error(`${options.plan.command} ${options.plan.args.join(" ")} failed with exit code ${code}.`));
    });
  });

  return {
    command: `${options.plan.command} ${options.plan.args.join(" ")}`
  };
}
