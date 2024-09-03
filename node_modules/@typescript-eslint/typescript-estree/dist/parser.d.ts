import type * as ts from 'typescript';
import type { ParserServices, TSESTreeOptions } from './parser-options';
import type { TSESTree } from './ts-estree';
declare function clearProgramCache(): void;
declare function clearDefaultProjectMatchedFiles(): void;
type AST<T extends TSESTreeOptions> = TSESTree.Program & (T['comment'] extends true ? {
    comments: TSESTree.Comment[];
} : {}) & (T['tokens'] extends true ? {
    tokens: TSESTree.Token[];
} : {});
interface ParseAndGenerateServicesResult<T extends TSESTreeOptions> {
    ast: AST<T>;
    services: ParserServices;
}
declare function parse<T extends TSESTreeOptions = TSESTreeOptions>(code: string, options?: T): AST<T>;
declare function clearParseAndGenerateServicesCalls(): void;
declare function parseAndGenerateServices<T extends TSESTreeOptions = TSESTreeOptions>(code: ts.SourceFile | string, tsestreeOptions: T): ParseAndGenerateServicesResult<T>;
export { type AST, parse, parseAndGenerateServices, type ParseAndGenerateServicesResult, clearDefaultProjectMatchedFiles, clearProgramCache, clearParseAndGenerateServicesCalls, };
//# sourceMappingURL=parser.d.ts.map