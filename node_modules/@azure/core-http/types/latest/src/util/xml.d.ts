import { SerializerOptions } from "./serializer.common";
/**
 * Converts given JSON object to XML string
 * @param obj - JSON object to be converted into XML string
 * @param opts - Options that govern the parsing of given JSON object
 */
export declare function stringifyXML(obj: unknown, opts?: SerializerOptions): string;
/**
 * Converts given XML string into JSON
 * @param str - String containing the XML content to be parsed into JSON
 * @param opts - Options that govern the parsing of given xml string
 */
export declare function parseXML(str: string, opts?: SerializerOptions): Promise<any>;
//# sourceMappingURL=xml.d.ts.map