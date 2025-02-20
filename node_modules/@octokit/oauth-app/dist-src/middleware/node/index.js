import { parseRequest } from "./parse-request.js";
import { sendResponse } from "./send-response.js";
import { handleRequest } from "../handle-request.js";
function createNodeMiddleware(app, options = {}) {
  return async function(request, response, next) {
    const octokitRequest = await parseRequest(request);
    const octokitResponse = await handleRequest(app, options, octokitRequest);
    if (octokitResponse) {
      sendResponse(octokitResponse, response);
      return true;
    } else {
      next?.();
      return false;
    }
  };
}
export {
  createNodeMiddleware
};
