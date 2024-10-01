import { FileDescriptorProto } from "@protobuf-ts/plugin-framework";
interface OpenAPIDoc {
    fileName: string;
    content: string;
}
export declare enum OpenAPIType {
    GATEWAY = 0,
    TWIRP = 1
}
/**
 * Generate twirp compliant OpenAPI doc
 * @param ctx
 * @param files
 * @param type
 */
export declare function genOpenAPI(ctx: any, files: readonly FileDescriptorProto[], type: OpenAPIType): Promise<OpenAPIDoc[]>;
export {};
