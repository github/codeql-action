"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRepositoryNwo = parseRepositoryNwo;
const util_1 = require("./util");
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