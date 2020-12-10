import * as core from "@actions/core";


import * as actionsUtil from "./actions-util";
import * as config_utils from "./config-utils";
import { getActionsLogger, Logger } from "./logging";
import * as util from "./util";
import { Language } from "./languages";
import {DatabaseHash} from "./hash-inputs"

async function getCodeQLHash(_config: config_utils.Config) {
  return "DUMMY_CODEQL_HASH";
}

async function getQueriesHash(
  _language: Language,
  config: config_utils.Config,
  logger: Logger
): Promise<string> {
  // Compute hash
  const globHash = require("glob-hash");
  const finalHash = await globHash({
    include: [
      // @esbena: isn't this a bit too aggressive? Could we select qlpack directories instead?
      `${config.tempDir}/**/.cache/data/**`,
      `${config.toolCacheDir}/**/.cache/data/**`,
    ],
    files: false, // MG: List matched files for debugging
  });
  logger.info(`queries-hash: ${finalHash}`);
  return finalHash;
}

async function getDatabaseHash(
  language: Language,
  config: config_utils.Config,
  logger: Logger
): Promise<string> {
  const dbPath = util.getCodeQLDatabasePath(config.tempDir, language);
  return DatabaseHash(language, dbPath, logger);
}

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
    let hashesByLanguage: {
      [language in keyof typeof Language]?: {
        queries: string;
        database: string;
        codeql: string;
      };
    } = {};
    for (const language of config.languages) {
      (hashesByLanguage as any) /* XXX circumvent aggressive typescript */[
        language
      ] = {
        queries: await getQueriesHash(language, config, logger),
        database: await getDatabaseHash(language, config, logger),
        codeql: getCodeQLHash(config),
      };
    }
    logger.info("hashes:");
    logger.info(JSON.stringify(hashesByLanguage, null, 2));
    core.setOutput("hashes", JSON.stringify(hashesByLanguage));
  } catch (error) {
    core.setFailed(`We were unable to hash the inputs.  ${error.message}`);
    console.log(error);
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`hash-inputs action failed. ${error}`);
    console.log(error);
  }
}

void runWrapper();
