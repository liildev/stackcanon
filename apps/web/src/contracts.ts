import {
  isDoctorJsonOutput,
  isGenerateJsonOutput,
  isInitJsonOutput,
  isRevertJsonOutput,
  isSyncJsonOutput,
  type DoctorJsonOutput,
  type GenerateJsonOutput,
  type InitJsonOutput,
  type RevertJsonOutput,
  type SyncJsonOutput
} from "@stackcanon/contracts";

export type StackCanonCliPayload =
  | DoctorJsonOutput
  | InitJsonOutput
  | GenerateJsonOutput
  | SyncJsonOutput
  | RevertJsonOutput;

export function parseCliPayload(input: string): StackCanonCliPayload {
  const parsed = JSON.parse(input) as unknown;

  if (
    isDoctorJsonOutput(parsed) ||
    isInitJsonOutput(parsed) ||
    isGenerateJsonOutput(parsed) ||
    isSyncJsonOutput(parsed) ||
    isRevertJsonOutput(parsed)
  ) {
    return parsed;
  }

  throw new Error("Unsupported StackCanon JSON payload.");
}

export function summarizeDoctorPayload(payload: DoctorJsonOutput): readonly string[] {
  return payload.findings.map((finding) => `[${finding.severity}] ${finding.code}: ${finding.message}`);
}

export function summarizeInitPayload(payload: InitJsonOutput): readonly string[] {
  const lines = [
    `${payload.plan.framework} / ${payload.plan.quality}`,
    `actions=${payload.plan.actions.length}`,
    `files=${payload.plan.files.length}`
  ];

  if (payload.mode === "apply") {
    lines.push(`written=${payload.apply.writtenFiles.length}`);
    lines.push(`skipped=${payload.apply.skippedFiles.length}`);
  }

  return lines;
}

export function summarizeGeneratePayload(payload: GenerateJsonOutput): readonly string[] {
  const lines = [
    `target=${payload.target}`,
    `written=${payload.result.writtenFiles.length}`,
    `skipped=${payload.result.skippedFiles.length}`
  ];

  if (payload.result.aiRulezCommand) {
    lines.push(`aiRulez=${payload.result.aiRulezCommand}`);
  }

  return lines;
}

export function summarizeSyncPayload(payload: SyncJsonOutput): readonly string[] {
  return [
    `sources=${payload.result.syncedSources.length}`,
    `index=${payload.result.indexPath}`
  ];
}

export function summarizeRevertPayload(payload: RevertJsonOutput): readonly string[] {
  return [
    `backup=${payload.result.backupDirectory}`,
    `restored=${payload.result.restoredPaths.length}`,
    `removed=${payload.result.removedPaths.length}`
  ];
}
