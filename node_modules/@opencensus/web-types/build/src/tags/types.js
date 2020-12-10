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
/** TagTtl is an integer that represents number of hops a tag can propagate */
export var TagTtl;
(function (TagTtl) {
    /**
     * NO_PROPAGATION is considered to have local scope and is used within the
     * process it created.
     */
    TagTtl[TagTtl["NO_PROPAGATION"] = 0] = "NO_PROPAGATION";
    /** UNLIMITED_PROPAGATION can propagate unlimited hops. */
    TagTtl[TagTtl["UNLIMITED_PROPAGATION"] = -1] = "UNLIMITED_PROPAGATION";
})(TagTtl || (TagTtl = {}));
//# sourceMappingURL=types.js.map