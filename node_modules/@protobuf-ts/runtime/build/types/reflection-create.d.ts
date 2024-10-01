import type { IMessageType } from './message-type-contract';
/**
 * Creates an instance of the generic message, using the field
 * information.
 */
export declare function reflectionCreate<T extends object>(type: IMessageType<T>): T;
