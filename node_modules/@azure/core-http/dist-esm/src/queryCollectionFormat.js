// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * The format that will be used to join an array of values together for a query parameter value.
 */
export var QueryCollectionFormat;
(function (QueryCollectionFormat) {
    /**
     * CSV: Each pair of segments joined by a single comma.
     */
    QueryCollectionFormat["Csv"] = ",";
    /**
     * SSV: Each pair of segments joined by a single space character.
     */
    QueryCollectionFormat["Ssv"] = " ";
    /**
     * TSV: Each pair of segments joined by a single tab character.
     */
    QueryCollectionFormat["Tsv"] = "\t";
    /**
     * Pipes: Each pair of segments joined by a single pipe character.
     */
    QueryCollectionFormat["Pipes"] = "|";
    /**
     * Denotes this is an array of values that should be passed to the server in multiple key/value pairs, e.g. `?queryParam=value1&queryParam=value2`
     */
    QueryCollectionFormat["Multi"] = "Multi";
})(QueryCollectionFormat || (QueryCollectionFormat = {}));
//# sourceMappingURL=queryCollectionFormat.js.map