import { createIterator } from "./iterator.js";
import { createPaginate } from "./paginate.js";
import { VERSION } from "./version.js";
function paginateGraphQL(octokit) {
  return {
    graphql: Object.assign(octokit.graphql, {
      paginate: Object.assign(createPaginate(octokit), {
        iterator: createIterator(octokit)
      })
    })
  };
}
export {
  VERSION,
  paginateGraphQL
};
