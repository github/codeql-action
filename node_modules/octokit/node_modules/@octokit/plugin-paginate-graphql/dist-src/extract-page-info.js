import { findPaginatedResourcePath, get } from "./object-helpers.js";
const extractPageInfos = (responseData) => {
  const pageInfoPath = findPaginatedResourcePath(responseData);
  return {
    pathInQuery: pageInfoPath,
    pageInfo: get(responseData, [...pageInfoPath, "pageInfo"])
  };
};
export {
  extractPageInfos
};
