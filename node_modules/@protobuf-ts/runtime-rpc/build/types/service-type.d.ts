import { MethodInfo, PartialMethodInfo, ServiceInfo } from "./reflection-info";
import type { JsonValue } from "@protobuf-ts/runtime";
export declare class ServiceType implements ServiceInfo {
    /**
     * The protobuf type name of the service, including package name if
     * present.
     */
    readonly typeName: string;
    /**
     * Information for each rpc method of the service, in the order of
     * declaration in the source .proto.
     */
    readonly methods: MethodInfo[];
    /**
     * Contains custom service options from the .proto source in JSON format.
     */
    readonly options: JsonOptionsMap;
    constructor(typeName: string, methods: PartialMethodInfo[], options?: JsonOptionsMap);
}
declare type JsonOptionsMap = {
    [extensionName: string]: JsonValue;
};
export {};
