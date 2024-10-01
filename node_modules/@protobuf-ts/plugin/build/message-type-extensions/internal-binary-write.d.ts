import * as ts from "typescript";
import { DescriptorProto, DescriptorRegistry, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import * as rt from "@protobuf-ts/runtime";
import { CustomMethodGenerator } from "../code-gen/message-type-generator";
import { Interpreter } from "../interpreter";
/**
 * Generates the `internalBinaryWrite` method, which writes a message
 * in binary format.
 *
 * Heads up: The generated code is only very marginally faster than
 * the reflection-based one. The gain is less than 3%.
 *
 */
export declare class InternalBinaryWrite implements CustomMethodGenerator {
    private readonly registry;
    private readonly imports;
    private readonly interpreter;
    private readonly options;
    constructor(registry: DescriptorRegistry, imports: TypeScriptImports, interpreter: Interpreter, options: {
        oneofKindDiscriminator: string;
        runtimeImportPath: string;
    });
    make(source: TypescriptFile, descriptor: DescriptorProto): ts.MethodDeclaration[];
    makeMethod(source: TypescriptFile, descriptor: DescriptorProto, bodyStatements: readonly ts.Statement[]): ts.MethodDeclaration;
    makeUnknownFieldsHandler(source: TypescriptFile): ts.Statement[];
    makeStatementsForEveryField(source: TypescriptFile, descriptor: DescriptorProto): ts.Statement[];
    scalar(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "scalar" | "enum";
        oneof: undefined;
        repeat: undefined | rt.RepeatType.NO;
    }, fieldPropertyAccess: ts.PropertyAccessExpression, fieldDeclarationComment: string): ts.Statement[];
    scalarRepeated(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "scalar" | "enum";
        oneof: undefined;
        repeat: rt.RepeatType.PACKED | rt.RepeatType.UNPACKED;
    }, fieldPropertyAccess: ts.PropertyAccessExpression, fieldDeclarationComment: string): ts.Statement[];
    scalarOneof(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "scalar" | "enum";
        oneof: string;
        repeat: undefined | rt.RepeatType.NO;
    }, fieldDeclarationComment: string): ts.Statement[];
    message(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "message";
        repeat: undefined | rt.RepeatType.NO;
        oneof: undefined;
    }, fieldPropertyAccess: ts.PropertyAccessExpression, fieldDeclarationComment: string): ts.Statement[];
    messageRepeated(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "message";
        repeat: rt.RepeatType.PACKED | rt.RepeatType.UNPACKED;
        oneof: undefined;
    }, fieldPropertyAccess: ts.PropertyAccessExpression, fieldDeclarationComment: string): ts.Statement[];
    messageOneof(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "message";
        repeat: undefined | rt.RepeatType.NO;
        oneof: string;
    }, fieldDeclarationComment: string): ts.Statement[];
    map(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "map";
    }, fieldPropertyAccess: ts.PropertyAccessExpression, fieldDeclarationComment: string): ts.Statement[];
    protected makeWriterCall(writerExpressionOrName: string | ts.Expression, type: rt.ScalarType | 'fork' | 'join', argument?: ts.Expression): ts.Expression;
    protected makeWriterTagCall(source: TypescriptFile, writerExpressionOrName: string | ts.Expression, fieldNo: number, wireType: rt.WireType): ts.Expression;
    protected wireTypeForSingleScalar(scalarType: rt.ScalarType): rt.WireType;
}
