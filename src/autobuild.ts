import { getCodeQL } from './codeql';
import * as config_utils from './config-utils';
import { isTracedLanguage, Language } from './languages';
import { Logger } from './logging';

export async function runAutobuild(
  language: Language,
  tmpDir: string,
  logger: Logger) {

  if (!isTracedLanguage(language)) {
    throw new Error(`Cannot build "${language}" as it is not a traced language`);
  }

  const config = await config_utils.getConfig(tmpDir, logger);

  logger.startGroup(`Attempting to automatically build ${language} code`);
  const codeQL = getCodeQL(config.codeQLCmd);
  await codeQL.runAutobuild(language);
  logger.endGroup();
}
