import * as ts from "typescript";
import { DescriptorProto, DescriptorRegistry, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import * as rt from "@protobuf-ts/runtime";
import { LongType } from "@protobuf-ts/runtime";
import { CustomMethodGenerator } from "../code-gen/message-type-generator";
import { Interpreter } from "../interpreter";
/**
 * Generates a "internalBinaryRead()" method for an `IMessageType`
 */
export declare class InternalBinaryRead implements CustomMethodGenerator {
    private readonly registry;
    private readonly imports;
    private readonly interpreter;
    private readonly options;
    constructor(registry: DescriptorRegistry, imports: TypeScriptImports, interpreter: Interpreter, options: {
        normalLongType: LongType;
        oneofKindDiscriminator: string;
        runtimeImportPath: string;
    });
    private readonly binaryReadMapEntryMethodName;
    make(source: TypescriptFile, descriptor: DescriptorProto): ts.MethodDeclaration[];
    makeMethod(source: TypescriptFile, descriptor: DescriptorProto, ...bodyStatements: readonly ts.Statement[]): ts.MethodDeclaration;
    makeVariables(): ts.VariableStatement;
    makeWhileSwitch(switchCases: ts.CaseClause[], defaultClause: ts.DefaultClause): ts.WhileStatement;
    makeCaseClauses(source: TypescriptFile, descriptor: DescriptorProto): ts.CaseClause[];
    makeDefaultClause(source: TypescriptFile): ts.DefaultClause;
    map(field: rt.FieldInfo & {
        kind: "map";
    }, fieldPropertyAccess: ts.PropertyAccessExpression): ts.Statement[];
    message(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "message";
        repeat: undefined | rt.RepeatType.NO;
        oneof: undefined;
    }, fieldPropertyAccess: ts.PropertyAccessExpression): ts.Statement[];
    messageOneof(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "message";
        repeat: undefined | rt.RepeatType.NO;
        oneof: string;
    }): ts.Statement[];
    messageRepeated(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "message";
        repeat: rt.RepeatType.PACKED | rt.RepeatType.UNPACKED;
        oneof: undefined;
    }, fieldPropertyAccess: ts.PropertyAccessExpression): ts.Statement[];
    scalar(field: rt.FieldInfo & {
        kind: "scalar" | "enum";
        oneof: undefined;
        repeat: undefined | rt.RepeatType.NO;
    }, fieldPropertyAccess: ts.PropertyAccessExpression): ts.Statement[];
    scalarOneof(field: rt.FieldInfo & {
        kind: "scalar" | "enum";
        oneof: string;
        repeat: undefined | rt.RepeatType.NO;
    }): ts.Statement[];
    scalarRepeated(source: TypescriptFile, field: rt.FieldInfo & {
        kind: "scalar" | "enum";
        oneof: undefined;
        repeat: rt.RepeatType.PACKED | rt.RepeatType.UNPACKED;
    }, fieldPropertyAccess: ts.PropertyAccessExpression): ts.Statement[];
    makeMapEntryReadMethod(source: TypescriptFile, messageDescriptor: DescriptorProto, field: rt.FieldInfo & {
        kind: "map";
    }): ts.MethodDeclaration;
    private createMapKeyDefaultValue;
    private createMapValueDefaultValue;
    private createScalarDefaultValue;
    makeReaderCall(readerExpressionOrName: string | ts.Expression, type: rt.ScalarType, longType?: rt.LongType): ts.Expression;
}
