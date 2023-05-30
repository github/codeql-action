import { getCodeQL } from "./codeql";
import { Language } from "./languages";
import { Logger } from "./logging";

export async function runResolveBuildEnvironment(
  cmd: string,
  logger: Logger,
  language: Language
) {
  logger.startGroup(`Attempting to resolve build environment for ${language}`);
  const codeQL = await getCodeQL(cmd);
  const result = await codeQL.resolveBuildEnvironment(language);
  logger.endGroup();
  return result;
}
