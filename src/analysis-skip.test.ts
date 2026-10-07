import test from "ava";

import {
  getDraftStateFromContext,
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

test("JavaScript changes do not start an unchanged Python analysis", (t) => {
  const files = [".github/issue-triage/guard.mjs", "docs/setup.md"];

  t.false(shouldSkipUnchangedLanguage(true, "javascript-typescript", files));
  t.true(shouldSkipUnchangedLanguage(true, "python", files));
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
});

test("build scripts are ignored only when the workflow uses build-mode none", (t) => {
  const files = ["src/guard.mjs", "scripts/test-issue-triage.sh"];

  t.true(shouldSkipUnchangedLanguage(true, "python", files, "none"));
  t.false(shouldSkipUnchangedLanguage(true, "python", files, "manual"));
  t.false(shouldSkipUnchangedLanguage(true, "python", files));
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
});

test("incomplete inputs, multi-language jobs, and disabled gates fail open", (t) => {
  t.false(shouldSkipUnchangedLanguage(false, "python", ["README.md"]));
  t.false(shouldSkipUnchangedLanguage(true, undefined, ["README.md"]));
  t.false(
    shouldSkipUnchangedLanguage(true, "python,javascript", ["README.md"]),
  );
  t.false(shouldSkipUnchangedLanguage(true, "python", undefined));
});
