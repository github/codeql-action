import test from "ava";

import {
  getDraftStateFromContext,
  getPullRequestCommitShas,
  shouldSkipDraftAnalysis,
  shouldSkipUnchangedLanguage,
} from "./analysis-skip";
import { setupTests } from "./testing-utils";

setupTests(test);

test("draft analysis is skipped only when explicitly enabled and confirmed", (t) => {
  t.true(shouldSkipDraftAnalysis(true, true));
  t.false(shouldSkipDraftAnalysis(false, true));
  t.false(shouldSkipDraftAnalysis(true, false));
  t.false(shouldSkipDraftAnalysis(true, undefined));
  t.true(shouldSkipDraftAnalysis(false, undefined, true));
});

test("draft state can be supplied by a pull_request or dynamic event", (t) => {
  t.is(getDraftStateFromContext(true), true);
  t.is(getDraftStateFromContext(undefined, "true"), true);
  t.is(getDraftStateFromContext(undefined, "false"), false);
  t.is(getDraftStateFromContext(undefined), undefined);
});

test("source changes in another language fail open", (t) => {
  t.false(
    shouldSkipUnchangedLanguage(true, "python", [
      ".github/issue-triage/guard.mjs",
      "docs/setup.md",
    ]),
  );
});

test("documentation-only changes can skip a language analysis", (t) => {
  t.true(
    shouldSkipUnchangedLanguage(true, "javascript", [
      "docs/guide.md",
      "README.rst",
    ]),
  );
});

test("language-specific dependency files keep their language analysis", (t) => {
  t.false(
    shouldSkipUnchangedLanguage(true, "javascript-typescript", [
      "package-lock.json",
    ]),
  );
  t.false(
    shouldSkipUnchangedLanguage(true, "python", ["requirements-dev.txt"]),
  );
  t.false(shouldSkipUnchangedLanguage(true, "cpp", ["CMakeLists.txt"]));
});

test("build scripts always keep the analysis enabled", (t) => {
  t.false(
    shouldSkipUnchangedLanguage(true, "python", [
      "scripts/test-issue-triage.sh",
    ]),
  );
});

test("workflow changes are relevant to every language", (t) => {
  t.false(
    shouldSkipUnchangedLanguage(true, "python", [
      ".github/workflows/codeql.yml",
    ]),
  );
});

test("pull-request diffs use immutable event commit SHAs", (t) => {
  t.deepEqual(
    getPullRequestCommitShas({
      base: { sha: "base-sha" },
      head: { sha: "head-sha" },
    }),
    { base: "base-sha", head: "head-sha" },
  );
  t.is(getPullRequestCommitShas({ base: { sha: "base-sha" } }), undefined);
  t.is(getPullRequestCommitShas(undefined), undefined);
});

test("renames are relevant to both the old and new languages", (t) => {
  t.false(
    shouldSkipUnchangedLanguage(true, "python", [
      "src/new_guard.mjs",
      "src/old_guard.py",
    ]),
  );
});

test("unknown and CodeQL configuration paths fail open", (t) => {
  t.false(
    shouldSkipUnchangedLanguage(true, "python", ["build/custom-generator.x"]),
  );
  t.false(
    shouldSkipUnchangedLanguage(true, "python", [
      ".github/codeql/codeql-config.yml",
    ]),
  );
  t.false(shouldSkipUnchangedLanguage(true, "cpp", ["meson_options.txt"]));
  t.false(shouldSkipUnchangedLanguage(true, "python", ["conanfile.txt"]));
});

test("incomplete inputs, multi-language jobs, and disabled gates fail open", (t) => {
  t.false(shouldSkipUnchangedLanguage(false, "python", ["README.md"]));
  t.false(shouldSkipUnchangedLanguage(true, undefined, ["README.md"]));
  t.false(
    shouldSkipUnchangedLanguage(true, "python,javascript", ["README.md"]),
  );
  t.false(shouldSkipUnchangedLanguage(true, "python", undefined));
});
