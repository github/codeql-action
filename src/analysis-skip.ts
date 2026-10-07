import * as github from "@actions/github";

import * as actionsUtil from "./actions-util";
import { getPullRequestChangedFiles } from "./diff-informed-analysis-utils";
import { BuiltInLanguage, parseBuiltInLanguage } from "./languages";
import type { Logger } from "./logging";

type ChangedFileKind = BuiltInLanguage | "non-code" | "global";

const languageExtensions: Record<BuiltInLanguage, ReadonlySet<string>> = {
  [BuiltInLanguage.actions]: new Set(),
  [BuiltInLanguage.cpp]: new Set([
    ".c",
    ".cc",
    ".cpp",
    ".cxx",
    ".h",
    ".hh",
    ".hpp",
    ".hxx",
  ]),
  [BuiltInLanguage.csharp]: new Set([".cs"]),
  [BuiltInLanguage.go]: new Set([".go"]),
  [BuiltInLanguage.java]: new Set([".java", ".kt", ".kts"]),
  [BuiltInLanguage.javascript]: new Set([
    ".cjs",
    ".html",
    ".js",
    ".jsx",
    ".mjs",
    ".ts",
    ".tsx",
  ]),
  [BuiltInLanguage.python]: new Set([".py", ".pyi"]),
  [BuiltInLanguage.ruby]: new Set([".rb", ".rake", ".gemspec", ".erb"]),
  [BuiltInLanguage.rust]: new Set([".rs"]),
  [BuiltInLanguage.swift]: new Set([".swift"]),
};

const languageConfigFiles: Record<BuiltInLanguage, ReadonlySet<string>> = {
  [BuiltInLanguage.actions]: new Set(),
  [BuiltInLanguage.cpp]: new Set(["cmakelists.txt"]),
  [BuiltInLanguage.csharp]: new Set([
    "directory.build.props",
    "directory.build.targets",
  ]),
  [BuiltInLanguage.go]: new Set(["go.mod", "go.sum"]),
  [BuiltInLanguage.java]: new Set([
    "build.gradle",
    "build.gradle.kts",
    "gradle.properties",
    "pom.xml",
    "settings.gradle",
    "settings.gradle.kts",
  ]),
  [BuiltInLanguage.javascript]: new Set([
    ".npmrc",
    "jsconfig.json",
    "package-lock.json",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "yarn.lock",
  ]),
  [BuiltInLanguage.python]: new Set([
    ".python-version",
    "pipfile",
    "pipfile.lock",
    "poetry.lock",
    "pyproject.toml",
    "requirements.txt",
    "setup.cfg",
    "setup.py",
    "tox.ini",
    "uv.lock",
  ]),
  [BuiltInLanguage.ruby]: new Set(["gemfile", "gemfile.lock"]),
  [BuiltInLanguage.rust]: new Set(["cargo.lock", "cargo.toml"]),
  [BuiltInLanguage.swift]: new Set(["package.swift"]),
};

const nonCodeExtensions = new Set([
  ".adoc",
  ".csv",
  ".css",
  ".gif",
  ".jpeg",
  ".jpg",
  ".less",
  ".markdown",
  ".md",
  ".pdf",
  ".png",
  ".rst",
  ".scss",
  ".svg",
  ".txt",
  ".webp",
]);
const workflowExtensions = new Set([".yml", ".yaml"]);

/**
 * Returns whether the supplied pull-request metadata authorizes a draft skip.
 * Unknown draft state deliberately fails open.
 */
export function shouldSkipDraftAnalysis(
  skipIfDraft: boolean,
  draftState: boolean | undefined,
  managedWorkflowDraft = false,
): boolean {
  return managedWorkflowDraft || (skipIfDraft && draftState === true);
}

/**
 * Returns whether a single-language analysis can safely be skipped for a diff.
 * Unknown languages, unknown files, and absent diff data all fail open.
 */
export function shouldSkipUnchangedLanguage(
  enabled: boolean,
  languagesInput: string | undefined,
  changedFiles: readonly string[] | undefined,
  buildMode: string | undefined = undefined,
): boolean {
  if (!enabled || languagesInput === undefined || changedFiles === undefined) {
    return false;
  }

  const languages = languagesInput
    .split(",")
    .map((language) => parseBuiltInLanguage(language));
  if (
    languages.length === 0 ||
    languages.length > 1 ||
    languages.some((language) => language === undefined)
  ) {
    return false;
  }

  const language = languages[0];
  if (language === undefined) {
    return false;
  }

  return changedFiles.every((file) => {
    const fileKind = classifyChangedFile(file, buildMode);
    return (
      fileKind !== undefined &&
      (fileKind === "non-code" ||
        (fileKind !== "global" && fileKind !== language))
    );
  });
}

function classifyChangedFile(
  file: string,
  buildMode: string | undefined,
): ChangedFileKind | undefined {
  const normalizedPath = file.replaceAll("\\", "/").toLowerCase();
  const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);

  // Query and extractor configuration can change the meaning of every analysis.
  if (
    normalizedPath.includes("/.github/codeql/") ||
    normalizedPath.startsWith(".github/codeql/") ||
    [".ql", ".qls", ".qlpack.yml"].some((suffix) =>
      normalizedPath.endsWith(suffix),
    )
  ) {
    return "global";
  }

  for (const language of Object.values(BuiltInLanguage)) {
    if (languageConfigFiles[language].has(basename)) {
      return language;
    }
  }

  if (
    (normalizedPath.startsWith(".github/workflows/") ||
      normalizedPath.includes("/.github/workflows/")) &&
    workflowExtensions.has(extensionOf(basename))
  ) {
    return BuiltInLanguage.actions;
  }

  if (
    basename.startsWith("requirements") &&
    (basename.endsWith(".txt") || basename.endsWith(".in"))
  ) {
    return BuiltInLanguage.python;
  }
  if (
    basename.startsWith("tsconfig") &&
    (basename.endsWith(".json") || basename.endsWith(".jsonc"))
  ) {
    return BuiltInLanguage.javascript;
  }
  if (basename.endsWith(".csproj") || basename.endsWith(".sln")) {
    return BuiltInLanguage.csharp;
  }

  const extension = extensionOf(basename);
  if (extension === ".sh" || extension === ".bash") {
    // Build scripts can affect generated or compiled sources. They are safe to
    // ignore only when the workflow explicitly uses build-mode: none.
    return buildMode === "none" ? "non-code" : undefined;
  }
  for (const language of Object.values(BuiltInLanguage)) {
    if (languageExtensions[language].has(extension)) {
      return language;
    }
  }

  if (nonCodeExtensions.has(extension)) {
    return "non-code";
  }

  return undefined;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot) : "";
}

export function getDraftStateFromContext(
  pullRequestDraft: unknown,
  dynamicDraftValue?: unknown,
): boolean | undefined {
  if (typeof pullRequestDraft === "boolean") {
    return pullRequestDraft;
  }

  // GitHub-managed Code Quality uses a `dynamic` event rather than
  // `pull_request`; the product could pass this value when it integrates the
  // opt-in input.
  const dynamicDraft = dynamicDraftValue;
  if (dynamicDraft === "true") {
    return true;
  }
  if (dynamicDraft === "false") {
    return false;
  }
  return undefined;
}

function getDraftState(): boolean | undefined {
  return getDraftStateFromContext(
    github.context.payload.pull_request?.draft,
    process.env.CODE_SCANNING_IS_DRAFT,
  );
}

/** Determine whether the current run should stop before CodeQL initialization. */
export async function getAnalysisSkipReason(
  logger: Logger,
): Promise<string | undefined> {
  const skipIfDraft = actionsUtil.getOptionalInput("skip-if-draft") === "true";
  const draftState = getDraftState();
  const managedWorkflowDraft = process.env.CODE_SCANNING_IS_DRAFT === "true";
  if (shouldSkipDraftAnalysis(skipIfDraft, draftState, managedWorkflowDraft)) {
    return "the pull request is a draft";
  }
  if (skipIfDraft && draftState === undefined) {
    logger.info(
      "Draft status is unavailable in this workflow event; continuing with analysis.",
    );
  }

  const skipUnchangedLanguage =
    actionsUtil.getOptionalInput("skip-if-no-language-changes") === "true";
  if (!skipUnchangedLanguage) {
    return undefined;
  }

  const languagesInput = actionsUtil.getOptionalInput("languages");
  if (!languagesInput) {
    logger.info(
      "Cannot skip an unchanged-language analysis without an explicit languages input.",
    );
    return undefined;
  }

  const branches = actionsUtil.getPullRequestBranches();
  if (!branches) {
    logger.info(
      "Cannot skip an unchanged-language analysis outside a pull request.",
    );
    return undefined;
  }

  let changedFiles: string[] | undefined;
  try {
    changedFiles = await getPullRequestChangedFiles(branches, logger);
  } catch (error) {
    logger.warning(
      `Unable to determine changed files; continuing with the full analysis: ${error}`,
    );
    return undefined;
  }
  if (changedFiles === undefined) {
    logger.info(
      "The complete pull-request diff is unavailable; continuing with the full analysis.",
    );
    return undefined;
  }

  if (
    shouldSkipUnchangedLanguage(
      true,
      languagesInput,
      changedFiles,
      actionsUtil.getOptionalInput("build-mode"),
    )
  ) {
    return `the pull request changes no files for ${languagesInput}`;
  }
  return undefined;
}
