import { SerializerOptions } from "./util/serializer.common";
/**
 * Used to map raw response objects to final shapes.
 * Helps packing and unpacking Dates and other encoded types that are not intrinsic to JSON.
 * Also allows pulling values from headers, as well as inserting default values and constants.
 */
export declare class Serializer {
    /**
     * The provided model mapper.
     */
    readonly modelMappers: {
        [key: string]: any;
    };
    /**
     * Whether the contents are XML or not.
     */
    readonly isXML?: boolean | undefined;
    constructor(
    /**
     * The provided model mapper.
     */
    modelMappers?: {
        [key: string]: any;
    }, 
    /**
     * Whether the contents are XML or not.
     */
    isXML?: boolean | undefined);
    /**
     * Validates constraints, if any. This function will throw if the provided value does not respect those constraints.
     * @param mapper - The definition of data models.
     * @param value - The value.
     * @param objectName - Name of the object. Used in the error messages.
     * @deprecated Removing the constraints validation on client side.
     */
    validateConstraints(mapper: Mapper, value: unknown, objectName: string): void;
    /**
     * Serialize the given object based on its metadata defined in the mapper.
     *
     * @param mapper - The mapper which defines the metadata of the serializable object.
     * @param object - A valid Javascript object to be serialized.
     * @param objectName - Name of the serialized object.
     * @param options - additional options to deserialization.
     * @returns A valid serialized Javascript object.
     */
    serialize(mapper: Mapper, object: unknown, objectName?: string, options?: SerializerOptions): any;
    /**
     * Deserialize the given object based on its metadata defined in the mapper.
     *
     * @param mapper - The mapper which defines the metadata of the serializable object.
     * @param responseBody - A valid Javascript entity to be deserialized.
     * @param objectName - Name of the deserialized object.
     * @param options - Controls behavior of XML parser and builder.
     * @returns A valid deserialized Javascript object.
     */
    deserialize(mapper: Mapper, responseBody: unknown, objectName: string, options?: SerializerOptions): any;
}
/**
 * Description of various value constraints such as integer ranges and string regex.
 */
export interface MapperConstraints {
    /**
     * The value should be less than or equal to the `InclusiveMaximum` value.
     */
    InclusiveMaximum?: number;
    /**
     * The value should be less than the `ExclusiveMaximum` value.
     */
    ExclusiveMaximum?: number;
    /**
     * The value should be greater than or equal to the `InclusiveMinimum` value.
     */
    InclusiveMinimum?: number;
    /**
     * The value should be greater than the `InclusiveMinimum` value.
     */
    ExclusiveMinimum?: number;
    /**
     * The length should be smaller than the `MaxLength`.
     */
    MaxLength?: number;
    /**
     * The length should be bigger than the `MinLength`.
     */
    MinLength?: number;
    /**
     * The value must match the pattern.
     */
    Pattern?: RegExp;
    /**
     * The value must contain fewer items than the MaxItems value.
     */
    MaxItems?: number;
    /**
     * The value must contain more items than the `MinItems` value.
     */
    MinItems?: number;
    /**
     * The value must contain only unique items.
     */
    UniqueItems?: true;
    /**
     * The value should be exactly divisible by the `MultipleOf` value.
     */
    MultipleOf?: number;
}
/**
 * Type of the mapper. Includes known mappers.
 */
export declare type MapperType = SimpleMapperType | CompositeMapperType | SequenceMapperType | DictionaryMapperType | EnumMapperType;
/**
 * The type of a simple mapper.
 */
export interface SimpleMapperType {
    /**
     * Name of the type of the property.
     */
    name: "Base64Url" | "Boolean" | "ByteArray" | "Date" | "DateTime" | "DateTimeRfc1123" | "Object" | "Stream" | "String" | "TimeSpan" | "UnixTime" | "Uuid" | "Number" | "any";
}
/**
 * Helps build a mapper that describes how to map a set of properties of an object based on other mappers.
 *
 * Only one of the following properties should be present: `className`, `modelProperties` and `additionalProperties`.
 */
export interface CompositeMapperType {
    /**
     * Name of the composite mapper type.
     */
    name: "Composite";
    /**
     * Use `className` to reference another type definition.
     */
    className?: string;
    /**
     * Use `modelProperties` when the reference to the other type has been resolved.
     */
    modelProperties?: {
        [propertyName: string]: Mapper;
    };
    /**
     * Used when a model has `additionalProperties: true`. Allows the generic processing of unnamed model properties on the response object.
     */
    additionalProperties?: Mapper;
    /**
     * The name of the top-most parent scheme, the one that has no parents.
     */
    uberParent?: string;
    /**
     * A polymorphic discriminator.
     */
    polymorphicDiscriminator?: PolymorphicDiscriminator;
}
/**
 * Helps build a mapper that describes how to parse a sequence of mapped values.
 */
export interface SequenceMapperType {
    /**
     * Name of the sequence type mapper.
     */
    name: "Sequence";
    /**
     * The mapper to use to map each one of the properties of the sequence.
     */
    element: Mapper;
}
/**
 * Helps build a mapper that describes how to parse a dictionary of mapped values.
 */
export interface DictionaryMapperType {
    /**
     * Name of the sequence type mapper.
     */
    name: "Dictionary";
    /**
     * The mapper to use to map the value of each property in the dictionary.
     */
    value: Mapper;
}
/**
 * Helps build a mapper that describes how to parse an enum value.
 */
export interface EnumMapperType {
    /**
     * Name of the enum type mapper.
     */
    name: "Enum";
    /**
     * Values allowed by this mapper.
     */
    allowedValues: any[];
}
/**
 * The base definition of a mapper. Can be used for XML and plain JavaScript objects.
 */
export interface BaseMapper {
    /**
     * Name for the xml element
     */
    xmlName?: string;
    /**
     * Xml element namespace
     */
    xmlNamespace?: string;
    /**
     * Xml element namespace prefix
     */
    xmlNamespacePrefix?: string;
    /**
     * Determines if the current property should be serialized as an attribute of the parent xml element
     */
    xmlIsAttribute?: boolean;
    /**
     * Determines if the current property should be serialized as the inner content of the xml element
     */
    xmlIsMsText?: boolean;
    /**
     * Name for the xml elements when serializing an array
     */
    xmlElementName?: string;
    /**
     * Whether or not the current property should have a wrapping XML element
     */
    xmlIsWrapped?: boolean;
    /**
     * Whether or not the current property is readonly
     */
    readOnly?: boolean;
    /**
     * Whether or not the current property is a constant
     */
    isConstant?: boolean;
    /**
     * Whether or not the current property is required
     */
    required?: boolean;
    /**
     * Whether or not the current property allows mull as a value
     */
    nullable?: boolean;
    /**
     * The name to use when serializing
     */
    serializedName?: string;
    /**
     * Type of the mapper
     */
    type: MapperType;
    /**
     * Default value when one is not explicitly provided
     */
    defaultValue?: any;
    /**
     * Constraints to test the current value against
     */
    constraints?: MapperConstraints;
}
/**
 * Mappers are definitions of the data models used in the library.
 * These data models are part of the Operation or Client definitions in the responses or parameters.
 */
export declare type Mapper = BaseMapper | CompositeMapper | SequenceMapper | DictionaryMapper | EnumMapper;
/**
 * Used to disambiguate discriminated type unions.
 * For example, if response can have many shapes but also includes a 'kind' field (or similar),
 * that field can be used to determine how to deserialize the response to the correct type.
 */
export interface PolymorphicDiscriminator {
    /**
     * Name of the discriminant property in the original JSON payload, e.g. `@odata.kind`.
     */
    serializedName: string;
    /**
     * Name to use on the resulting object instead of the original property name.
     * Useful since the JSON property could be difficult to work with.
     * For example: For a field received as `@odata.kind`, the final object could instead include a property simply named `kind`.
     */
    clientName: string;
    /**
     * It may contain any other property.
     */
    [key: string]: string;
}
/**
 * A mapper composed of other mappers.
 */
export interface CompositeMapper extends BaseMapper {
    /**
     * The type descriptor of the `CompositeMapper`.
     */
    type: CompositeMapperType;
}
/**
 * A mapper describing arrays.
 */
export interface SequenceMapper extends BaseMapper {
    /**
     * The type descriptor of the `SequenceMapper`.
     */
    type: SequenceMapperType;
}
/**
 * A mapper describing plain JavaScript objects used as key/value pairs.
 */
export interface DictionaryMapper extends BaseMapper {
    /**
     * The type descriptor of the `DictionaryMapper`.
     */
    type: DictionaryMapperType;
    /**
     * Optionally, a prefix to add to the header collection.
     */
    headerCollectionPrefix?: string;
}
/**
 * A mapper describing an enum value.
 */
export interface EnumMapper extends BaseMapper {
    /**
     * The type descriptor of the `EnumMapper`.
     */
    type: EnumMapperType;
}
/**
 * An interface representing an URL parameter value.
 */
export interface UrlParameterValue {
    /**
     * The URL value.
     */
    value: string;
    /**
     * Whether to keep or skip URL encoding.
     */
    skipUrlEncoding: boolean;
}
/**
 * Utility function that serializes an object that might contain binary information into a plain object, array or a string.
 */
export declare function serializeObject(toSerialize: unknown): any;
/**
 * String enum containing the string types of property mappers.
 */
export declare const MapperType: {
    Date: "Date";
    Base64Url: "Base64Url";
    Boolean: "Boolean";
    ByteArray: "ByteArray";
    DateTime: "DateTime";
    DateTimeRfc1123: "DateTimeRfc1123";
    Object: "Object";
    Stream: "Stream";
    String: "String";
    TimeSpan: "TimeSpan";
    UnixTime: "UnixTime";
    Number: "Number";
    Composite: "Composite";
    Sequence: "Sequence";
    Dictionary: "Dictionary";
    Enum: "Enum";
};
//# sourceMappingURL=serializer.d.ts.map