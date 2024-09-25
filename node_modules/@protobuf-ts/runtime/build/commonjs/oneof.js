"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSelectedOneofValue = exports.clearOneofValue = exports.setUnknownOneofValue = exports.setOneofValue = exports.getOneofValue = exports.isOneofGroup = void 0;
/**
 * Is the given value a valid oneof group?
 *
 * We represent protobuf `oneof` as algebraic data types (ADT) in generated
 * code. But when working with messages of unknown type, the ADT does not
 * help us.
 *
 * This type guard checks if the given object adheres to the ADT rules, which
 * are as follows:
 *
 * 1) Must be an object.
 *
 * 2) Must have a "oneofKind" discriminator property.
 *
 * 3) If "oneofKind" is `undefined`, no member field is selected. The object
 * must not have any other properties.
 *
 * 4) If "oneofKind" is a `string`, the member field with this name is
 * selected.
 *
 * 5) If a member field is selected, the object must have a second property
 * with this name. The property must not be `undefined`.
 *
 * 6) No extra properties are allowed. The object has either one property
 * (no selection) or two properties (selection).
 *
 */
function isOneofGroup(any) {
    if (typeof any != 'object' || any === null || !any.hasOwnProperty('oneofKind')) {
        return false;
    }
    switch (typeof any.oneofKind) {
        case "string":
            if (any[any.oneofKind] === undefined)
                return false;
            return Object.keys(any).length == 2;
        case "undefined":
            return Object.keys(any).length == 1;
        default:
            return false;
    }
}
exports.isOneofGroup = isOneofGroup;
/**
 * Returns the value of the given field in a oneof group.
 */
function getOneofValue(oneof, kind) {
    return oneof[kind];
}
exports.getOneofValue = getOneofValue;
function setOneofValue(oneof, kind, value) {
    if (oneof.oneofKind !== undefined) {
        delete oneof[oneof.oneofKind];
    }
    oneof.oneofKind = kind;
    if (value !== undefined) {
        oneof[kind] = value;
    }
}
exports.setOneofValue = setOneofValue;
function setUnknownOneofValue(oneof, kind, value) {
    if (oneof.oneofKind !== undefined) {
        delete oneof[oneof.oneofKind];
    }
    oneof.oneofKind = kind;
    if (value !== undefined && kind !== undefined) {
        oneof[kind] = value;
    }
}
exports.setUnknownOneofValue = setUnknownOneofValue;
/**
 * Removes the selected field in a oneof group.
 *
 * Note that the recommended way to modify a oneof group is to set
 * a new object:
 *
 * ```ts
 * message.result = { oneofKind: undefined };
 * ```
 */
function clearOneofValue(oneof) {
    if (oneof.oneofKind !== undefined) {
        delete oneof[oneof.oneofKind];
    }
    oneof.oneofKind = undefined;
}
exports.clearOneofValue = clearOneofValue;
/**
 * Returns the selected value of the given oneof group.
 *
 * Not that the recommended way to access a oneof group is to check
 * the "oneofKind" property and let TypeScript narrow down the union
 * type for you:
 *
 * ```ts
 * if (message.result.oneofKind === "error") {
 *   message.result.error; // string
 * }
 * ```
 *
 * In the rare case you just need the value, and do not care about
 * which protobuf field is selected, you can use this function
 * for convenience.
 */
function getSelectedOneofValue(oneof) {
    if (oneof.oneofKind === undefined) {
        return undefined;
    }
    return oneof[oneof.oneofKind];
}
exports.getSelectedOneofValue = getSelectedOneofValue;
