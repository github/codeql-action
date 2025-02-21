import { parseRequest } from "./parse-request.js";
import { sendResponse } from "./send-response.js";
import { handleRequest } from "../handle-request.js";
function createWebWorkerHandler(app, options = {}) {
  return async function(request) {
    const octokitRequest = await parseRequest(request);
    const octokitResponse = await handleRequest(app, options, octokitRequest);
    return octokitResponse ? sendResponse(octokitResponse) : void 0;
  };
}
export {
  createWebWorkerHandler
};
