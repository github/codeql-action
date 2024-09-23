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
const tsutils = __importStar(require("ts-api-utils"));
const ts = __importStar(require("typescript"));
const util_1 = require("../util");
exports.default = (0, util_1.createRule)({
    name: 'no-deprecated',
    meta: {
        docs: {
            description: 'Disallow using code marked as `@deprecated`',
            recommended: 'strict',
            requiresTypeChecking: true,
        },
        messages: {
            deprecated: `\`{{name}}\` is deprecated.`,
            deprecatedWithReason: `\`{{name}}\` is deprecated. {{reason}}`,
        },
        schema: [],
        type: 'problem',
    },
    defaultOptions: [],
    create(context) {
        const { jsDocParsingMode } = context.parserOptions;
        if (jsDocParsingMode === 'none' || jsDocParsingMode === 'type-info') {
            throw new Error(`Cannot be used with jsDocParsingMode: '${jsDocParsingMode}'.`);
        }
        const services = (0, util_1.getParserServices)(context);
        const checker = services.program.getTypeChecker();
        function isDeclaration(node) {
            const { parent } = node;
            switch (parent.type) {
                case utils_1.AST_NODE_TYPES.ArrayPattern:
                    return parent.elements.includes(node);
                case utils_1.AST_NODE_TYPES.ClassExpression:
                case utils_1.AST_NODE_TYPES.ClassDeclaration:
                case utils_1.AST_NODE_TYPES.VariableDeclarator:
                case utils_1.AST_NODE_TYPES.TSEnumMember:
                    return parent.id === node;
                case utils_1.AST_NODE_TYPES.MethodDefinition:
                case utils_1.AST_NODE_TYPES.PropertyDefinition:
                    return parent.key === node;
                case utils_1.AST_NODE_TYPES.Property:
                    // foo in "const { foo } = bar" will be processed twice, as parent.key
                    // and parent.value. The second is treated as a declaration.
                    return ((parent.shorthand && parent.value === node) ||
                        parent.parent.type === utils_1.AST_NODE_TYPES.ObjectExpression);
                case utils_1.AST_NODE_TYPES.AssignmentPattern:
                    // foo in "const { foo = "" } = bar" will be processed twice, as parent.parent.key
                    // and parent.left. The second is treated as a declaration.
                    return parent.left === node;
                case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
                case utils_1.AST_NODE_TYPES.FunctionDeclaration:
                case utils_1.AST_NODE_TYPES.FunctionExpression:
                case utils_1.AST_NODE_TYPES.TSDeclareFunction:
                case utils_1.AST_NODE_TYPES.TSEmptyBodyFunctionExpression:
                case utils_1.AST_NODE_TYPES.TSEnumDeclaration:
                case utils_1.AST_NODE_TYPES.TSInterfaceDeclaration:
                case utils_1.AST_NODE_TYPES.TSMethodSignature:
                case utils_1.AST_NODE_TYPES.TSModuleDeclaration:
                case utils_1.AST_NODE_TYPES.TSParameterProperty:
                case utils_1.AST_NODE_TYPES.TSPropertySignature:
                case utils_1.AST_NODE_TYPES.TSTypeAliasDeclaration:
                case utils_1.AST_NODE_TYPES.TSTypeParameter:
                    return true;
                default:
                    return false;
            }
        }
        function isInsideExportOrImport(node) {
            let current = node;
            while (true) {
                switch (current.type) {
                    case utils_1.AST_NODE_TYPES.ExportAllDeclaration:
                    case utils_1.AST_NODE_TYPES.ExportDefaultDeclaration:
                    case utils_1.AST_NODE_TYPES.ExportNamedDeclaration:
                    case utils_1.AST_NODE_TYPES.ImportDeclaration:
                    case utils_1.AST_NODE_TYPES.ImportExpression:
                        return true;
                    case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
                    case utils_1.AST_NODE_TYPES.BlockStatement:
                    case utils_1.AST_NODE_TYPES.ClassBody:
                    case utils_1.AST_NODE_TYPES.TSInterfaceDeclaration:
                    case utils_1.AST_NODE_TYPES.FunctionDeclaration:
                    case utils_1.AST_NODE_TYPES.FunctionExpression:
                    case utils_1.AST_NODE_TYPES.Program:
                    case utils_1.AST_NODE_TYPES.TSUnionType:
                    case utils_1.AST_NODE_TYPES.VariableDeclarator:
                        return false;
                    default:
                        current = current.parent;
                }
            }
        }
        function getJsDocDeprecation(symbol) {
            const tag = symbol
                ?.getJsDocTags(checker)
                .find(tag => tag.name === 'deprecated');
            if (!tag) {
                return undefined;
            }
            const displayParts = tag.text;
            return displayParts ? ts.displayPartsToString(displayParts) : '';
        }
        function isNodeCalleeOfParent(node) {
            switch (node.parent?.type) {
                case utils_1.AST_NODE_TYPES.NewExpression:
                case utils_1.AST_NODE_TYPES.CallExpression:
                    return node.parent.callee === node;
                case utils_1.AST_NODE_TYPES.TaggedTemplateExpression:
                    return node.parent.tag === node;
                case utils_1.AST_NODE_TYPES.JSXOpeningElement:
                    return node.parent.name === node;
                default:
                    return false;
            }
        }
        function getCallLikeNode(node) {
            let callee = node;
            while (callee.parent?.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                callee.parent.property === callee) {
                callee = callee.parent;
            }
            return isNodeCalleeOfParent(callee) ? callee : undefined;
        }
        function getCallLikeDeprecation(node) {
            const tsNode = services.esTreeNodeToTSNodeMap.get(node.parent);
            // If the node is a direct function call, we look for its signature.
            const signature = checker.getResolvedSignature(tsNode);
            const symbol = services.getSymbolAtLocation(node);
            if (signature) {
                const signatureDeprecation = getJsDocDeprecation(signature);
                if (signatureDeprecation !== undefined) {
                    return signatureDeprecation;
                }
                // Properties with function-like types have "deprecated" jsdoc
                // on their symbols, not on their signatures:
                //
                // interface Props {
                //   /** @deprecated */
                //   property: () => 'foo'
                //   ^symbol^  ^signature^
                // }
                const symbolDeclarationKind = symbol?.declarations?.[0].kind;
                if (symbolDeclarationKind !== ts.SyntaxKind.MethodDeclaration &&
                    symbolDeclarationKind !== ts.SyntaxKind.FunctionDeclaration &&
                    symbolDeclarationKind !== ts.SyntaxKind.MethodSignature) {
                    return getJsDocDeprecation(symbol);
                }
            }
            // Or it could be a ClassDeclaration or a variable set to a ClassExpression.
            const symbolAtLocation = symbol && checker.getTypeOfSymbolAtLocation(symbol, tsNode).getSymbol();
            return symbolAtLocation &&
                tsutils.isSymbolFlagSet(symbolAtLocation, ts.SymbolFlags.Class)
                ? getJsDocDeprecation(symbolAtLocation)
                : undefined;
        }
        function getSymbol(node) {
            if (node.parent.type === utils_1.AST_NODE_TYPES.Property) {
                return services
                    .getTypeAtLocation(node.parent.parent)
                    .getProperty(node.name);
            }
            return services.getSymbolAtLocation(node);
        }
        function getDeprecationReason(node) {
            const callLikeNode = getCallLikeNode(node);
            return callLikeNode
                ? getCallLikeDeprecation(callLikeNode)
                : getJsDocDeprecation(getSymbol(node));
        }
        function checkIdentifier(node) {
            if (isDeclaration(node) || isInsideExportOrImport(node)) {
                return;
            }
            const reason = getDeprecationReason(node);
            if (reason === undefined) {
                return;
            }
            context.report({
                ...(reason
                    ? {
                        data: { name: node.name, reason },
                        messageId: 'deprecatedWithReason',
                    }
                    : {
                        data: { name: node.name },
                        messageId: 'deprecated',
                    }),
                node,
            });
        }
        return {
            Identifier: checkIdentifier,
            JSXIdentifier(node) {
                if (node.parent.type !== utils_1.AST_NODE_TYPES.JSXClosingElement) {
                    checkIdentifier(node);
                }
            },
        };
    },
});
//# sourceMappingURL=no-deprecated.js.map