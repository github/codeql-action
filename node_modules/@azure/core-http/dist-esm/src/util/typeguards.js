// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Helper TypeGuard that checks if the value is not null or undefined.
 * @param thing - Anything
 * @internal
 */
export function isDefined(thing) {
    return typeof thing !== "undefined" && thing !== null;
}
//# sourceMappingURL=typeguards.js.map