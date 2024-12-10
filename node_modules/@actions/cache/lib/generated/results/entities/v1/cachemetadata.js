"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheMetadata = void 0;
const runtime_1 = require("@protobuf-ts/runtime");
const runtime_2 = require("@protobuf-ts/runtime");
const runtime_3 = require("@protobuf-ts/runtime");
const runtime_4 = require("@protobuf-ts/runtime");
const runtime_5 = require("@protobuf-ts/runtime");
const cachescope_1 = require("./cachescope");
// @generated message type with reflection information, may provide speed optimized methods
class CacheMetadata$Type extends runtime_5.MessageType {
    constructor() {
        super("github.actions.results.entities.v1.CacheMetadata", [
            { no: 1, name: "repository_id", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
            { no: 2, name: "scope", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => cachescope_1.CacheScope }
        ]);
    }
    create(value) {
        const message = { repositoryId: "0", scope: [] };
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
                case /* int64 repository_id */ 1:
                    message.repositoryId = reader.int64().toString();
                    break;
                case /* repeated github.actions.results.entities.v1.CacheScope scope */ 2:
                    message.scope.push(cachescope_1.CacheScope.internalBinaryRead(reader, reader.uint32(), options));
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
        /* int64 repository_id = 1; */
        if (message.repositoryId !== "0")
            writer.tag(1, runtime_1.WireType.Varint).int64(message.repositoryId);
        /* repeated github.actions.results.entities.v1.CacheScope scope = 2; */
        for (let i = 0; i < message.scope.length; i++)
            cachescope_1.CacheScope.internalBinaryWrite(message.scope[i], writer.tag(2, runtime_1.WireType.LengthDelimited).fork(), options).join();
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? runtime_2.UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message github.actions.results.entities.v1.CacheMetadata
 */
exports.CacheMetadata = new CacheMetadata$Type();
//# sourceMappingURL=cachemetadata.js.map