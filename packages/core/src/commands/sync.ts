import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSourceDocument, getSourceDocumentsByUrls, sourceRegistry, type SourceDocument } from "@stackcanon/packs";

export interface SyncOptions {
  readonly root: string;
  readonly sourceId?: string;
  readonly fetchSource?: (input: SourceDocument) => Promise<SyncFetchedSource>;
}

export interface SyncFetchedSource {
  readonly content: string;
  readonly contentType: string;
  readonly status: number;
}

export interface SyncedSourceArtifact {
  readonly id: string;
  readonly product: SourceDocument["product"];
  readonly roles: SourceDocument["roles"];
  readonly url: string;
  readonly versionRange?: string;
  readonly lastVerified: string;
  readonly fetchedAt: string;
  readonly contentType: string;
  readonly contentHash: string;
  readonly rawPath: string;
  readonly normalizedPath: string;
}

export interface SyncedSourceIndex {
  readonly schemaVersion: 1;
  readonly managedBy: "stackcn";
  readonly root: string;
  readonly fetchedAt: string;
  readonly sourceCount: number;
  readonly sources: readonly SyncedSourceArtifact[];
}

export interface SyncResult {
  readonly root: string;
  readonly syncedSources: readonly SyncedSourceArtifact[];
  readonly indexPath: string;
}

interface PersistedManifest {
  readonly pack?: {
    readonly sources?: readonly string[];
  };
}

async function readManifest(root: string): Promise<PersistedManifest | undefined> {
  try {
    const rawManifest = await readFile(path.join(root, ".stackcn", "manifest.json"), "utf8");
    return JSON.parse(rawManifest) as PersistedManifest;
  } catch {
    return undefined;
  }
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSourceContent(content: string, contentType: string): string {
  if (contentType.includes("text/html")) {
    return stripHtml(content);
  }

  return content.trim();
}

async function defaultFetchSource(input: SourceDocument): Promise<SyncFetchedSource> {
  const response = await fetch(input.url);
  return {
    content: await response.text(),
    contentType: response.headers.get("content-type") ?? "text/plain",
    status: response.status
  };
}

async function writeText(root: string, relativePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), content, "utf8");
}

function createContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function readSyncedSourceIndex(root: string): Promise<SyncedSourceIndex | undefined> {
  try {
    const rawIndex = await readFile(path.join(root, ".stackcn", "sources", "index.json"), "utf8");
    return JSON.parse(rawIndex) as SyncedSourceIndex;
  } catch {
    return undefined;
  }
}

async function resolveSourceDocuments(options: SyncOptions): Promise<readonly SourceDocument[]> {
  if (options.sourceId) {
    const source = getSourceDocument(options.sourceId);
    if (!source) {
      throw new Error(`Unknown source id: ${options.sourceId}`);
    }
    return [source];
  }

  const manifest = await readManifest(options.root);
  if (manifest?.pack?.sources?.length) {
    const matched = getSourceDocumentsByUrls(manifest.pack.sources);
    if (matched.length > 0) {
      return matched;
    }
  }

  return sourceRegistry;
}

export async function syncSources(options: SyncOptions): Promise<SyncResult> {
  const fetchSource = options.fetchSource ?? defaultFetchSource;
  const sourceDocuments = await resolveSourceDocuments(options);
  const syncedSources: SyncedSourceArtifact[] = [];
  const fetchedAt = new Date().toISOString();

  for (const source of sourceDocuments) {
    const fetched = await fetchSource(source);
    if (fetched.status >= 400) {
      throw new Error(`Failed to sync ${source.id} from ${source.url}: HTTP ${fetched.status}`);
    }

    const extension = fetched.contentType.includes("text/html") ? "html" : "md";
    const rawPath = `.stackcn/sources/raw/${source.id}.${extension}`;
    const normalizedPath = `.stackcn/sources/normalized/${source.id}.md`;
    const normalizedContent = normalizeSourceContent(fetched.content, fetched.contentType);

    await writeText(options.root, rawPath, fetched.content);
    await writeText(options.root, normalizedPath, `${normalizedContent}\n`);

    syncedSources.push({
      id: source.id,
      product: source.product,
      roles: source.roles,
      url: source.url,
      ...(source.versionRange ? { versionRange: source.versionRange } : {}),
      lastVerified: source.lastVerified,
      fetchedAt,
      contentType: fetched.contentType,
      contentHash: createContentHash(normalizedContent),
      rawPath,
      normalizedPath
    });
  }

  const indexPath = ".stackcn/sources/index.json";
  const index: SyncedSourceIndex = {
    schemaVersion: 1,
    managedBy: "stackcn",
    root: options.root,
    fetchedAt,
    sourceCount: syncedSources.length,
    sources: syncedSources
  };
  await writeText(
    options.root,
    indexPath,
    `${JSON.stringify(index, null, 2)}\n`
  );

  return {
    root: options.root,
    syncedSources,
    indexPath
  };
}
