import { parseRequest } from "./api-gateway-v2-parse-request.js";
import { sendResponse } from "./api-gateway-v2-send-response.js";
import { handleRequest } from "../handle-request.js";
function createAWSLambdaAPIGatewayV2Handler(app, options = {}) {
  return async function(event) {
    const request = parseRequest(event);
    const response = await handleRequest(app, options, request);
    return response ? sendResponse(response) : void 0;
  };
}
export {
  createAWSLambdaAPIGatewayV2Handler
};
