"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@typescript-eslint/utils");
const ts = __importStar(require("typescript"));
const util_1 = require("../util");
const evenNumOfBackslashesRegExp = /(?<!(?:[^\\]|^)(?:\\\\)*\\)/;
// '\\$' <- false
// '\\\\$' <- true
// '\\\\\\$' <- false
function endsWithUnescapedDollarSign(str) {
    return new RegExp(`${String(evenNumOfBackslashesRegExp.source)}\\$$`).test(str);
}
exports.default = (0, util_1.createRule)({
    name: 'no-unnecessary-template-expression',
    meta: {
        fixable: 'code',
        type: 'suggestion',
        docs: {
            description: 'Disallow unnecessary template expressions',
            recommended: 'strict',
            requiresTypeChecking: true,
        },
        messages: {
            noUnnecessaryTemplateExpression: 'Template literal expression is unnecessary and can be simplified.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const services = (0, util_1.getParserServices)(context);
        function isUnderlyingTypeString(expression) {
            const type = (0, util_1.getConstrainedTypeAtLocation)(services, expression);
            const isString = (t) => {
                return (0, util_1.isTypeFlagSet)(t, ts.TypeFlags.StringLike);
            };
            if (type.isUnion()) {
                return type.types.every(isString);
            }
            if (type.isIntersection()) {
                return type.types.some(isString);
            }
            return isString(type);
        }
        function isLiteral(expression) {
            return expression.type === utils_1.AST_NODE_TYPES.Literal;
        }
        function isTemplateLiteral(expression) {
            return expression.type === utils_1.AST_NODE_TYPES.TemplateLiteral;
        }
        function isInfinityIdentifier(expression) {
            return (expression.type === utils_1.AST_NODE_TYPES.Identifier &&
                expression.name === 'Infinity');
        }
        function isNaNIdentifier(expression) {
            return (expression.type === utils_1.AST_NODE_TYPES.Identifier &&
                expression.name === 'NaN');
        }
        return {
            TemplateLiteral(node) {
                if (node.parent.type === utils_1.AST_NODE_TYPES.TaggedTemplateExpression) {
                    return;
                }
                const hasSingleStringVariable = node.quasis.length === 2 &&
                    node.quasis[0].value.raw === '' &&
                    node.quasis[1].value.raw === '' &&
                    node.expressions.length === 1 &&
                    isUnderlyingTypeString(node.expressions[0]);
                if (hasSingleStringVariable) {
                    context.report({
                        node: node.expressions[0],
                        messageId: 'noUnnecessaryTemplateExpression',
                        fix(fixer) {
                            const [prevQuasi, nextQuasi] = node.quasis;
                            // Remove the quasis and backticks.
                            return [
                                fixer.removeRange([
                                    prevQuasi.range[1] - 3,
                                    node.expressions[0].range[0],
                                ]),
                                fixer.removeRange([
                                    node.expressions[0].range[1],
                                    nextQuasi.range[0] + 2,
                                ]),
                            ];
                        },
                    });
                    return;
                }
                const fixableExpressions = node.expressions
                    .filter(expression => isLiteral(expression) ||
                    isTemplateLiteral(expression) ||
                    (0, util_1.isUndefinedIdentifier)(expression) ||
                    isInfinityIdentifier(expression) ||
                    isNaNIdentifier(expression))
                    .reverse();
                let nextCharacterIsOpeningCurlyBrace = false;
                for (const expression of fixableExpressions) {
                    const fixers = [];
                    const index = node.expressions.indexOf(expression);
                    const prevQuasi = node.quasis[index];
                    const nextQuasi = node.quasis[index + 1];
                    if (nextQuasi.value.raw.length !== 0) {
                        nextCharacterIsOpeningCurlyBrace =
                            nextQuasi.value.raw.startsWith('{');
                    }
                    if (isLiteral(expression)) {
                        let escapedValue = (typeof expression.value === 'string'
                            ? // The value is already a string, so we're removing quotes:
                                // "'va`lue'" -> "va`lue"
                                expression.raw.slice(1, -1)
                            : // The value may be one of number | bigint | boolean | RegExp | null.
                                // In regular expressions, we escape every backslash
                                String(expression.value).replaceAll('\\', '\\\\'))
                            // The string or RegExp may contain ` or ${.
                            // We want both of these to be escaped in the final template expression.
                            //
                            // A pair of backslashes means "escaped backslash", so backslashes
                            // from this pair won't escape ` or ${. Therefore, to escape these
                            // sequences in the resulting template expression, we need to escape
                            // all sequences that are preceded by an even number of backslashes.
                            //
                            // This RegExp does the following transformations:
                            // \` -> \`
                            // \\` -> \\\`
                            // \${ -> \${
                            // \\${ -> \\\${
                            .replaceAll(new RegExp(`${String(evenNumOfBackslashesRegExp.source)}(\`|\\\${)`, 'g'), '\\$1');
                        // `...${'...$'}{...`
                        //           ^^^^
                        if (nextCharacterIsOpeningCurlyBrace &&
                            endsWithUnescapedDollarSign(escapedValue)) {
                            escapedValue = escapedValue.replaceAll(/\$$/g, '\\$');
                        }
                        if (escapedValue.length !== 0) {
                            nextCharacterIsOpeningCurlyBrace = escapedValue.startsWith('{');
                        }
                        fixers.push(fixer => [fixer.replaceText(expression, escapedValue)]);
                    }
                    else if (isTemplateLiteral(expression)) {
                        // Since we iterate from the last expression to the first,
                        // a subsequent expression can tell the current expression
                        // that it starts with {.
                        //
                        // `... ${`... $`}${'{...'} ...`
                        //             ^     ^ subsequent expression starts with {
                        //             current expression ends with a dollar sign,
                        //             so '$' + '{' === '${' (bad news for us).
                        //             Let's escape the dollar sign at the end.
                        if (nextCharacterIsOpeningCurlyBrace &&
                            endsWithUnescapedDollarSign(expression.quasis[expression.quasis.length - 1].value.raw)) {
                            fixers.push(fixer => [
                                fixer.replaceTextRange([expression.range[1] - 2, expression.range[1] - 2], '\\'),
                            ]);
                        }
                        if (expression.quasis.length === 1 &&
                            expression.quasis[0].value.raw.length !== 0) {
                            nextCharacterIsOpeningCurlyBrace =
                                expression.quasis[0].value.raw.startsWith('{');
                        }
                        // Remove the beginning and trailing backtick characters.
                        fixers.push(fixer => [
                            fixer.removeRange([expression.range[0], expression.range[0] + 1]),
                            fixer.removeRange([expression.range[1] - 1, expression.range[1]]),
                        ]);
                    }
                    else {
                        nextCharacterIsOpeningCurlyBrace = false;
                    }
                    // `... $${'{...'} ...`
                    //      ^^^^^
                    if (nextCharacterIsOpeningCurlyBrace &&
                        endsWithUnescapedDollarSign(prevQuasi.value.raw)) {
                        fixers.push(fixer => [
                            fixer.replaceTextRange([prevQuasi.range[1] - 3, prevQuasi.range[1] - 2], '\\$'),
                        ]);
                    }
                    context.report({
                        node: expression,
                        messageId: 'noUnnecessaryTemplateExpression',
                        fix(fixer) {
                            return [
                                // Remove the quasis' parts that are related to the current expression.
                                fixer.removeRange([
                                    prevQuasi.range[1] - 2,
                                    expression.range[0],
                                ]),
                                fixer.removeRange([
                                    expression.range[1],
                                    nextQuasi.range[0] + 1,
                                ]),
                                ...fixers.flatMap(cb => cb(fixer)),
                            ];
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-unnecessary-template-expression.js.map