import { getCodeQL } from "./codeql";
import { Logger } from "./logging";

export async function runResolveBuildEnvironment(
  cmd: string,
  logger: Logger,
  workingDir: string | undefined,
  language: string,
) {
  logger.startGroup(`Attempting to resolve build environment for ${language}`);

  const codeql = await getCodeQL(cmd);

  if (workingDir !== undefined) {
    logger.info(`Using ${workingDir} as the working directory.`);
  }

  const result = await codeql.resolveBuildEnvironment(workingDir, language);

  logger.endGroup();
  return result;
}
