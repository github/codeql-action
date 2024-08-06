"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDeclaredInFile = typeDeclaredInFile;
const typescript_estree_1 = require("@typescript-eslint/typescript-estree");
const path_1 = __importDefault(require("path"));
function typeDeclaredInFile(relativePath, declarationFiles, program) {
    if (relativePath === undefined) {
        const cwd = (0, typescript_estree_1.getCanonicalFileName)(program.getCurrentDirectory());
        return declarationFiles.some(declaration => (0, typescript_estree_1.getCanonicalFileName)(declaration.fileName).startsWith(cwd));
    }
    const absolutePath = (0, typescript_estree_1.getCanonicalFileName)(path_1.default.join(program.getCurrentDirectory(), relativePath));
    return declarationFiles.some(declaration => (0, typescript_estree_1.getCanonicalFileName)(declaration.fileName) === absolutePath);
}
//# sourceMappingURL=typeDeclaredInFile.js.map