import * as ts from "typescript";
/**
 * Creates an enum declaration.
 */
export declare class TypescriptEnumBuilder {
    private readonly values;
    add(name: string, number: number, comment?: string): void;
    build(name: string | ts.Identifier, modifiers?: readonly ts.Modifier[]): ts.EnumDeclaration;
    private validate;
}
