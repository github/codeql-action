import { FileDescriptorProto } from "@protobuf-ts/plugin-framework";
import { MatchFunction } from "path-to-regexp";
export declare enum Pattern {
    POST = "post",
    GET = "get",
    PATCH = "patch",
    PUT = "put",
    DELETE = "delete"
}
export interface HttpRoute {
    serviceName: string;
    methodName: string;
    packageName: string;
    matchingPath: string;
    matcher: MatchFunction;
    httpMethod: Pattern;
    bodyKey?: string;
    responseBodyKey?: string;
    additionalBindings?: HttpRoute;
}
export declare type HttpRulePattern = {
    [key in Pattern]: string;
};
export interface HttpOption extends HttpRulePattern {
    body: string;
    responseBody: string;
    additional_bindings: HttpOption;
}
export declare function genGateway(ctx: any, files: readonly FileDescriptorProto[]): Promise<string>;
export declare function getMethod(httpSpec: HttpOption): Pattern;
