import { getUserAgent } from "universal-user-agent";
import { request as defaultRequest } from "@octokit/request";
import { createOAuthAppAuth } from "@octokit/auth-oauth-app";
import { auth } from "./auth.js";
import { hook } from "./hook.js";
import { getCache } from "./cache.js";
import { VERSION } from "./version.js";
import { createOAuthUserAuth } from "@octokit/auth-oauth-user";
function createAppAuth(options) {
  if (!options.appId) {
    throw new Error("[@octokit/auth-app] appId option is required");
  }
  if (!options.privateKey) {
    throw new Error("[@octokit/auth-app] privateKey option is required");
  }
  if ("installationId" in options && !options.installationId) {
    throw new Error(
      "[@octokit/auth-app] installationId is set to a falsy value"
    );
  }
  const log = Object.assign(
    {
      warn: console.warn.bind(console)
    },
    options.log
  );
  const request = options.request || defaultRequest.defaults({
    headers: {
      "user-agent": `octokit-auth-app.js/${VERSION} ${getUserAgent()}`
    }
  });
  const state = Object.assign(
    {
      request,
      cache: getCache()
    },
    options,
    options.installationId ? { installationId: Number(options.installationId) } : {},
    {
      log,
      oauthApp: createOAuthAppAuth({
        clientType: "github-app",
        clientId: options.clientId || "",
        clientSecret: options.clientSecret || "",
        request
      })
    }
  );
  return Object.assign(auth.bind(null, state), {
    hook: hook.bind(null, state)
  });
}
export {
  createAppAuth,
  createOAuthUserAuth
};
