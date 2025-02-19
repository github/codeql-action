import type { OctokitResponse } from "../types.js";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
export declare function sendResponse(octokitResponse: OctokitResponse): APIGatewayProxyStructuredResultV2;
