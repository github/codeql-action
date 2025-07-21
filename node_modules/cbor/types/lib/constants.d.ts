export namespace MT {
    let POS_INT: number;
    let NEG_INT: number;
    let BYTE_STRING: number;
    let UTF8_STRING: number;
    let ARRAY: number;
    let MAP: number;
    let TAG: number;
    let SIMPLE_FLOAT: number;
}
export type MT = number;
export namespace TAG {
    let DATE_STRING: number;
    let DATE_EPOCH: number;
    let POS_BIGINT: number;
    let NEG_BIGINT: number;
    let DECIMAL_FRAC: number;
    let BIGFLOAT: number;
    let BASE64URL_EXPECTED: number;
    let BASE64_EXPECTED: number;
    let BASE16_EXPECTED: number;
    let CBOR: number;
    let URI: number;
    let BASE64URL: number;
    let BASE64: number;
    let REGEXP: number;
    let MIME: number;
    let SET: number;
}
export type TAG = number;
export namespace NUMBYTES {
    let ZERO: number;
    let ONE: number;
    let TWO: number;
    let FOUR: number;
    let EIGHT: number;
    let INDEFINITE: number;
}
export type NUMBYTES = number;
export namespace SIMPLE {
    let FALSE: number;
    let TRUE: number;
    let NULL: number;
    let UNDEFINED: number;
}
export type SIMPLE = number;
export namespace SYMS {
    let NULL_1: symbol;
    export { NULL_1 as NULL };
    let UNDEFINED_1: symbol;
    export { UNDEFINED_1 as UNDEFINED };
    export let PARENT: symbol;
    export let BREAK: symbol;
    export let STREAM: symbol;
}
export const SHIFT32: 4294967296;
export namespace BI {
    let MINUS_ONE: bigint;
    let NEG_MAX: bigint;
    let MAXINT32: bigint;
    let MAXINT64: bigint;
    let SHIFT32: bigint;
}
