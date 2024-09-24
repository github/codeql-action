import type * as ts from 'typescript';
/**
 * Describes specific types or values declared in local files.
 * See [TypeOrValueSpecifier > FileSpecifier](/packages/type-utils/type-or-value-specifier#filespecifier).
 */
export interface FileSpecifier {
    from: 'file';
    /**
     * Type or value name(s) to match on.
     */
    name: string[] | string;
    /**
     * A specific file the types or values must be declared in.
     */
    path?: string;
}
/**
 * Describes specific types or values declared in TypeScript's built-in lib definitions.
 * See [TypeOrValueSpecifier > LibSpecifier](/packages/type-utils/type-or-value-specifier#libspecifier).
 */
export interface LibSpecifier {
    from: 'lib';
    /**
     * Type or value name(s) to match on.
     */
    name: string[] | string;
}
/**
 * Describes specific types or values imported from packages.
 * See [TypeOrValueSpecifier > PackageSpecifier](/packages/type-utils/type-or-value-specifier#packagespecifier).
 */
export interface PackageSpecifier {
    from: 'package';
    /**
     * Type or value name(s) to match on.
     */
    name: string[] | string;
    /**
     * Package name the type or value must be declared in.
     */
    package: string;
}
/**
 * A centralized format for rule options to describe specific _types_ and/or _values_.
 * See [TypeOrValueSpecifier](/packages/type-utils/type-or-value-specifier).
 */
export type TypeOrValueSpecifier = FileSpecifier | LibSpecifier | PackageSpecifier | string;
export declare const typeOrValueSpecifiersSchema: {
    readonly type: "array";
    readonly items: {
        readonly oneOf: [{
            readonly type: "string";
        }, {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly from: {
                    readonly type: "string";
                    readonly enum: ["file"];
                };
                readonly name: {
                    readonly oneOf: [{
                        readonly type: "string";
                    }, {
                        readonly type: "array";
                        readonly minItems: 1;
                        readonly uniqueItems: true;
                        readonly items: {
                            readonly type: "string";
                        };
                    }];
                };
                readonly path: {
                    readonly type: "string";
                };
            };
            readonly required: ["from", "name"];
        }, {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly from: {
                    readonly type: "string";
                    readonly enum: ["lib"];
                };
                readonly name: {
                    readonly oneOf: [{
                        readonly type: "string";
                    }, {
                        readonly type: "array";
                        readonly minItems: 1;
                        readonly uniqueItems: true;
                        readonly items: {
                            readonly type: "string";
                        };
                    }];
                };
            };
            readonly required: ["from", "name"];
        }, {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly from: {
                    readonly type: "string";
                    readonly enum: ["package"];
                };
                readonly name: {
                    readonly oneOf: [{
                        readonly type: "string";
                    }, {
                        readonly type: "array";
                        readonly minItems: 1;
                        readonly uniqueItems: true;
                        readonly items: {
                            readonly type: "string";
                        };
                    }];
                };
                readonly package: {
                    readonly type: "string";
                };
            };
            readonly required: ["from", "name", "package"];
        }];
    };
};
export declare function typeMatchesSpecifier(type: ts.Type, specifier: TypeOrValueSpecifier, program: ts.Program): boolean;
export declare const typeMatchesSomeSpecifier: (type: ts.Type, specifiers: TypeOrValueSpecifier[] | undefined, program: ts.Program) => boolean;
//# sourceMappingURL=TypeOrValueSpecifier.d.ts.map