import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
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
export declare const typeOrValueSpecifierSchema: JSONSchema4;
export declare function typeMatchesSpecifier(type: ts.Type, specifier: TypeOrValueSpecifier, program: ts.Program): boolean;
//# sourceMappingURL=TypeOrValueSpecifier.d.ts.map