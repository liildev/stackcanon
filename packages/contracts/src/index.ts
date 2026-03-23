import type { ApplyInitResult, DoctorReport, GenerateResult, InitPlan, RevertResult, SyncResult } from "@stackcanon/core";

export const STACKCANON_JSON_SCHEMA_VERSION = 1 as const;
export type SetupCommand = "init" | "add";

export type DoctorJsonOutput = DoctorReport;

export interface InitPlanJsonOutput {
  readonly schemaVersion: typeof STACKCANON_JSON_SCHEMA_VERSION;
  readonly command: SetupCommand;
  readonly mode: "plan";
  readonly plan: InitPlan;
}

export interface InitApplyJsonOutput {
  readonly schemaVersion: typeof STACKCANON_JSON_SCHEMA_VERSION;
  readonly command: SetupCommand;
  readonly mode: "apply";
  readonly plan: InitPlan;
  readonly apply: ApplyInitResult;
}

export type InitJsonOutput = InitPlanJsonOutput | InitApplyJsonOutput;

export interface GenerateJsonOutput {
  readonly schemaVersion: typeof STACKCANON_JSON_SCHEMA_VERSION;
  readonly command: "generate";
  readonly root: string;
  readonly target: "agents" | "claude" | "ai-rulez" | "all";
  readonly result: GenerateResult;
}

export interface SyncJsonOutput {
  readonly schemaVersion: typeof STACKCANON_JSON_SCHEMA_VERSION;
  readonly command: "sync";
  readonly root: string;
  readonly result: SyncResult;
}

export interface RevertJsonOutput {
  readonly schemaVersion: typeof STACKCANON_JSON_SCHEMA_VERSION;
  readonly command: "revert";
  readonly root: string;
  readonly result: RevertResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isDoctorJsonOutput(value: unknown): value is DoctorJsonOutput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === STACKCANON_JSON_SCHEMA_VERSION &&
    isRecord(value.summary) &&
    typeof value.summary.status === "string" &&
    isRecord(value.context) &&
    typeof value.context.docsSyncState === "string" &&
    Array.isArray(value.findings)
  );
}

export function isInitJsonOutput(value: unknown): value is InitJsonOutput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === STACKCANON_JSON_SCHEMA_VERSION &&
    (value.command === "init" || value.command === "add") &&
    (value.mode === "plan" || value.mode === "apply") &&
    isRecord(value.plan)
  );
}

export function isGenerateJsonOutput(value: unknown): value is GenerateJsonOutput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === STACKCANON_JSON_SCHEMA_VERSION &&
    value.command === "generate" &&
    typeof value.root === "string" &&
    (value.target === "agents" || value.target === "claude" || value.target === "ai-rulez" || value.target === "all") &&
    isRecord(value.result) &&
    Array.isArray(value.result.writtenFiles) &&
    Array.isArray(value.result.skippedFiles)
  );
}

export function isSyncJsonOutput(value: unknown): value is SyncJsonOutput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === STACKCANON_JSON_SCHEMA_VERSION &&
    value.command === "sync" &&
    typeof value.root === "string" &&
    isRecord(value.result) &&
    typeof value.result.indexPath === "string" &&
    Array.isArray(value.result.syncedSources)
  );
}

export function isRevertJsonOutput(value: unknown): value is RevertJsonOutput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === STACKCANON_JSON_SCHEMA_VERSION &&
    value.command === "revert" &&
    typeof value.root === "string" &&
    isRecord(value.result) &&
    typeof value.result.backupDirectory === "string" &&
    Array.isArray(value.result.restoredPaths) &&
    Array.isArray(value.result.removedPaths) &&
    Array.isArray(value.result.warnings)
  );
}
