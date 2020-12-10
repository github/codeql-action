// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * The format that will be used to join an array of values together for a query parameter value.
 */
export var QueryCollectionFormat;
(function (QueryCollectionFormat) {
    QueryCollectionFormat["Csv"] = ",";
    QueryCollectionFormat["Ssv"] = " ";
    QueryCollectionFormat["Tsv"] = "\t";
    QueryCollectionFormat["Pipes"] = "|";
    QueryCollectionFormat["Multi"] = "Multi";
})(QueryCollectionFormat || (QueryCollectionFormat = {}));
//# sourceMappingURL=queryCollectionFormat.js.map