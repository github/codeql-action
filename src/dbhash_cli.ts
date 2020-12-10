import {DatabaseHash} from "./hash-inputs";
import {getRunnerLogger} from "./logging";
import {Language} from "./languages";

const dbPath = process.argv[2];
const logger = getRunnerLogger(true);

/* TODO: Do we need to unboundle here or before? */
const stableHash = DatabaseHash(
    Language.javascript,
    dbPath,
    logger
);

stableHash.then(function (v:string) {
    logger.info(`stableHash: ${v}`);
});
