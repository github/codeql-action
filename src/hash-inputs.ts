import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import { Language } from "./languages";
import { Logger } from "./logging";

export async function DatabaseHash(
    language: Language,
      dbPath: string,
      logger: Logger
    ): Promise<string> {
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
        language === Language.javascript &&
        path.basename(relFile) !== "extraction_time.rel"
      ) {
        combined_noExtractionTime.update(content);
      }
      combined_all.update(content);
    }
    let stableHash = combined_noExtractionTime.digest("hex");
    logger.info("database-hash:");
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
    return stableHash;
  }