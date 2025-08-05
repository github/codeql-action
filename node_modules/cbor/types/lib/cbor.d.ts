import Commented = require("./commented");
import Diagnose = require("./diagnose");
import Decoder = require("./decoder");
import Encoder = require("./encoder");
import Simple = require("./simple");
import Tagged = require("./tagged");
import Map = require("./map");
import SharedValueEncoder = require("./sharedValueEncoder");
export declare let comment: typeof import("./commented").comment;
export declare let decodeAll: typeof import("./decoder").decodeAll;
export declare let decodeFirst: typeof import("./decoder").decodeFirst;
export declare let decodeAllSync: typeof import("./decoder").decodeAllSync;
export declare let decodeFirstSync: typeof import("./decoder").decodeFirstSync;
export declare let diagnose: typeof import("./diagnose").diagnose;
export declare let encode: typeof import("./encoder").encode;
export declare let encodeCanonical: typeof import("./encoder").encodeCanonical;
export declare let encodeOne: typeof import("./encoder").encodeOne;
export declare let encodeAsync: typeof import("./encoder").encodeAsync;
export declare let decode: typeof import("./decoder").decodeFirstSync;
export declare namespace leveldb {
    let decode_1: typeof Decoder.decodeFirstSync;
    export { decode_1 as decode };
    let encode_1: typeof Encoder.encode;
    export { encode_1 as encode };
    export let buffer: boolean;
    export let name: string;
}
/**
 * Reset everything that we can predict a plugin might have altered in good
 * faith.  For now that includes the default set of tags that decoding and
 * encoding will use.
 */
export declare function reset(): void;
export { Commented, Diagnose, Decoder, Encoder, Simple, Tagged, Map, SharedValueEncoder };
