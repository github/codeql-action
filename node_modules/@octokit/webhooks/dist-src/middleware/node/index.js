import { createLogger } from "../../createLogger.js";
import { middleware } from "./middleware.js";
function createNodeMiddleware(webhooks, {
  path = "/api/github/webhooks",
  log = createLogger()
} = {}) {
  return middleware.bind(null, webhooks, {
    path,
    log
  });
}
export {
  createNodeMiddleware
};
