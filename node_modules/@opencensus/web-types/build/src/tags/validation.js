/**
 * Copyright 2019, OpenCensus Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var nonPrintableCharsRegex = /[^\u0020-\u007e]/;
var TAG_KEY_MAX_LENGTH = 255;
/** Determines whether the given String is a valid tag key. */
export function isValidTagKey(tagKey) {
    if (!tagKey || !tagKey.name) {
        return false;
    }
    return (isPrintableString(tagKey.name) &&
        tagKey.name.length > 0 &&
        tagKey.name.length <= TAG_KEY_MAX_LENGTH);
}
/** Determines whether the given String is a valid tag value. */
export function isValidTagValue(tagValue) {
    if (!tagValue || tagValue.value === null || tagValue.value === undefined) {
        return false;
    }
    return (isPrintableString(tagValue.value) &&
        tagValue.value.length <= TAG_KEY_MAX_LENGTH);
}
function isPrintableString(name) {
    return !nonPrintableCharsRegex.test(name);
}
//# sourceMappingURL=validation.js.map