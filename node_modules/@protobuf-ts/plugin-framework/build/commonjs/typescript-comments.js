"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCommentBlockAsJsDoc = exports.addCommentBlocksAsLeadingDetachedLines = void 0;
const ts = require("typescript");
/**
 * Adds multiple comment blocks as line comments
 * in front of the given node.
 *
 * Applies a dirty hack to enforce newlines
 * between each block.
 */
function addCommentBlocksAsLeadingDetachedLines(node, ...texts) {
    for (let text of texts) {
        let lines = text.split('\n').map(l => l[0] !== ' ' ? ` ${l}` : l);
        for (let j = 0; j < lines.length; j++) {
            const line = lines[j];
            if (j === lines.length - 1) {
                ts.addSyntheticLeadingComment(node, ts.SyntaxKind.SingleLineCommentTrivia, line + '\n\n', false);
            }
            else {
                ts.addSyntheticLeadingComment(node, ts.SyntaxKind.SingleLineCommentTrivia, line, true);
            }
        }
    }
}
exports.addCommentBlocksAsLeadingDetachedLines = addCommentBlocksAsLeadingDetachedLines;
/**
 * Adds a JSDoc comment block in front of the given node.
 *
 * A JSDoc comment looks like this:
 *   /**
 *    * body text
 *    *\/
 *
 * A regular block comment looks like this:
 *   /* body text *\/
 *
 */
function addCommentBlockAsJsDoc(node, text) {
    let lines = text
        .split('\n')
        .map(line => {
        if (line[0] === ' ') {
            return ' *' + line;
        }
        return ' * ' + line;
    });
    text = '*\n' + lines.join('\n') + '\n ';
    text = text.split('*/').join('*\\/'); // need to escape a comment in the comment
    ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, text, true);
}
exports.addCommentBlockAsJsDoc = addCommentBlockAsJsDoc;
