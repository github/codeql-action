"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepositoryNwo = getRepositoryNwo;
exports.getRepositoryNwoFromEnv = getRepositoryNwoFromEnv;
exports.parseRepositoryNwo = parseRepositoryNwo;
const util_1 = require("./util");
/**
 * Get the repository name with owner from the environment variable
 * `GITHUB_REPOSITORY`.
 *
 * @returns The repository name with owner.
 */
function getRepositoryNwo() {
    return getRepositoryNwoFromEnv("GITHUB_REPOSITORY");
}
/**
 * Get the repository name with owner from the first environment variable that
 * is set and non-empty.
 *
 * @param envVarNames The names of the environment variables to check.
 * @returns The repository name with owner.
 * @throws ConfigurationError if none of the environment variables are set.
 */
function getRepositoryNwoFromEnv(...envVarNames) {
    const envVarName = envVarNames.find((name) => process.env[name]);
    if (!envVarName) {
        throw new util_1.ConfigurationError(`None of the env vars ${envVarNames.join(", ")} are set`);
    }
    return parseRepositoryNwo((0, util_1.getRequiredEnvParam)(envVarName));
}
function parseRepositoryNwo(input) {
    const parts = input.split("/");
    if (parts.length !== 2) {
        throw new util_1.ConfigurationError(`"${input}" is not a valid repository name`);
    }
    return {
        owner: parts[0],
        repo: parts[1],
    };
}
//# sourceMappingURL=repository.js.map