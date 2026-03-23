import type {
  DoctorJsonOutput,
  GenerateJsonOutput,
  InitJsonOutput,
  RevertJsonOutput,
  SyncJsonOutput
} from "@stackcanon/contracts";
import type { StackCanonCliPayload } from "./contracts.js";
import {
  summarizeDoctorPayload,
  summarizeGeneratePayload,
  summarizeInitPayload,
  summarizeRevertPayload,
  summarizeSyncPayload
} from "./contracts.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSummaryCard(label: string, value: string, tone: "neutral" | "warning" | "error" = "neutral"): string {
  return `<article class="summary-card" data-tone="${tone}">
    <p class="summary-label">${escapeHtml(label)}</p>
    <p class="summary-value">${escapeHtml(value)}</p>
  </article>`;
}

function renderDoctorReport(payload: DoctorJsonOutput): string {
  const summaryCards = [
    renderSummaryCard("Status", payload.summary.status, payload.summary.status === "error" ? "error" : payload.summary.status === "warning" ? "warning" : "neutral"),
    renderSummaryCard("Package Manager", payload.context.packageManager),
    renderSummaryCard("Quality State", payload.context.qualityProviderState),
    renderSummaryCard("Docs Sync", payload.context.docsSyncState, payload.context.docsSyncState === "ready" || payload.context.docsSyncState === "none" ? "neutral" : "warning"),
    renderSummaryCard("Findings", String(payload.summary.totalFindings))
  ].join("");

  const findings = payload.findings
    .map((finding) => `<li class="finding" data-severity="${finding.severity}">
      <div class="finding-head">
        <span class="finding-code">${escapeHtml(finding.code)}</span>
        <span class="finding-severity">${escapeHtml(finding.severity)}</span>
      </div>
      <p class="finding-message">${escapeHtml(finding.message)}</p>
    </li>`)
    .join("");

  const quickLines = summarizeDoctorPayload(payload)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  return `<section class="panel">
    <div class="panel-head">
      <h2>Doctor Report</h2>
      <p>${escapeHtml(payload.root)}</p>
    </div>
    <div class="summary-grid">${summaryCards}</div>
    <div class="split-grid">
      <section class="subpanel">
        <h3>Findings</h3>
        <ul class="finding-list">${findings}</ul>
      </section>
      <section class="subpanel">
        <h3>Quick View</h3>
        <ul class="bullet-list">${quickLines}</ul>
      </section>
    </div>
  </section>`;
}

function renderInitReport(payload: InitJsonOutput): string {
  const commandLabel = payload.command === "add" ? "Add" : "Init";
  const summaryCards = [
    renderSummaryCard("Command", payload.command),
    renderSummaryCard("Mode", payload.mode),
    renderSummaryCard("Framework", payload.plan.framework),
    renderSummaryCard("Quality", payload.plan.quality)
  ].join("");

  const actions = payload.plan.actions
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join("");
  const files = payload.plan.files
    .map((file) => `<li class="file-row"><span>${escapeHtml(file.mode)}</span><code>${escapeHtml(file.path)}</code></li>`)
    .join("");
  const quickLines = summarizeInitPayload(payload)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const applySection = payload.mode === "apply"
    ? `<section class="subpanel">
        <h3>Apply Result</h3>
        <ul class="bullet-list">
          <li>backup=${escapeHtml(payload.apply.backupDirectory)}</li>
          <li>written=${payload.apply.writtenFiles.length}</li>
          <li>skipped=${payload.apply.skippedFiles.length}</li>
        </ul>
      </section>`
    : "";

  return `<section class="panel">
    <div class="panel-head">
      <h2>${escapeHtml(commandLabel)} ${escapeHtml(payload.mode)}</h2>
      <p>${escapeHtml(payload.plan.detection.root)}</p>
    </div>
    <div class="summary-grid">${summaryCards}</div>
    <div class="split-grid">
      <section class="subpanel">
        <h3>Actions</h3>
        <ol class="ordered-list">${actions}</ol>
      </section>
      <section class="subpanel">
        <h3>Files</h3>
        <ul class="file-list">${files}</ul>
      </section>
      <section class="subpanel">
        <h3>Quick View</h3>
        <ul class="bullet-list">${quickLines}</ul>
      </section>
      ${applySection}
    </div>
  </section>`;
}

function renderGenerateReport(payload: GenerateJsonOutput): string {
  const summaryCards = [
    renderSummaryCard("Target", payload.target),
    renderSummaryCard("Written", String(payload.result.writtenFiles.length)),
    renderSummaryCard("Skipped", String(payload.result.skippedFiles.length)),
    renderSummaryCard("Root", payload.root)
  ].join("");

  const quickLines = summarizeGeneratePayload(payload)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const writtenFiles = payload.result.writtenFiles
    .map((file) => `<li class="file-row"><span>wrote</span><code>${escapeHtml(file)}</code></li>`)
    .join("");
  const skippedFiles = payload.result.skippedFiles
    .map((file) => `<li class="file-row"><span>skipped</span><code>${escapeHtml(file)}</code></li>`)
    .join("");

  return `<section class="panel">
    <div class="panel-head">
      <h2>Generate Output</h2>
      <p>${escapeHtml(payload.root)}</p>
    </div>
    <div class="summary-grid">${summaryCards}</div>
    <div class="split-grid">
      <section class="subpanel">
        <h3>Written Files</h3>
        <ul class="file-list">${writtenFiles || "<li class=\"file-row\"><span>none</span><code>-</code></li>"}</ul>
      </section>
      <section class="subpanel">
        <h3>Skipped Files</h3>
        <ul class="file-list">${skippedFiles || "<li class=\"file-row\"><span>none</span><code>-</code></li>"}</ul>
      </section>
      <section class="subpanel">
        <h3>Quick View</h3>
        <ul class="bullet-list">${quickLines}</ul>
      </section>
    </div>
  </section>`;
}

function renderRevertReport(payload: RevertJsonOutput): string {
  const summaryCards = [
    renderSummaryCard("Backup", payload.result.backupDirectory),
    renderSummaryCard("Restored", String(payload.result.restoredPaths.length)),
    renderSummaryCard("Removed", String(payload.result.removedPaths.length)),
    renderSummaryCard("Warnings", String(payload.result.warnings.length), payload.result.warnings.length > 0 ? "warning" : "neutral")
  ].join("");

  const quickLines = summarizeRevertPayload(payload)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const restoredPaths = payload.result.restoredPaths
    .map((file) => `<li class="file-row"><span>restored</span><code>${escapeHtml(file)}</code></li>`)
    .join("");
  const removedPaths = payload.result.removedPaths
    .map((file) => `<li class="file-row"><span>removed</span><code>${escapeHtml(file)}</code></li>`)
    .join("");
  const warnings = payload.result.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");

  return `<section class="panel">
    <div class="panel-head">
      <h2>Revert Output</h2>
      <p>${escapeHtml(payload.root)}</p>
    </div>
    <div class="summary-grid">${summaryCards}</div>
    <div class="split-grid">
      <section class="subpanel">
        <h3>Restored Paths</h3>
        <ul class="file-list">${restoredPaths || "<li class=\"file-row\"><span>none</span><code>-</code></li>"}</ul>
      </section>
      <section class="subpanel">
        <h3>Removed Paths</h3>
        <ul class="file-list">${removedPaths || "<li class=\"file-row\"><span>none</span><code>-</code></li>"}</ul>
      </section>
      <section class="subpanel">
        <h3>Quick View</h3>
        <ul class="bullet-list">${quickLines}</ul>
      </section>
      <section class="subpanel">
        <h3>Warnings</h3>
        <ul class="bullet-list">${warnings || "<li>none</li>"}</ul>
      </section>
    </div>
  </section>`;
}

function renderSyncReport(payload: SyncJsonOutput): string {
  const summaryCards = [
    renderSummaryCard("Sources", String(payload.result.syncedSources.length)),
    renderSummaryCard("Index", payload.result.indexPath),
    renderSummaryCard("Root", payload.root)
  ].join("");
  const quickLines = summarizeSyncPayload(payload)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const syncedSources = payload.result.syncedSources
    .map((source) => `<li class="file-row"><span>${escapeHtml(source.id)}</span><code>${escapeHtml(source.normalizedPath)}</code></li>`)
    .join("");

  return `<section class="panel">
    <div class="panel-head">
      <h2>Sync Output</h2>
      <p>${escapeHtml(payload.root)}</p>
    </div>
    <div class="summary-grid">${summaryCards}</div>
    <div class="split-grid">
      <section class="subpanel">
        <h3>Synced Sources</h3>
        <ul class="file-list">${syncedSources || "<li class=\"file-row\"><span>none</span><code>-</code></li>"}</ul>
      </section>
      <section class="subpanel">
        <h3>Quick View</h3>
        <ul class="bullet-list">${quickLines}</ul>
      </section>
    </div>
  </section>`;
}

function renderParsedPayload(payload: StackCanonCliPayload): string {
  if (!("command" in payload)) {
    return renderDoctorReport(payload);
  }

  switch (payload.command) {
    case "init":
    case "add":
      return renderInitReport(payload);
    case "generate":
      return renderGenerateReport(payload);
    case "sync":
      return renderSyncReport(payload);
    case "revert":
      return renderRevertReport(payload);
  }
}

export function renderAppPage(input: {
  readonly payload?: string;
  readonly parsedPayload?: StackCanonCliPayload;
  readonly error?: string;
}): string {
  const preview = input.payload ?? "";
  const resultSection = input.error
    ? `<section class="panel error-panel"><h2>Parse Error</h2><p>${escapeHtml(input.error)}</p></section>`
    : input.parsedPayload
      ? renderParsedPayload(input.parsedPayload)
      : `<section class="panel empty-panel">
          <h2>Ready</h2>
          <p>Paste a <code>stackcn doctor --json</code>, <code>stackcn init --json</code>, <code>stackcn generate --json</code>, <code>stackcn sync --json</code>, or <code>stackcn revert --json</code> payload to inspect it here.</p>
        </section>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StackCanon Inspect</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --bg-accent: #eadfce;
        --panel: rgba(255, 251, 245, 0.88);
        --text: #1f1d1a;
        --muted: #5b544b;
        --line: rgba(73, 58, 41, 0.16);
        --warning: #aa5a00;
        --error: #9f1d1d;
        --shadow: 0 20px 40px rgba(69, 49, 23, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(188, 141, 84, 0.18), transparent 28rem),
          linear-gradient(180deg, var(--bg), #fbf7f1 45%, #fffdf9 100%);
      }
      main {
        width: min(1120px, calc(100% - 2rem));
        margin: 0 auto;
        padding: 2.5rem 0 4rem;
      }
      .hero {
        display: grid;
        gap: 0.9rem;
        margin-bottom: 2rem;
      }
      .eyebrow {
        margin: 0;
        font-size: 0.9rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }
      h1, h2, h3 { margin: 0; font-weight: 700; }
      h1 {
        font-size: clamp(2.4rem, 6vw, 4.6rem);
        line-height: 0.95;
        max-width: 10ch;
      }
      .hero p {
        margin: 0;
        color: var(--muted);
        max-width: 58ch;
        font-size: 1.05rem;
        line-height: 1.55;
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(20rem, 30rem) minmax(0, 1fr);
        gap: 1.25rem;
        align-items: start;
      }
      .panel {
        border: 1px solid var(--line);
        border-radius: 1.5rem;
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(8px);
        padding: 1.25rem;
      }
      .panel-head {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: baseline;
        margin-bottom: 1rem;
      }
      .panel-head p {
        margin: 0;
        font-size: 0.92rem;
        color: var(--muted);
      }
      form {
        display: grid;
        gap: 0.9rem;
      }
      label {
        display: grid;
        gap: 0.45rem;
        font-weight: 600;
      }
      textarea {
        width: 100%;
        min-height: 30rem;
        resize: vertical;
        border-radius: 1rem;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.72);
        padding: 1rem;
        color: var(--text);
        font: 0.95rem/1.5 "SFMono-Regular", "Menlo", "Monaco", "Liberation Mono", monospace;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 0.9rem 1.2rem;
        background: linear-gradient(135deg, #1f1d1a, #51473a);
        color: white;
        font: inherit;
        cursor: pointer;
      }
      .hint {
        margin: 0;
        color: var(--muted);
        font-size: 0.92rem;
        line-height: 1.5;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.85rem;
        margin-bottom: 1rem;
      }
      .summary-card {
        border: 1px solid var(--line);
        border-radius: 1rem;
        padding: 0.85rem 1rem;
        background: rgba(255,255,255,0.62);
      }
      .summary-card[data-tone="warning"] { border-color: rgba(170, 90, 0, 0.25); }
      .summary-card[data-tone="error"] { border-color: rgba(159, 29, 29, 0.25); }
      .summary-label {
        margin: 0;
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .summary-value {
        margin: 0.25rem 0 0;
        font-size: 1.35rem;
      }
      .split-grid {
        display: grid;
        gap: 1rem;
      }
      .subpanel {
        border-top: 1px solid var(--line);
        padding-top: 1rem;
      }
      .subpanel h3 {
        margin-bottom: 0.75rem;
        font-size: 1.05rem;
      }
      .finding-list, .bullet-list, .ordered-list, .file-list {
        margin: 0;
        padding-left: 1.1rem;
        display: grid;
        gap: 0.6rem;
      }
      .finding {
        list-style: none;
        margin-left: -1.1rem;
        padding: 0.9rem 1rem;
        border: 1px solid var(--line);
        border-radius: 1rem;
        background: rgba(255,255,255,0.58);
      }
      .finding[data-severity="warning"] { border-color: rgba(170, 90, 0, 0.25); }
      .finding[data-severity="error"] { border-color: rgba(159, 29, 29, 0.25); }
      .finding-head {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.4rem;
        font-family: "SFMono-Regular", "Menlo", "Monaco", "Liberation Mono", monospace;
        font-size: 0.82rem;
      }
      .finding-message {
        margin: 0;
        line-height: 1.55;
      }
      .file-row {
        display: flex;
        gap: 0.75rem;
        align-items: baseline;
      }
      code {
        font-family: "SFMono-Regular", "Menlo", "Monaco", "Liberation Mono", monospace;
      }
      .error-panel {
        border-color: rgba(159, 29, 29, 0.25);
      }
      @media (max-width: 920px) {
        .layout {
          grid-template-columns: 1fr;
        }
        textarea {
          min-height: 20rem;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">StackCanon Inspect</p>
        <h1>Turn CLI JSON into a readable plan.</h1>
        <p>Paste structured output from <code>stackcn doctor --json</code> or <code>stackcn init --json</code>. This prototype validates the contract and renders the payload without inventing extra state.</p>
      </section>
      <section class="layout">
        <section class="panel">
          <form method="post" action="/inspect">
            <label>
              CLI payload
              <textarea name="payload" spellcheck="false" placeholder="Paste stackcn doctor --json or stackcn init --json output here...">${escapeHtml(preview)}</textarea>
            </label>
            <button type="submit">Inspect Payload</button>
            <p class="hint">This is a local prototype page intended to validate StackCanon JSON contracts before a larger UI exists.</p>
          </form>
        </section>
        ${resultSection}
      </section>
    </main>
  </body>
</html>`;
}
