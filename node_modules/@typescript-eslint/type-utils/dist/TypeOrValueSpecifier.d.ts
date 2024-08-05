import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import type * as ts from 'typescript';
export interface FileSpecifier {
    from: 'file';
    name: string[] | string;
    path?: string;
}
export interface LibSpecifier {
    from: 'lib';
    name: string[] | string;
}
export interface PackageSpecifier {
    from: 'package';
    name: string[] | string;
    package: string;
}
export type TypeOrValueSpecifier = FileSpecifier | LibSpecifier | PackageSpecifier | string;
export declare const typeOrValueSpecifierSchema: JSONSchema4;
export declare function typeMatchesSpecifier(type: ts.Type, specifier: TypeOrValueSpecifier, program: ts.Program): boolean;
//# sourceMappingURL=TypeOrValueSpecifier.d.ts.map