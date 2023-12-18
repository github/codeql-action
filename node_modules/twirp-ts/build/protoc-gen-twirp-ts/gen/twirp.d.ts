import { FileDescriptorProto } from "@protobuf-ts/plugin-framework";
/**
 * Generates the client and server implementation of the twirp
 * specification.
 * @param ctx
 * @param file
 */
export declare function generateTwirp(ctx: any, file: FileDescriptorProto): Promise<string>;
/**
 * Generates the client implementation of the twirp specification.
 * @param ctx
 * @param file
 */
export declare function generateTwirpClient(ctx: any, file: FileDescriptorProto): Promise<string>;
/**
 * Generates the server implementation of the twirp specification.
 * @param ctx
 * @param file
 */
export declare function generateTwirpServer(ctx: any, file: FileDescriptorProto): Promise<string>;
