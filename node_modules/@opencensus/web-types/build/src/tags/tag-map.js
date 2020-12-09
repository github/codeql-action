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
var __values = (this && this.__values) || function (o) {
    var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
    if (m) return m.call(o);
    return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
import { TagTtl, } from './types';
import { isValidTagKey, isValidTagValue } from './validation';
var UNLIMITED_PROPAGATION_MD = {
    tagTtl: TagTtl.UNLIMITED_PROPAGATION,
};
/** TagMap is maps of TagKey -> TagValueWithMetadata */
var TagMap = /** @class */ (function () {
    function TagMap() {
        // A map mapping TagKey to to its respective TagValueWithMetadata.
        this.registeredTags = new Map();
    }
    /**
     * Adds the key/value pair regardless of whether the key is present.
     * @param tagKey The TagKey which will be set.
     * @param tagValue The TagValue to set for the given key.
     * @param tagMetadata The TagMetadata associated with this Tag.
     */
    TagMap.prototype.set = function (tagKey, tagValue, tagMetadata) {
        var e_1, _a;
        if (!isValidTagKey(tagKey)) {
            throw new Error("Invalid TagKey name: " + tagKey.name);
        }
        if (!isValidTagValue(tagValue)) {
            throw new Error("Invalid TagValue: " + tagValue.value);
        }
        var existingKey;
        try {
            for (var _b = __values(this.registeredTags.keys()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var key = _c.value;
                if (key.name === tagKey.name) {
                    existingKey = key;
                    break;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        if (existingKey)
            this.registeredTags.delete(existingKey);
        var valueWithMetadata = this.getValueWithMetadata(tagValue, tagMetadata);
        this.registeredTags.set(tagKey, valueWithMetadata);
    };
    /**
     * Deletes a tag from the map if the key is in the map.
     * @param tagKey The TagKey which will be removed.
     */
    TagMap.prototype.delete = function (tagKey) {
        this.registeredTags.delete(tagKey);
    };
    Object.defineProperty(TagMap.prototype, "tags", {
        /** Gets the tags map without metadata. */
        get: function () {
            var e_2, _a;
            var tagsWithoutMetadata = new Map();
            try {
                for (var _b = __values(this.registeredTags), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = __read(_c.value, 2), tagKey = _d[0], valueWithMetadata = _d[1];
                    tagsWithoutMetadata.set(tagKey, valueWithMetadata.tagValue);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_2) throw e_2.error; }
            }
            return tagsWithoutMetadata;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TagMap.prototype, "tagsWithMetadata", {
        /** Gets the tags map with metadata. */
        get: function () {
            return this.registeredTags;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Constructs a new TagValueWithMetadata using tagValue and tagMetadata.
     * For backwards-compatibility this method still produces propagating Tags
     * (UNLIMITED_PROPAGATION) if tagMetadata is not provided or missing.
     */
    TagMap.prototype.getValueWithMetadata = function (tagValue, tagMetadata) {
        if (tagMetadata) {
            return { tagValue: tagValue, tagMetadata: tagMetadata };
        }
        return { tagValue: tagValue, tagMetadata: UNLIMITED_PROPAGATION_MD };
    };
    return TagMap;
}());
export { TagMap };
//# sourceMappingURL=tag-map.js.map