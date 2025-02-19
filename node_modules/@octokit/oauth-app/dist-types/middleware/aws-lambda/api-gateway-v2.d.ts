import type { HandlerOptions } from "../types.js";
import type { OAuthApp } from "../../index.js";
import type { ClientType, Options } from "../../types.js";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
export declare function createAWSLambdaAPIGatewayV2Handler(app: OAuthApp<Options<ClientType>>, options?: HandlerOptions): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2 | undefined>;
