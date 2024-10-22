"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFixOrSuggest = getFixOrSuggest;
function getFixOrSuggest({ suggestion, useFix, }) {
    return useFix ? { fix: suggestion.fix } : { suggest: [suggestion] };
}
//# sourceMappingURL=getFixOrSuggest.js.map