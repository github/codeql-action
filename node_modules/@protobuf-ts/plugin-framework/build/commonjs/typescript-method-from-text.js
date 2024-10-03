"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.typescriptMethodFromText = void 0;
const ts = require("typescript");
const typescript_comments_1 = require("./typescript-comments");
/**
 * Provide a function statement as plain text, receive a
 * method declaration.
 */
function typescriptMethodFromText(functionText) {
    const sourceFile = ts.createSourceFile('temp.ts', functionText, ts.ScriptTarget.Latest);
    if (sourceFile.statements.length !== 1) {
        throw new Error('Expected exactly one statement, got ' + sourceFile.statements.length);
    }
    const node = sourceFile.statements[0];
    if (!ts.isFunctionDeclaration(node)) {
        throw new Error('Expected a function declaration');
    }
    if (node.name === undefined) {
        throw new Error('function needs a name');
    }
    const method = ts.createMethod(node.decorators /*decorators*/, node.modifiers /*modifiers*/, node.asteriskToken /*asteriskToken*/, node.name, node.questionToken /*questionToken*/, node.typeParameters /*typeParameters*/, node.parameters, node.type /*return type*/, node.body);
    ts.forEachLeadingCommentRange(functionText, node.getFullStart(), (pos, end) => {
        let text = functionText.substring(pos, end);
        text = text.trim();
        if (text.startsWith('/*'))
            text = text.substring(2);
        if (text.endsWith('*/'))
            text = text.substring(0, text.length - 2);
        text = text.split('\n').map(l => l.replace(/^\s*\*/, '')).join('\n');
        text = text.trim();
        typescript_comments_1.addCommentBlockAsJsDoc(method, text);
    });
    return method;
}
exports.typescriptMethodFromText = typescriptMethodFromText;
