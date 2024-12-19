import * as core from "@actions/core";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";

import {
  getOptionalInput,
  getWorkflowEvent,
  getWorkflowEventName,
} from "./actions-util";
import { ConfigurationError, getRequiredEnvParam } from "./util";

async function runGitCommand(
  checkoutPath: string | undefined,
  args: string[],
  customErrorMessage: string,
): Promise<string> {
  let stdout = "";
  let stderr = "";
  core.debug(`Running git command: git ${args.join(" ")}`);
  try {
    await new toolrunner.ToolRunner(await io.which("git", true), args, {
      silent: true,
      listeners: {
        stdout: (data) => {
          stdout += data.toString();
        },
        stderr: (data) => {
          stderr += data.toString();
        },
      },
      cwd: checkoutPath,
    }).exec();
    return stdout;
  } catch (error) {
    let reason = stderr;
    if (stderr.includes("not a git repository")) {
      reason =
        "The checkout path provided to the action does not appear to be a git repository.";
    }
    core.info(`git call failed. ${customErrorMessage} Error: ${reason}`);
    throw error;
  }
}

/**
 * Gets the SHA of the commit that is currently checked out.
 */
export const getCommitOid = async function (
  checkoutPath: string,
  ref = "HEAD",
): Promise<string> {
  // Try to use git to get the current commit SHA. If that fails then
  // log but otherwise silently fall back to using the SHA from the environment.
  // The only time these two values will differ is during analysis of a PR when
  // the workflow has changed the current commit to the head commit instead of
  // the merge commit, which must mean that git is available.
  // Even if this does go wrong, it's not a huge problem for the alerts to
  // reported on the merge commit.
  try {
    const stdout = await runGitCommand(
      checkoutPath,
      ["rev-parse", ref],
      "Continuing with commit SHA from user input or environment.",
    );
    return stdout.trim();
  } catch {
    return getOptionalInput("sha") || getRequiredEnvParam("GITHUB_SHA");
  }
};

/**
 * If the action was triggered by a pull request, determine the commit sha at
 * the head of the base branch, using the merge commit that this workflow analyzes.
 * Returns undefined if run by other triggers or the base branch commit cannot be
 * determined.
 */
export const determineBaseBranchHeadCommitOid = async function (
  checkoutPathOverride?: string,
): Promise<string | undefined> {
  if (getWorkflowEventName() !== "pull_request") {
    return undefined;
  }

  const mergeSha = getRequiredEnvParam("GITHUB_SHA");
  const checkoutPath =
    checkoutPathOverride ?? getOptionalInput("checkout_path");

  try {
    let commitOid = "";
    let baseOid = "";
    let headOid = "";

    const stdout = await runGitCommand(
      checkoutPath,
      ["show", "-s", "--format=raw", mergeSha],
      "Will calculate the base branch SHA on the server.",
    );

    for (const data of stdout.split("\n")) {
      if (data.startsWith("commit ") && commitOid === "") {
        commitOid = data.substring(7);
      } else if (data.startsWith("parent ")) {
        if (baseOid === "") {
          baseOid = data.substring(7);
        } else if (headOid === "") {
          headOid = data.substring(7);
        }
      }
    }

    // Let's confirm our assumptions: We had a merge commit and the parsed parent data looks correct
    if (
      commitOid === mergeSha &&
      headOid.length === 40 &&
      baseOid.length === 40
    ) {
      return baseOid;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Deepen the git history of HEAD by one level. Errors are logged.
 *
 * This function uses the `checkout_path` to determine the repository path and
 * works only when called from `analyze` or `upload-sarif`.
 */
export const deepenGitHistory = async function () {
  try {
    await runGitCommand(
      getOptionalInput("checkout_path"),
      [
        "fetch",
        "origin",
        "HEAD",
        "--no-tags",
        "--no-recurse-submodules",
        "--deepen=1",
      ],
      "Cannot deepen the shallow repository.",
    );
  } catch {
    // Errors are already logged by runGitCommand()
  }
};

/**
 * Fetch the given remote branch. Errors are logged.
 *
 * This function uses the `checkout_path` to determine the repository path and
 * works only when called from `analyze` or `upload-sarif`.
 */
export const gitFetch = async function (branch: string, extraFlags: string[]) {
  try {
    await runGitCommand(
      getOptionalInput("checkout_path"),
      ["fetch", "--no-tags", ...extraFlags, "origin", `${branch}:${branch}`],
      `Cannot fetch ${branch}.`,
    );
  } catch {
    // Errors are already logged by runGitCommand()
  }
};

/**
 * Repack the git repository, using with the given flags. Errors are logged.
 *
 * This function uses the `checkout_path` to determine the repository path and
 * works only when called from `analyze` or `upload-sarif`.
 */
export const gitRepack = async function (flags: string[]) {
  try {
    await runGitCommand(
      getOptionalInput("checkout_path"),
      ["repack", ...flags],
      "Cannot repack the repository.",
    );
  } catch {
    // Errors are already logged by runGitCommand()
  }
};

/**
 * Compute the all merge bases between the given refs. Returns an empty array
 * if no merge base is found, or if there is an error.
 *
 * This function uses the `checkout_path` to determine the repository path and
 * works only when called from `analyze` or `upload-sarif`.
 */
export const getAllGitMergeBases = async function (
  refs: string[],
): Promise<string[]> {
  try {
    const stdout = await runGitCommand(
      getOptionalInput("checkout_path"),
      ["merge-base", "--all", ...refs],
      `Cannot get merge base of ${refs}.`,
    );
    return stdout.trim().split("\n");
  } catch {
    return [];
  }
};

/**
 * Compute the diff hunk headers between the two given refs.
 *
 * This function uses the `checkout_path` to determine the repository path and
 * works only when called from `analyze` or `upload-sarif`.
 *
 * @returns an array of diff hunk headers (one element per line), or undefined
 * if the action was not triggered by a pull request, or if the diff could not
 * be determined.
 */
export const getGitDiffHunkHeaders = async function (
  fromRef: string,
  toRef: string,
): Promise<string[] | undefined> {
  let stdout = "";
  try {
    stdout = await runGitCommand(
      getOptionalInput("checkout_path"),
      [
        "-c",
        "core.quotePath=false",
        "diff",
        "--no-renames",
        "--irreversible-delete",
        "-U0",
        fromRef,
        toRef,
      ],
      `Cannot get diff from ${fromRef} to ${toRef}.`,
    );
  } catch {
    return undefined;
  }

  const headers: string[] = [];
  for (const line of stdout.split("\n")) {
    if (
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("@@ ")
    ) {
      headers.push(line);
    }
  }
  return headers;
};

/**
 * Decode, if necessary, a file path produced by Git. See
 * https://git-scm.com/docs/git-config#Documentation/git-config.txt-corequotePath
 * for details on how Git encodes file paths with special characters.
 *
 * This function works only for Git output with `core.quotePath=false`.
 */
export const decodeGitFilePath = function (filePath: string): string {
  if (filePath.startsWith('"') && filePath.endsWith('"')) {
    filePath = filePath.substring(1, filePath.length - 1);
    return filePath.replace(
      /\\([abfnrtv\\"]|[0-7]{1,3})/g,
      (_match, seq: string) => {
        switch (seq[0]) {
          case "a":
            return "\x07";
          case "b":
            return "\b";
          case "f":
            return "\f";
          case "n":
            return "\n";
          case "r":
            return "\r";
          case "t":
            return "\t";
          case "v":
            return "\v";
          case "\\":
            return "\\";
          case '"':
            return '"';
          default:
            // Both String.fromCharCode() and String.fromCodePoint() works only
            // for constructing an entire character at once. If a Unicode
            // character is encoded as a sequence of escaped bytes, calling these
            // methods sequentially on the individual byte values would *not*
            // produce the original multi-byte Unicode character. As a result,
            // this implementation works only with the Git option core.quotePath
            // set to false.
            return String.fromCharCode(parseInt(seq, 8));
        }
      },
    );
  }
  return filePath;
};

function getRefFromEnv(): string {
  // To workaround a limitation of Actions dynamic workflows not setting
  // the GITHUB_REF in some cases, we accept also the ref within the
  // CODE_SCANNING_REF variable. When possible, however, we prefer to use
  // the GITHUB_REF as that is a protected variable and cannot be overwritten.
  let refEnv: string;
  try {
    refEnv = getRequiredEnvParam("GITHUB_REF");
  } catch (e) {
    // If the GITHUB_REF is not set, we try to rescue by getting the
    // CODE_SCANNING_REF.
    const maybeRef = process.env["CODE_SCANNING_REF"];
    if (maybeRef === undefined || maybeRef.length === 0) {
      throw e;
    }
    refEnv = maybeRef;
  }
  return refEnv;
}

/**
 * Get the ref currently being analyzed.
 */
export async function getRef(): Promise<string> {
  // Will be in the form "refs/heads/master" on a push event
  // or in the form "refs/pull/N/merge" on a pull_request event
  const refInput = getOptionalInput("ref");
  const shaInput = getOptionalInput("sha");
  const checkoutPath =
    getOptionalInput("checkout_path") ||
    getOptionalInput("source-root") ||
    getRequiredEnvParam("GITHUB_WORKSPACE");

  const hasRefInput = !!refInput;
  const hasShaInput = !!shaInput;
  // If one of 'ref' or 'sha' are provided, both are required
  if ((hasRefInput || hasShaInput) && !(hasRefInput && hasShaInput)) {
    throw new ConfigurationError(
      "Both 'ref' and 'sha' are required if one of them is provided.",
    );
  }

  const ref = refInput || getRefFromEnv();
  const sha = shaInput || getRequiredEnvParam("GITHUB_SHA");

  // If the ref is a user-provided input, we have to skip logic
  // and assume that it is really where they want to upload the results.
  if (refInput) {
    return refInput;
  }

  // For pull request refs we want to detect whether the workflow
  // has run `git checkout HEAD^2` to analyze the 'head' ref rather
  // than the 'merge' ref. If so, we want to convert the ref that
  // we report back.
  const pull_ref_regex = /refs\/pull\/(\d+)\/merge/;
  if (!pull_ref_regex.test(ref)) {
    return ref;
  }

  const head = await getCommitOid(checkoutPath, "HEAD");

  // in actions/checkout@v2+ we can check if git rev-parse HEAD == GITHUB_SHA
  // in actions/checkout@v1 this may not be true as it checks out the repository
  // using GITHUB_REF. There is a subtle race condition where
  // git rev-parse GITHUB_REF != GITHUB_SHA, so we must check
  // git rev-parse GITHUB_REF == git rev-parse HEAD instead.
  const hasChangedRef =
    sha !== head &&
    (await getCommitOid(
      checkoutPath,
      ref.replace(/^refs\/pull\//, "refs/remotes/pull/"),
    )) !== head;

  if (hasChangedRef) {
    const newRef = ref.replace(pull_ref_regex, "refs/pull/$1/head");
    core.debug(
      `No longer on merge commit, rewriting ref from ${ref} to ${newRef}.`,
    );
    return newRef;
  } else {
    return ref;
  }
}

function removeRefsHeadsPrefix(ref: string): string {
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

/**
 * Returns whether we are analyzing the default branch for the repository.
 *
 * This first checks the environment variable `CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH`. This
 * environment variable can be set in cases where repository information might not be available, for
 * example dynamic workflows.
 */
export async function isAnalyzingDefaultBranch(): Promise<boolean> {
  if (process.env.CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH === "true") {
    return true;
  }

  // Get the current ref and trim and refs/heads/ prefix
  let currentRef = await getRef();
  currentRef = removeRefsHeadsPrefix(currentRef);

  const event = getWorkflowEvent();
  let defaultBranch = event?.repository?.default_branch;

  if (getWorkflowEventName() === "schedule") {
    defaultBranch = removeRefsHeadsPrefix(getRefFromEnv());
  }

  return currentRef === defaultBranch;
}
