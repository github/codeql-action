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
exports.typeMatchesSomeSpecifier = exports.typeOrValueSpecifiersSchema = void 0;
exports.typeMatchesSpecifier = typeMatchesSpecifier;
const tsutils = __importStar(require("ts-api-utils"));
const specifierNameMatches_1 = require("./typeOrValueSpecifiers/specifierNameMatches");
const typeDeclaredInFile_1 = require("./typeOrValueSpecifiers/typeDeclaredInFile");
const typeDeclaredInLib_1 = require("./typeOrValueSpecifiers/typeDeclaredInLib");
const typeDeclaredInPackageDeclarationFile_1 = require("./typeOrValueSpecifiers/typeDeclaredInPackageDeclarationFile");
exports.typeOrValueSpecifiersSchema = {
    type: 'array',
    items: {
        oneOf: [
            {
                type: 'string',
            },
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    from: {
                        type: 'string',
                        enum: ['file'],
                    },
                    name: {
                        oneOf: [
                            {
                                type: 'string',
                            },
                            {
                                type: 'array',
                                minItems: 1,
                                uniqueItems: true,
                                items: {
                                    type: 'string',
                                },
                            },
                        ],
                    },
                    path: {
                        type: 'string',
                    },
                },
                required: ['from', 'name'],
            },
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    from: {
                        type: 'string',
                        enum: ['lib'],
                    },
                    name: {
                        oneOf: [
                            {
                                type: 'string',
                            },
                            {
                                type: 'array',
                                minItems: 1,
                                uniqueItems: true,
                                items: {
                                    type: 'string',
                                },
                            },
                        ],
                    },
                },
                required: ['from', 'name'],
            },
            {
                type: 'object',
                additionalProperties: false,
                properties: {
                    from: {
                        type: 'string',
                        enum: ['package'],
                    },
                    name: {
                        oneOf: [
                            {
                                type: 'string',
                            },
                            {
                                type: 'array',
                                minItems: 1,
                                uniqueItems: true,
                                items: {
                                    type: 'string',
                                },
                            },
                        ],
                    },
                    package: {
                        type: 'string',
                    },
                },
                required: ['from', 'name', 'package'],
            },
        ],
    },
};
function typeMatchesSpecifier(type, specifier, program) {
    if (tsutils.isIntrinsicErrorType(type)) {
        return false;
    }
    if (typeof specifier === 'string') {
        return (0, specifierNameMatches_1.specifierNameMatches)(type, specifier);
    }
    if (!(0, specifierNameMatches_1.specifierNameMatches)(type, specifier.name)) {
        return false;
    }
    const symbol = type.getSymbol() ?? type.aliasSymbol;
    const declarations = symbol?.getDeclarations() ?? [];
    const declarationFiles = declarations.map(declaration => declaration.getSourceFile());
    switch (specifier.from) {
        case 'file':
            return (0, typeDeclaredInFile_1.typeDeclaredInFile)(specifier.path, declarationFiles, program);
        case 'lib':
            return (0, typeDeclaredInLib_1.typeDeclaredInLib)(declarationFiles, program);
        case 'package':
            return (0, typeDeclaredInPackageDeclarationFile_1.typeDeclaredInPackageDeclarationFile)(specifier.package, declarations, declarationFiles, program);
    }
}
const typeMatchesSomeSpecifier = (type, specifiers = [], program) => specifiers.some(specifier => typeMatchesSpecifier(type, specifier, program));
exports.typeMatchesSomeSpecifier = typeMatchesSomeSpecifier;
//# sourceMappingURL=TypeOrValueSpecifier.js.map