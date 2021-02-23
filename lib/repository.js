"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRepositoryNwo = void 0;
function parseRepositoryNwo(input) {
    const parts = input.split("/");
    if (parts.length !== 2) {
        throw new Error(`"${input}" is not a valid repository name`);
    }
    return {
        owner: parts[0],
        repo: parts[1],
    };
}
exports.parseRepositoryNwo = parseRepositoryNwo;
//# sourceMappingURL=repository.js.map