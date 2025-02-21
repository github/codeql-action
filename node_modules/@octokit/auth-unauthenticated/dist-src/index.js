import { auth } from "./auth.js";
import { hook } from "./hook.js";
const createUnauthenticatedAuth = function createUnauthenticatedAuth2(options) {
  if (!options || !options.reason) {
    throw new Error(
      "[@octokit/auth-unauthenticated] No reason passed to createUnauthenticatedAuth"
    );
  }
  return Object.assign(auth.bind(null, options.reason), {
    hook: hook.bind(null, options.reason)
  });
};
export {
  createUnauthenticatedAuth
};
