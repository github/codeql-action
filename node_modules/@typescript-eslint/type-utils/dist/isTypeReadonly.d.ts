import * as ts from 'typescript';
import type { TypeOrValueSpecifier } from './TypeOrValueSpecifier';
export interface ReadonlynessOptions {
    readonly treatMethodsAsReadonly?: boolean;
    readonly allow?: TypeOrValueSpecifier[];
}
export declare const readonlynessOptionsSchema: {
    type: "object";
    additionalProperties: false;
    properties: {
        treatMethodsAsReadonly: {
            type: "boolean";
        };
        allow: {
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
    };
};
export declare const readonlynessOptionsDefaults: ReadonlynessOptions;
/**
 * Checks if the given type is readonly
 */
declare function isTypeReadonly(program: ts.Program, type: ts.Type, options?: ReadonlynessOptions): boolean;
export { isTypeReadonly };
//# sourceMappingURL=isTypeReadonly.d.ts.map