import {
  createNodeMiddleware as oauthNodeMiddleware,
  sendNodeResponse,
  unknownRouteResponse
} from "@octokit/oauth-app";
import { createNodeMiddleware as webhooksNodeMiddleware } from "@octokit/webhooks";
function noop() {
}
function createNodeMiddleware(app, options = {}) {
  const log = Object.assign(
    {
      debug: noop,
      info: noop,
      warn: console.warn.bind(console),
      error: console.error.bind(console)
    },
    options.log
  );
  const optionsWithDefaults = {
    pathPrefix: "/api/github",
    ...options,
    log
  };
  const webhooksMiddleware = webhooksNodeMiddleware(app.webhooks, {
    path: optionsWithDefaults.pathPrefix + "/webhooks",
    log
  });
  const oauthMiddleware = oauthNodeMiddleware(app.oauth, {
    pathPrefix: optionsWithDefaults.pathPrefix + "/oauth"
  });
  return middleware.bind(
    null,
    optionsWithDefaults.pathPrefix,
    webhooksMiddleware,
    oauthMiddleware
  );
}
async function middleware(pathPrefix, webhooksMiddleware, oauthMiddleware, request, response, next) {
  const { pathname } = new URL(request.url, "http://localhost");
  if (pathname.startsWith(`${pathPrefix}/`)) {
    if (pathname === `${pathPrefix}/webhooks`) {
      webhooksMiddleware(request, response);
    } else if (pathname.startsWith(`${pathPrefix}/oauth/`)) {
      oauthMiddleware(request, response);
    } else {
      sendNodeResponse(unknownRouteResponse(request), response);
    }
    return true;
  } else {
    next?.();
    return false;
  }
}
export {
  createNodeMiddleware,
  middleware
};
