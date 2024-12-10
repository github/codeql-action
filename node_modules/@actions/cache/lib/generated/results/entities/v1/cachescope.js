"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheScope = void 0;
const runtime_1 = require("@protobuf-ts/runtime");
const runtime_2 = require("@protobuf-ts/runtime");
const runtime_3 = require("@protobuf-ts/runtime");
const runtime_4 = require("@protobuf-ts/runtime");
const runtime_5 = require("@protobuf-ts/runtime");
// @generated message type with reflection information, may provide speed optimized methods
class CacheScope$Type extends runtime_5.MessageType {
    constructor() {
        super("github.actions.results.entities.v1.CacheScope", [
            { no: 1, name: "scope", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "permission", kind: "scalar", T: 3 /*ScalarType.INT64*/ }
        ]);
    }
    create(value) {
        const message = { scope: "", permission: "0" };
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
                case /* string scope */ 1:
                    message.scope = reader.string();
                    break;
                case /* int64 permission */ 2:
                    message.permission = reader.int64().toString();
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
        /* string scope = 1; */
        if (message.scope !== "")
            writer.tag(1, runtime_1.WireType.LengthDelimited).string(message.scope);
        /* int64 permission = 2; */
        if (message.permission !== "0")
            writer.tag(2, runtime_1.WireType.Varint).int64(message.permission);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? runtime_2.UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message github.actions.results.entities.v1.CacheScope
 */
exports.CacheScope = new CacheScope$Type();
//# sourceMappingURL=cachescope.js.map