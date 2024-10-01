/**
 * assert that condition is true or throw error (with message)
 */
export declare function assert(condition: any, msg?: string): asserts condition;
/**
 * assert that value cannot exist = type `never`. throw runtime error if it does.
 */
export declare function assertNever(value: never, msg?: string): never;
export declare function assertInt32(arg: any): asserts arg is number;
export declare function assertUInt32(arg: any): asserts arg is number;
export declare function assertFloat32(arg: any): asserts arg is number;
