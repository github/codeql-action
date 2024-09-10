"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFixOrSuggest = getFixOrSuggest;
function getFixOrSuggest({ useFix, suggestion, }) {
    return useFix ? { fix: suggestion.fix } : { suggest: [suggestion] };
}
//# sourceMappingURL=getFixOrSuggest.js.map