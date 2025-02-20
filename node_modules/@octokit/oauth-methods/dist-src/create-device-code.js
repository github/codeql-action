import { request as defaultRequest } from "@octokit/request";
import { oauthRequest } from "./utils.js";
async function createDeviceCode(options) {
  const request = options.request || defaultRequest;
  const parameters = {
    client_id: options.clientId
  };
  if ("scopes" in options && Array.isArray(options.scopes)) {
    parameters.scope = options.scopes.join(" ");
  }
  return oauthRequest(request, "POST /login/device/code", parameters);
}
export {
  createDeviceCode
};
