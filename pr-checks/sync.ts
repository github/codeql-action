#!/usr/bin/env npx tsx

import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

/**
 * Represents workflow input definitions.
 */
interface WorkflowInput {
  type: string;
  description: string;
  required: boolean;
  default: string;
}

/**
 * Represents PR check specifications.
 */
interface Specification {
  /** The display name for the check. */
  name: string;
  /** The workflow steps specific to this check. */
  steps: any[];
  /** Workflow-level input definitions forwarded to `workflow_dispatch`/`workflow_call`. */
  inputs?: Record<string, WorkflowInput>;
  /** CodeQL bundle versions to test against. Defaults to `DEFAULT_TEST_VERSIONS`. */
  versions?: string[];
  /** Operating system prefixes used to select runner images (e.g. `["ubuntu", "macos"]`). */
  operatingSystems?: string[];
  /** Whether to use the all-platform CodeQL bundle. */
  useAllPlatformBundle?: string;
  /** Values for the `analysis-kinds` matrix dimension. */
  analysisKinds?: string[];

  installNode?: string | boolean;
  installGo?: string | boolean;
  installJava?: string | boolean;
  installPython?: string | boolean;
  installDotNet?: string | boolean;
  installYq?: string | boolean;

  /** Container image configuration for the job. */
  container?: any;
  /** Service containers for the job. */
  services?: any;

  /** Custom permissions override for the job. */
  permissions?: Record<string, string>;
  /** Extra environment variables for the job. */
  env?: Record<string, any>;

  /** If set, this check is part of a named collection that gets its own caller workflow. */
  collection?: string;
}

// The default set of CodeQL Bundle versions to use for the PR checks.
const defaultTestVersions = [
  // The oldest supported CodeQL version. If bumping, update `CODEQL_MINIMUM_VERSION` in `codeql.ts`
  "stable-v2.17.6",
  // The last CodeQL release in the 2.18 series.
  "stable-v2.18.4",
  // The last CodeQL release in the 2.19 series.
  "stable-v2.19.4",
  // The last CodeQL release in the 2.20 series.
  "stable-v2.20.7",
  // The last CodeQL release in the 2.21 series.
  "stable-v2.21.4",
  // The last CodeQL release in the 2.22 series.
  "stable-v2.22.4",
  // The default version of CodeQL for Dotcom, as determined by feature flags.
  "default",
  // The version of CodeQL shipped with the Action in `defaults.json`. During the release process
  // for a new CodeQL release, there will be a period of time during which this will be newer than
  // the default version on Dotcom.
  "linked",
  // A nightly build directly from the our private repo, built in the last 24 hours.
  "nightly-latest",
];

const THIS_DIR = __dirname;
const CHECKS_DIR = path.join(THIS_DIR, "checks");
const OUTPUT_DIR = path.join(THIS_DIR, "new-output");

/**
 * Loads and parses a YAML file as a `Specification`.
 */
function loadYaml(filePath: string): Specification {
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content) as Specification;
}

/**
 * Serialize a value to YAML and write it to a file, prepended with the
 * standard header comment.
 */
function writeYaml(filePath: string, data: any): void {
  const header = `# Warning: This file is generated automatically, and should not be modified.
# Instead, please modify the template in the pr-checks directory and run:
#     pr-checks/sync.sh
# to regenerate this file.

`;
  const yamlStr = yaml.dump(data, {
    indent: 2,
    lineWidth: -1, // Don't wrap long lines
    noRefs: true, // Don't use YAML anchors/aliases
    quotingType: "'", // Use single quotes where quoting is needed
    forceQuotes: false,
  });
  fs.writeFileSync(filePath, stripTrailingWhitespace(header + yamlStr), "utf8");
}

function isTruthy(value: string | boolean | undefined): boolean {
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return Boolean(value);
}

/**
 * Strip trailing whitespace from each line.
 */
function stripTrailingWhitespace(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/**
 * Main entry point for the sync script.
 */
function main(): void {
  // Ensure the output directory exists.
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Discover and sort all check specification files.
  const checkFiles = fs
    .readdirSync(CHECKS_DIR)
    .filter((f) => f.endsWith(".yml"))
    .sort()
    .map((f) => path.join(CHECKS_DIR, f));

  console.log(`Found ${checkFiles.length} check specification(s).`);

  for (const file of checkFiles) {
    const checkName = path.basename(file, ".yml");
    const checkSpecification = loadYaml(file);

    console.log(`Processing: ${checkName} — "${checkSpecification.name}"`);

    let workflowInputs: Record<string, WorkflowInput> = {};
    if (checkSpecification.inputs) {
      workflowInputs = checkSpecification.inputs;
    }

    let matrix: Array<Record<string, any>> = [];

    for (const version of checkSpecification.versions ?? defaultTestVersions) {
      if (version === "latest") {
        throw new Error(
          'Did not recognise "version: latest". Did you mean "version: linked"?',
        );
      }

      const runnerImages = ["ubuntu-latest", "macos-latest", "windows-latest"];
      const operatingSystems = checkSpecification.operatingSystems ?? [
        "ubuntu",
      ];

      for (const operatingSystem of operatingSystems) {
        const runnerImagesForOs = runnerImages.filter((image) =>
          image.startsWith(operatingSystem),
        );

        for (const runnerImage of runnerImagesForOs) {
          matrix.push({
            os: runnerImage,
            version,
          });
        }
      }
    }

    // Construct the workflow steps needed for this check.
    const steps: any[] = [
      {
        name: "Check out repository",
        uses: "actions/checkout@v6",
      },
    ];

    steps.push(...checkSpecification.steps);

    const checkJob: Record<string, any> = {
      strategy: {
        "fail-fast": false,
        matrix: {
          include: matrix,
        },
      },
      name: checkSpecification.name,
      if: "github.triggering_actor != 'dependabot[bot]'",
      permissions: {
        contents: "read",
        "security-events": "read",
      },
      "timeout-minutes": 45,
      "runs-on": "${{ matrix.os }}",
      steps,
    };

    if (checkSpecification.permissions) {
      checkJob.permissions = checkSpecification.permissions;
    }

    for (const key of ["env", "container", "services"] as const) {
      if (checkSpecification[key] !== undefined) {
        checkJob[key] = checkSpecification[key];
      }
    }

    checkJob.env = checkJob.env ?? {};
    if (!("CODEQL_ACTION_TEST_MODE" in checkJob.env)) {
      checkJob.env.CODEQL_ACTION_TEST_MODE = true;
    }

    let extraGroupName = "";
    for (const inputName of Object.keys(workflowInputs)) {
      extraGroupName += "-${{inputs." + inputName + "}}";
    }

    const workflow = {
      name: `PR Check - ${checkSpecification.name}`,
      env: {
        GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
        GO111MODULE: "auto",
      },
      on: {
        push: {
          branches: ["main", "releases/v*"],
        },
        pull_request: {
          types: ["opened", "synchronize", "reopened", "ready_for_review"],
        },
        merge_group: {
          types: ["checks_requested"],
        },
        schedule: [{ cron: "0 5 * * *" }],
        workflow_dispatch: {
          inputs: workflowInputs,
        },
        workflow_call: {
          inputs: workflowInputs,
        },
      },
      defaults: {
        run: {
          shell: "bash",
        },
      },
      concurrency: {
        "cancel-in-progress":
          "${{ github.event_name == 'pull_request' || false }}",
        group: checkName + "-${{github.ref}}" + extraGroupName,
      },
      jobs: {
        [checkName]: checkJob,
      },
    };

    const outputPath = path.join(OUTPUT_DIR, `__${checkName}.yml`);
    writeYaml(outputPath, workflow);
  }

  console.log(
    `\nDone. Wrote ${checkFiles.length} workflow file(s) to ${OUTPUT_DIR}`,
  );
}

main();
