import { oauthAuthorizationUrl } from "@octokit/oauth-authorization-url";
import { request as defaultRequest } from "@octokit/request";
import { requestToOAuthBaseUrl } from "./utils.js";
function getWebFlowAuthorizationUrl({
  request = defaultRequest,
  ...options
}) {
  const baseUrl = requestToOAuthBaseUrl(request);
  return oauthAuthorizationUrl({
    ...options,
    baseUrl
  });
}
export {
  getWebFlowAuthorizationUrl
};
