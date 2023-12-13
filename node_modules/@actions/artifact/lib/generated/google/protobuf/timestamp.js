"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timestamp = void 0;
const runtime_1 = require("@protobuf-ts/runtime");
const runtime_2 = require("@protobuf-ts/runtime");
const runtime_3 = require("@protobuf-ts/runtime");
const runtime_4 = require("@protobuf-ts/runtime");
const runtime_5 = require("@protobuf-ts/runtime");
const runtime_6 = require("@protobuf-ts/runtime");
const runtime_7 = require("@protobuf-ts/runtime");
// @generated message type with reflection information, may provide speed optimized methods
class Timestamp$Type extends runtime_7.MessageType {
    constructor() {
        super("google.protobuf.Timestamp", [
            { no: 1, name: "seconds", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
            { no: 2, name: "nanos", kind: "scalar", T: 5 /*ScalarType.INT32*/ }
        ]);
    }
    /**
     * Creates a new `Timestamp` for the current time.
     */
    now() {
        const msg = this.create();
        const ms = Date.now();
        msg.seconds = runtime_6.PbLong.from(Math.floor(ms / 1000)).toString();
        msg.nanos = (ms % 1000) * 1000000;
        return msg;
    }
    /**
     * Converts a `Timestamp` to a JavaScript Date.
     */
    toDate(message) {
        return new Date(runtime_6.PbLong.from(message.seconds).toNumber() * 1000 + Math.ceil(message.nanos / 1000000));
    }
    /**
     * Converts a JavaScript Date to a `Timestamp`.
     */
    fromDate(date) {
        const msg = this.create();
        const ms = date.getTime();
        msg.seconds = runtime_6.PbLong.from(Math.floor(ms / 1000)).toString();
        msg.nanos = (ms % 1000) * 1000000;
        return msg;
    }
    /**
     * In JSON format, the `Timestamp` type is encoded as a string
     * in the RFC 3339 format.
     */
    internalJsonWrite(message, options) {
        let ms = runtime_6.PbLong.from(message.seconds).toNumber() * 1000;
        if (ms < Date.parse("0001-01-01T00:00:00Z") || ms > Date.parse("9999-12-31T23:59:59Z"))
            throw new Error("Unable to encode Timestamp to JSON. Must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive.");
        if (message.nanos < 0)
            throw new Error("Unable to encode invalid Timestamp to JSON. Nanos must not be negative.");
        let z = "Z";
        if (message.nanos > 0) {
            let nanosStr = (message.nanos + 1000000000).toString().substring(1);
            if (nanosStr.substring(3) === "000000")
                z = "." + nanosStr.substring(0, 3) + "Z";
            else if (nanosStr.substring(6) === "000")
                z = "." + nanosStr.substring(0, 6) + "Z";
            else
                z = "." + nanosStr + "Z";
        }
        return new Date(ms).toISOString().replace(".000Z", z);
    }
    /**
     * In JSON format, the `Timestamp` type is encoded as a string
     * in the RFC 3339 format.
     */
    internalJsonRead(json, options, target) {
        if (typeof json !== "string")
            throw new Error("Unable to parse Timestamp from JSON " + (0, runtime_5.typeofJsonValue)(json) + ".");
        let matches = json.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:Z|\.([0-9]{3,9})Z|([+-][0-9][0-9]:[0-9][0-9]))$/);
        if (!matches)
            throw new Error("Unable to parse Timestamp from JSON. Invalid format.");
        let ms = Date.parse(matches[1] + "-" + matches[2] + "-" + matches[3] + "T" + matches[4] + ":" + matches[5] + ":" + matches[6] + (matches[8] ? matches[8] : "Z"));
        if (Number.isNaN(ms))
            throw new Error("Unable to parse Timestamp from JSON. Invalid value.");
        if (ms < Date.parse("0001-01-01T00:00:00Z") || ms > Date.parse("9999-12-31T23:59:59Z"))
            throw new globalThis.Error("Unable to parse Timestamp from JSON. Must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive.");
        if (!target)
            target = this.create();
        target.seconds = runtime_6.PbLong.from(ms / 1000).toString();
        target.nanos = 0;
        if (matches[7])
            target.nanos = (parseInt("1" + matches[7] + "0".repeat(9 - matches[7].length)) - 1000000000);
        return target;
    }
    create(value) {
        const message = { seconds: "0", nanos: 0 };
        globalThis.Object.defineProperty(message, runtime_4.MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            (0, runtime_3.reflectionMergePartial)(this, message, value);
        return message;
    }
    internalBinaryRead(reader, length, options, target) {
        let message = target !== null && target !== void 0 ? target : this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* int64 seconds */ 1:
                    message.seconds = reader.int64().toString();
                    break;
                case /* int32 nanos */ 2:
                    message.nanos = reader.int32();
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? runtime_2.UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message, writer, options) {
        /* int64 seconds = 1; */
        if (message.seconds !== "0")
            writer.tag(1, runtime_1.WireType.Varint).int64(message.seconds);
        /* int32 nanos = 2; */
        if (message.nanos !== 0)
            writer.tag(2, runtime_1.WireType.Varint).int32(message.nanos);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? runtime_2.UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message google.protobuf.Timestamp
 */
exports.Timestamp = new Timestamp$Type();
//# sourceMappingURL=timestamp.js.map