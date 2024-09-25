import { AnyTypeDescriptorProto, IDescriptorTree } from "@protobuf-ts/plugin-framework";
/**
 * Create a name for an enum, message or service.
 * - ignores package
 * - nested types get the names merged with '_'
 * - reserved words are escaped by adding '$' at the end
 * - does *not* prevent clashes, for example clash
 *   of merged nested name with other message name
 */
export declare function createLocalTypeName(descriptor: AnyTypeDescriptorProto, treeLookup: IDescriptorTree): string;
