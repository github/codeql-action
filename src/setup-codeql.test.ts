import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import { getRunnerLogger } from "./logging";
import * as setupCodeql from "./setup-codeql";
import { setupTests } from "./testing-utils";
import { initializeEnvironment } from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
});

test("parse codeql bundle url version", (t) => {
  t.deepEqual(
    setupCodeql.getCodeQLURLVersion(
      "https://github.com/.../codeql-bundle-20200601/..."
    ),
    "20200601"
  );
});

test("convert to semver", (t) => {
  const tests = {
    "20200601": "0.0.0-20200601",
    "20200601.0": "0.0.0-20200601.0",
    "20200601.0.0": "20200601.0.0",
    "1.2.3": "1.2.3",
    "1.2.3-alpha": "1.2.3-alpha",
    "1.2.3-beta.1": "1.2.3-beta.1",
  };

  for (const [version, expectedVersion] of Object.entries(tests)) {
    try {
      const parsedVersion = setupCodeql.convertToSemVer(
        version,
        getRunnerLogger(true)
      );
      t.deepEqual(parsedVersion, expectedVersion);
    } catch (e) {
      t.fail(e instanceof Error ? e.message : String(e));
    }
  }
});

test("getCodeQLActionRepository", (t) => {
  const logger = getRunnerLogger(true);

  initializeEnvironment("1.2.3");

  // isRunningLocalAction() === true
  delete process.env["GITHUB_ACTION_REPOSITORY"];
  process.env["RUNNER_TEMP"] = path.dirname(__dirname);
  const repoLocalRunner = setupCodeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoLocalRunner, "github/codeql-action");

  // isRunningLocalAction() === false
  sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
  process.env["GITHUB_ACTION_REPOSITORY"] = "xxx/yyy";
  const repoEnv = setupCodeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoEnv, "xxx/yyy");
});

test("findCodeQLBundleTagDotcomOnly() matches GitHub Release with marker file", async (t) => {
  // Look for GitHub Releases in github/codeql-action
  sinon.stub(actionsUtil, "isRunningLocalAction").resolves(true);
  sinon.stub(api, "getApiClient").value(() => ({
    repos: {
      listReleases: sinon.stub().resolves(undefined),
    },
    paginate: sinon.stub().resolves([
      {
        assets: [
          {
            name: "cli-version-2.12.0.txt",
          },
        ],
        tag_name: "codeql-bundle-20230106",
      },
    ]),
  }));
  t.is(
    await setupCodeql.findCodeQLBundleTagDotcomOnly(
      "2.12.0",
      getRunnerLogger(true)
    ),
    "codeql-bundle-20230106"
  );
});

test("findCodeQLBundleTagDotcomOnly() errors if no GitHub Release matches marker file", async (t) => {
  // Look for GitHub Releases in github/codeql-action
  sinon.stub(actionsUtil, "isRunningLocalAction").resolves(true);
  sinon.stub(api, "getApiClient").value(() => ({
    repos: {
      listReleases: sinon.stub().resolves(undefined),
    },
    paginate: sinon.stub().resolves([
      {
        assets: [
          {
            name: "cli-version-2.12.0.txt",
          },
        ],
        tag_name: "codeql-bundle-20230106",
      },
    ]),
  }));
  await t.throwsAsync(
    async () =>
      await setupCodeql.findCodeQLBundleTagDotcomOnly(
        "2.12.1",
        getRunnerLogger(true)
      ),
    {
      message:
        "Failed to find a release of the CodeQL tools that contains CodeQL CLI 2.12.1.",
    }
  );
});
