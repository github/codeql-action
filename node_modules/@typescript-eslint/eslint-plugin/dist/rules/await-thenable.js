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
const tsutils = __importStar(require("ts-api-utils"));
const util_1 = require("../util");
const getForStatementHeadLoc_1 = require("../util/getForStatementHeadLoc");
exports.default = (0, util_1.createRule)({
    name: 'await-thenable',
    meta: {
        docs: {
            description: 'Disallow awaiting a value that is not a Thenable',
            recommended: 'recommended',
            requiresTypeChecking: true,
        },
        hasSuggestions: true,
        messages: {
            await: 'Unexpected `await` of a non-Promise (non-"Thenable") value.',
            forAwaitOfNonThenable: 'Unexpected `for await...of` of a value that is not async iterable.',
            removeAwait: 'Remove unnecessary `await`.',
            convertToOrdinaryFor: 'Convert to an ordinary `for...of` loop.',
        },
        schema: [],
        type: 'problem',
    },
    defaultOptions: [],
    create(context) {
        const services = (0, util_1.getParserServices)(context);
        const checker = services.program.getTypeChecker();
        return {
            AwaitExpression(node) {
                const type = services.getTypeAtLocation(node.argument);
                if ((0, util_1.isTypeAnyType)(type) || (0, util_1.isTypeUnknownType)(type)) {
                    return;
                }
                const originalNode = services.esTreeNodeToTSNodeMap.get(node);
                if (!tsutils.isThenableType(checker, originalNode.expression, type)) {
                    context.report({
                        messageId: 'await',
                        node,
                        suggest: [
                            {
                                messageId: 'removeAwait',
                                fix(fixer) {
                                    const awaitKeyword = (0, util_1.nullThrows)(context.sourceCode.getFirstToken(node, util_1.isAwaitKeyword), util_1.NullThrowsReasons.MissingToken('await', 'await expression'));
                                    return fixer.remove(awaitKeyword);
                                },
                            },
                        ],
                    });
                }
            },
            'ForOfStatement[await=true]'(node) {
                const type = services.getTypeAtLocation(node.right);
                if ((0, util_1.isTypeAnyType)(type)) {
                    return;
                }
                const asyncIteratorSymbol = tsutils.getWellKnownSymbolPropertyOfType(type, 'asyncIterator', checker);
                if (asyncIteratorSymbol == null) {
                    context.report({
                        loc: (0, getForStatementHeadLoc_1.getForStatementHeadLoc)(context.sourceCode, node),
                        messageId: 'forAwaitOfNonThenable',
                        suggest: [
                            // Note that this suggestion causes broken code for sync iterables
                            // of promises, since the loop variable is not awaited.
                            {
                                messageId: 'convertToOrdinaryFor',
                                fix(fixer) {
                                    const awaitToken = (0, util_1.nullThrows)(context.sourceCode.getFirstToken(node, util_1.isAwaitKeyword), util_1.NullThrowsReasons.MissingToken('await', 'for await loop'));
                                    return fixer.remove(awaitToken);
                                },
                            },
                        ],
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=await-thenable.js.map