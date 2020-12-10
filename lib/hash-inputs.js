"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseHash = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const languages_1 = require("./languages");
async function DatabaseHash(language, dbPath, logger) {
    let relDir = path.join(dbPath, `db-${language}`, "default");
    let combined_all = crypto.createHash("sha256");
    let combined_noExtractionTime = crypto.createHash("sha256");
    let files = {};
    let relFiles = fs
        .readdirSync(relDir)
        .filter((n) => n.endsWith(".rel"))
        .map((n) => path.join(relDir, n));
    if (relFiles.length === 0) {
        throw new Error(`No '.rel' files found in ${relDir}. Has the 'create-database' action been called?`);
    }
    for (const relFile of relFiles) {
        let content = fs.readFileSync(relFile); // XXX this ought to be chunked for large tables!
        let solo = crypto.createHash("sha256");
        solo.update(content);
        files[path.relative(dbPath, relFile)] = solo.digest("hex");
        if (language === languages_1.Language.javascript &&
            path.basename(relFile) !== "extraction_time.rel") {
            combined_noExtractionTime.update(content);
        }
        combined_all.update(content);
    }
    let stableHash = combined_noExtractionTime.digest("hex");
    logger.info("database-hash:");
    logger.info(JSON.stringify({
        language,
        combined: {
            all: combined_all.digest("hex"),
            noExtractionTime: stableHash,
            files,
        },
    }, null, 2));
    return stableHash;
}
exports.DatabaseHash = DatabaseHash;
//# sourceMappingURL=hash-inputs.js.map