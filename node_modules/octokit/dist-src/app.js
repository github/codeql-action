import { App as DefaultApp } from "@octokit/app";
import { OAuthApp as DefaultOAuthApp } from "@octokit/oauth-app";
import { Octokit } from "./octokit.js";
const App = DefaultApp.defaults({ Octokit });
const OAuthApp = DefaultOAuthApp.defaults({ Octokit });
import { createNodeMiddleware } from "@octokit/app";
export {
  App,
  OAuthApp,
  createNodeMiddleware
};
