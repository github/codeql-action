import { getCodeQL } from "./codeql";
import { Language } from "./languages";
import { Logger } from "./logging";

export async function runResolveBuildEnvironment(
  cmd: string,
  logger: Logger,
  workingDir: string | undefined,
  language: Language
) {
  logger.startGroup(
    `Attempting to resolve build environment for ${language} in ${workingDir}`
  );
  const codeql = await getCodeQL(cmd);
  const result = await codeql.resolveBuildEnvironment(workingDir, language);
  logger.endGroup();
  return result;
}
