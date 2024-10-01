import { GeneratedFile } from "@protobuf-ts/plugin-framework";
export declare class File implements GeneratedFile {
    readonly fileName: string;
    private content;
    constructor(fileName: string);
    getFilename(): string;
    setContent(content: string): this;
    getContent(): string;
}
