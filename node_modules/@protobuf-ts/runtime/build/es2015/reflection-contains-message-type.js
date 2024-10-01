import { MESSAGE_TYPE } from './message-type-contract';
/**
 * Check if the provided object is a proto message.
 *
 * Note that this is an experimental feature - it is here to stay, but
 * implementation details may change without notice.
 */
export function containsMessageType(msg) {
    return msg[MESSAGE_TYPE] != null;
}
