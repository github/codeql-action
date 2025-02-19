import { mergeResponses } from "./merge-responses.js";
import { createIterator } from "./iterator.js";
const createPaginate = (octokit) => {
  const iterator = createIterator(octokit);
  return async (query, initialParameters = {}) => {
    let mergedResponse = {};
    for await (const response of iterator(
      query,
      initialParameters
    )) {
      mergedResponse = mergeResponses(mergedResponse, response);
    }
    return mergedResponse;
  };
};
export {
  createPaginate
};
