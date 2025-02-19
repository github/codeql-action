import { createOAuthAppAuth } from "@octokit/auth-oauth-app";
import { VERSION } from "./version.js";
import { addEventHandler } from "./add-event-handler.js";
import { OAuthAppOctokit } from "./oauth-app-octokit.js";
import {
  getUserOctokitWithState
} from "./methods/get-user-octokit.js";
import {
  getWebFlowAuthorizationUrlWithState
} from "./methods/get-web-flow-authorization-url.js";
import {
  createTokenWithState
} from "./methods/create-token.js";
import {
  checkTokenWithState
} from "./methods/check-token.js";
import {
  resetTokenWithState
} from "./methods/reset-token.js";
import {
  refreshTokenWithState
} from "./methods/refresh-token.js";
import {
  scopeTokenWithState
} from "./methods/scope-token.js";
import {
  deleteTokenWithState
} from "./methods/delete-token.js";
import {
  deleteAuthorizationWithState
} from "./methods/delete-authorization.js";
import { handleRequest } from "./middleware/handle-request.js";
import { unknownRouteResponse } from "./middleware/unknown-route-response.js";
import { createNodeMiddleware } from "./middleware/node/index.js";
import { sendResponse } from "./middleware/node/send-response.js";
import { createWebWorkerHandler } from "./middleware/web-worker/index.js";
import { createAWSLambdaAPIGatewayV2Handler } from "./middleware/aws-lambda/api-gateway-v2.js";
class OAuthApp {
  static VERSION = VERSION;
  static defaults(defaults) {
    const OAuthAppWithDefaults = class extends this {
      constructor(...args) {
        super({
          ...defaults,
          ...args[0]
        });
      }
    };
    return OAuthAppWithDefaults;
  }
  constructor(options) {
    const Octokit = options.Octokit || OAuthAppOctokit;
    this.type = options.clientType || "oauth-app";
    const octokit = new Octokit({
      authStrategy: createOAuthAppAuth,
      auth: {
        clientType: this.type,
        clientId: options.clientId,
        clientSecret: options.clientSecret
      }
    });
    const state = {
      clientType: this.type,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      // @ts-expect-error defaultScopes not permitted for GitHub Apps
      defaultScopes: options.defaultScopes || [],
      allowSignup: options.allowSignup,
      baseUrl: options.baseUrl,
      redirectUrl: options.redirectUrl,
      log: options.log,
      Octokit,
      octokit,
      eventHandlers: {}
    };
    this.on = addEventHandler.bind(null, state);
    this.octokit = octokit;
    this.getUserOctokit = getUserOctokitWithState.bind(null, state);
    this.getWebFlowAuthorizationUrl = getWebFlowAuthorizationUrlWithState.bind(
      null,
      state
    );
    this.createToken = createTokenWithState.bind(
      null,
      state
    );
    this.checkToken = checkTokenWithState.bind(
      null,
      state
    );
    this.resetToken = resetTokenWithState.bind(
      null,
      state
    );
    this.refreshToken = refreshTokenWithState.bind(
      null,
      state
    );
    this.scopeToken = scopeTokenWithState.bind(
      null,
      state
    );
    this.deleteToken = deleteTokenWithState.bind(null, state);
    this.deleteAuthorization = deleteAuthorizationWithState.bind(null, state);
  }
  // assigned during constructor
  type;
  on;
  octokit;
  getUserOctokit;
  getWebFlowAuthorizationUrl;
  createToken;
  checkToken;
  resetToken;
  refreshToken;
  scopeToken;
  deleteToken;
  deleteAuthorization;
}
export {
  OAuthApp,
  createAWSLambdaAPIGatewayV2Handler,
  createNodeMiddleware,
  createWebWorkerHandler,
  handleRequest,
  sendResponse as sendNodeResponse,
  unknownRouteResponse
};
