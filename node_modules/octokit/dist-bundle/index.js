// pkg/dist-src/octokit.js
import { Octokit as OctokitCore } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { paginateGraphQL } from "@octokit/plugin-paginate-graphql";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";

// pkg/dist-src/version.js
var VERSION = "0.0.0-development";

// pkg/dist-src/octokit.js
import { RequestError } from "@octokit/request-error";
var Octokit = OctokitCore.plugin(
  restEndpointMethods,
  paginateRest,
  paginateGraphQL,
  retry,
  throttling
).defaults({
  userAgent: `octokit.js/${VERSION}`,
  throttle: {
    onRateLimit,
    onSecondaryRateLimit
  }
});
function onRateLimit(retryAfter, options, octokit) {
  octokit.log.warn(
    `Request quota exhausted for request ${options.method} ${options.url}`
  );
  if (options.request.retryCount === 0) {
    octokit.log.info(`Retrying after ${retryAfter} seconds!`);
    return true;
  }
}
function onSecondaryRateLimit(retryAfter, options, octokit) {
  octokit.log.warn(
    `SecondaryRateLimit detected for request ${options.method} ${options.url}`
  );
  if (options.request.retryCount === 0) {
    octokit.log.info(`Retrying after ${retryAfter} seconds!`);
    return true;
  }
}

// pkg/dist-src/app.js
import { App as DefaultApp } from "@octokit/app";
import { OAuthApp as DefaultOAuthApp } from "@octokit/oauth-app";
import { createNodeMiddleware } from "@octokit/app";
var App = DefaultApp.defaults({ Octokit });
var OAuthApp = DefaultOAuthApp.defaults({ Octokit });
export {
  App,
  OAuthApp,
  Octokit,
  RequestError,
  createNodeMiddleware
};
