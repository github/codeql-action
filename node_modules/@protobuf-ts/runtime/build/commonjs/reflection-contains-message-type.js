"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsMessageType = void 0;
const message_type_contract_1 = require("./message-type-contract");
/**
 * Check if the provided object is a proto message.
 *
 * Note that this is an experimental feature - it is here to stay, but
 * implementation details may change without notice.
 */
function containsMessageType(msg) {
    return msg[message_type_contract_1.MESSAGE_TYPE] != null;
}
exports.containsMessageType = containsMessageType;
