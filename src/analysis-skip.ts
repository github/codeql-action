import * as github from "@actions/github";

import * as actionsUtil from "./actions-util";
import type { PullRequestBranches } from "./actions-util";
import { getPullRequestChangedFiles } from "./diff-informed-analysis-utils";
import { parseBuiltInLanguage } from "./languages";
import type { Logger } from "./logging";

type ChangedFileKind = "non-code" | "global";

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
  ".webp",
]);
const buildConfigurationFiles = new Set([
  ".npmrc",
  ".python-version",
  "build.gradle",
  "build.gradle.kts",
  "cargo.lock",
  "cargo.toml",
  "directory.build.props",
  "directory.build.targets",
  "gemfile",
  "gemfile.lock",
  "go.mod",
  "go.sum",
  "gradle.properties",
  "jsconfig.json",
  "package-lock.json",
  "package.json",
  "pipfile",
  "pipfile.lock",
  "poetry.lock",
  "pom.xml",
  "pyproject.toml",
  "settings.gradle",
  "settings.gradle.kts",
  "setup.cfg",
  "setup.py",
  "tox.ini",
  "tsconfig.json",
  "uv.lock",
  "yarn.lock",
]);
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
): boolean {
  if (!enabled || languagesInput === undefined || changedFiles === undefined) {
    return false;
  }

  const languages = languagesInput
    .split(",")
    .map((language) => parseBuiltInLanguage(language));
  if (languages.length !== 1 || languages[0] === undefined) {
    return false;
  }

  return changedFiles.every((file) => {
    const fileKind = classifyChangedFile(file);
    // File extensions cannot establish whether code in another language is a
    // generator or build input for this analysis. Only explicitly non-code
    // paths are safe evidence that the analyzed language is unaffected.
    return fileKind === "non-code";
  });
}

function classifyChangedFile(file: string): ChangedFileKind | undefined {
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

  if (
    normalizedPath.startsWith(".github/workflows/") ||
    normalizedPath.includes("/.github/workflows/")
  ) {
    // Workflow files can change queries, inline CodeQL config, build steps, or
    // generated-source behavior for any language.
    return "global";
  }

  if (
    buildConfigurationFiles.has(basename) ||
    basename === "cmakelists.txt" ||
    basename.endsWith(".csproj") ||
    basename.endsWith(".sln") ||
    (basename.startsWith("requirements") &&
      (basename.endsWith(".txt") || basename.endsWith(".in"))) ||
    (basename.startsWith("tsconfig") &&
      (basename.endsWith(".json") || basename.endsWith(".jsonc")))
  ) {
    return "global";
  }

  // Shell scripts may build or generate sources. The effective build mode can
  // differ from its input value, so do not treat them as unrelated changes.
  const extension = extensionOf(basename);
  if (extension === ".sh" || extension === ".bash") {
    return undefined;
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

/** Return immutable PR commit SHAs for a snapshot-specific diff comparison. */
export function getPullRequestCommitShas(
  pullRequest: unknown,
): PullRequestBranches | undefined {
  if (typeof pullRequest !== "object" || pullRequest === null) {
    return undefined;
  }
  const pullRequestData = pullRequest as {
    base?: { sha?: unknown };
    head?: { sha?: unknown };
  };
  const baseSha = pullRequestData.base?.sha;
  const headSha = pullRequestData.head?.sha;
  if (typeof baseSha !== "string" || typeof headSha !== "string") {
    return undefined;
  }
  return { base: baseSha, head: headSha };
}

/** Determine whether a confirmed draft should skip before status reporting. */
export function getDraftAnalysisSkipReason(logger: Logger): string | undefined {
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
  return undefined;
}

/** Determine whether the current run should stop before CodeQL initialization. */
export async function getAnalysisSkipReason(
  logger: Logger,
): Promise<string | undefined> {
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

  const branches = getPullRequestCommitShas(
    github.context.payload.pull_request,
  );
  if (!branches) {
    logger.info(
      "Cannot skip an unchanged-language analysis without immutable pull-request commit SHAs.",
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

  if (shouldSkipUnchangedLanguage(true, languagesInput, changedFiles)) {
    return `the pull request changes no files for ${languagesInput}`;
  }
  return undefined;
}
