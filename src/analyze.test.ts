import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import { CommandInvocationError } from "./actions-util";
import { CodeQuality, CodeScanning, RiskAssessment } from "./analyses";
import {
  runQueries,
  resolveQuerySuiteAlias,
  addSarifExtension,
  diffRangeExtensionPackContents,
  determineCheckoutPath,
  runFinalize,
} from "./analyze";
import {
  CliConfigurationError,
  CliError,
  wrapCliConfigurationError,
} from "./cli-errors";
import { createStubCodeQL } from "./codeql";
import { defaultSuites } from "./config/db-config";
import { Feature } from "./feature-flags";
import * as gitUtils from "./git-utils";
import { BuiltInLanguage, type Language } from "./languages";
import {
  setupTests,
  setupActionsVars,
  createFeatures,
  createTestConfig,
  RecordingLogger,
  callee,
} from "./testing-utils";
import * as uploadLib from "./upload-lib";
import * as util from "./util";

setupTests(test);

test.serial(
  "determineCheckoutPath - logs when checkout_path is not in a work tree",
  async (t) => {
    const expectedPath = path.resolve("/checkout/path");
    const target = callee(determineCheckoutPath)
      .withActions((actions) => {
        sinon
          .stub(actions, "getRequiredInput")
          .withArgs("checkout_path")
          .returns(expectedPath);
      })
      .withArgs(createTestConfig({}));
    sinon.stub(gitUtils, "getGitRoot").resolves(undefined);

    await target
      .logs(t, "is not in the work tree of a git repository")
      .passes(t.is, expectedPath);
  },
);

test.serial(
  "determineCheckoutPath - logs when checkout_path is not a repo root",
  async (t) => {
    const expectedPath = path.resolve("/checkout/path");
    const target = callee(determineCheckoutPath)
      .withActions((actions) => {
        sinon
          .stub(actions, "getRequiredInput")
          .withArgs("checkout_path")
          .returns(expectedPath);
      })
      .withArgs(createTestConfig({}));
    sinon.stub(gitUtils, "getGitRoot").resolves("/checkout");

    await target
      .logs(t, "is not the root of the repository")
      .passes(t.is, expectedPath);
  },
);

test.serial(
  "determineCheckoutPath - logs when checkout_path is not the same as repo root in config",
  async (t) => {
    const expectedPath = path.resolve("/checkout/path");
    const target = callee(determineCheckoutPath)
      .withActions((actions) => {
        sinon
          .stub(actions, "getRequiredInput")
          .withArgs("checkout_path")
          .returns(expectedPath);
      })
      .withArgs(createTestConfig({ repositoryRoot: "/some/other/path" }));
    sinon.stub(gitUtils, "getGitRoot").resolves(expectedPath);

    await target
      .logs(t, "does not match that found by the 'codeql-action/init' step")
      .passes(t.is, expectedPath);
  },
);

test.serial(
  "determineCheckoutPath - doesn't log any of the messages when all is as expected",
  async (t) => {
    const expectedPath = path.resolve("/checkout/path");
    const target = callee(determineCheckoutPath)
      .withActions((actions) => {
        sinon
          .stub(actions, "getRequiredInput")
          .withArgs("checkout_path")
          .returns(expectedPath);
      })
      .withArgs(createTestConfig({ repositoryRoot: expectedPath }));
    sinon.stub(gitUtils, "getGitRoot").resolves(expectedPath);

    await target
      .notLogs(
        t,
        "is not in the work tree of a git repository",
        "is not the root of the repository",
        "does not match that found by the 'codeql-action/init' step",
      )
      .passes(t.is, expectedPath);
  },
);

/**
 * Checks the status report produced by the analyze Action.
 *
 * - Checks that the duration fields are populated for the correct language.
 * - Checks that the QA telemetry status report fields are populated when the QA feature flag is enabled.
 */
test.serial("status report fields", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const memoryFlag = "";
    const threadsFlag = "";
    sinon.stub(uploadLib, "validateSarifFileSchema");

    for (const language of Object.values(BuiltInLanguage)) {
      const codeql = createStubCodeQL({
        databaseRunQueries: async () => {},
        databaseInterpretResults: async (
          _db: string,
          _queriesRun: string[],
          sarifFile: string,
        ) => {
          fs.writeFileSync(
            sarifFile,
            JSON.stringify({
              runs: [
                // references a rule with the lines-of-code tag, so baseline should be injected
                {
                  tool: {
                    extensions: [
                      {
                        rules: [
                          {
                            properties: {
                              tags: ["lines-of-code"],
                            },
                          },
                        ],
                      },
                    ],
                  },
                  properties: {
                    metricResults: [
                      {
                        rule: {
                          index: 0,
                          toolComponent: {
                            index: 0,
                          },
                        },
                        value: 123,
                      },
                    ],
                  },
                },
                {},
              ],
            }),
          );
          return "";
        },
      });

      const config = createTestConfig({
        languages: [language],
        tempDir: tmpDir,
        dbLocation: path.resolve(tmpDir, "codeql_databases"),
      });
      fs.mkdirSync(util.getCodeQLDatabasePath(config, language), {
        recursive: true,
      });

      const statusReport = await runQueries(
        tmpDir,
        memoryFlag,
        threadsFlag,
        undefined,
        undefined,
        codeql,
        config,
        new RecordingLogger(),
        createFeatures([Feature.QaTelemetryEnabled]),
      );
      t.deepEqual(Object.keys(statusReport).sort(), [
        "analysis_builds_overlay_base_database",
        "analysis_is_diff_informed",
        "analysis_is_overlay",
        `analyze_builtin_queries_${language}_duration_ms`,
        "event_reports",
        `interpret_results_${language}_duration_ms`,
      ]);
      for (const eventReport of statusReport.event_reports!) {
        t.deepEqual(eventReport.event, "codeql database interpret-results");
        t.true("properties" in eventReport);
        t.true("alertCounts" in eventReport.properties!);
      }
    }
  });
});

test("resolveQuerySuiteAlias", (t) => {
  // default query suite names should resolve to something language-specific ending in `.qls`.
  for (const suite of defaultSuites) {
    const resolved = resolveQuerySuiteAlias(BuiltInLanguage.go, suite);
    t.assert(
      path.extname(resolved) === ".qls",
      "Resolved default suite doesn't end in .qls",
    );
    t.assert(
      resolved.indexOf(BuiltInLanguage.go) >= 0,
      "Resolved default suite doesn't contain language name",
    );
  }

  // other inputs should be returned unchanged
  const names = ["foo", "bar", "codeql/go-queries@1.0"];

  for (const name of names) {
    t.deepEqual(resolveQuerySuiteAlias(BuiltInLanguage.go, name), name);
  }
});

test("addSarifExtension", (t) => {
  for (const language of Object.values(BuiltInLanguage)) {
    t.deepEqual(addSarifExtension(CodeScanning, language), `${language}.sarif`);
    t.deepEqual(
      addSarifExtension(CodeQuality, language),
      `${language}.quality.sarif`,
    );
    t.is(addSarifExtension(RiskAssessment, language), `${language}.csra.sarif`);
  }
});

test("diffRangeExtensionPackContents", (t) => {
  const output = diffRangeExtensionPackContents(
    [
      {
        path: "main.js",
        startLine: 10,
        endLine: 20,
      },
    ],
    "/checkout/path",
  );

  const expected = fs.readFileSync(
    `${__dirname}/../src/testdata/pr-diff-range.yml`,
    "utf8",
  );
  t.deepEqual(output, expected);
});

/**
 * Runs `runFinalize` for databases of `languages`. Finalization fails with a
 * no-source-code-seen error for each language in `languagesWithoutSourceCode`.
 */
function runFinalizeWithoutSourceCode(
  tmpDir: string,
  {
    languages,
    languagesWithoutSourceCode,
    languagesAutodetected,
    tracedLanguages = [],
  }: {
    languages: Language[];
    languagesWithoutSourceCode: Language[];
    languagesAutodetected: boolean;
    tracedLanguages?: Language[];
  },
) {
  const config = createTestConfig({
    languages,
    languagesAutodetected,
    dbLocation: path.join(tmpDir, "dbs"),
    tempDir: tmpDir,
  });
  for (const language of languages) {
    const dbPath = util.getCodeQLDatabasePath(config, language);
    fs.mkdirSync(dbPath, { recursive: true });
    fs.writeFileSync(
      path.join(dbPath, "codeql-database.yml"),
      "inProgress: true\n",
    );
  }
  const codeql = createStubCodeQL({
    isTracedLanguage: async (language) => tracedLanguages.includes(language),
    isScannedLanguage: async (language) => !tracedLanguages.includes(language),
    extractScannedLanguage: async () => {},
    finalizeDatabase: async (databasePath) => {
      const language = path.basename(databasePath);
      if (languagesWithoutSourceCode.includes(language)) {
        throw wrapCliConfigurationError(
          new CliError(
            new CommandInvocationError(
              "codeql",
              ["database", "finalize", databasePath],
              32,
              `CodeQL detected code written in JavaScript/TypeScript, but not any written in ${language}.`,
            ),
          ),
        );
      }
    },
  });
  const logger = new RecordingLogger(false);
  const finalize = runFinalize(
    createFeatures([]),
    path.join(tmpDir, "output"),
    "--threads=1",
    "--ram=2048",
    codeql,
    config,
    logger,
  );
  return { config, logger, finalize };
}

test.serial(
  "runFinalize skips autodetected languages without source code",
  async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      const { config, logger, finalize } = runFinalizeWithoutSourceCode(
        tmpDir,
        {
          languages: [BuiltInLanguage.javascript, BuiltInLanguage.ruby],
          languagesWithoutSourceCode: [BuiltInLanguage.ruby],
          languagesAutodetected: true,
        },
      );
      await finalize;
      t.deepEqual(config.languages, [BuiltInLanguage.javascript]);
      t.true(
        logger.hasMessage(
          "Skipping analysis of ruby: CodeQL found no ruby source code in the checkout.",
        ),
      );
    });
  },
);

test.serial(
  "runFinalize fails for languages from the input without source code",
  async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      const { finalize } = runFinalizeWithoutSourceCode(tmpDir, {
        languages: [BuiltInLanguage.javascript, BuiltInLanguage.ruby],
        languagesWithoutSourceCode: [BuiltInLanguage.ruby],
        languagesAutodetected: false,
      });
      await t.throwsAsync(finalize, {
        instanceOf: CliConfigurationError,
        message: /but not any written in ruby/,
      });
    });
  },
);

test.serial(
  "runFinalize fails for autodetected traced languages without source code",
  async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      const { finalize } = runFinalizeWithoutSourceCode(tmpDir, {
        languages: [BuiltInLanguage.javascript, BuiltInLanguage.go],
        languagesWithoutSourceCode: [BuiltInLanguage.go],
        languagesAutodetected: true,
        tracedLanguages: [BuiltInLanguage.go],
      });
      await t.throwsAsync(finalize, {
        instanceOf: CliConfigurationError,
        message: /but not any written in go/,
      });
    });
  },
);

test.serial(
  "runFinalize fails when no autodetected language has source code",
  async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      const { finalize } = runFinalizeWithoutSourceCode(tmpDir, {
        languages: [BuiltInLanguage.javascript, BuiltInLanguage.ruby],
        languagesWithoutSourceCode: [
          BuiltInLanguage.javascript,
          BuiltInLanguage.ruby,
        ],
        languagesAutodetected: true,
      });
      await t.throwsAsync(finalize, {
        instanceOf: CliConfigurationError,
        message: /but not any written in javascript/,
      });
    });
  },
);
