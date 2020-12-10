import * as core from "@actions/core";

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import * as actionsUtil from "./actions-util";
import * as config_utils from "./config-utils";
import { getActionsLogger } from "./logging";
import * as util from "./util";

async function run() {
  const logger = getActionsLogger();
  try {
    actionsUtil.prepareLocalRunEnvironment();

    const config = await config_utils.getConfig(
      actionsUtil.getRequiredEnvParam("RUNNER_TEMP"),
      logger
    );
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }

    for (const language of config.languages) {
      const dbPath = util.getCodeQLDatabasePath(config.tempDir, language);
      let relDir = path.join(dbPath, `db-${language}`, "default");
      let combined_all = crypto.createHash("sha256");
      let combined_noExtractionTime = crypto.createHash("sha256");
      let files: {
        [name: string]: string;
      } = {};
      let relFiles = fs
        .readdirSync(relDir)
        .filter((n) => n.endsWith(".rel"))
        .map((n) => path.join(relDir, n));
      if (relFiles.length === 0) {
        throw new Error(
          `No '.rel' files found in ${relDir}. Has the 'create-database' action been called?`
        );
      }
      for (const relFile of relFiles) {
        let content = fs.readFileSync(relFile); // XXX this ought to be chunked for large tables!
        let solo = crypto.createHash("sha256");
        solo.update(content);
        files[path.relative(dbPath, relFile)] = solo.digest("hex");
        if (
          language === "javascript" &&
          path.basename(relFile) !== "extraction_time.rel"
        ) {
          combined_noExtractionTime.update(content);
        }
        combined_all.update(content);
      }
      let stableHash = combined_noExtractionTime.digest("hex");
      logger.info(
        JSON.stringify(
          {
            language,
            combined: {
              all: combined_all.digest("hex"),
              noExtractionTime: stableHash,
              files,
            },
          },
          null,
          2
        )
      );
      core.setOutput("hash", stableHash);
    }
  } catch (error) {
    core.setFailed(`We were unable to hash the database.  ${error.message}`);
    console.log(error);
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`hash-database action failed. ${error}`);
    console.log(error);
  }
}

void runWrapper();
