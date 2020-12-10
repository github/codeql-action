"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hash_inputs_1 = require("./hash-inputs");
const logging_1 = require("./logging");
const languages_1 = require("./languages");
const dbPath = process.argv[2];
const logger = logging_1.getRunnerLogger(true);
/* TODO: Do we need to unboundle here or before? */
const stableHash = hash_inputs_1.DatabaseHash(languages_1.Language.javascript, dbPath, logger);
stableHash.then(function (v) {
    logger.info(`stableHash: ${v}`);
});
//# sourceMappingURL=dbhash_cli.js.map