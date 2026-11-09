import * as fs from "fs";
import * as path from "path";

import * as yaml from "yaml";

import { REPO_ROOT } from "./config";

/** The path of the workflow that reruns failed jobs in other workflows. */
const DEFLAKE_WORKFLOW_FILE = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "deflake.yml",
);

/**
 * The names of workflows that `sync.ts` doesn't generate, but whose failed jobs the Deflake
 * workflow should rerun.
 *
 * Exclude workflows that have significant side effects, like publishing releases. It's OK to retry
 * CodeQL analysis.
 */
const NON_GENERATED_WORKFLOWS_TO_RERUN = [
  "Check Expected Release Files",
  "Code-Scanning config CLI tests",
  "CodeQL action",
  "PR Check - Debug artifact upload",
  "PR Check - Debug artifacts after failure",
  "PR Checks",
  "Query filters tests",
  "Test that the workaround for python 3.12 on windows works",
];

/**
 * Escapes the characters in a workflow name that `on.workflow_run.workflows` would otherwise treat
 * as glob syntax.
 *
 * @returns A pattern that matches only the workflow called `name`.
 */
export function escapeWorkflowName(name: string): string {
  // These are the characters that can be escaped in GitHub Actions filter patterns. `]` is only
  // special after an unescaped `[`, so it doesn't need escaping.
  return name.replace(/[\\[?*+!]/g, "\\$&");
}

/**
 * Replaces the items in the `on.workflow_run.workflows` list of a workflow, and any comments on
 * their lines or between them, with patterns that match the workflows called `workflowNames`,
 * sorted by name. The list is written as a block sequence.
 *
 * The whole workflow is rewritten with the `yaml` library, so any other parts that aren't
 * formatted the way that library formats them are reformatted, for example by joining lines of
 * folded (`>`) block scalars. Prettier, which checks the formatting of YAML files in this
 * repository, formats non-empty flow mappings, and flow sequences that don't fit within 80
 * columns, differently from that library, so the workflow is expected not to contain any.
 *
 * @param workflow The contents of the workflow file.
 * @param workflowNames The names of the workflows that should trigger the workflow.
 * @returns The updated contents of the workflow file.
 * @throws If the workflow isn't valid YAML, or `on.workflow_run.workflows` isn't a sequence.
 */
export function setWorkflowRunWorkflows(
  workflow: string,
  workflowNames: string[],
): string {
  const document = yaml.parseDocument(workflow);
  if (document.errors.length > 0) {
    throw new Error(
      `Failed to parse the workflow: ${document.errors[0].message}`,
    );
  }
  const workflows = document.getIn(["on", "workflow_run", "workflows"], true);
  if (!yaml.isSeq(workflows)) {
    throw new Error("Expected `on.workflow_run.workflows` to be a sequence.");
  }

  workflows.flow = false;
  workflows.items = workflowNames
    .toSorted((a, b) => a.localeCompare(b, "en"))
    .map((name) => {
      const pattern = escapeWorkflowName(name);
      const item = new yaml.Scalar(pattern);
      // Quote the pattern in the same way as Prettier, which uses single quotes for strings that
      // contain `"` but no `\`, and double quotes otherwise.
      item.type =
        pattern.includes('"') && !pattern.includes("\\")
          ? yaml.Scalar.QUOTE_SINGLE
          : yaml.Scalar.QUOTE_DOUBLE;
      return item;
    });
  // These options match how Prettier formats short flow sequences, such as `[completed]`, and long
  // strings.
  return document.toString({ flowCollectionPadding: false, lineWidth: 0 });
}

/**
 * Updates the Deflake workflow so that it reruns failed jobs in the workflows called
 * `generatedWorkflowNames` and in {@link NON_GENERATED_WORKFLOWS_TO_RERUN}.
 */
export function updateDeflakeWorkflow(generatedWorkflowNames: string[]): void {
  console.log(`Updating the list of workflows in '${DEFLAKE_WORKFLOW_FILE}'.`);
  const workflow = fs.readFileSync(DEFLAKE_WORKFLOW_FILE, "utf8");
  fs.writeFileSync(
    DEFLAKE_WORKFLOW_FILE,
    setWorkflowRunWorkflows(workflow, [
      ...generatedWorkflowNames,
      ...NON_GENERATED_WORKFLOWS_TO_RERUN,
    ]),
    "utf8",
  );
}
