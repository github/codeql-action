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
/**
 * Describes the unit used for the Measure. Should follows the format described
 * by http://unitsofmeasure.org/ucum.html.
 */
export var MeasureUnit;
(function (MeasureUnit) {
    MeasureUnit["UNIT"] = "1";
    MeasureUnit["BYTE"] = "by";
    MeasureUnit["KBYTE"] = "kb";
    MeasureUnit["SEC"] = "s";
    MeasureUnit["MS"] = "ms";
    MeasureUnit["NS"] = "ns";
})(MeasureUnit || (MeasureUnit = {}));
/** Describes the types of a Measure. It can be Int64 or a Double type. */
export var MeasureType;
(function (MeasureType) {
    MeasureType["INT64"] = "INT64";
    MeasureType["DOUBLE"] = "DOUBLE";
})(MeasureType || (MeasureType = {}));
/**
 * Informs the type of the aggregation. It can be: count, sum, lastValue or
 * distribution.
 */
export var AggregationType;
(function (AggregationType) {
    AggregationType[AggregationType["COUNT"] = 0] = "COUNT";
    AggregationType[AggregationType["SUM"] = 1] = "SUM";
    AggregationType[AggregationType["LAST_VALUE"] = 2] = "LAST_VALUE";
    AggregationType[AggregationType["DISTRIBUTION"] = 3] = "DISTRIBUTION";
})(AggregationType || (AggregationType = {}));
//# sourceMappingURL=types.js.map