"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReflectionBinaryWriter = void 0;
const binary_format_contract_1 = require("./binary-format-contract");
const reflection_info_1 = require("./reflection-info");
const assert_1 = require("./assert");
const pb_long_1 = require("./pb-long");
/**
 * Writes proto3 messages in binary format using reflection information.
 *
 * https://developers.google.com/protocol-buffers/docs/encoding
 */
class ReflectionBinaryWriter {
    constructor(info) {
        this.info = info;
    }
    prepare() {
        if (!this.fields) {
            const fieldsInput = this.info.fields ? this.info.fields.concat() : [];
            this.fields = fieldsInput.sort((a, b) => a.no - b.no);
        }
    }
    /**
     * Writes the message to binary format.
     */
    write(message, writer, options) {
        this.prepare();
        for (const field of this.fields) {
            let value, // this will be our field value, whether it is member of a oneof or not
            emitDefault, // whether we emit the default value (only true for oneof members)
            repeated = field.repeat, localName = field.localName;
            // handle oneof ADT
            if (field.oneof) {
                const group = message[field.oneof];
                if (group.oneofKind !== localName)
                    continue; // if field is not selected, skip
                value = group[localName];
                emitDefault = true;
            }
            else {
                value = message[localName];
                emitDefault = false;
            }
            // we have handled oneof above. we just have to honor `emitDefault`.
            switch (field.kind) {
                case "scalar":
                case "enum":
                    let T = field.kind == "enum" ? reflection_info_1.ScalarType.INT32 : field.T;
                    if (repeated) {
                        assert_1.assert(Array.isArray(value));
                        if (repeated == reflection_info_1.RepeatType.PACKED)
                            this.packed(writer, T, field.no, value);
                        else
                            for (const item of value)
                                this.scalar(writer, T, field.no, item, true);
                    }
                    else if (value === undefined)
                        assert_1.assert(field.opt);
                    else
                        this.scalar(writer, T, field.no, value, emitDefault || field.opt);
                    break;
                case "message":
                    if (repeated) {
                        assert_1.assert(Array.isArray(value));
                        for (const item of value)
                            this.message(writer, options, field.T(), field.no, item);
                    }
                    else {
                        this.message(writer, options, field.T(), field.no, value);
                    }
                    break;
                case "map":
                    assert_1.assert(typeof value == 'object' && value !== null);
                    for (const [key, val] of Object.entries(value))
                        this.mapEntry(writer, options, field, key, val);
                    break;
            }
        }
        let u = options.writeUnknownFields;
        if (u !== false)
            (u === true ? binary_format_contract_1.UnknownFieldHandler.onWrite : u)(this.info.typeName, message, writer);
    }
    mapEntry(writer, options, field, key, value) {
        writer.tag(field.no, binary_format_contract_1.WireType.LengthDelimited);
        writer.fork();
        // javascript only allows number or string for object properties
        // we convert from our representation to the protobuf type
        let keyValue = key;
        switch (field.K) {
            case reflection_info_1.ScalarType.INT32:
            case reflection_info_1.ScalarType.FIXED32:
            case reflection_info_1.ScalarType.UINT32:
            case reflection_info_1.ScalarType.SFIXED32:
            case reflection_info_1.ScalarType.SINT32:
                keyValue = Number.parseInt(key);
                break;
            case reflection_info_1.ScalarType.BOOL:
                assert_1.assert(key == 'true' || key == 'false');
                keyValue = key == 'true';
                break;
        }
        // write key, expecting key field number = 1
        this.scalar(writer, field.K, 1, keyValue, true);
        // write value, expecting value field number = 2
        switch (field.V.kind) {
            case 'scalar':
                this.scalar(writer, field.V.T, 2, value, true);
                break;
            case 'enum':
                this.scalar(writer, reflection_info_1.ScalarType.INT32, 2, value, true);
                break;
            case 'message':
                this.message(writer, options, field.V.T(), 2, value);
                break;
        }
        writer.join();
    }
    message(writer, options, handler, fieldNo, value) {
        if (value === undefined)
            return;
        handler.internalBinaryWrite(value, writer.tag(fieldNo, binary_format_contract_1.WireType.LengthDelimited).fork(), options);
        writer.join();
    }
    /**
     * Write a single scalar value.
     */
    scalar(writer, type, fieldNo, value, emitDefault) {
        let [wireType, method, isDefault] = this.scalarInfo(type, value);
        if (!isDefault || emitDefault) {
            writer.tag(fieldNo, wireType);
            writer[method](value);
        }
    }
    /**
     * Write an array of scalar values in packed format.
     */
    packed(writer, type, fieldNo, value) {
        if (!value.length)
            return;
        assert_1.assert(type !== reflection_info_1.ScalarType.BYTES && type !== reflection_info_1.ScalarType.STRING);
        // write tag
        writer.tag(fieldNo, binary_format_contract_1.WireType.LengthDelimited);
        // begin length-delimited
        writer.fork();
        // write values without tags
        let [, method,] = this.scalarInfo(type);
        for (let i = 0; i < value.length; i++)
            writer[method](value[i]);
        // end length delimited
        writer.join();
    }
    /**
     * Get information for writing a scalar value.
     *
     * Returns tuple:
     * [0]: appropriate WireType
     * [1]: name of the appropriate method of IBinaryWriter
     * [2]: whether the given value is a default value
     *
     * If argument `value` is omitted, [2] is always false.
     */
    scalarInfo(type, value) {
        let t = binary_format_contract_1.WireType.Varint;
        let m;
        let i = value === undefined;
        let d = value === 0;
        switch (type) {
            case reflection_info_1.ScalarType.INT32:
                m = "int32";
                break;
            case reflection_info_1.ScalarType.STRING:
                d = i || !value.length;
                t = binary_format_contract_1.WireType.LengthDelimited;
                m = "string";
                break;
            case reflection_info_1.ScalarType.BOOL:
                d = value === false;
                m = "bool";
                break;
            case reflection_info_1.ScalarType.UINT32:
                m = "uint32";
                break;
            case reflection_info_1.ScalarType.DOUBLE:
                t = binary_format_contract_1.WireType.Bit64;
                m = "double";
                break;
            case reflection_info_1.ScalarType.FLOAT:
                t = binary_format_contract_1.WireType.Bit32;
                m = "float";
                break;
            case reflection_info_1.ScalarType.INT64:
                d = i || pb_long_1.PbLong.from(value).isZero();
                m = "int64";
                break;
            case reflection_info_1.ScalarType.UINT64:
                d = i || pb_long_1.PbULong.from(value).isZero();
                m = "uint64";
                break;
            case reflection_info_1.ScalarType.FIXED64:
                d = i || pb_long_1.PbULong.from(value).isZero();
                t = binary_format_contract_1.WireType.Bit64;
                m = "fixed64";
                break;
            case reflection_info_1.ScalarType.BYTES:
                d = i || !value.byteLength;
                t = binary_format_contract_1.WireType.LengthDelimited;
                m = "bytes";
                break;
            case reflection_info_1.ScalarType.FIXED32:
                t = binary_format_contract_1.WireType.Bit32;
                m = "fixed32";
                break;
            case reflection_info_1.ScalarType.SFIXED32:
                t = binary_format_contract_1.WireType.Bit32;
                m = "sfixed32";
                break;
            case reflection_info_1.ScalarType.SFIXED64:
                d = i || pb_long_1.PbLong.from(value).isZero();
                t = binary_format_contract_1.WireType.Bit64;
                m = "sfixed64";
                break;
            case reflection_info_1.ScalarType.SINT32:
                m = "sint32";
                break;
            case reflection_info_1.ScalarType.SINT64:
                d = i || pb_long_1.PbLong.from(value).isZero();
                m = "sint64";
                break;
        }
        return [t, m, i || d];
    }
}
exports.ReflectionBinaryWriter = ReflectionBinaryWriter;
