"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheEntry = void 0;
const runtime_1 = require("@protobuf-ts/runtime");
const runtime_2 = require("@protobuf-ts/runtime");
const runtime_3 = require("@protobuf-ts/runtime");
const runtime_4 = require("@protobuf-ts/runtime");
const runtime_5 = require("@protobuf-ts/runtime");
const timestamp_1 = require("../../../google/protobuf/timestamp");
// @generated message type with reflection information, may provide speed optimized methods
class CacheEntry$Type extends runtime_5.MessageType {
    constructor() {
        super("github.actions.results.entities.v1.CacheEntry", [
            { no: 1, name: "key", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "hash", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "size_bytes", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
            { no: 4, name: "scope", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 5, name: "version", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 6, name: "created_at", kind: "message", T: () => timestamp_1.Timestamp },
            { no: 7, name: "last_accessed_at", kind: "message", T: () => timestamp_1.Timestamp },
            { no: 8, name: "expires_at", kind: "message", T: () => timestamp_1.Timestamp }
        ]);
    }
    create(value) {
        const message = { key: "", hash: "", sizeBytes: "0", scope: "", version: "" };
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
                case /* string key */ 1:
                    message.key = reader.string();
                    break;
                case /* string hash */ 2:
                    message.hash = reader.string();
                    break;
                case /* int64 size_bytes */ 3:
                    message.sizeBytes = reader.int64().toString();
                    break;
                case /* string scope */ 4:
                    message.scope = reader.string();
                    break;
                case /* string version */ 5:
                    message.version = reader.string();
                    break;
                case /* google.protobuf.Timestamp created_at */ 6:
                    message.createdAt = timestamp_1.Timestamp.internalBinaryRead(reader, reader.uint32(), options, message.createdAt);
                    break;
                case /* google.protobuf.Timestamp last_accessed_at */ 7:
                    message.lastAccessedAt = timestamp_1.Timestamp.internalBinaryRead(reader, reader.uint32(), options, message.lastAccessedAt);
                    break;
                case /* google.protobuf.Timestamp expires_at */ 8:
                    message.expiresAt = timestamp_1.Timestamp.internalBinaryRead(reader, reader.uint32(), options, message.expiresAt);
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
        /* string key = 1; */
        if (message.key !== "")
            writer.tag(1, runtime_1.WireType.LengthDelimited).string(message.key);
        /* string hash = 2; */
        if (message.hash !== "")
            writer.tag(2, runtime_1.WireType.LengthDelimited).string(message.hash);
        /* int64 size_bytes = 3; */
        if (message.sizeBytes !== "0")
            writer.tag(3, runtime_1.WireType.Varint).int64(message.sizeBytes);
        /* string scope = 4; */
        if (message.scope !== "")
            writer.tag(4, runtime_1.WireType.LengthDelimited).string(message.scope);
        /* string version = 5; */
        if (message.version !== "")
            writer.tag(5, runtime_1.WireType.LengthDelimited).string(message.version);
        /* google.protobuf.Timestamp created_at = 6; */
        if (message.createdAt)
            timestamp_1.Timestamp.internalBinaryWrite(message.createdAt, writer.tag(6, runtime_1.WireType.LengthDelimited).fork(), options).join();
        /* google.protobuf.Timestamp last_accessed_at = 7; */
        if (message.lastAccessedAt)
            timestamp_1.Timestamp.internalBinaryWrite(message.lastAccessedAt, writer.tag(7, runtime_1.WireType.LengthDelimited).fork(), options).join();
        /* google.protobuf.Timestamp expires_at = 8; */
        if (message.expiresAt)
            timestamp_1.Timestamp.internalBinaryWrite(message.expiresAt, writer.tag(8, runtime_1.WireType.LengthDelimited).fork(), options).join();
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? runtime_2.UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message github.actions.results.entities.v1.CacheEntry
 */
exports.CacheEntry = new CacheEntry$Type();
//# sourceMappingURL=cacheentry.js.map