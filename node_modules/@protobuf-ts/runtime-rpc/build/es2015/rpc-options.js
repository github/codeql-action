import { mergeBinaryOptions, mergeJsonOptions } from "@protobuf-ts/runtime";
/**
 * Merges custom RPC options with defaults. Returns a new instance and keeps
 * the "defaults" and the "options" unmodified.
 *
 * Merges `RpcMetadata` "meta", overwriting values from "defaults" with
 * values from "options". Does not append values to existing entries.
 *
 * Merges "jsonOptions", including "jsonOptions.typeRegistry", by creating
 * a new array that contains types from "options.jsonOptions.typeRegistry"
 * first, then types from "defaults.jsonOptions.typeRegistry".
 *
 * Merges "binaryOptions".
 *
 * Merges "interceptors" by creating a new array that contains interceptors
 * from "defaults" first, then interceptors from "options".
 *
 * Works with objects that extend `RpcOptions`, but only if the added
 * properties are of type Date, primitive like string, boolean, or Array
 * of primitives. If you have other property types, you have to merge them
 * yourself.
 */
export function mergeRpcOptions(defaults, options) {
    if (!options)
        return defaults;
    let o = {};
    copy(defaults, o);
    copy(options, o);
    for (let key of Object.keys(options)) {
        let val = options[key];
        switch (key) {
            case "jsonOptions":
                o.jsonOptions = mergeJsonOptions(defaults.jsonOptions, o.jsonOptions);
                break;
            case "binaryOptions":
                o.binaryOptions = mergeBinaryOptions(defaults.binaryOptions, o.binaryOptions);
                break;
            case "meta":
                o.meta = {};
                copy(defaults.meta, o.meta);
                copy(options.meta, o.meta);
                break;
            case "interceptors":
                o.interceptors = defaults.interceptors ? defaults.interceptors.concat(val) : val.concat();
                break;
        }
    }
    return o;
}
function copy(a, into) {
    if (!a)
        return;
    let c = into;
    for (let [k, v] of Object.entries(a)) {
        if (v instanceof Date)
            c[k] = new Date(v.getTime());
        else if (Array.isArray(v))
            c[k] = v.concat();
        else
            c[k] = v;
    }
}
