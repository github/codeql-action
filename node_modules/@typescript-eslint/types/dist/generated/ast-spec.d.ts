/**********************************************
 *      DO NOT MODIFY THIS FILE MANUALLY      *
 *                                            *
 *  THIS FILE HAS BEEN COPIED FROM ast-spec.  *
 * ANY CHANGES WILL BE LOST ON THE NEXT BUILD *
 *                                            *
 *   MAKE CHANGES TO ast-spec AND THEN RUN    *
 *                 yarn build                 *
 **********************************************/
import type { SyntaxKind } from 'typescript';
export declare type Accessibility = 'private' | 'protected' | 'public';
export declare type AccessorProperty = AccessorPropertyComputedName | AccessorPropertyNonComputedName;
export declare interface AccessorPropertyComputedName extends PropertyDefinitionComputedNameBase {
    type: AST_NODE_TYPES.AccessorProperty;
}
export declare interface AccessorPropertyNonComputedName extends PropertyDefinitionNonComputedNameBase {
    type: AST_NODE_TYPES.AccessorProperty;
}
export declare interface ArrayExpression extends BaseNode {
    /**
     * an element will be `null` in the case of a sparse array: `[1, ,3]`
     */
    elements: (Expression | SpreadElement | null)[];
    type: AST_NODE_TYPES.ArrayExpression;
}
export declare interface ArrayPattern extends BaseNode {
    decorators: Decorator[];
    elements: (DestructuringPattern | null)[];
    optional: boolean;
    type: AST_NODE_TYPES.ArrayPattern;
    typeAnnotation: TSTypeAnnotation | undefined;
}
export declare interface ArrowFunctionExpression extends BaseNode {
    async: boolean;
    body: BlockStatement | Expression;
    expression: boolean;
    generator: boolean;
    id: null;
    params: Parameter[];
    returnType: TSTypeAnnotation | undefined;
    type: AST_NODE_TYPES.ArrowFunctionExpression;
    typeParameters: TSTypeParameterDeclaration | undefined;
}
export declare interface AssignmentExpression extends BaseNode {
    left: Expression;
    operator: ValueOf<AssignmentOperatorToText>;
    right: Expression;
    type: AST_NODE_TYPES.AssignmentExpression;
}
export declare interface AssignmentOperatorToText {
    [SyntaxKind.AmpersandAmpersandEqualsToken]: '&&=';
    [SyntaxKind.AmpersandEqualsToken]: '&=';
    [SyntaxKind.AsteriskAsteriskEqualsToken]: '**=';
    [SyntaxKind.AsteriskEqualsToken]: '*=';
    [SyntaxKind.BarBarEqualsToken]: '||=';
    [SyntaxKind.BarEqualsToken]: '|=';
    [SyntaxKind.CaretEqualsToken]: '^=';
    [SyntaxKind.EqualsToken]: '=';
    [SyntaxKind.GreaterThanGreaterThanEqualsToken]: '>>=';
    [SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken]: '>>>=';
    [SyntaxKind.LessThanLessThanEqualsToken]: '<<=';
    [SyntaxKind.MinusEqualsToken]: '-=';
    [SyntaxKind.PercentEqualsToken]: '%=';
    [SyntaxKind.PlusEqualsToken]: '+=';
    [SyntaxKind.QuestionQuestionEqualsToken]: '??=';
    [SyntaxKind.SlashEqualsToken]: '/=';
}
export declare interface AssignmentPattern extends BaseNode {
    decorators: Decorator[];
    left: BindingName;
    optional: boolean;
    right: Expression;
    type: AST_NODE_TYPES.AssignmentPattern;
    typeAnnotation: TSTypeAnnotation | undefined;
}
export declare enum AST_NODE_TYPES {
    AccessorProperty = "AccessorProperty",
    ArrayExpression = "ArrayExpression",
    ArrayPattern = "ArrayPattern",
    ArrowFunctionExpression = "ArrowFunctionExpression",
    AssignmentExpression = "AssignmentExpression",
    AssignmentPattern = "AssignmentPattern",
    AwaitExpression = "AwaitExpression",
    BinaryExpression = "BinaryExpression",
    BlockStatement = "BlockStatement",
    BreakStatement = "BreakStatement",
    CallExpression = "CallExpression",
    CatchClause = "CatchClause",
    ChainExpression = "ChainExpression",
    ClassBody = "ClassBody",
    ClassDeclaration = "ClassDeclaration",
    ClassExpression = "ClassExpression",
    ConditionalExpression = "ConditionalExpression",
    ContinueStatement = "ContinueStatement",
    DebuggerStatement = "DebuggerStatement",
    Decorator = "Decorator",
    DoWhileStatement = "DoWhileStatement",
    EmptyStatement = "EmptyStatement",
    ExportAllDeclaration = "ExportAllDeclaration",
    ExportDefaultDeclaration = "ExportDefaultDeclaration",
    ExportNamedDeclaration = "ExportNamedDeclaration",
    ExportSpecifier = "ExportSpecifier",
    ExpressionStatement = "ExpressionStatement",
    ForInStatement = "ForInStatement",
    ForOfStatement = "ForOfStatement",
    ForStatement = "ForStatement",
    FunctionDeclaration = "FunctionDeclaration",
    FunctionExpression = "FunctionExpression",
    Identifier = "Identifier",
    IfStatement = "IfStatement",
    ImportAttribute = "ImportAttribute",
    ImportDeclaration = "ImportDeclaration",
    ImportDefaultSpecifier = "ImportDefaultSpecifier",
    ImportExpression = "ImportExpression",
    ImportNamespaceSpecifier = "ImportNamespaceSpecifier",
    ImportSpecifier = "ImportSpecifier",
    JSXAttribute = "JSXAttribute",
    JSXClosingElement = "JSXClosingElement",
    JSXClosingFragment = "JSXClosingFragment",
    JSXElement = "JSXElement",
    JSXEmptyExpression = "JSXEmptyExpression",
    JSXExpressionContainer = "JSXExpressionContainer",
    JSXFragment = "JSXFragment",
    JSXIdentifier = "JSXIdentifier",
    JSXMemberExpression = "JSXMemberExpression",
    JSXNamespacedName = "JSXNamespacedName",
    JSXOpeningElement = "JSXOpeningElement",
    JSXOpeningFragment = "JSXOpeningFragment",
    JSXSpreadAttribute = "JSXSpreadAttribute",
    JSXSpreadChild = "JSXSpreadChild",
    JSXText = "JSXText",
    LabeledStatement = "LabeledStatement",
    Literal = "Literal",
    LogicalExpression = "LogicalExpression",
    MemberExpression = "MemberExpression",
    MetaProperty = "MetaProperty",
    MethodDefinition = "MethodDefinition",
    NewExpression = "NewExpression",
    ObjectExpression = "ObjectExpression",
    ObjectPattern = "ObjectPattern",
    PrivateIdentifier = "PrivateIdentifier",
    Program = "Program",
    Property = "Property",
    PropertyDefinition = "PropertyDefinition",
    RestElement = "RestElement",
    ReturnStatement = "ReturnStatement",
    SequenceExpression = "SequenceExpression",
    SpreadElement = "SpreadElement",
    StaticBlock = "StaticBlock",
    Super = "Super",
    SwitchCase = "SwitchCase",
    SwitchStatement = "SwitchStatement",
    TaggedTemplateExpression = "TaggedTemplateExpression",
    TemplateElement = "TemplateElement",
    TemplateLiteral = "TemplateLiteral",
    ThisExpression = "ThisExpression",
    ThrowStatement = "ThrowStatement",
    TryStatement = "TryStatement",
    UnaryExpression = "UnaryExpression",
    UpdateExpression = "UpdateExpression",
    VariableDeclaration = "VariableDeclaration",
    VariableDeclarator = "VariableDeclarator",
    WhileStatement = "WhileStatement",
    WithStatement = "WithStatement",
    YieldExpression = "YieldExpression",
    TSAbstractAccessorProperty = "TSAbstractAccessorProperty",
    TSAbstractKeyword = "TSAbstractKeyword",
    TSAbstractMethodDefinition = "TSAbstractMethodDefinition",
    TSAbstractPropertyDefinition = "TSAbstractPropertyDefinition",
    TSAnyKeyword = "TSAnyKeyword",
    TSArrayType = "TSArrayType",
    TSAsExpression = "TSAsExpression",
    TSAsyncKeyword = "TSAsyncKeyword",
    TSBigIntKeyword = "TSBigIntKeyword",
    TSBooleanKeyword = "TSBooleanKeyword",
    TSCallSignatureDeclaration = "TSCallSignatureDeclaration",
    TSClassImplements = "TSClassImplements",
    TSConditionalType = "TSConditionalType",
    TSConstructorType = "TSConstructorType",
    TSConstructSignatureDeclaration = "TSConstructSignatureDeclaration",
    TSDeclareFunction = "TSDeclareFunction",
    TSDeclareKeyword = "TSDeclareKeyword",
    TSEmptyBodyFunctionExpression = "TSEmptyBodyFunctionExpression",
    TSEnumBody = "TSEnumBody",
    TSEnumDeclaration = "TSEnumDeclaration",
    TSEnumMember = "TSEnumMember",
    TSExportAssignment = "TSExportAssignment",
    TSExportKeyword = "TSExportKeyword",
    TSExternalModuleReference = "TSExternalModuleReference",
    TSFunctionType = "TSFunctionType",
    TSImportEqualsDeclaration = "TSImportEqualsDeclaration",
    TSImportType = "TSImportType",
    TSIndexedAccessType = "TSIndexedAccessType",
    TSIndexSignature = "TSIndexSignature",
    TSInferType = "TSInferType",
    TSInstantiationExpression = "TSInstantiationExpression",
    TSInterfaceBody = "TSInterfaceBody",
    TSInterfaceDeclaration = "TSInterfaceDeclaration",
    TSInterfaceHeritage = "TSInterfaceHeritage",
    TSIntersectionType = "TSIntersectionType",
    TSIntrinsicKeyword = "TSIntrinsicKeyword",
    TSLiteralType = "TSLiteralType",
    TSMappedType = "TSMappedType",
    TSMethodSignature = "TSMethodSignature",
    TSModuleBlock = "TSModuleBlock",
    TSModuleDeclaration = "TSModuleDeclaration",
    TSNamedTupleMember = "TSNamedTupleMember",
    TSNamespaceExportDeclaration = "TSNamespaceExportDeclaration",
    TSNeverKeyword = "TSNeverKeyword",
    TSNonNullExpression = "TSNonNullExpression",
    TSNullKeyword = "TSNullKeyword",
    TSNumberKeyword = "TSNumberKeyword",
    TSObjectKeyword = "TSObjectKeyword",
    TSOptionalType = "TSOptionalType",
    TSParameterProperty = "TSParameterProperty",
    TSPrivateKeyword = "TSPrivateKeyword",
    TSPropertySignature = "TSPropertySignature",
    TSProtectedKeyword = "TSProtectedKeyword",
    TSPublicKeyword = "TSPublicKeyword",
    TSQualifiedName = "TSQualifiedName",
    TSReadonlyKeyword = "TSReadonlyKeyword",
    TSRestType = "TSRestType",
    TSSatisfiesExpression = "TSSatisfiesExpression",
    TSStaticKeyword = "TSStaticKeyword",
    TSStringKeyword = "TSStringKeyword",
    TSSymbolKeyword = "TSSymbolKeyword",
    TSTemplateLiteralType = "TSTemplateLiteralType",
    TSThisType = "TSThisType",
    TSTupleType = "TSTupleType",
    TSTypeAliasDeclaration = "TSTypeAliasDeclaration",
    TSTypeAnnotation = "TSTypeAnnotation",
    TSTypeAssertion = "TSTypeAssertion",
    TSTypeLiteral = "TSTypeLiteral",
    TSTypeOperator = "TSTypeOperator",
    TSTypeParameter = "TSTypeParameter",
    TSTypeParameterDeclaration = "TSTypeParameterDeclaration",
    TSTypeParameterInstantiation = "TSTypeParameterInstantiation",
    TSTypePredicate = "TSTypePredicate",
    TSTypeQuery = "TSTypeQuery",
    TSTypeReference = "TSTypeReference",
    TSUndefinedKeyword = "TSUndefinedKeyword",
    TSUnionType = "TSUnionType",
    TSUnknownKeyword = "TSUnknownKeyword",
    TSVoidKeyword = "TSVoidKeyword"
}
export declare enum AST_TOKEN_TYPES {
    Boolean = "Boolean",
    Identifier = "Identifier",
    JSXIdentifier = "JSXIdentifier",
    JSXText = "JSXText",
    Keyword = "Keyword",
    Null = "Null",
    Numeric = "Numeric",
    Punctuator = "Punctuator",
    RegularExpression = "RegularExpression",
    String = "String",
    Template = "Template",
    Block = "Block",
    Line = "Line"
}
export declare interface AwaitExpression extends BaseNode {
    argument: Expression;
    type: AST_NODE_TYPES.AwaitExpression;
}
export declare interface BaseNode extends NodeOrTokenData {
    type: AST_NODE_TYPES;
}
declare interface BaseToken extends NodeOrTokenData {
    type: AST_TOKEN_TYPES;
    value: string;
}
export declare interface BigIntLiteral extends LiteralBase {
    bigint: string;
    value: bigint | null;
}
export declare interface BinaryExpression extends BaseNode {
    left: Expression | PrivateIdentifier;
    operator: ValueOf<BinaryOperatorToText>;
    right: Expression;
    type: AST_NODE_TYPES.BinaryExpression;
}
export declare interface BinaryOperatorToText {
    [SyntaxKind.AmpersandAmpersandToken]: '&&';
    [SyntaxKind.AmpersandToken]: '&';
    [SyntaxKind.AsteriskAsteriskToken]: '**';
    [SyntaxKind.AsteriskToken]: '*';
    [SyntaxKind.BarBarToken]: '||';
    [SyntaxKind.BarToken]: '|';
    [SyntaxKind.CaretToken]: '^';
    [SyntaxKind.EqualsEqualsEqualsToken]: '===';
    [SyntaxKind.EqualsEqualsToken]: '==';
    [SyntaxKind.ExclamationEqualsEqualsToken]: '!==';
    [SyntaxKind.ExclamationEqualsToken]: '!=';
    [SyntaxKind.GreaterThanEqualsToken]: '>=';
    [SyntaxKind.GreaterThanGreaterThanGreaterThanToken]: '>>>';
    [SyntaxKind.GreaterThanGreaterThanToken]: '>>';
    [SyntaxKind.GreaterThanToken]: '>';
    [SyntaxKind.InKeyword]: 'in';
    [SyntaxKind.InstanceOfKeyword]: 'instanceof';
    [SyntaxKind.LessThanEqualsToken]: '<=';
    [SyntaxKind.LessThanLessThanToken]: '<<';
    [SyntaxKind.LessThanToken]: '<';
    [SyntaxKind.MinusToken]: '-';
    [SyntaxKind.PercentToken]: '%';
    [SyntaxKind.PlusToken]: '+';
    [SyntaxKind.SlashToken]: '/';
}
export declare type BindingName = BindingPattern | Identifier;
export declare type BindingPattern = ArrayPattern | ObjectPattern;
export declare interface BlockComment extends BaseToken {
    type: AST_TOKEN_TYPES.Block;
}
export declare interface BlockStatement extends BaseNode {
    body: Statement[];
    type: AST_NODE_TYPES.BlockStatement;
}
export declare interface BooleanLiteral extends LiteralBase {
    raw: 'false' | 'true';
    value: boolean;
}
export declare interface BooleanToken extends BaseToken {
    type: AST_TOKEN_TYPES.Boolean;
}
export declare interface BreakStatement extends BaseNode {
    label: Identifier | null;
    type: AST_NODE_TYPES.BreakStatement;
}
export declare interface CallExpression extends BaseNode {
    arguments: CallExpressionArgument[];
    callee: Expression;
    optional: boolean;
    type: AST_NODE_TYPES.CallExpression;
    typeArguments: TSTypeParameterInstantiation | undefined;
}
export declare type CallExpressionArgument = Expression | SpreadElement;
export declare interface CatchClause extends BaseNode {
    body: BlockStatement;
    param: BindingName | null;
    type: AST_NODE_TYPES.CatchClause;
}
export declare type ChainElement = CallExpression | MemberExpression | TSNonNullExpression;
export declare interface ChainExpression extends BaseNode {
    expression: ChainElement;
    type: AST_NODE_TYPES.ChainExpression;
}
declare interface ClassBase extends BaseNode {
    /**
     * Whether the class is an abstract class.
     * @example
     * ```ts
     * abstract class Foo {}
     * ```
     */
    abstract: boolean;
    /**
     * The class body.
     */
    body: ClassBody;
    /**
     * Whether the class has been `declare`d:
     * @example
     * ```ts
     * declare class Foo {}
     * ```
     */
    declare: boolean;
    /**
     * The decorators declared for the class.
     * @example
     * ```ts
     * @deco
     * class Foo {}
     * ```
     */
    decorators: Decorator[];
    /**
     * The class's name.
     * - For a `ClassExpression` this may be `null` if the name is omitted.
     * - For a `ClassDeclaration` this may be `null` if and only if the parent is
     *   an `ExportDefaultDeclaration`.
     */
    id: Identifier | null;
    /**
     * The implemented interfaces for the class.
     */
    implements: TSClassImplements[];
    /**
     * The super class this class extends.
     */
    superClass: LeftHandSideExpression | null;
    /**
     * The generic type parameters passed to the superClass.
     */
    superTypeArguments: TSTypeParameterInstantiation | undefined;
    /**
     * The generic type parameters declared for the class.
     */
    typeParameters: TSTypeParameterDeclaration | undefined;
}
export declare interface ClassBody extends BaseNode {
    body: ClassElement[];
    type: AST_NODE_TYPES.ClassBody;
}
export declare type ClassDeclaration = ClassDeclarationWithName | ClassDeclarationWithOptionalName;
declare interface ClassDeclarationBase extends ClassBase {
    type: AST_NODE_TYPES.ClassDeclaration;
}
/**
 * A normal class declaration:
 * ```
 * class A {}
 * ```
 */
export declare interface ClassDeclarationWithName extends ClassDeclarationBase {
    id: Identifier;
}
/**
 * Default-exported class declarations have optional names:
 * ```
 * export default class {}
 * ```
 */
export declare interface ClassDeclarationWithOptionalName extends ClassDeclarationBase {
    id: Identifier | null;
}
export declare type ClassElement = AccessorProperty | MethodDefinition | PropertyDefinition | StaticBlock | TSAbstractAccessorProperty | TSAbstractMethodDefinition | TSAbstractPropertyDefinition | TSIndexSignature;
export declare interface ClassExpression extends ClassBase {
    abstract: false;
    declare: false;
    type: AST_NODE_TYPES.ClassExpression;
}
declare interface ClassMethodDefinitionNonComputedNameBase extends MethodDefinitionBase {
    computed: false;
    key: ClassPropertyNameNonComputed;
}
declare interface ClassPropertyDefinitionNonComputedNameBase extends PropertyDefinitionBase {
    computed: false;
    key: ClassPropertyNameNonComputed;
}
export declare type ClassPropertyNameNonComputed = PrivateIdentifier | PropertyNameNonComputed;
export declare type Comment = BlockComment | LineComment;
export declare interface ConditionalExpression extends BaseNode {
    alternate: Expression;
    consequent: Expression;
    test: Expression;
    type: AST_NODE_TYPES.ConditionalExpression;
}
export declare interface ConstDeclaration extends LetOrConstOrVarDeclarationBase {
    /**
     * In a `declare const` declaration, the declarators may have initializers, but
     * not definite assignment assertions. Each declarator cannot have both an
     * initializer and a type annotation.
     *
     * Even if the declaration has no `declare`, it may still be ambient and have
     * no initializer.
     */
    declarations: VariableDeclaratorMaybeInit[];
    kind: 'const';
}
export declare interface ContinueStatement extends BaseNode {
    label: Identifier | null;
    type: AST_NODE_TYPES.ContinueStatement;
}
export declare interface DebuggerStatement extends BaseNode {
    type: AST_NODE_TYPES.DebuggerStatement;
}
/**
 * @deprecated
 * Note that this is neither up to date nor fully correct.
 */
export declare type DeclarationStatement = ClassDeclaration | ClassExpression | ExportAllDeclaration | ExportDefaultDeclaration | ExportNamedDeclaration | FunctionDeclaration | TSDeclareFunction | TSEnumDeclaration | TSImportEqualsDeclaration | TSInterfaceDeclaration | TSModuleDeclaration | TSNamespaceExportDeclaration | TSTypeAliasDeclaration;
export declare interface Decorator extends BaseNode {
    expression: LeftHandSideExpression;
    type: AST_NODE_TYPES.Decorator;
}
export declare type DefaultExportDeclarations = ClassDeclarationWithOptionalName | Expression | FunctionDeclarationWithName | FunctionDeclarationWithOptionalName | TSDeclareFunction | TSEnumDeclaration | TSInterfaceDeclaration | TSModuleDeclaration | TSTypeAliasDeclaration | VariableDeclaration;
export declare type DestructuringPattern = ArrayPattern | AssignmentPattern | Identifier | MemberExpression | ObjectPattern | RestElement;
export declare interface DoWhileStatement extends BaseNode {
    body: Statement;
    test: Expression;
    type: AST_NODE_TYPES.DoWhileStatement;
}
export declare interface EmptyStatement extends BaseNode {
    type: AST_NODE_TYPES.EmptyStatement;
}
export declare type EntityName = Identifier | ThisExpression | TSQualifiedName;
export declare interface ExportAllDeclaration extends BaseNode {
    /**
     * The assertions declared for the export.
     * @example
     * ```ts
     * export * from 'mod' assert \{ type: 'json' \};
     * ```
     * @deprecated Replaced with {@link `attributes`}.
     */
    assertions: ImportAttribute[];
    /**
     * The attributes declared for the export.
     * @example
     * ```ts
     * export * from 'mod' with \{ type: 'json' \};
     * ```
     */
    attributes: ImportAttribute[];
    /**
     * The name for the exported items (`as X`). `null` if no name is assigned.
     */
    exported: Identifier | null;
    /**
     * The kind of the export.
     */
    exportKind: ExportKind;
    /**
     * The source module being exported from.
     */
    source: StringLiteral;
    type: AST_NODE_TYPES.ExportAllDeclaration;
}
declare type ExportAndImportKind = 'type' | 'value';
export declare type ExportDeclaration = DefaultExportDeclarations | NamedExportDeclarations;
export declare interface ExportDefaultDeclaration extends BaseNode {
    /**
     * The declaration being exported.
     */
    declaration: DefaultExportDeclarations;
    /**
     * The kind of the export. Always `value` for default exports.
     */
    exportKind: 'value';
    type: AST_NODE_TYPES.ExportDefaultDeclaration;
}
declare type ExportKind = ExportAndImportKind;
export declare type ExportNamedDeclaration = ExportNamedDeclarationWithoutSourceWithMultiple | ExportNamedDeclarationWithoutSourceWithSingle | ExportNamedDeclarationWithSource;
declare interface ExportNamedDeclarationBase extends BaseNode {
    /**
     * The assertions declared for the export.
     * @example
     * ```ts
     * export { foo } from 'mod' assert \{ type: 'json' \};
     * ```
     * This will be an empty array if `source` is `null`
     * @deprecated Replaced with {@link `attributes`}.
     */
    assertions: ImportAttribute[];
    /**
     * The attributes declared for the export.
     * @example
     * ```ts
     * export { foo } from 'mod' with \{ type: 'json' \};
     * ```
     * This will be an empty array if `source` is `null`
     */
    attributes: ImportAttribute[];
    /**
     * The exported declaration.
     * @example
     * ```ts
     * export const x = 1;
     * ```
     * This will be `null` if `source` is not `null`, or if there are `specifiers`
     */
    declaration: NamedExportDeclarations | null;
    /**
     * The kind of the export.
     */
    exportKind: ExportKind;
    /**
     * The source module being exported from.
     */
    source: StringLiteral | null;
    /**
     * The specifiers being exported.
     * @example
     * ```ts
     * export { a, b };
     * ```
     * This will be an empty array if `declaration` is not `null`
     */
    specifiers: ExportSpecifier[];
    type: AST_NODE_TYPES.ExportNamedDeclaration;
}
/**
 * Exporting names from the current module.
 * ```
 * export {};
 * export { a, b };
 * ```
 */
export declare interface ExportNamedDeclarationWithoutSourceWithMultiple extends ExportNamedDeclarationBase {
    /**
     * This will always be an empty array.
     * @deprecated Replaced with {@link `attributes`}.
     */
    assertions: ImportAttribute[];
    /**
     * This will always be an empty array.
     */
    attributes: ImportAttribute[];
    declaration: null;
    source: null;
}
/**
 * Exporting a single named declaration.
 * ```
 * export const x = 1;
 * ```
 */
export declare interface ExportNamedDeclarationWithoutSourceWithSingle extends ExportNamedDeclarationBase {
    /**
     * This will always be an empty array.
     * @deprecated Replaced with {@link `attributes`}.
     */
    assertions: ImportAttribute[];
    /**
     * This will always be an empty array.
     */
    attributes: ImportAttribute[];
    declaration: NamedExportDeclarations;
    source: null;
    /**
     * This will always be an empty array.
     */
    specifiers: ExportSpecifier[];
}
/**
 * Export names from another module.
 * ```
 * export { a, b } from 'mod';
 * ```
 */
export declare interface ExportNamedDeclarationWithSource extends ExportNamedDeclarationBase {
    declaration: null;
    source: StringLiteral;
}
export declare interface ExportSpecifier extends BaseNode {
    exported: Identifier;
    exportKind: ExportKind;
    local: Identifier;
    type: AST_NODE_TYPES.ExportSpecifier;
}
export declare type Expression = ArrayExpression | ArrayPattern | ArrowFunctionExpression | AssignmentExpression | AwaitExpression | BinaryExpression | CallExpression | ChainExpression | ClassExpression | ConditionalExpression | FunctionExpression | Identifier | ImportExpression | JSXElement | JSXFragment | LiteralExpression | LogicalExpression | MemberExpression | MetaProperty | NewExpression | ObjectExpression | ObjectPattern | SequenceExpression | Super | TaggedTemplateExpression | TemplateLiteral | ThisExpression | TSAsExpression | TSInstantiationExpression | TSNonNullExpression | TSSatisfiesExpression | TSTypeAssertion | UnaryExpression | UpdateExpression | YieldExpression;
export declare interface ExpressionStatement extends BaseNode {
    directive: string | undefined;
    expression: Expression;
    type: AST_NODE_TYPES.ExpressionStatement;
}
export declare type ForInitialiser = Expression | LetOrConstOrVarDeclaration;
export declare interface ForInStatement extends BaseNode {
    body: Statement;
    left: ForInitialiser;
    right: Expression;
    type: AST_NODE_TYPES.ForInStatement;
}
declare type ForOfInitialiser = Expression | LetOrConstOrVarDeclaration | UsingInForOfDeclaration;
export declare interface ForOfStatement extends BaseNode {
    await: boolean;
    body: Statement;
    left: ForOfInitialiser;
    right: Expression;
    type: AST_NODE_TYPES.ForOfStatement;
}
export declare interface ForStatement extends BaseNode {
    body: Statement;
    init: Expression | ForInitialiser | null;
    test: Expression | null;
    type: AST_NODE_TYPES.ForStatement;
    update: Expression | null;
}
declare interface FunctionBase extends BaseNode {
    /**
     * Whether the function is async:
     * ```
     * async function foo() {}
     * const x = async function () {}
     * const x = async () => {}
     * ```
     */
    async: boolean;
    /**
     * The body of the function.
     * - For an `ArrowFunctionExpression` this may be an `Expression` or `BlockStatement`.
     * - For a `FunctionDeclaration` or `FunctionExpression` this is always a `BlockStatement`.
     * - For a `TSDeclareFunction` this is always `undefined`.
     * - For a `TSEmptyBodyFunctionExpression` this is always `null`.
     */
    body: BlockStatement | Expression | null | undefined;
    /**
     * This is only `true` if and only if the node is a `TSDeclareFunction` and it has `declare`:
     * ```
     * declare function foo() {}
     * ```
     */
    declare: boolean;
    /**
     * This is only ever `true` if and only the node is an `ArrowFunctionExpression` and the body
     * is an expression:
     * ```
     * (() => 1)
     * ```
     */
    expression: boolean;
    /**
     * Whether the function is a generator function:
     * ```
     * function *foo() {}
     * const x = function *() {}
     * ```
     * This is always `false` for arrow functions as they cannot be generators.
     */
    generator: boolean;
    /**
     * The function's name.
     * - For an `ArrowFunctionExpression` this is always `null`.
     * - For a `FunctionExpression` this may be `null` if the name is omitted.
     * - For a `FunctionDeclaration` or `TSDeclareFunction` this may be `null` if
     *   and only if the parent is an `ExportDefaultDeclaration`.
     */
    id: Identifier | null;
    /**
     * The list of parameters declared for the function.
     */
    params: Parameter[];
    /**
     * The return type annotation for the function.
     */
    returnType: TSTypeAnnotation | undefined;
    /**
     * The generic type parameter declaration for the function.
     */
    typeParameters: TSTypeParameterDeclaration | undefined;
}
export declare type FunctionDeclaration = FunctionDeclarationWithName | FunctionDeclarationWithOptionalName;
declare interface FunctionDeclarationBase extends FunctionBase {
    body: BlockStatement;
    declare: false;
    expression: false;
    type: AST_NODE_TYPES.FunctionDeclaration;
}
/**
 * A normal function declaration:
 * ```
 * function f() {}
 * ```
 */
export declare interface FunctionDeclarationWithName extends FunctionDeclarationBase {
    id: Identifier;
}
/**
 * Default-exported function declarations have optional names:
 * ```
 * export default function () {}
 * ```
 */
export declare interface FunctionDeclarationWithOptionalName extends FunctionDeclarationBase {
    id: Identifier | null;
}
export declare interface FunctionExpression extends FunctionBase {
    body: BlockStatement;
    expression: false;
    type: AST_NODE_TYPES.FunctionExpression;
}
export declare type FunctionLike = ArrowFunctionExpression | FunctionDeclaration | FunctionExpression | TSDeclareFunction | TSEmptyBodyFunctionExpression;
export declare interface Identifier extends BaseNode {
    decorators: Decorator[];
    name: string;
    optional: boolean;
    type: AST_NODE_TYPES.Identifier;
    typeAnnotation: TSTypeAnnotation | undefined;
}
export declare interface IdentifierToken extends BaseToken {
    type: AST_TOKEN_TYPES.Identifier;
}
export declare interface IfStatement extends BaseNode {
    alternate: Statement | null;
    consequent: Statement;
    test: Expression;
    type: AST_NODE_TYPES.IfStatement;
}
export declare interface ImportAttribute extends BaseNode {
    key: Identifier | Literal;
    type: AST_NODE_TYPES.ImportAttribute;
    value: Literal;
}
export declare type ImportClause = ImportDefaultSpecifier | ImportNamespaceSpecifier | ImportSpecifier;
export declare interface ImportDeclaration extends BaseNode {
    /**
     * The assertions declared for the export.
     * @example
     * ```ts
     * import * from 'mod' assert \{ type: 'json' \};
     * ```
     * @deprecated Replaced with {@link `attributes`}.
     */
    assertions: ImportAttribute[];
    /**
     * The attributes declared for the export.
     * @example
     * ```ts
     * import * from 'mod' with \{ type: 'json' \};
     * ```
     */
    attributes: ImportAttribute[];
    /**
     * The kind of the import.
     */
    importKind: ImportKind;
    /**
     * The source module being imported from.
     */
    source: StringLiteral;
    /**
     * The specifiers being imported.
     * If this is an empty array then either there are no specifiers:
     * ```
     * import {} from 'mod';
     * ```
     * Or it is a side-effect import:
     * ```
     * import 'mod';
     * ```
     */
    specifiers: ImportClause[];
    type: AST_NODE_TYPES.ImportDeclaration;
}
export declare interface ImportDefaultSpecifier extends BaseNode {
    local: Identifier;
    type: AST_NODE_TYPES.ImportDefaultSpecifier;
}
export declare interface ImportExpression extends BaseNode {
    attributes: Expression | null;
    source: Expression;
    type: AST_NODE_TYPES.ImportExpression;
}
declare type ImportKind = ExportAndImportKind;
export declare interface ImportNamespaceSpecifier extends BaseNode {
    local: Identifier;
    type: AST_NODE_TYPES.ImportNamespaceSpecifier;
}
export declare interface ImportSpecifier extends BaseNode {
    imported: Identifier;
    importKind: ImportKind;
    local: Identifier;
    type: AST_NODE_TYPES.ImportSpecifier;
}
export declare type IterationStatement = DoWhileStatement | ForInStatement | ForOfStatement | ForStatement | WhileStatement;
export declare interface JSXAttribute extends BaseNode {
    name: JSXIdentifier | JSXNamespacedName;
    type: AST_NODE_TYPES.JSXAttribute;
    value: JSXElement | JSXExpression | Literal | null;
}
export declare type JSXChild = JSXElement | JSXExpression | JSXFragment | JSXText;
export declare interface JSXClosingElement extends BaseNode {
    name: JSXTagNameExpression;
    type: AST_NODE_TYPES.JSXClosingElement;
}
export declare interface JSXClosingFragment extends BaseNode {
    type: AST_NODE_TYPES.JSXClosingFragment;
}
export declare interface JSXElement extends BaseNode {
    children: JSXChild[];
    closingElement: JSXClosingElement | null;
    openingElement: JSXOpeningElement;
    type: AST_NODE_TYPES.JSXElement;
}
export declare interface JSXEmptyExpression extends BaseNode {
    type: AST_NODE_TYPES.JSXEmptyExpression;
}
export declare type JSXExpression = JSXExpressionContainer | JSXSpreadChild;
export declare interface JSXExpressionContainer extends BaseNode {
    expression: Expression | JSXEmptyExpression;
    type: AST_NODE_TYPES.JSXExpressionContainer;
}
export declare interface JSXFragment extends BaseNode {
    children: JSXChild[];
    closingFragment: JSXClosingFragment;
    openingFragment: JSXOpeningFragment;
    type: AST_NODE_TYPES.JSXFragment;
}
export declare interface JSXIdentifier extends BaseNode {
    name: string;
    type: AST_NODE_TYPES.JSXIdentifier;
}
export declare interface JSXIdentifierToken extends BaseToken {
    type: AST_TOKEN_TYPES.JSXIdentifier;
}
export declare interface JSXMemberExpression extends BaseNode {
    object: JSXTagNameExpression;
    property: JSXIdentifier;
    type: AST_NODE_TYPES.JSXMemberExpression;
}
export declare interface JSXNamespacedName extends BaseNode {
    name: JSXIdentifier;
    namespace: JSXIdentifier;
    type: AST_NODE_TYPES.JSXNamespacedName;
}
export declare interface JSXOpeningElement extends BaseNode {
    attributes: (JSXAttribute | JSXSpreadAttribute)[];
    name: JSXTagNameExpression;
    selfClosing: boolean;
    type: AST_NODE_TYPES.JSXOpeningElement;
    typeArguments: TSTypeParameterInstantiation | undefined;
}
export declare interface JSXOpeningFragment extends BaseNode {
    type: AST_NODE_TYPES.JSXOpeningFragment;
}
export declare interface JSXSpreadAttribute extends BaseNode {
    argument: Expression;
    type: AST_NODE_TYPES.JSXSpreadAttribute;
}
export declare interface JSXSpreadChild extends BaseNode {
    expression: Expression | JSXEmptyExpression;
    type: AST_NODE_TYPES.JSXSpreadChild;
}
export declare type JSXTagNameExpression = JSXIdentifier | JSXMemberExpression | JSXNamespacedName;
export declare interface JSXText extends BaseNode {
    raw: string;
    type: AST_NODE_TYPES.JSXText;
    value: string;
}
export declare interface JSXTextToken extends BaseToken {
    type: AST_TOKEN_TYPES.JSXText;
}
export declare interface KeywordToken extends BaseToken {
    type: AST_TOKEN_TYPES.Keyword;
}
export declare interface LabeledStatement extends BaseNode {
    body: Statement;
    label: Identifier;
    type: AST_NODE_TYPES.LabeledStatement;
}
export declare type LeftHandSideExpression = ArrayExpression | ArrayPattern | ArrowFunctionExpression | CallExpression | ClassExpression | FunctionExpression | Identifier | JSXElement | JSXFragment | LiteralExpression | MemberExpression | MetaProperty | ObjectExpression | ObjectPattern | SequenceExpression | Super | TaggedTemplateExpression | ThisExpression | TSAsExpression | TSNonNullExpression | TSTypeAssertion;
export declare type LetOrConstOrVarDeclaration = ConstDeclaration | LetOrVarDeclaredDeclaration | LetOrVarNonDeclaredDeclaration;
declare interface LetOrConstOrVarDeclarationBase extends BaseNode {
    /**
     * The variables declared by this declaration.
     * Always non-empty.
     * @example
     * ```ts
     * let x;
     * let y, z;
     * ```
     */
    declarations: LetOrConstOrVarDeclarator[];
    /**
     * Whether the declaration is `declare`d
     * @example
     * ```ts
     * declare const x = 1;
     * ```
     */
    declare: boolean;
    /**
     * The keyword used to declare the variable(s)
     * @example
     * ```ts
     * const x = 1;
     * let y = 2;
     * var z = 3;
     * ```
     */
    kind: 'const' | 'let' | 'var';
    type: AST_NODE_TYPES.VariableDeclaration;
}
export declare type LetOrConstOrVarDeclarator = VariableDeclaratorDefiniteAssignment | VariableDeclaratorMaybeInit | VariableDeclaratorNoInit;
export declare interface LetOrVarDeclaredDeclaration extends LetOrConstOrVarDeclarationBase {
    /**
     * In a `declare let` declaration, the declarators must not have definite assignment
     * assertions or initializers.
     *
     * @example
     * ```ts
     * using x = 1;
     * using y =1, z = 2;
     * ```
     */
    declarations: VariableDeclaratorNoInit[];
    declare: true;
    kind: 'let' | 'var';
}
export declare interface LetOrVarNonDeclaredDeclaration extends LetOrConstOrVarDeclarationBase {
    /**
     * In a `let`/`var` declaration, the declarators may have definite assignment
     * assertions or initializers, but not both.
     */
    declarations: (VariableDeclaratorDefiniteAssignment | VariableDeclaratorMaybeInit)[];
    declare: false;
    kind: 'let' | 'var';
}
export declare interface LineComment extends BaseToken {
    type: AST_TOKEN_TYPES.Line;
}
export declare type Literal = BigIntLiteral | BooleanLiteral | NullLiteral | NumberLiteral | RegExpLiteral | StringLiteral;
declare interface LiteralBase extends BaseNode {
    raw: string;
    type: AST_NODE_TYPES.Literal;
    value: RegExp | bigint | boolean | number | string | null;
}
export declare type LiteralExpression = Literal | TemplateLiteral;
export declare interface LogicalExpression extends BaseNode {
    left: Expression;
    operator: '&&' | '??' | '||';
    right: Expression;
    type: AST_NODE_TYPES.LogicalExpression;
}
export declare type MemberExpression = MemberExpressionComputedName | MemberExpressionNonComputedName;
declare interface MemberExpressionBase extends BaseNode {
    computed: boolean;
    object: Expression;
    optional: boolean;
    property: Expression | Identifier | PrivateIdentifier;
}
export declare interface MemberExpressionComputedName extends MemberExpressionBase {
    computed: true;
    property: Expression;
    type: AST_NODE_TYPES.MemberExpression;
}
export declare interface MemberExpressionNonComputedName extends MemberExpressionBase {
    computed: false;
    property: Identifier | PrivateIdentifier;
    type: AST_NODE_TYPES.MemberExpression;
}
export declare interface MetaProperty extends BaseNode {
    meta: Identifier;
    property: Identifier;
    type: AST_NODE_TYPES.MetaProperty;
}
export declare type MethodDefinition = MethodDefinitionComputedName | MethodDefinitionNonComputedName;
/** this should not be directly used - instead use MethodDefinitionComputedNameBase or MethodDefinitionNonComputedNameBase */
declare interface MethodDefinitionBase extends BaseNode {
    accessibility: Accessibility | undefined;
    computed: boolean;
    decorators: Decorator[];
    key: PropertyName;
    kind: 'constructor' | 'get' | 'method' | 'set';
    optional: boolean;
    override: boolean;
    static: boolean;
    value: FunctionExpression | TSEmptyBodyFunctionExpression;
}
export declare interface MethodDefinitionComputedName extends MethodDefinitionComputedNameBase {
    type: AST_NODE_TYPES.MethodDefinition;
}
declare interface MethodDefinitionComputedNameBase extends MethodDefinitionBase {
    computed: true;
    key: PropertyNameComputed;
}
export declare interface MethodDefinitionNonComputedName extends ClassMethodDefinitionNonComputedNameBase {
    type: AST_NODE_TYPES.MethodDefinition;
}
declare interface MethodDefinitionNonComputedNameBase extends MethodDefinitionBase {
    computed: false;
    key: PropertyNameNonComputed;
}
export declare type NamedExportDeclarations = ClassDeclarationWithName | ClassDeclarationWithOptionalName | FunctionDeclarationWithName | FunctionDeclarationWithOptionalName | TSDeclareFunction | TSEnumDeclaration | TSImportEqualsDeclaration | TSInterfaceDeclaration | TSModuleDeclaration | TSTypeAliasDeclaration | VariableDeclaration;
export declare interface NewExpression extends BaseNode {
    arguments: CallExpressionArgument[];
    callee: Expression;
    type: AST_NODE_TYPES.NewExpression;
    typeArguments: TSTypeParameterInstantiation | undefined;
}
export declare type Node = AccessorProperty | ArrayExpression | ArrayPattern | ArrowFunctionExpression | AssignmentExpression | AssignmentPattern | AwaitExpression | BinaryExpression | BlockStatement | BreakStatement | CallExpression | CatchClause | ChainExpression | ClassBody | ClassDeclaration | ClassExpression | ConditionalExpression | ContinueStatement | DebuggerStatement | Decorator | DoWhileStatement | EmptyStatement | ExportAllDeclaration | ExportDefaultDeclaration | ExportNamedDeclaration | ExportSpecifier | ExpressionStatement | ForInStatement | ForOfStatement | ForStatement | FunctionDeclaration | FunctionExpression | Identifier | IfStatement | ImportAttribute | ImportDeclaration | ImportDefaultSpecifier | ImportExpression | ImportNamespaceSpecifier | ImportSpecifier | JSXAttribute | JSXClosingElement | JSXClosingFragment | JSXElement | JSXEmptyExpression | JSXExpressionContainer | JSXFragment | JSXIdentifier | JSXMemberExpression | JSXNamespacedName | JSXOpeningElement | JSXOpeningFragment | JSXSpreadAttribute | JSXSpreadChild | JSXText | LabeledStatement | Literal | LogicalExpression | MemberExpression | MetaProperty | MethodDefinition | NewExpression | ObjectExpression | ObjectPattern | PrivateIdentifier | Program | Property | PropertyDefinition | RestElement | ReturnStatement | SequenceExpression | SpreadElement | StaticBlock | Super | SwitchCase | SwitchStatement | TaggedTemplateExpression | TemplateElement | TemplateLiteral | ThisExpression | ThrowStatement | TryStatement | TSAbstractAccessorProperty | TSAbstractKeyword | TSAbstractMethodDefinition | TSAbstractPropertyDefinition | TSAnyKeyword | TSArrayType | TSAsExpression | TSAsyncKeyword | TSBigIntKeyword | TSBooleanKeyword | TSCallSignatureDeclaration | TSClassImplements | TSConditionalType | TSConstructorType | TSConstructSignatureDeclaration | TSDeclareFunction | TSDeclareKeyword | TSEmptyBodyFunctionExpression | TSEnumBody | TSEnumDeclaration | TSEnumMember | TSExportAssignment | TSExportKeyword | TSExternalModuleReference | TSFunctionType | TSImportEqualsDeclaration | TSImportType | TSIndexedAccessType | TSIndexSignature | TSInferType | TSInstantiationExpression | TSInterfaceBody | TSInterfaceDeclaration | TSInterfaceHeritage | TSIntersectionType | TSIntrinsicKeyword | TSLiteralType | TSMappedType | TSMethodSignature | TSModuleBlock | TSModuleDeclaration | TSNamedTupleMember | TSNamespaceExportDeclaration | TSNeverKeyword | TSNonNullExpression | TSNullKeyword | TSNumberKeyword | TSObjectKeyword | TSOptionalType | TSParameterProperty | TSPrivateKeyword | TSPropertySignature | TSProtectedKeyword | TSPublicKeyword | TSQualifiedName | TSReadonlyKeyword | TSRestType | TSSatisfiesExpression | TSStaticKeyword | TSStringKeyword | TSSymbolKeyword | TSTemplateLiteralType | TSThisType | TSTupleType | TSTypeAliasDeclaration | TSTypeAnnotation | TSTypeAssertion | TSTypeLiteral | TSTypeOperator | TSTypeParameter | TSTypeParameterDeclaration | TSTypeParameterInstantiation | TSTypePredicate | TSTypeQuery | TSTypeReference | TSUndefinedKeyword | TSUnionType | TSUnknownKeyword | TSVoidKeyword | UnaryExpression | UpdateExpression | VariableDeclaration | VariableDeclarator | WhileStatement | WithStatement | YieldExpression;
export declare interface NodeOrTokenData {
    /**
     * The source location information of the node.
     *
     * The loc property is defined as nullable by ESTree, but ESLint requires this property.
     */
    loc: SourceLocation;
    range: Range;
    type: string;
}
export declare interface NullLiteral extends LiteralBase {
    raw: 'null';
    value: null;
}
export declare interface NullToken extends BaseToken {
    type: AST_TOKEN_TYPES.Null;
}
export declare interface NumberLiteral extends LiteralBase {
    value: number;
}
export declare interface NumericToken extends BaseToken {
    type: AST_TOKEN_TYPES.Numeric;
}
export declare interface ObjectExpression extends BaseNode {
    properties: ObjectLiteralElement[];
    type: AST_NODE_TYPES.ObjectExpression;
}
export declare type ObjectLiteralElement = Property | SpreadElement;
export declare type ObjectLiteralElementLike = ObjectLiteralElement;
export declare interface ObjectPattern extends BaseNode {
    decorators: Decorator[];
    optional: boolean;
    properties: (Property | RestElement)[];
    type: AST_NODE_TYPES.ObjectPattern;
    typeAnnotation: TSTypeAnnotation | undefined;
}
export declare type OptionalRangeAndLoc<T> = {
    loc?: SourceLocation;
    range?: Range;
} & Pick<T, Exclude<keyof T, 'loc' | 'range'>>;
export declare type Parameter = ArrayPattern | AssignmentPattern | Identifier | ObjectPattern | RestElement | TSParameterProperty;
export declare interface Position {
    /**
     * Column number on the line (0-indexed)
     */
    column: number;
    /**
     * Line number (1-indexed)
     */
    line: number;
}
export declare type PrimaryExpression = ArrayExpression | ArrayPattern | ClassExpression | FunctionExpression | Identifier | JSXElement | JSXFragment | JSXOpeningElement | LiteralExpression | MetaProperty | ObjectExpression | ObjectPattern | Super | TemplateLiteral | ThisExpression | TSNullKeyword;
export declare interface PrivateIdentifier extends BaseNode {
    name: string;
    type: AST_NODE_TYPES.PrivateIdentifier;
}
export declare interface Program extends NodeOrTokenData {
    body: ProgramStatement[];
    comments: Comment[] | undefined;
    sourceType: 'module' | 'script';
    tokens: Token[] | undefined;
    type: AST_NODE_TYPES.Program;
}
export declare type ProgramStatement = ExportAllDeclaration | ExportDefaultDeclaration | ExportNamedDeclaration | ImportDeclaration | Statement | TSImportEqualsDeclaration | TSNamespaceExportDeclaration;
export declare type Property = PropertyComputedName | PropertyNonComputedName;
declare interface PropertyBase extends BaseNode {
    computed: boolean;
    key: PropertyName;
    kind: 'get' | 'init' | 'set';
    method: boolean;
    optional: boolean;
    shorthand: boolean;
    type: AST_NODE_TYPES.Property;
    value: AssignmentPattern | BindingName | Expression | TSEmptyBodyFunctionExpression;
}
export declare interface PropertyComputedName extends PropertyBase {
    computed: true;
    key: PropertyNameComputed;
}
export declare type PropertyDefinition = PropertyDefinitionComputedName | PropertyDefinitionNonComputedName;
declare interface PropertyDefinitionBase extends BaseNode {
    accessibility: Accessibility | undefined;
    computed: boolean;
    declare: boolean;
    decorators: Decorator[];
    definite: boolean;
    key: PropertyName;
    optional: boolean;
    override: boolean;
    readonly: boolean;
    static: boolean;
    typeAnnotation: TSTypeAnnotation | undefined;
    value: Expression | null;
}
export declare interface PropertyDefinitionComputedName extends PropertyDefinitionComputedNameBase {
    type: AST_NODE_TYPES.PropertyDefinition;
}
declare interface PropertyDefinitionComputedNameBase extends PropertyDefinitionBase {
    computed: true;
    key: PropertyNameComputed;
}
export declare interface PropertyDefinitionNonComputedName extends ClassPropertyDefinitionNonComputedNameBase {
    type: AST_NODE_TYPES.PropertyDefinition;
}
declare interface PropertyDefinitionNonComputedNameBase extends PropertyDefinitionBase {
    computed: false;
    key: PropertyNameNonComputed;
}
export declare type PropertyName = ClassPropertyNameNonComputed | PropertyNameComputed | PropertyNameNonComputed;
export declare type PropertyNameComputed = Expression;
export declare type PropertyNameNonComputed = Identifier | NumberLiteral | StringLiteral;
export declare interface PropertyNonComputedName extends PropertyBase {
    computed: false;
    key: PropertyNameNonComputed;
}
export declare interface PunctuatorToken extends BaseToken {
    type: AST_TOKEN_TYPES.Punctuator;
    value: ValueOf<PunctuatorTokenToText>;
}
export declare interface PunctuatorTokenToText extends AssignmentOperatorToText {
    [SyntaxKind.AmpersandAmpersandToken]: '&&';
    [SyntaxKind.AmpersandToken]: '&';
    [SyntaxKind.AsteriskAsteriskToken]: '**';
    [SyntaxKind.AsteriskToken]: '*';
    [SyntaxKind.AtToken]: '@';
    [SyntaxKind.BacktickToken]: '`';
    [SyntaxKind.BarBarToken]: '||';
    [SyntaxKind.BarToken]: '|';
    [SyntaxKind.CaretToken]: '^';
    [SyntaxKind.CloseBraceToken]: '}';
    [SyntaxKind.CloseBracketToken]: ']';
    [SyntaxKind.CloseParenToken]: ')';
    [SyntaxKind.ColonToken]: ':';
    [SyntaxKind.CommaToken]: ',';
    [SyntaxKind.DotDotDotToken]: '...';
    [SyntaxKind.DotToken]: '.';
    [SyntaxKind.EqualsEqualsEqualsToken]: '===';
    [SyntaxKind.EqualsEqualsToken]: '==';
    [SyntaxKind.EqualsGreaterThanToken]: '=>';
    [SyntaxKind.ExclamationEqualsEqualsToken]: '!==';
    [SyntaxKind.ExclamationEqualsToken]: '!=';
    [SyntaxKind.ExclamationToken]: '!';
    [SyntaxKind.GreaterThanEqualsToken]: '>=';
    [SyntaxKind.GreaterThanGreaterThanGreaterThanToken]: '>>>';
    [SyntaxKind.GreaterThanGreaterThanToken]: '>>';
    [SyntaxKind.GreaterThanToken]: '>';
    [SyntaxKind.HashToken]: '#';
    [SyntaxKind.LessThanEqualsToken]: '<=';
    [SyntaxKind.LessThanLessThanToken]: '<<';
    [SyntaxKind.LessThanSlashToken]: '</';
    [SyntaxKind.LessThanToken]: '<';
    [SyntaxKind.MinusMinusToken]: '--';
    [SyntaxKind.MinusToken]: '-';
    [SyntaxKind.OpenBraceToken]: '{';
    [SyntaxKind.OpenBracketToken]: '[';
    [SyntaxKind.OpenParenToken]: '(';
    [SyntaxKind.PercentToken]: '%';
    [SyntaxKind.PlusPlusToken]: '++';
    [SyntaxKind.PlusToken]: '+';
    [SyntaxKind.QuestionDotToken]: '?.';
    [SyntaxKind.QuestionQuestionToken]: '??';
    [SyntaxKind.QuestionToken]: '?';
    [SyntaxKind.SemicolonToken]: ';';
    [SyntaxKind.SlashToken]: '/';
    [SyntaxKind.TildeToken]: '~';
}
/**
 * An array of two numbers.
 * Both numbers are a 0-based index which is the position in the array of source code characters.
 * The first is the start position of the node, the second is the end position of the node.
 */
export declare type Range = [number, number];
export declare interface RegExpLiteral extends LiteralBase {
    regex: {
        flags: string;
        pattern: string;
    };
    value: RegExp | null;
}
export declare interface RegularExpressionToken extends BaseToken {
    regex: {
        flags: string;
        pattern: string;
    };
    type: AST_TOKEN_TYPES.RegularExpression;
}
export declare interface RestElement extends BaseNode {
    argument: DestructuringPattern;
    decorators: Decorator[];
    optional: boolean;
    type: AST_NODE_TYPES.RestElement;
    typeAnnotation: TSTypeAnnotation | undefined;
    value: AssignmentPattern | undefined;
}
export declare interface ReturnStatement extends BaseNode {
    argument: Expression | null;
    type: AST_NODE_TYPES.ReturnStatement;
}
export declare interface SequenceExpression extends BaseNode {
    expressions: Expression[];
    type: AST_NODE_TYPES.SequenceExpression;
}
export declare interface SourceLocation {
    /**
     * The position of the first character after the parsed source region
     */
    end: Position;
    /**
     * The position of the first character of the parsed source region
     */
    start: Position;
}
export declare interface SpreadElement extends BaseNode {
    argument: Expression;
    type: AST_NODE_TYPES.SpreadElement;
}
export declare type Statement = BlockStatement | BreakStatement | ClassDeclarationWithName | ContinueStatement | DebuggerStatement | DoWhileStatement | EmptyStatement | ExportAllDeclaration | ExportDefaultDeclaration | ExportNamedDeclaration | ExpressionStatement | ForInStatement | ForOfStatement | ForStatement | FunctionDeclarationWithName | IfStatement | ImportDeclaration | LabeledStatement | ReturnStatement | SwitchStatement | ThrowStatement | TryStatement | TSDeclareFunction | TSEnumDeclaration | TSExportAssignment | TSImportEqualsDeclaration | TSInterfaceDeclaration | TSModuleDeclaration | TSNamespaceExportDeclaration | TSTypeAliasDeclaration | VariableDeclaration | WhileStatement | WithStatement;
export declare interface StaticBlock extends BaseNode {
    body: Statement[];
    type: AST_NODE_TYPES.StaticBlock;
}
export declare interface StringLiteral extends LiteralBase {
    value: string;
}
export declare interface StringToken extends BaseToken {
    type: AST_TOKEN_TYPES.String;
}
export declare interface Super extends BaseNode {
    type: AST_NODE_TYPES.Super;
}
export declare interface SwitchCase extends BaseNode {
    consequent: Statement[];
    test: Expression | null;
    type: AST_NODE_TYPES.SwitchCase;
}
export declare interface SwitchStatement extends BaseNode {
    cases: SwitchCase[];
    discriminant: Expression;
    type: AST_NODE_TYPES.SwitchStatement;
}
export declare interface TaggedTemplateExpression extends BaseNode {
    quasi: TemplateLiteral;
    tag: Expression;
    type: AST_NODE_TYPES.TaggedTemplateExpression;
    typeArguments: TSTypeParameterInstantiation | undefined;
}
export declare interface TemplateElement extends BaseNode {
    tail: boolean;
    type: AST_NODE_TYPES.TemplateElement;
    value: {
        cooked: string;
        raw: string;
    };
}
export declare interface TemplateLiteral extends BaseNode {
    expressions: Expression[];
    quasis: TemplateElement[];
    type: AST_NODE_TYPES.TemplateLiteral;
}
export declare interface TemplateToken extends BaseToken {
    type: AST_TOKEN_TYPES.Template;
}
export declare interface ThisExpression extends BaseNode {
    type: AST_NODE_TYPES.ThisExpression;
}
export declare interface ThrowStatement extends BaseNode {
    argument: Expression;
    type: AST_NODE_TYPES.ThrowStatement;
}
export declare type Token = BooleanToken | Comment | IdentifierToken | JSXIdentifierToken | JSXTextToken | KeywordToken | NullToken | NumericToken | PunctuatorToken | RegularExpressionToken | StringToken | TemplateToken;
export declare interface TryStatement extends BaseNode {
    block: BlockStatement;
    finalizer: BlockStatement | null;
    handler: CatchClause | null;
    type: AST_NODE_TYPES.TryStatement;
}
export declare type TSAbstractAccessorProperty = TSAbstractAccessorPropertyComputedName | TSAbstractAccessorPropertyNonComputedName;
export declare interface TSAbstractAccessorPropertyComputedName extends PropertyDefinitionComputedNameBase {
    type: AST_NODE_TYPES.TSAbstractAccessorProperty;
    value: null;
}
export declare interface TSAbstractAccessorPropertyNonComputedName extends PropertyDefinitionNonComputedNameBase {
    type: AST_NODE_TYPES.TSAbstractAccessorProperty;
    value: null;
}
export declare interface TSAbstractKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSAbstractKeyword;
}
export declare type TSAbstractMethodDefinition = TSAbstractMethodDefinitionComputedName | TSAbstractMethodDefinitionNonComputedName;
export declare interface TSAbstractMethodDefinitionComputedName extends MethodDefinitionComputedNameBase {
    type: AST_NODE_TYPES.TSAbstractMethodDefinition;
}
export declare interface TSAbstractMethodDefinitionNonComputedName extends MethodDefinitionNonComputedNameBase {
    type: AST_NODE_TYPES.TSAbstractMethodDefinition;
}
export declare type TSAbstractPropertyDefinition = TSAbstractPropertyDefinitionComputedName | TSAbstractPropertyDefinitionNonComputedName;
export declare interface TSAbstractPropertyDefinitionComputedName extends PropertyDefinitionComputedNameBase {
    type: AST_NODE_TYPES.TSAbstractPropertyDefinition;
    value: null;
}
export declare interface TSAbstractPropertyDefinitionNonComputedName extends PropertyDefinitionNonComputedNameBase {
    type: AST_NODE_TYPES.TSAbstractPropertyDefinition;
    value: null;
}
export declare interface TSAnyKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSAnyKeyword;
}
export declare interface TSArrayType extends BaseNode {
    elementType: TypeNode;
    type: AST_NODE_TYPES.TSArrayType;
}
export declare interface TSAsExpression extends BaseNode {
    expression: Expression;
    type: AST_NODE_TYPES.TSAsExpression;
    typeAnnotation: TypeNode;
}
export declare interface TSAsyncKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSAsyncKeyword;
}
export declare interface TSBigIntKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSBigIntKeyword;
}
export declare interface TSBooleanKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSBooleanKeyword;
}
export declare interface TSCallSignatureDeclaration extends TSFunctionSignatureBase {
    type: AST_NODE_TYPES.TSCallSignatureDeclaration;
}
export declare interface TSClassImplements extends TSHeritageBase {
    type: AST_NODE_TYPES.TSClassImplements;
}
export declare interface TSConditionalType extends BaseNode {
    checkType: TypeNode;
    extendsType: TypeNode;
    falseType: TypeNode;
    trueType: TypeNode;
    type: AST_NODE_TYPES.TSConditionalType;
}
export declare interface TSConstructorType extends TSFunctionSignatureBase {
    abstract: boolean;
    type: AST_NODE_TYPES.TSConstructorType;
}
export declare interface TSConstructSignatureDeclaration extends TSFunctionSignatureBase {
    type: AST_NODE_TYPES.TSConstructSignatureDeclaration;
}
export declare type TSDeclareFunction = TSDeclareFunctionNoDeclare | TSDeclareFunctionWithDeclare;
declare interface TSDeclareFunctionBase extends FunctionBase {
    /**
     * TS1183: An implementation cannot be declared in ambient contexts.
     */
    body: undefined;
    /**
     * Whether the declaration has `declare` modifier.
     */
    declare: boolean;
    expression: false;
    type: AST_NODE_TYPES.TSDeclareFunction;
}
/**
 * Function declaration without the `declare` keyword:
 * ```
 * function foo(): void;
 * ```
 * This can either be an overload signature or a declaration in an ambient context
 * (e.g. `declare module`)
 */
export declare interface TSDeclareFunctionNoDeclare extends TSDeclareFunctionBase {
    declare: false;
    /**
     * - TS1221: Generators are not allowed in an ambient context.
     * - TS1222: An overload signature cannot be declared as a generator.
     */
    generator: false;
}
/**
 * Function declaration with the `declare` keyword:
 * ```
 * declare function foo(): void;
 * ```
 */
export declare interface TSDeclareFunctionWithDeclare extends TSDeclareFunctionBase {
    /**
     * TS1040: 'async' modifier cannot be used in an ambient context.
     */
    async: false;
    declare: true;
    /**
     * TS1221: Generators are not allowed in an ambient context.
     */
    generator: false;
}
export declare interface TSDeclareKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSDeclareKeyword;
}
export declare interface TSEmptyBodyFunctionExpression extends FunctionBase {
    body: null;
    id: null;
    type: AST_NODE_TYPES.TSEmptyBodyFunctionExpression;
}
export declare interface TSEnumBody extends BaseNode {
    members: TSEnumMember[];
    type: AST_NODE_TYPES.TSEnumBody;
}
export declare interface TSEnumDeclaration extends BaseNode {
    /**
     * The body of the enum.
     */
    body: TSEnumBody;
    /**
     * Whether this is a `const` enum.
     * @example
     * ```ts
     * const enum Foo {}
     * ```
     */
    const: boolean;
    /**
     * Whether this is a `declare`d enum.
     * @example
     * ```ts
     * declare enum Foo {}
     * ```
     */
    declare: boolean;
    /**
     * The enum name.
     */
    id: Identifier;
    /**
     * The enum members.
     * @deprecated Use {@link body} instead.
     */
    members: TSEnumMember[];
    type: AST_NODE_TYPES.TSEnumDeclaration;
}
export declare type TSEnumMember = TSEnumMemberComputedName | TSEnumMemberNonComputedName;
declare interface TSEnumMemberBase extends BaseNode {
    computed: boolean;
    id: PropertyNameComputed | PropertyNameNonComputed;
    initializer: Expression | undefined;
    type: AST_NODE_TYPES.TSEnumMember;
}
/**
 * this should only really happen in semantically invalid code (errors 1164 and 2452)
 *
 * @example
 * ```ts
 * // VALID:
 * enum Foo { ['a'] }
 *
 * // INVALID:
 * const x = 'a';
 * enum Foo { [x] }
 * enum Bar { ['a' + 'b'] }
 * ```
 */
export declare interface TSEnumMemberComputedName extends TSEnumMemberBase {
    computed: true;
    id: PropertyNameComputed;
}
export declare interface TSEnumMemberNonComputedName extends TSEnumMemberBase {
    computed: false;
    id: PropertyNameNonComputed;
}
export declare interface TSExportAssignment extends BaseNode {
    expression: Expression;
    type: AST_NODE_TYPES.TSExportAssignment;
}
export declare interface TSExportKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSExportKeyword;
}
export declare interface TSExternalModuleReference extends BaseNode {
    expression: StringLiteral;
    type: AST_NODE_TYPES.TSExternalModuleReference;
}
declare interface TSFunctionSignatureBase extends BaseNode {
    params: Parameter[];
    returnType: TSTypeAnnotation | undefined;
    typeParameters: TSTypeParameterDeclaration | undefined;
}
export declare interface TSFunctionType extends TSFunctionSignatureBase {
    type: AST_NODE_TYPES.TSFunctionType;
}
declare interface TSHeritageBase extends BaseNode {
    expression: Expression;
    typeArguments: TSTypeParameterInstantiation | undefined;
}
export declare type TSImportEqualsDeclaration = TSImportEqualsNamespaceDeclaration | TSImportEqualsRequireDeclaration;
declare interface TSImportEqualsDeclarationBase extends BaseNode {
    /**
     * The locally imported name.
     */
    id: Identifier;
    /**
     * The kind of the import. Always `'value'` unless `moduleReference` is a
     * `TSExternalModuleReference`.
     */
    importKind: ImportKind;
    /**
     * The value being aliased.
     * @example
     * ```ts
     * import F1 = A;
     * import F2 = A.B.C;
     * import F3 = require('mod');
     * ```
     */
    moduleReference: Identifier | TSExternalModuleReference | TSQualifiedName;
    type: AST_NODE_TYPES.TSImportEqualsDeclaration;
}
export declare interface TSImportEqualsNamespaceDeclaration extends TSImportEqualsDeclarationBase {
    /**
     * The kind of the import.
     */
    importKind: 'value';
    /**
     * The value being aliased.
     * ```
     * import F1 = A;
     * import F2 = A.B.C;
     * ```
     */
    moduleReference: Identifier | TSQualifiedName;
}
export declare interface TSImportEqualsRequireDeclaration extends TSImportEqualsDeclarationBase {
    /**
     * The kind of the import.
     */
    importKind: ImportKind;
    /**
     * The value being aliased.
     * ```
     * import F3 = require('mod');
     * ```
     */
    moduleReference: TSExternalModuleReference;
}
export declare interface TSImportType extends BaseNode {
    argument: TypeNode;
    qualifier: EntityName | null;
    type: AST_NODE_TYPES.TSImportType;
    typeArguments: TSTypeParameterInstantiation | null;
}
export declare interface TSIndexedAccessType extends BaseNode {
    indexType: TypeNode;
    objectType: TypeNode;
    type: AST_NODE_TYPES.TSIndexedAccessType;
}
export declare interface TSIndexSignature extends BaseNode {
    accessibility: Accessibility | undefined;
    parameters: Parameter[];
    readonly: boolean;
    static: boolean;
    type: AST_NODE_TYPES.TSIndexSignature;
    typeAnnotation: TSTypeAnnotation | undefined;
}
export declare interface TSInferType extends BaseNode {
    type: AST_NODE_TYPES.TSInferType;
    typeParameter: TSTypeParameter;
}
export declare interface TSInstantiationExpression extends BaseNode {
    expression: Expression;
    type: AST_NODE_TYPES.TSInstantiationExpression;
    typeArguments: TSTypeParameterInstantiation;
}
export declare interface TSInterfaceBody extends BaseNode {
    body: TypeElement[];
    type: AST_NODE_TYPES.TSInterfaceBody;
}
export declare interface TSInterfaceDeclaration extends BaseNode {
    /**
     * The body of the interface
     */
    body: TSInterfaceBody;
    /**
     * Whether the interface was `declare`d
     */
    declare: boolean;
    /**
     * The types this interface `extends`
     */
    extends: TSInterfaceHeritage[];
    /**
     * The name of this interface
     */
    id: Identifier;
    type: AST_NODE_TYPES.TSInterfaceDeclaration;
    /**
     * The generic type parameters declared for the interface. Empty declaration
     * (`<>`) is different from no declaration.
     */
    typeParameters: TSTypeParameterDeclaration | undefined;
}
export declare interface TSInterfaceHeritage extends TSHeritageBase {
    type: AST_NODE_TYPES.TSInterfaceHeritage;
}
export declare interface TSIntersectionType extends BaseNode {
    type: AST_NODE_TYPES.TSIntersectionType;
    types: TypeNode[];
}
export declare interface TSIntrinsicKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSIntrinsicKeyword;
}
export declare interface TSLiteralType extends BaseNode {
    literal: LiteralExpression | UnaryExpression | UpdateExpression;
    type: AST_NODE_TYPES.TSLiteralType;
}
export declare interface TSMappedType extends BaseNode {
    constraint: TypeNode;
    key: Identifier;
    nameType: TypeNode | null;
    optional: '+' | '-' | boolean | undefined;
    readonly: '+' | '-' | boolean | undefined;
    type: AST_NODE_TYPES.TSMappedType;
    typeAnnotation: TypeNode | undefined;
    /** @deprecated Use {@link `constraint`} and {@link `key`} instead. */
    typeParameter: TSTypeParameter;
}
export declare type TSMethodSignature = TSMethodSignatureComputedName | TSMethodSignatureNonComputedName;
declare interface TSMethodSignatureBase extends BaseNode {
    accessibility: Accessibility | undefined;
    computed: boolean;
    key: PropertyName;
    kind: 'get' | 'method' | 'set';
    optional: boolean;
    params: Parameter[];
    readonly: boolean;
    returnType: TSTypeAnnotation | undefined;
    static: boolean;
    type: AST_NODE_TYPES.TSMethodSignature;
    typeParameters: TSTypeParameterDeclaration | undefined;
}
export declare interface TSMethodSignatureComputedName extends TSMethodSignatureBase {
    computed: true;
    key: PropertyNameComputed;
}
export declare interface TSMethodSignatureNonComputedName extends TSMethodSignatureBase {
    computed: false;
    key: PropertyNameNonComputed;
}
export declare interface TSModuleBlock extends BaseNode {
    body: ProgramStatement[];
    type: AST_NODE_TYPES.TSModuleBlock;
}
export declare type TSModuleDeclaration = TSModuleDeclarationGlobal | TSModuleDeclarationModule | TSModuleDeclarationNamespace;
declare interface TSModuleDeclarationBase extends BaseNode {
    /**
     * The body of the module.
     * This can only be `undefined` for the code `declare module 'mod';`
     */
    body?: TSModuleBlock;
    /**
     * Whether the module is `declare`d
     * @example
     * ```ts
     * declare namespace F {}
     * ```
     */
    declare: boolean;
    /**
     * Whether this is a global declaration
     * @example
     * ```ts
     * declare global {}
     * ```
     *
     * @deprecated Use {@link kind} instead
     */
    global: boolean;
    /**
     * The name of the module
     * ```
     * namespace A {}
     * namespace A.B.C {}
     * module 'a' {}
     * ```
     */
    id: Identifier | Literal | TSQualifiedName;
    /**
     * The keyword used to define this module declaration
     * @example
     * ```ts
     * namespace Foo {}
     * ^^^^^^^^^
     *
     * module 'foo' {}
     * ^^^^^^
     *
     * global {}
     * ^^^^^^
     * ```
     */
    kind: TSModuleDeclarationKind;
    type: AST_NODE_TYPES.TSModuleDeclaration;
}
export declare interface TSModuleDeclarationGlobal extends TSModuleDeclarationBase {
    body: TSModuleBlock;
    /**
     * This will always be an Identifier with name `global`
     */
    id: Identifier;
    kind: 'global';
}
export declare type TSModuleDeclarationKind = 'global' | 'module' | 'namespace';
export declare type TSModuleDeclarationModule = TSModuleDeclarationModuleWithIdentifierId | TSModuleDeclarationModuleWithStringId;
declare interface TSModuleDeclarationModuleBase extends TSModuleDeclarationBase {
    kind: 'module';
}
/**
 * The legacy module declaration, replaced with namespace declarations.
 * ```
 * module A {}
 * ```
 */
export declare interface TSModuleDeclarationModuleWithIdentifierId extends TSModuleDeclarationModuleBase {
    body: TSModuleBlock;
    id: Identifier;
    kind: 'module';
}
export declare type TSModuleDeclarationModuleWithStringId = TSModuleDeclarationModuleWithStringIdDeclared | TSModuleDeclarationModuleWithStringIdNotDeclared;
/**
 * A string module declaration that is declared:
 * ```
 * declare module 'foo' {}
 * declare module 'foo';
 * ```
 */
export declare interface TSModuleDeclarationModuleWithStringIdDeclared extends TSModuleDeclarationModuleBase {
    body?: TSModuleBlock;
    declare: true;
    id: StringLiteral;
    kind: 'module';
}
/**
 * A string module declaration that is not declared:
 * ```
 * module 'foo' {}
 * ```
 */
export declare interface TSModuleDeclarationModuleWithStringIdNotDeclared extends TSModuleDeclarationModuleBase {
    body: TSModuleBlock;
    declare: false;
    id: StringLiteral;
    kind: 'module';
}
export declare interface TSModuleDeclarationNamespace extends TSModuleDeclarationBase {
    body: TSModuleBlock;
    id: Identifier | TSQualifiedName;
    kind: 'namespace';
}
export declare interface TSNamedTupleMember extends BaseNode {
    elementType: TypeNode;
    label: Identifier;
    optional: boolean;
    type: AST_NODE_TYPES.TSNamedTupleMember;
}
/**
 * For the following declaration:
 * ```
 * export as namespace X;
 * ```
 */
export declare interface TSNamespaceExportDeclaration extends BaseNode {
    /**
     * The name of the global variable that's exported as namespace
     */
    id: Identifier;
    type: AST_NODE_TYPES.TSNamespaceExportDeclaration;
}
export declare interface TSNeverKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSNeverKeyword;
}
export declare interface TSNonNullExpression extends BaseNode {
    expression: Expression;
    type: AST_NODE_TYPES.TSNonNullExpression;
}
export declare interface TSNullKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSNullKeyword;
}
export declare interface TSNumberKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSNumberKeyword;
}
export declare interface TSObjectKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSObjectKeyword;
}
export declare interface TSOptionalType extends BaseNode {
    type: AST_NODE_TYPES.TSOptionalType;
    typeAnnotation: TypeNode;
}
export declare interface TSParameterProperty extends BaseNode {
    accessibility: Accessibility | undefined;
    decorators: Decorator[];
    override: boolean;
    parameter: AssignmentPattern | BindingName | RestElement;
    readonly: boolean;
    static: boolean;
    type: AST_NODE_TYPES.TSParameterProperty;
}
export declare interface TSPrivateKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSPrivateKeyword;
}
export declare type TSPropertySignature = TSPropertySignatureComputedName | TSPropertySignatureNonComputedName;
declare interface TSPropertySignatureBase extends BaseNode {
    accessibility: Accessibility | undefined;
    computed: boolean;
    key: PropertyName;
    optional: boolean;
    readonly: boolean;
    static: boolean;
    type: AST_NODE_TYPES.TSPropertySignature;
    typeAnnotation: TSTypeAnnotation | undefined;
}
export declare interface TSPropertySignatureComputedName extends TSPropertySignatureBase {
    computed: true;
    key: PropertyNameComputed;
}
export declare interface TSPropertySignatureNonComputedName extends TSPropertySignatureBase {
    computed: false;
    key: PropertyNameNonComputed;
}
export declare interface TSProtectedKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSProtectedKeyword;
}
export declare interface TSPublicKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSPublicKeyword;
}
export declare interface TSQualifiedName extends BaseNode {
    left: EntityName;
    right: Identifier;
    type: AST_NODE_TYPES.TSQualifiedName;
}
export declare interface TSReadonlyKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSReadonlyKeyword;
}
export declare interface TSRestType extends BaseNode {
    type: AST_NODE_TYPES.TSRestType;
    typeAnnotation: TypeNode;
}
export declare interface TSSatisfiesExpression extends BaseNode {
    expression: Expression;
    type: AST_NODE_TYPES.TSSatisfiesExpression;
    typeAnnotation: TypeNode;
}
export declare interface TSStaticKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSStaticKeyword;
}
export declare interface TSStringKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSStringKeyword;
}
export declare interface TSSymbolKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSSymbolKeyword;
}
export declare interface TSTemplateLiteralType extends BaseNode {
    quasis: TemplateElement[];
    type: AST_NODE_TYPES.TSTemplateLiteralType;
    types: TypeNode[];
}
export declare interface TSThisType extends BaseNode {
    type: AST_NODE_TYPES.TSThisType;
}
export declare interface TSTupleType extends BaseNode {
    elementTypes: TypeNode[];
    type: AST_NODE_TYPES.TSTupleType;
}
export declare interface TSTypeAliasDeclaration extends BaseNode {
    /**
     * Whether the type was `declare`d.
     * @example
     * ```ts
     * declare type T = 1;
     * ```
     */
    declare: boolean;
    /**
     * The name of the type.
     */
    id: Identifier;
    type: AST_NODE_TYPES.TSTypeAliasDeclaration;
    /**
     * The "value" (type) of the declaration
     */
    typeAnnotation: TypeNode;
    /**
     * The generic type parameters declared for the type. Empty declaration
     * (`<>`) is different from no declaration.
     */
    typeParameters: TSTypeParameterDeclaration | undefined;
}
export declare interface TSTypeAnnotation extends BaseNode {
    type: AST_NODE_TYPES.TSTypeAnnotation;
    typeAnnotation: TypeNode;
}
export declare interface TSTypeAssertion extends BaseNode {
    expression: Expression;
    type: AST_NODE_TYPES.TSTypeAssertion;
    typeAnnotation: TypeNode;
}
export declare interface TSTypeLiteral extends BaseNode {
    members: TypeElement[];
    type: AST_NODE_TYPES.TSTypeLiteral;
}
export declare interface TSTypeOperator extends BaseNode {
    operator: 'keyof' | 'readonly' | 'unique';
    type: AST_NODE_TYPES.TSTypeOperator;
    typeAnnotation: TypeNode | undefined;
}
export declare interface TSTypeParameter extends BaseNode {
    const: boolean;
    constraint: TypeNode | undefined;
    default: TypeNode | undefined;
    in: boolean;
    name: Identifier;
    out: boolean;
    type: AST_NODE_TYPES.TSTypeParameter;
}
export declare interface TSTypeParameterDeclaration extends BaseNode {
    params: TSTypeParameter[];
    type: AST_NODE_TYPES.TSTypeParameterDeclaration;
}
export declare interface TSTypeParameterInstantiation extends BaseNode {
    params: TypeNode[];
    type: AST_NODE_TYPES.TSTypeParameterInstantiation;
}
export declare interface TSTypePredicate extends BaseNode {
    asserts: boolean;
    parameterName: Identifier | TSThisType;
    type: AST_NODE_TYPES.TSTypePredicate;
    typeAnnotation: TSTypeAnnotation | null;
}
export declare interface TSTypeQuery extends BaseNode {
    exprName: EntityName | TSImportType;
    type: AST_NODE_TYPES.TSTypeQuery;
    typeArguments: TSTypeParameterInstantiation | undefined;
}
export declare interface TSTypeReference extends BaseNode {
    type: AST_NODE_TYPES.TSTypeReference;
    typeArguments: TSTypeParameterInstantiation | undefined;
    typeName: EntityName;
}
export declare type TSUnaryExpression = AwaitExpression | LeftHandSideExpression | UnaryExpression | UpdateExpression;
export declare interface TSUndefinedKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSUndefinedKeyword;
}
export declare interface TSUnionType extends BaseNode {
    type: AST_NODE_TYPES.TSUnionType;
    types: TypeNode[];
}
export declare interface TSUnknownKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSUnknownKeyword;
}
export declare interface TSVoidKeyword extends BaseNode {
    type: AST_NODE_TYPES.TSVoidKeyword;
}
export declare type TypeElement = TSCallSignatureDeclaration | TSConstructSignatureDeclaration | TSIndexSignature | TSMethodSignature | TSPropertySignature;
export declare type TypeNode = TSAbstractKeyword | TSAnyKeyword | TSArrayType | TSAsyncKeyword | TSBigIntKeyword | TSBooleanKeyword | TSConditionalType | TSConstructorType | TSDeclareKeyword | TSExportKeyword | TSFunctionType | TSImportType | TSIndexedAccessType | TSInferType | TSIntersectionType | TSIntrinsicKeyword | TSLiteralType | TSMappedType | TSNamedTupleMember | TSNeverKeyword | TSNullKeyword | TSNumberKeyword | TSObjectKeyword | TSOptionalType | TSPrivateKeyword | TSProtectedKeyword | TSPublicKeyword | TSQualifiedName | TSReadonlyKeyword | TSRestType | TSStaticKeyword | TSStringKeyword | TSSymbolKeyword | TSTemplateLiteralType | TSThisType | TSTupleType | TSTypeLiteral | TSTypeOperator | TSTypePredicate | TSTypeQuery | TSTypeReference | TSUndefinedKeyword | TSUnionType | TSUnknownKeyword | TSVoidKeyword;
export declare interface UnaryExpression extends UnaryExpressionBase {
    operator: '!' | '+' | '~' | '-' | 'delete' | 'typeof' | 'void';
    type: AST_NODE_TYPES.UnaryExpression;
}
declare interface UnaryExpressionBase extends BaseNode {
    argument: Expression;
    operator: string;
    prefix: boolean;
}
export declare interface UpdateExpression extends UnaryExpressionBase {
    operator: '++' | '--';
    type: AST_NODE_TYPES.UpdateExpression;
}
export declare type UsingDeclaration = UsingInForOfDeclaration | UsingInNormalContextDeclaration;
declare interface UsingDeclarationBase extends BaseNode {
    /**
     * This value will always be `false`
     * because 'declare' modifier cannot appear on a 'using' declaration.
     */
    declare: false;
    /**
     * The keyword used to declare the variable(s)
     * @example
     * ```ts
     * using x = 1;
     * await using y = 2;
     * ```
     */
    kind: 'await using' | 'using';
    type: AST_NODE_TYPES.VariableDeclaration;
}
export declare type UsingDeclarator = UsingInForOfDeclarator | UsingInNormalContextDeclarator;
export declare interface UsingInForOfDeclaration extends UsingDeclarationBase {
    /**
     * The variables declared by this declaration.
     * Always has exactly one element.
     * @example
     * ```ts
     * for (using x of y) {}
     * ```
     */
    declarations: [UsingInForOfDeclarator];
}
export declare interface UsingInForOfDeclarator extends VariableDeclaratorBase {
    definite: false;
    id: Identifier;
    init: null;
}
export declare interface UsingInNormalContextDeclaration extends UsingDeclarationBase {
    /**
     * The variables declared by this declaration.
     * Always non-empty.
     * @example
     * ```ts
     * using x = 1;
     * using y = 1, z = 2;
     * ```
     */
    declarations: UsingInNormalContextDeclarator[];
}
export declare interface UsingInNormalContextDeclarator extends VariableDeclaratorBase {
    definite: false;
    id: Identifier;
    init: Expression;
}
declare type ValueOf<T> = T[keyof T];
export declare type VariableDeclaration = LetOrConstOrVarDeclaration | UsingDeclaration;
export declare type VariableDeclarator = LetOrConstOrVarDeclarator | UsingDeclarator;
declare interface VariableDeclaratorBase extends BaseNode {
    /**
     * Whether there's definite assignment assertion (`let x!: number`).
     * If `true`, then: `id` must be an identifier with a type annotation,
     * `init` must be `null`, and the declarator must be a `var`/`let` declarator.
     */
    definite: boolean;
    /**
     * The name(s) of the variable(s).
     */
    id: BindingName;
    /**
     * The initializer expression of the variable. Must be present for `const` unless
     * in a `declare const`.
     */
    init: Expression | null;
    type: AST_NODE_TYPES.VariableDeclarator;
}
export declare interface VariableDeclaratorDefiniteAssignment extends VariableDeclaratorBase {
    definite: true;
    /**
     * The name of the variable. Must have a type annotation.
     */
    id: Identifier;
    init: null;
}
export declare interface VariableDeclaratorMaybeInit extends VariableDeclaratorBase {
    definite: false;
}
export declare interface VariableDeclaratorNoInit extends VariableDeclaratorBase {
    definite: false;
    init: null;
}
export declare interface WhileStatement extends BaseNode {
    body: Statement;
    test: Expression;
    type: AST_NODE_TYPES.WhileStatement;
}
export declare interface WithStatement extends BaseNode {
    body: Statement;
    object: Expression;
    type: AST_NODE_TYPES.WithStatement;
}
export declare interface YieldExpression extends BaseNode {
    argument: Expression | undefined;
    delegate: boolean;
    type: AST_NODE_TYPES.YieldExpression;
}
export {};
//# sourceMappingURL=ast-spec.d.ts.map