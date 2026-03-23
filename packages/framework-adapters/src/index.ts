import type { FrameworkName } from "@stackcanon/detectors";
import { detectInstalledMajor, toolingVersions } from "@stackcanon/tooling-registry";

export interface FrameworkPolicy {
  readonly framework: FrameworkName;
  readonly category: "frontend" | "backend" | "fullstack";
  readonly requiresExistingDependency: boolean;
  readonly configFiles: readonly string[];
}

export interface FrameworkConfigResult {
  readonly path: string;
  readonly content: string;
  readonly notes: readonly string[];
}

export interface PackageJsonPatch {
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: readonly {
    readonly preferredName: string;
    readonly fallbackName?: string;
    readonly command: string;
  }[];
}

type PackageScriptIntent = NonNullable<PackageJsonPatch["scripts"]>[number];

export interface FrameworkConfigInput {
  readonly framework: FrameworkName;
  readonly version?: string;
  readonly existingContent?: string;
  readonly backendEntry?: string;
  readonly hasTypeScript?: boolean;
  readonly hasTsconfig?: boolean;
  readonly hasNodeTypes?: boolean;
  readonly hasNestCli?: boolean;
  readonly hasExpressTypes?: boolean;
  readonly hasViteTsconfigPaths?: boolean;
  readonly hasVueTsc?: boolean;
}

export const frameworkPolicies: readonly FrameworkPolicy[] = [
  {
    framework: "next",
    category: "fullstack",
    requiresExistingDependency: true,
    configFiles: ["next.config.ts", "next.config.mjs", "next.config.js"]
  },
  {
    framework: "nuxt",
    category: "fullstack",
    requiresExistingDependency: true,
    configFiles: ["nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.js"]
  },
  {
    framework: "vite-react",
    category: "frontend",
    requiresExistingDependency: true,
    configFiles: ["vite.config.ts", "vite.config.js"]
  },
  {
    framework: "vite-vue",
    category: "frontend",
    requiresExistingDependency: true,
    configFiles: ["vite.config.ts", "vite.config.js"]
  },
  {
    framework: "nest",
    category: "backend",
    requiresExistingDependency: true,
    configFiles: ["nest-cli.json"]
  },
  {
    framework: "express",
    category: "backend",
    requiresExistingDependency: true,
    configFiles: ["tsconfig.json"]
  },
  {
    framework: "fastify",
    category: "backend",
    requiresExistingDependency: true,
    configFiles: ["tsconfig.json"]
  },
  {
    framework: "tanstack-start",
    category: "fullstack",
    requiresExistingDependency: true,
    configFiles: ["app.config.ts", "vite.config.ts"]
  },
  {
    framework: "tanstack-query",
    category: "frontend",
    requiresExistingDependency: true,
    configFiles: []
  }
];

function findMatchingBrace(source: string, startIndex: number): number | undefined {
  let depth = 0;
  let inString = false;
  let stringDelimiter = "";
  let isEscaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const current = source[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (current === "\\") {
        isEscaped = true;
      } else if (current === stringDelimiter) {
        inString = false;
        stringDelimiter = "";
      }
      continue;
    }

    if (current === "\"" || current === "'" || current === "`") {
      inString = true;
      stringDelimiter = current;
      continue;
    }

    if (current === "{") {
      depth += 1;
      continue;
    }

    if (current === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

interface ObjectRange {
  readonly start: number;
  readonly end: number;
  readonly indentation: string;
}

function findObjectRange(source: string, marker: RegExp): ObjectRange | undefined {
  const match = marker.exec(source);
  if (!match?.index && match?.index !== 0) {
    return undefined;
  }

  const objectStart = source.indexOf("{", match.index);
  if (objectStart < 0) {
    return undefined;
  }

  const objectEnd = findMatchingBrace(source, objectStart);
  if (objectEnd === undefined) {
    return undefined;
  }

  const lineStart = source.lastIndexOf("\n", objectStart) + 1;
  const indentationMatch = source.slice(lineStart, objectStart).match(/^\s*/);

  return {
    start: objectStart,
    end: objectEnd,
    indentation: `${indentationMatch?.[0] ?? ""}  `
  };
}

function hasProperty(source: string, propertyName: string): boolean {
  return new RegExp(`(^|\\n)\\s*${propertyName}\\s*:`, "m").test(source);
}

function insertIntoObject(source: string, range: ObjectRange, propertyLines: readonly string[]): string {
  const before = source.slice(0, range.start + 1);
  const after = source.slice(range.end);
  const existingBody = source.slice(range.start + 1, range.end);
  const trimmedBody = existingBody.trim();
  const lines = propertyLines.map((line) => `${range.indentation}${line}`);

  if (trimmedBody.length === 0) {
    return `${before}\n${lines.join("\n")}\n${after}`;
  }

  const bodyWithoutTrailingWhitespace = existingBody.replace(/\s*$/, "");
  const needsComma = !bodyWithoutTrailingWhitespace.trimEnd().endsWith(",");
  const separator = needsComma ? "," : "";
  const trailingWhitespace = existingBody.slice(bodyWithoutTrailingWhitespace.length);

  return `${before}${bodyWithoutTrailingWhitespace}${separator}\n${lines.join("\n")}${trailingWhitespace}${after}`;
}

function ensureImport(source: string, importStatement: string): string {
  if (source.includes(importStatement)) {
    return source;
  }

  const importMatches = [...source.matchAll(/^import .*$/gm)];
  if (importMatches.length === 0) {
    return `${importStatement}\n${source}`;
  }

  const lastImport = importMatches[importMatches.length - 1];
  if (!lastImport) {
    return `${importStatement}\n${source}`;
  }
  const insertIndex = (lastImport.index ?? 0) + lastImport[0].length;
  return `${source.slice(0, insertIndex)}\n${importStatement}${source.slice(insertIndex)}`;
}

function ensureArrayEntry(source: string, propertyName: string, entry: string): string {
  if (source.includes(entry)) {
    return source;
  }

  const propertyMatch = new RegExp(`${propertyName}\\s*:\\s*\\[`, "m").exec(source);
  if (propertyMatch?.index !== undefined) {
    const arrayStart = source.indexOf("[", propertyMatch.index);
    const arrayEnd = source.indexOf("]", arrayStart);
    if (arrayEnd > arrayStart) {
      const before = source.slice(0, arrayEnd);
      const after = source.slice(arrayEnd);
      const needsComma = source.slice(arrayStart + 1, arrayEnd).trim().length > 0;
      return `${before}${needsComma ? ", " : ""}${entry}${after}`;
    }
  }

  const objectRange =
    findObjectRange(source, /export default\s+defineConfig\s*\(/m) ??
    findObjectRange(source, /export default\s+/m) ??
    findObjectRange(source, /const\s+\w+\s*=\s*/m);

  if (!objectRange) {
    return source;
  }

  return insertIntoObject(source, objectRange, [`${propertyName}: [${entry}],`]);
}

function ensureTopLevelProperty(source: string, propertyName: string, propertyValue: string): string {
  if (hasProperty(source, propertyName)) {
    return source;
  }

  const objectRange =
    findObjectRange(source, /export default\s+defineConfig\s*\(/m) ??
    findObjectRange(source, /export default\s+/m) ??
    findObjectRange(source, /const\s+\w+\s*=\s*/m) ??
    findObjectRange(source, /module\.exports\s*=\s*/m);

  if (!objectRange) {
    return source;
  }

  return insertIntoObject(source, objectRange, [`${propertyName}: ${propertyValue},`]);
}

function ensureNestedBooleanProperty(
  source: string,
  parentProperty: string,
  propertyName: string,
  value: boolean
): string {
  const parentMatch = new RegExp(`${parentProperty}\\s*:\\s*\\{`, "m").exec(source);
  if (parentMatch?.index !== undefined) {
    const objectStart = source.indexOf("{", parentMatch.index);
    const objectEnd = findMatchingBrace(source, objectStart);
    if (objectEnd !== undefined) {
      const body = source.slice(objectStart + 1, objectEnd);
      if (new RegExp(`(^|\\n)\\s*${propertyName}\\s*:`, "m").test(body)) {
        return source;
      }

      const lineStart = source.lastIndexOf("\n", objectStart) + 1;
      const indentationMatch = source.slice(lineStart, objectStart).match(/^\s*/);
      const indentation = `${indentationMatch?.[0] ?? ""}    `;
      return `${source.slice(0, objectEnd)}\n${indentation}${propertyName}: ${value},${source.slice(objectEnd)}`;
    }
  }

  return ensureTopLevelProperty(source, parentProperty, `{ ${propertyName}: ${value} }`);
}

function createNextBaseline(hasTypeScript: boolean, nextMajor: number | undefined): string {
  const typedRoutes = hasTypeScript && (nextMajor ?? 16) >= 16 ? "  typedRoutes: true,\n" : "";
  const shared = "  reactStrictMode: true,\n";

  if (hasTypeScript) {
    return `// generated by stackcn\nimport type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {\n${shared}${typedRoutes}};\n\nexport default nextConfig;\n`;
  }

  return `// generated by stackcn\nconst nextConfig = {\n${shared}${typedRoutes}};\n\nexport default nextConfig;\n`;
}

function patchNextConfig(source: string, hasTypeScript: boolean, nextMajor: number | undefined): FrameworkConfigResult {
  let content = source;
  const notes: string[] = [];

  if (!content.includes("reactStrictMode")) {
    content = ensureTopLevelProperty(content, "reactStrictMode", "true");
    notes.push("enabled reactStrictMode");
  }

  if (hasTypeScript && (nextMajor ?? 16) >= 16) {
    const nextConfigImport = 'import type { NextConfig } from "next";';
    if (!content.includes("NextConfig")) {
      content = ensureImport(content, nextConfigImport);
      notes.push("added NextConfig type import");
    }

    if (!content.includes("typedRoutes")) {
      content = ensureTopLevelProperty(content, "typedRoutes", "true");
      notes.push("enabled typedRoutes for TypeScript");
    }
  }

  return {
    path: "next.config.ts",
    content,
    notes
  };
}

function createNuxtBaseline(): string {
  return `// generated by stackcn\nexport default defineNuxtConfig({\n  typescript: {\n    typeCheck: true\n  }\n});\n`;
}

function patchNuxtConfig(source: string): FrameworkConfigResult {
  let content = source;
  const notes: string[] = [];

  if (!content.includes("defineNuxtConfig")) {
    return {
      path: "nuxt.config.ts",
      content,
      notes: ["Nuxt config patch skipped because defineNuxtConfig was not found"]
    };
  }

  if (!content.includes("typescript")) {
    content = ensureTopLevelProperty(content, "typescript", "{ typeCheck: true }");
    notes.push("enabled Nuxt TypeScript typeCheck");
  } else if (!/\btypeCheck\s*:/.test(content)) {
    content = ensureNestedBooleanProperty(content, "typescript", "typeCheck", true);
    notes.push("enabled Nuxt TypeScript typeCheck");
  }

  return {
    path: "nuxt.config.ts",
    content,
    notes
  };
}

function createNestBaseline(): string {
  return `{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
`;
}

function patchNestConfig(source: string): FrameworkConfigResult {
  const parsed = JSON.parse(source) as Record<string, unknown>;
  const compilerOptions =
    typeof parsed.compilerOptions === "object" && parsed.compilerOptions !== null
      ? { ...(parsed.compilerOptions as Record<string, unknown>) }
      : {};
  const notes: string[] = [];

  if (parsed.collection !== "@nestjs/schematics") {
    parsed.collection = "@nestjs/schematics";
    notes.push("set Nest schematics collection");
  }

  if (parsed.sourceRoot !== "src") {
    parsed.sourceRoot = "src";
    notes.push("set Nest sourceRoot to src");
  }

  if (compilerOptions.deleteOutDir !== true) {
    compilerOptions.deleteOutDir = true;
    notes.push("enabled deleteOutDir in nest-cli compilerOptions");
  }

  parsed.compilerOptions = compilerOptions;

  return {
    path: "nest-cli.json",
    content: `${JSON.stringify(parsed, null, 2)}\n`,
    notes
  };
}

function isTypeScriptEntry(entry?: string): boolean {
  return entry ? /\.(?:cts|mts|ts|tsx)$/.test(entry) : false;
}

function getBackendDistEntry(entry: string): string {
  const withoutSourceRoot = entry.startsWith("src/") ? entry.slice(4) : entry;
  return `dist/${withoutSourceRoot.replace(/\.[^.]+$/, ".js")}`;
}

function createBackendScriptIntents(input: {
  readonly entry?: string;
  readonly isTypeScriptRuntime: boolean;
  readonly hasTsconfig: boolean;
}): readonly PackageScriptIntent[] {
  if (!input.entry) {
    return [];
  }

  if (input.isTypeScriptRuntime) {
    const intents: PackageScriptIntent[] = [
      {
        preferredName: "dev",
        fallbackName: "dev:backend",
        command: `tsx watch ${input.entry}`
      },
      {
        preferredName: "start",
        fallbackName: "start:backend",
        command: `tsx ${input.entry}`
      }
    ];

    if (input.hasTsconfig) {
      intents.push(
        {
          preferredName: "build",
          fallbackName: "build:backend",
          command: "tsc -p tsconfig.json"
        },
        {
          preferredName: "start:prod",
          command: `node ${getBackendDistEntry(input.entry)}`
        }
      );
    }

    return intents;
  }

  return [
    {
      preferredName: "dev",
      fallbackName: "dev:backend",
      command: `node --watch ${input.entry}`
    },
    {
      preferredName: "start",
      fallbackName: "start:backend",
      command: `node ${input.entry}`
    }
  ];
}

function createViteBaseline(framework: FrameworkName, viteMajor: number | undefined, hasViteTsconfigPaths: boolean): string {
  if (framework === "vite-react") {
    return `// generated by stackcn\nimport { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()]\n});\n`;
  }

  if (framework === "vite-vue") {
    return `// generated by stackcn\nimport { defineConfig } from "vite";\nimport vue from "@vitejs/plugin-vue";\n\nexport default defineConfig({\n  plugins: [vue()]\n});\n`;
  }

  if ((viteMajor ?? 8) >= 8) {
    return `// generated by stackcn\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  resolve: {\n    tsconfigPaths: true\n  }\n});\n`;
  }

  if (hasViteTsconfigPaths) {
    return `// generated by stackcn\nimport { defineConfig } from "vite";\nimport viteTsconfigPaths from "vite-tsconfig-paths";\n\nexport default defineConfig({\n  plugins: [viteTsconfigPaths({ projects: ["./tsconfig.json"] })]\n});\n`;
  }

  return `// generated by stackcn\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  // Install vite-tsconfig-paths to enable tsconfig path aliases on Vite 7 and earlier.\n});\n`;
}

function patchViteConfig(source: string, input: FrameworkConfigInput): FrameworkConfigResult {
  const framework = input.framework;
  const viteMajor = detectInstalledMajor(input.version);
  let content = source;
  const notes: string[] = [];

  if (framework === "vite-react") {
    content = ensureImport(content, 'import react from "@vitejs/plugin-react";');
    content = ensureArrayEntry(content, "plugins", "react()");
    notes.push("ensured @vitejs/plugin-react is registered");
  }

  if (framework === "vite-vue") {
    content = ensureImport(content, 'import vue from "@vitejs/plugin-vue";');
    content = ensureArrayEntry(content, "plugins", "vue()");
    notes.push("ensured @vitejs/plugin-vue is registered");
  }

  if (framework === "tanstack-start") {
    if ((viteMajor ?? 8) >= 8) {
      content = ensureNestedBooleanProperty(content, "resolve", "tsconfigPaths", true);
      notes.push("enabled resolve.tsconfigPaths for TanStack Start on Vite 8+");
    } else if (input.hasViteTsconfigPaths) {
      content = ensureImport(content, 'import viteTsconfigPaths from "vite-tsconfig-paths";');
      content = ensureArrayEntry(content, "plugins", 'viteTsconfigPaths({ projects: ["./tsconfig.json"] })');
      notes.push("ensured vite-tsconfig-paths is registered for TanStack Start on Vite 7 and earlier");
    } else {
      notes.push("TanStack Start path alias patch skipped because vite-tsconfig-paths is not installed for Vite 7 and earlier");
    }
  }

  return {
    path: "vite.config.ts",
    content,
    notes
  };
}

export function renderFrameworkConfig(input: FrameworkConfigInput): FrameworkConfigResult | undefined {
  switch (input.framework) {
    case "next":
      return input.existingContent
        ? patchNextConfig(input.existingContent, input.hasTypeScript ?? true, detectInstalledMajor(input.version))
        : {
            path: "next.config.ts",
            content: createNextBaseline(input.hasTypeScript ?? true, detectInstalledMajor(input.version)),
            notes: ["created Next.js config baseline"]
          };
    case "nuxt":
      return input.existingContent
        ? patchNuxtConfig(input.existingContent)
        : {
            path: "nuxt.config.ts",
            content: createNuxtBaseline(),
            notes: ["created Nuxt config baseline"]
          };
    case "nest":
      return input.existingContent
        ? patchNestConfig(input.existingContent)
        : {
            path: "nest-cli.json",
            content: createNestBaseline(),
            notes: ["created Nest CLI config baseline"]
          };
    case "vite-react":
    case "vite-vue":
    case "tanstack-start":
      return input.existingContent
        ? patchViteConfig(input.existingContent, input)
        : {
            path: "vite.config.ts",
            content: createViteBaseline(input.framework, detectInstalledMajor(input.version), input.hasViteTsconfigPaths ?? false),
            notes: ["created Vite config baseline"]
          };
    default:
      return undefined;
  }
}

export function getFrameworkPackagePatch(input: {
  readonly framework: FrameworkName;
  readonly backendEntry?: string;
  readonly hasExpressTypes?: boolean;
  readonly hasNestCli?: boolean;
  readonly hasNodeTypes?: boolean;
  readonly hasTsconfig?: boolean;
  readonly viteVersion?: string;
  readonly hasViteTsconfigPaths?: boolean;
  readonly hasTypeScript?: boolean;
  readonly hasVueTsc?: boolean;
}): PackageJsonPatch | undefined {
  if (input.framework === "vite-react") {
    return {
      devDependencies: {
        "@vitejs/plugin-react": toolingVersions.vitePluginReact
      }
    };
  }

  if (input.framework === "vite-vue") {
    return {
      devDependencies: {
        "@vitejs/plugin-vue": toolingVersions.vitePluginVue
      }
    };
  }

  if (input.framework === "tanstack-start") {
    const viteMajor = detectInstalledMajor(input.viteVersion);
    if ((viteMajor ?? 8) < 8 && !input.hasViteTsconfigPaths) {
      return {
        devDependencies: {
          "vite-tsconfig-paths": toolingVersions.viteTsconfigPaths
        }
      };
    }
  }

  if (input.framework === "nuxt") {
    const devDependencies: Record<string, string> = {};
    if (input.hasTypeScript === false) {
      devDependencies.typescript = toolingVersions.typescript;
    }
    if (!input.hasVueTsc) {
      devDependencies["vue-tsc"] = toolingVersions.vueTsc;
    }

    return {
      ...(Object.keys(devDependencies).length > 0 ? { devDependencies } : {}),
      scripts: [
        {
          preferredName: "typecheck",
          fallbackName: "typecheck:nuxt",
          command: "nuxt typecheck"
        }
      ]
    };
  }

  if (input.framework === "nest") {
    const devDependencies: Record<string, string> = {};

    if (input.hasTypeScript === false) {
      devDependencies.typescript = toolingVersions.typescript;
    }

    if (!input.hasNodeTypes) {
      devDependencies["@types/node"] = toolingVersions.nodeTypes;
    }

    if (!input.hasNestCli) {
      devDependencies["@nestjs/cli"] = toolingVersions.nestCli;
    }

    return {
      ...(Object.keys(devDependencies).length > 0 ? { devDependencies } : {}),
      scripts: [
        {
          preferredName: "build",
          fallbackName: "build:nest",
          command: "nest build"
        },
        {
          preferredName: "start",
          fallbackName: "start:nest",
          command: "nest start"
        },
        {
          preferredName: "start:dev",
          command: "nest start --watch"
        },
        {
          preferredName: "start:prod",
          command: "node dist/main.js"
        }
      ]
    };
  }

  if (input.framework === "express" || input.framework === "fastify") {
    const isTypeScriptRuntime = input.backendEntry
      ? isTypeScriptEntry(input.backendEntry)
      : input.hasTypeScript === true;
    const devDependencies: Record<string, string> = {};

    if (isTypeScriptRuntime) {
      if (input.hasTypeScript === false) {
        devDependencies.typescript = toolingVersions.typescript;
      }
      if (!input.hasNodeTypes) {
        devDependencies["@types/node"] = toolingVersions.nodeTypes;
      }
      if (!input.backendEntry || !input.backendEntry.endsWith(".js")) {
        devDependencies.tsx = toolingVersions.tsx;
      }
      if (input.framework === "express" && !input.hasExpressTypes) {
        devDependencies["@types/express"] = toolingVersions.expressTypes;
      }
    }

    return {
      ...(Object.keys(devDependencies).length > 0 ? { devDependencies } : {}),
      scripts: createBackendScriptIntents({
        ...(input.backendEntry ? { entry: input.backendEntry } : {}),
        isTypeScriptRuntime,
        hasTsconfig: input.hasTsconfig ?? false
      })
    };
  }

  return undefined;
}

export function getFrameworkPolicy(framework: FrameworkName): FrameworkPolicy | undefined {
  return frameworkPolicies.find((policy) => policy.framework === framework);
}
