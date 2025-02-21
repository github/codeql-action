import type { OctokitRequest } from "../types.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
export declare function parseRequest(request: APIGatewayProxyEventV2): OctokitRequest;
