#!/usr/bin/env npx tsx

import * as fs from "fs";
import * as path from "path";

import * as yaml from "yaml";

import { KnownLanguage } from "../src/languages";

/** Known workflow input names. */
enum KnownInputName {
  GoVersion = "go-version",
  JavaVersion = "java-version",
  PythonVersion = "python-version",
  DotnetVersion = "dotnet-version",
}

/**
 * Represents workflow input definitions.
 */
interface WorkflowInput {
  type: string;
  description: string;
  required: boolean;
  default: string;
}

/** A partial mapping from known input names to input definitions. */
type WorkflowInputs = Partial<Record<KnownInputName, WorkflowInput>>;

/**
 * Represents PR check specifications.
 */
interface Specification extends JobSpecification {
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

  /** Container image configuration for the job. */
  container?: any;
  /** Service containers for the job. */
  services?: any;

  /** Additional jobs to run after the main PR check job. */
  validationJobs?: Record<string, JobSpecification>;

  /** If set, this check is part of a named collection that gets its own caller workflow. */
  collection?: string;
}

/** Represents job specifications. */
interface JobSpecification {
  /** The display name for the check. */
  name: string;
  /** Custom permissions override for the job. */
  permissions?: Record<string, string>;
  /** Extra environment variables for the job. */
  env?: Record<string, any>;

  /** The workflow steps specific to this check. */
  steps: any[];

  installNode?: boolean;
  installGo?: boolean;
  installJava?: boolean;
  installPython?: boolean;
  installDotNet?: boolean;
  installYq?: boolean;
}

/** Describes language/framework-specific steps and inputs. */
interface LanguageSetup {
  specProperty: keyof JobSpecification;
  inputs?: WorkflowInputs;
  steps: any[];
}

/** Describes partial mappings from known languages to their specific setup information. */
type LanguageSetups = Partial<Record<KnownLanguage, LanguageSetup>>;

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

/** The default versions we use for languages / frameworks, if not specified as a workflow input. */
const defaultLanguageVersions = {
  javascript: "20.x",
  go: ">=1.21.0",
  java: "17",
  python: "3.13",
  csharp: "9.x",
} as const satisfies Partial<Record<KnownLanguage, string>>;

/** A partial mapping from known languages to their specific setup information. */
const languageSetups: LanguageSetups = {
  javascript: {
    specProperty: "installNode",
    steps: [
      {
        name: "Install Node.js",
        uses: "actions/setup-node@v6",
        with: {
          "node-version": defaultLanguageVersions.javascript,
          cache: "npm",
        },
      },
      {
        name: "Install dependencies",
        run: "npm ci",
      },
    ],
  },
  go: {
    specProperty: "installGo",
    inputs: {
      [KnownInputName.GoVersion]: {
        type: "string",
        description: "The version of Go to install",
        required: false,
        default: defaultLanguageVersions.go,
      },
    },
    steps: [
      {
        name: "Install Go",
        uses: "actions/setup-go@v6",
        with: {
          "go-version":
            "${{ inputs.go-version || '" + defaultLanguageVersions.go + "' }}",
          // to avoid potentially misleading autobuilder results where we expect it to download
          // dependencies successfully, but they actually come from a warm cache
          cache: false,
        },
      },
    ],
  },
  java: {
    specProperty: "installJava",
    inputs: {
      [KnownInputName.JavaVersion]: {
        type: "string",
        description: "The version of Java to install",
        required: false,
        default: defaultLanguageVersions.java,
      },
    },
    steps: [
      {
        name: "Install Java",
        uses: "actions/setup-java@v5",
        with: {
          "java-version":
            "${{ inputs.java-version || '" +
            defaultLanguageVersions.java +
            "' }}",
          distribution: "temurin",
        },
      },
    ],
  },
  python: {
    specProperty: "installPython",
    inputs: {
      [KnownInputName.PythonVersion]: {
        type: "string",
        description: "The version of Python to install",
        required: false,
        default: defaultLanguageVersions.python,
      },
    },
    steps: [
      {
        name: "Install Python",
        if: "matrix.version != 'nightly-latest'",
        uses: "actions/setup-python@v6",
        with: {
          "python-version":
            "${{ inputs.python-version || '" +
            defaultLanguageVersions.python +
            "' }}",
        },
      },
    ],
  },
  csharp: {
    specProperty: "installDotNet",
    inputs: {
      [KnownInputName.DotnetVersion]: {
        type: "string",
        description: "The version of .NET to install",
        required: false,
        default: defaultLanguageVersions.csharp,
      },
    },
    steps: [
      {
        name: "Install .NET",
        uses: "actions/setup-dotnet@v5",
        with: {
          "dotnet-version":
            "${{ inputs.dotnet-version || '" +
            defaultLanguageVersions.csharp +
            "' }}",
        },
      },
    ],
  },
};

// This is essentially an arbitrary version of `yq`, which happened to be the one that
// `choco` fetched when we moved away from using that here.
// See https://github.com/github/codeql-action/pull/3423
const YQ_VERSION = "v4.50.1";

const THIS_DIR = __dirname;
const CHECKS_DIR = path.join(THIS_DIR, "checks");
const OUTPUT_DIR = path.join(THIS_DIR, "..", ".github", "workflows");

/**
 * Loads and parses a YAML file.
 */
function loadYaml(filePath: string): yaml.Document {
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.parseDocument(content);
}

/**
 * Serialize a value to YAML and write it to a file, prepended with the
 * standard header comment.
 */
function writeYaml(filePath: string, workflow: any): void {
  const header = `# Warning: This file is generated automatically, and should not be modified.
# Instead, please modify the template in the pr-checks directory and run:
#     pr-checks/sync.sh
# to regenerate this file.

`;
  const workflowDoc = new yaml.Document(workflow, {
    aliasDuplicateObjects: false,
  });
  const yamlStr = yaml.stringify(workflowDoc, {
    aliasDuplicateObjects: false,
    singleQuote: true,
    lineWidth: 0,
  });
  fs.writeFileSync(filePath, stripTrailingWhitespace(header + yamlStr), "utf8");
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

/** Generates the matrix for a job. */
function generateJobMatrix(
  checkSpecification: Specification,
): Array<Record<string, any>> {
  let matrix: Array<Record<string, any>> = [];

  for (const version of checkSpecification.versions ?? defaultTestVersions) {
    if (version === "latest") {
      throw new Error(
        'Did not recognise "version: latest". Did you mean "version: linked"?',
      );
    }

    const runnerImages = ["ubuntu-latest", "macos-latest", "windows-latest"];
    const operatingSystems = checkSpecification.operatingSystems ?? ["ubuntu"];

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

  if (checkSpecification.analysisKinds) {
    const newMatrix: Array<Record<string, any>> = [];
    for (const matrixInclude of matrix) {
      for (const analysisKind of checkSpecification.analysisKinds) {
        newMatrix.push({
          ...matrixInclude,
          "analysis-kinds": analysisKind,
        });
      }
    }
    matrix = newMatrix;
  }

  return matrix;
}

/**
 * Retrieves setup steps and additional input definitions based on specific languages or frameworks
 * that are requested by the `checkSpecification`.
 *
 * @returns An object containing setup steps and additional input specifications.
 */
function getSetupSteps(checkSpecification: Specification): {
  inputs: WorkflowInputs;
  steps: any[];
} {
  let inputs: WorkflowInputs = {};
  const steps = [];

  for (const language of Object.values(KnownLanguage).sort()) {
    const setupSpec = languageSetups[language];

    if (
      setupSpec === undefined ||
      checkSpecification[setupSpec.specProperty] === undefined
    ) {
      continue;
    }

    steps.push(...setupSpec.steps);
    inputs = { ...inputs, ...setupSpec.inputs };
  }

  const installYq = checkSpecification.installYq;

  if (installYq) {
    steps.push({
      name: "Install yq",
      if: "runner.os == 'Windows'",
      env: {
        YQ_PATH: "${{ runner.temp }}/yq",
        YQ_VERSION,
      },
      run:
        'gh release download --repo mikefarah/yq --pattern "yq_windows_amd64.exe" "$YQ_VERSION" -O "$YQ_PATH/yq.exe"\n' +
        'echo "$YQ_PATH" >> "$GITHUB_PATH"',
    });
  }

  return { inputs, steps };
}

/**
 * Generates an Actions job from the `checkSpecification`.
 *
 * @param specDocument
 * The raw YAML document of the PR check specification.
 * Used to extract `jobs` without losing the original formatting.
 * @param checkSpecification The PR check specification.
 * @returns The job and additional workflow inputs.
 */
function generateJob(
  specDocument: yaml.Document,
  checkSpecification: Specification,
) {
  const matrix: Array<Record<string, any>> =
    generateJobMatrix(checkSpecification);

  const useAllPlatformBundle = checkSpecification.useAllPlatformBundle
    ? checkSpecification.useAllPlatformBundle
    : "false";

  // Determine which languages or frameworks have to be installed.
  const setupInfo = getSetupSteps(checkSpecification);
  const workflowInputs = setupInfo.inputs;

  // Construct the workflow steps needed for this check.
  const steps: any[] = [
    {
      name: "Check out repository",
      uses: "actions/checkout@v6",
    },
    {
      name: "Prepare test",
      id: "prepare-test",
      uses: "./.github/actions/prepare-test",
      with: {
        version: "${{ matrix.version }}",
        "use-all-platform-bundle": useAllPlatformBundle,
        // If the action is being run from a container, then do not setup kotlin.
        // This is because the kotlin binaries cannot be downloaded from the container.
        "setup-kotlin": "container" in checkSpecification ? "false" : "true",
      },
    },
    ...setupInfo.steps,
  ];

  // Extract the sequence of steps from the YAML document to persist as much formatting as possible.
  const specSteps = specDocument.get("steps") as yaml.YAMLSeq;

  // A handful of workflow specifications use double quotes for values, while we generally use single quotes.
  // This replaces double quotes with single quotes for consistency.
  yaml.visit(specSteps, {
    Scalar(_key, node) {
      if (node.type === "QUOTE_DOUBLE") {
        node.type = "QUOTE_SINGLE";
      }
    },
  });

  // Add the generated steps in front of the ones from the specification.
  specSteps.items.unshift(...steps);

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
    steps: specSteps,
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

  return { checkJob, workflowInputs };
}

/** Generates a validation job. */
function generateValidationJob(
  specDocument: yaml.Document,
  jobSpecification: JobSpecification,
  checkName: string,
  name: string,
) {
  // Determine which languages or frameworks have to be installed.
  const { inputs, steps } = getSetupSteps(jobSpecification);

  // Extract the sequence of steps from the YAML document to persist as much formatting as possible.
  const specSteps = specDocument.getIn([
    "validationJobs",
    name,
    "steps",
  ]) as yaml.YAMLSeq;

  // Add the generated steps in front of the ones from the specification.
  specSteps.items.unshift(...steps);

  const validationJob: Record<string, any> = {
    name: jobSpecification.name,
    if: "github.triggering_actor != 'dependabot[bot]'",
    needs: [checkName],
    permissions: {
      contents: "read",
      "security-events": "read",
    },
    "timeout-minutes": 5,
    "runs-on": "ubuntu-slim",
    steps: specSteps,
  };

  if (jobSpecification.permissions) {
    validationJob.permissions = jobSpecification.permissions;
  }

  for (const key of ["env"] as const) {
    if (jobSpecification[key] !== undefined) {
      validationJob[key] = jobSpecification[key];
    }
  }

  validationJob.env = validationJob.env ?? {};
  if (!("CODEQL_ACTION_TEST_MODE" in validationJob.env)) {
    validationJob.env.CODEQL_ACTION_TEST_MODE = true;
  }

  return { validationJob, inputs };
}

/** Generates additional jobs that run after the main check job, based on the `validationJobs` property. */
function generateValidationJobs(
  specDocument: yaml.Document,
  checkSpecification: Specification,
  checkName: string,
): Record<string, any> {
  if (checkSpecification.validationJobs === undefined) {
    return {};
  }

  const validationJobs: Record<string, any> = {};
  let workflowInputs: WorkflowInputs = {};

  for (const [jobName, jobSpec] of Object.entries(
    checkSpecification.validationJobs,
  )) {
    if (checkName === jobName) {
      throw new Error(
        `Validation job '${jobName}' cannot have the same name as the main job.`,
      );
    }

    const { validationJob, inputs } = generateValidationJob(
      specDocument,
      jobSpec,
      checkName,
      jobName,
    );
    validationJobs[jobName] = validationJob;
    workflowInputs = { ...workflowInputs, ...inputs };
  }

  return { validationJobs, workflowInputs };
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

  const collections: Record<
    string,
    Array<{
      specification: Specification;
      checkName: string;
      inputs: Record<string, WorkflowInput>;
    }>
  > = {};

  for (const file of checkFiles) {
    const checkName = path.basename(file, ".yml");
    const specDocument = loadYaml(file);
    const checkSpecification = specDocument.toJS() as Specification;

    console.log(`Processing: ${checkName} — "${checkSpecification.name}"`);

    const { checkJob, workflowInputs } = generateJob(
      specDocument,
      checkSpecification,
    );
    const { validationJobs, validationJobInputs } = generateValidationJobs(
      specDocument,
      checkSpecification,
      checkName,
    );
    const combinedInputs = { ...workflowInputs, ...validationJobInputs };

    // If this check belongs to a named collection, record it.
    if (checkSpecification.collection) {
      const collectionName = checkSpecification.collection;
      if (!collections[collectionName]) {
        collections[collectionName] = [];
      }
      collections[collectionName].push({
        specification: checkSpecification,
        checkName,
        inputs: combinedInputs,
      });
    }

    let extraGroupName = "";
    for (const inputName of Object.keys(combinedInputs)) {
      extraGroupName += "-${{inputs." + inputName + "}}";
    }

    const cron = new yaml.Scalar("0 5 * * *");
    cron.type = yaml.Scalar.QUOTE_SINGLE;

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
        schedule: [{ cron }],
        workflow_dispatch: {
          inputs: combinedInputs,
        },
        workflow_call: {
          inputs: combinedInputs,
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
        ...validationJobs,
      },
    };

    const outputPath = path.join(OUTPUT_DIR, `__${checkName}.yml`);
    writeYaml(outputPath, workflow);
  }

  // Write workflow files for collections.
  for (const collectionName of Object.keys(collections)) {
    const jobs: Record<string, any> = {};
    let combinedInputs: Record<string, WorkflowInput> = {};

    for (const check of collections[collectionName]) {
      const { checkName, specification, inputs: checkInputs } = check;
      const checkWith: Record<string, string> = {};

      combinedInputs = { ...combinedInputs, ...checkInputs };

      for (const inputName of Object.keys(checkInputs)) {
        checkWith[inputName] = "${{ inputs." + inputName + " }}";
      }

      jobs[checkName] = {
        name: specification.name,
        permissions: {
          contents: "read",
          "security-events": "read",
        },
        uses: `./.github/workflows/__${checkName}.yml`,
        with: checkWith,
      };
    }

    const collectionWorkflow = {
      name: `Manual Check - ${collectionName}`,
      env: {
        GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
        GO111MODULE: "auto",
      },
      on: {
        workflow_dispatch: {
          inputs: combinedInputs,
        },
      },
      jobs,
    };

    const outputPath = path.join(OUTPUT_DIR, `__${collectionName}.yml`);
    writeYaml(outputPath, collectionWorkflow);
  }

  console.log(
    `\nDone. Wrote ${checkFiles.length} workflow file(s) to ${OUTPUT_DIR}`,
  );
}

main();
