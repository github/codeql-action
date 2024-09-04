"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReflectionJsonReader = void 0;
const json_typings_1 = require("./json-typings");
const base64_1 = require("./base64");
const reflection_info_1 = require("./reflection-info");
const pb_long_1 = require("./pb-long");
const assert_1 = require("./assert");
const reflection_long_convert_1 = require("./reflection-long-convert");
/**
 * Reads proto3 messages in canonical JSON format using reflection information.
 *
 * https://developers.google.com/protocol-buffers/docs/proto3#json
 */
class ReflectionJsonReader {
    constructor(info) {
        this.info = info;
    }
    prepare() {
        var _a;
        if (this.fMap === undefined) {
            this.fMap = {};
            const fieldsInput = (_a = this.info.fields) !== null && _a !== void 0 ? _a : [];
            for (const field of fieldsInput) {
                this.fMap[field.name] = field;
                this.fMap[field.jsonName] = field;
                this.fMap[field.localName] = field;
            }
        }
    }
    // Cannot parse JSON <type of jsonValue> for <type name>#<fieldName>.
    assert(condition, fieldName, jsonValue) {
        if (!condition) {
            let what = json_typings_1.typeofJsonValue(jsonValue);
            if (what == "number" || what == "boolean")
                what = jsonValue.toString();
            throw new Error(`Cannot parse JSON ${what} for ${this.info.typeName}#${fieldName}`);
        }
    }
    /**
     * Reads a message from canonical JSON format into the target message.
     *
     * Repeated fields are appended. Map entries are added, overwriting
     * existing keys.
     *
     * If a message field is already present, it will be merged with the
     * new data.
     */
    read(input, message, options) {
        this.prepare();
        const oneofsHandled = [];
        for (const [jsonKey, jsonValue] of Object.entries(input)) {
            const field = this.fMap[jsonKey];
            if (!field) {
                if (!options.ignoreUnknownFields)
                    throw new Error(`Found unknown field while reading ${this.info.typeName} from JSON format. JSON key: ${jsonKey}`);
                continue;
            }
            const localName = field.localName;
            // handle oneof ADT
            let target; // this will be the target for the field value, whether it is member of a oneof or not
            if (field.oneof) {
                if (jsonValue === null && (field.kind !== 'enum' || field.T()[0] !== 'google.protobuf.NullValue')) {
                    continue;
                }
                // since json objects are unordered by specification, it is not possible to take the last of multiple oneofs
                if (oneofsHandled.includes(field.oneof))
                    throw new Error(`Multiple members of the oneof group "${field.oneof}" of ${this.info.typeName} are present in JSON.`);
                oneofsHandled.push(field.oneof);
                target = message[field.oneof] = {
                    oneofKind: localName
                };
            }
            else {
                target = message;
            }
            // we have handled oneof above. we just have read the value into `target`.
            if (field.kind == 'map') {
                if (jsonValue === null) {
                    continue;
                }
                // check input
                this.assert(json_typings_1.isJsonObject(jsonValue), field.name, jsonValue);
                // our target to put map entries into
                const fieldObj = target[localName];
                // read entries
                for (const [jsonObjKey, jsonObjValue] of Object.entries(jsonValue)) {
                    this.assert(jsonObjValue !== null, field.name + " map value", null);
                    // read value
                    let val;
                    switch (field.V.kind) {
                        case "message":
                            val = field.V.T().internalJsonRead(jsonObjValue, options);
                            break;
                        case "enum":
                            val = this.enum(field.V.T(), jsonObjValue, field.name, options.ignoreUnknownFields);
                            if (val === false)
                                continue;
                            break;
                        case "scalar":
                            val = this.scalar(jsonObjValue, field.V.T, field.V.L, field.name);
                            break;
                    }
                    this.assert(val !== undefined, field.name + " map value", jsonObjValue);
                    // read key
                    let key = jsonObjKey;
                    if (field.K == reflection_info_1.ScalarType.BOOL)
                        key = key == "true" ? true : key == "false" ? false : key;
                    key = this.scalar(key, field.K, reflection_info_1.LongType.STRING, field.name).toString();
                    fieldObj[key] = val;
                }
            }
            else if (field.repeat) {
                if (jsonValue === null)
                    continue;
                // check input
                this.assert(Array.isArray(jsonValue), field.name, jsonValue);
                // our target to put array entries into
                const fieldArr = target[localName];
                // read array entries
                for (const jsonItem of jsonValue) {
                    this.assert(jsonItem !== null, field.name, null);
                    let val;
                    switch (field.kind) {
                        case "message":
                            val = field.T().internalJsonRead(jsonItem, options);
                            break;
                        case "enum":
                            val = this.enum(field.T(), jsonItem, field.name, options.ignoreUnknownFields);
                            if (val === false)
                                continue;
                            break;
                        case "scalar":
                            val = this.scalar(jsonItem, field.T, field.L, field.name);
                            break;
                    }
                    this.assert(val !== undefined, field.name, jsonValue);
                    fieldArr.push(val);
                }
            }
            else {
                switch (field.kind) {
                    case "message":
                        if (jsonValue === null && field.T().typeName != 'google.protobuf.Value') {
                            this.assert(field.oneof === undefined, field.name + " (oneof member)", null);
                            continue;
                        }
                        target[localName] = field.T().internalJsonRead(jsonValue, options, target[localName]);
                        break;
                    case "enum":
                        let val = this.enum(field.T(), jsonValue, field.name, options.ignoreUnknownFields);
                        if (val === false)
                            continue;
                        target[localName] = val;
                        break;
                    case "scalar":
                        target[localName] = this.scalar(jsonValue, field.T, field.L, field.name);
                        break;
                }
            }
        }
    }
    /**
     * Returns `false` for unrecognized string representations.
     *
     * google.protobuf.NullValue accepts only JSON `null` (or the old `"NULL_VALUE"`).
     */
    enum(type, json, fieldName, ignoreUnknownFields) {
        if (type[0] == 'google.protobuf.NullValue')
            assert_1.assert(json === null || json === "NULL_VALUE", `Unable to parse field ${this.info.typeName}#${fieldName}, enum ${type[0]} only accepts null.`);
        if (json === null)
            // we require 0 to be default value for all enums
            return 0;
        switch (typeof json) {
            case "number":
                assert_1.assert(Number.isInteger(json), `Unable to parse field ${this.info.typeName}#${fieldName}, enum can only be integral number, got ${json}.`);
                return json;
            case "string":
                let localEnumName = json;
                if (type[2] && json.substring(0, type[2].length) === type[2])
                    // lookup without the shared prefix
                    localEnumName = json.substring(type[2].length);
                let enumNumber = type[1][localEnumName];
                if (typeof enumNumber === 'undefined' && ignoreUnknownFields) {
                    return false;
                }
                assert_1.assert(typeof enumNumber == "number", `Unable to parse field ${this.info.typeName}#${fieldName}, enum ${type[0]} has no value for "${json}".`);
                return enumNumber;
        }
        assert_1.assert(false, `Unable to parse field ${this.info.typeName}#${fieldName}, cannot parse enum value from ${typeof json}".`);
    }
    scalar(json, type, longType, fieldName) {
        let e;
        try {
            switch (type) {
                // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
                // Either numbers or strings are accepted. Exponent notation is also accepted.
                case reflection_info_1.ScalarType.DOUBLE:
                case reflection_info_1.ScalarType.FLOAT:
                    if (json === null)
                        return .0;
                    if (json === "NaN")
                        return Number.NaN;
                    if (json === "Infinity")
                        return Number.POSITIVE_INFINITY;
                    if (json === "-Infinity")
                        return Number.NEGATIVE_INFINITY;
                    if (json === "") {
                        e = "empty string";
                        break;
                    }
                    if (typeof json == "string" && json.trim().length !== json.length) {
                        e = "extra whitespace";
                        break;
                    }
                    if (typeof json != "string" && typeof json != "number") {
                        break;
                    }
                    let float = Number(json);
                    if (Number.isNaN(float)) {
                        e = "not a number";
                        break;
                    }
                    if (!Number.isFinite(float)) {
                        // infinity and -infinity are handled by string representation above, so this is an error
                        e = "too large or small";
                        break;
                    }
                    if (type == reflection_info_1.ScalarType.FLOAT)
                        assert_1.assertFloat32(float);
                    return float;
                // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
                case reflection_info_1.ScalarType.INT32:
                case reflection_info_1.ScalarType.FIXED32:
                case reflection_info_1.ScalarType.SFIXED32:
                case reflection_info_1.ScalarType.SINT32:
                case reflection_info_1.ScalarType.UINT32:
                    if (json === null)
                        return 0;
                    let int32;
                    if (typeof json == "number")
                        int32 = json;
                    else if (json === "")
                        e = "empty string";
                    else if (typeof json == "string") {
                        if (json.trim().length !== json.length)
                            e = "extra whitespace";
                        else
                            int32 = Number(json);
                    }
                    if (int32 === undefined)
                        break;
                    if (type == reflection_info_1.ScalarType.UINT32)
                        assert_1.assertUInt32(int32);
                    else
                        assert_1.assertInt32(int32);
                    return int32;
                // int64, fixed64, uint64: JSON value will be a decimal string. Either numbers or strings are accepted.
                case reflection_info_1.ScalarType.INT64:
                case reflection_info_1.ScalarType.SFIXED64:
                case reflection_info_1.ScalarType.SINT64:
                    if (json === null)
                        return reflection_long_convert_1.reflectionLongConvert(pb_long_1.PbLong.ZERO, longType);
                    if (typeof json != "number" && typeof json != "string")
                        break;
                    return reflection_long_convert_1.reflectionLongConvert(pb_long_1.PbLong.from(json), longType);
                case reflection_info_1.ScalarType.FIXED64:
                case reflection_info_1.ScalarType.UINT64:
                    if (json === null)
                        return reflection_long_convert_1.reflectionLongConvert(pb_long_1.PbULong.ZERO, longType);
                    if (typeof json != "number" && typeof json != "string")
                        break;
                    return reflection_long_convert_1.reflectionLongConvert(pb_long_1.PbULong.from(json), longType);
                // bool:
                case reflection_info_1.ScalarType.BOOL:
                    if (json === null)
                        return false;
                    if (typeof json !== "boolean")
                        break;
                    return json;
                // string:
                case reflection_info_1.ScalarType.STRING:
                    if (json === null)
                        return "";
                    if (typeof json !== "string") {
                        e = "extra whitespace";
                        break;
                    }
                    try {
                        encodeURIComponent(json);
                    }
                    catch (e) {
                        e = "invalid UTF8";
                        break;
                    }
                    return json;
                // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
                // Either standard or URL-safe base64 encoding with/without paddings are accepted.
                case reflection_info_1.ScalarType.BYTES:
                    if (json === null || json === "")
                        return new Uint8Array(0);
                    if (typeof json !== 'string')
                        break;
                    return base64_1.base64decode(json);
            }
        }
        catch (error) {
            e = error.message;
        }
        this.assert(false, fieldName + (e ? " - " + e : ""), json);
    }
}
exports.ReflectionJsonReader = ReflectionJsonReader;
