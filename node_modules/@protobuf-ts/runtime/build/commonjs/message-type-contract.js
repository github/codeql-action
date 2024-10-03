"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MESSAGE_TYPE = void 0;
/**
 * The symbol used as a key on message objects to store the message type.
 *
 * Note that this is an experimental feature - it is here to stay, but
 * implementation details may change without notice.
 */
exports.MESSAGE_TYPE = Symbol.for("protobuf-ts/message-type");
