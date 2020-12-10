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
 * The kind of metric. It describes how the data is reported.
 *
 * A gauge is an instantaneous measurement of a value.
 *
 * A cumulative measurement is a value accumulated over a time interval. In
 * a time series, cumulative measurements should have the same start time,
 * increasing values and increasing end times, until an event resets the
 * cumulative value to zero and sets a new start time for the following
 * points.
 */
export var MetricDescriptorType;
(function (MetricDescriptorType) {
    /** Do not use this default value. */
    MetricDescriptorType[MetricDescriptorType["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    /** Integer gauge. The value can go both up and down. */
    MetricDescriptorType[MetricDescriptorType["GAUGE_INT64"] = 1] = "GAUGE_INT64";
    /** Floating point gauge. The value can go both up and down. */
    MetricDescriptorType[MetricDescriptorType["GAUGE_DOUBLE"] = 2] = "GAUGE_DOUBLE";
    /**
     * Distribution gauge measurement. The count and sum can go both up and
     * down. Recorded values are always >= 0.
     * Used in scenarios like a snapshot of time the current items in a queue
     * have spent there.
     */
    MetricDescriptorType[MetricDescriptorType["GAUGE_DISTRIBUTION"] = 3] = "GAUGE_DISTRIBUTION";
    /**
     * Integer cumulative measurement. The value cannot decrease, if resets
     * then the start_time should also be reset.
     */
    MetricDescriptorType[MetricDescriptorType["CUMULATIVE_INT64"] = 4] = "CUMULATIVE_INT64";
    /**
     * Floating point cumulative measurement. The value cannot decrease, if
     * resets then the start_time should also be reset. Recorded values are
     * always >= 0.
     */
    MetricDescriptorType[MetricDescriptorType["CUMULATIVE_DOUBLE"] = 5] = "CUMULATIVE_DOUBLE";
    /**
     * Distribution cumulative measurement. The count and sum cannot decrease,
     * if resets then the start_time should also be reset.
     */
    MetricDescriptorType[MetricDescriptorType["CUMULATIVE_DISTRIBUTION"] = 6] = "CUMULATIVE_DISTRIBUTION";
    /**
     * Some frameworks implemented Histograms as a summary of observations
     * (usually things like request durations and response sizes). While it
     * also provides a total count of observations and a sum of all observed
     * values, it calculates configurable percentiles over a sliding time
     * window. This is not recommended, since it cannot be aggregated.
     */
    MetricDescriptorType[MetricDescriptorType["SUMMARY"] = 7] = "SUMMARY";
})(MetricDescriptorType || (MetricDescriptorType = {}));
//# sourceMappingURL=types.js.map