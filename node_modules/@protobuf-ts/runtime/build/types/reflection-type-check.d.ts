import type { PartialMessageInfo } from "./reflection-info";
export declare class ReflectionTypeCheck {
    private readonly fields;
    private data;
    constructor(info: PartialMessageInfo);
    private prepare;
    /**
     * Is the argument a valid message as specified by the
     * reflection information?
     *
     * Checks all field types recursively. The `depth`
     * specifies how deep into the structure the check will be.
     *
     * With a depth of 0, only the presence of fields
     * is checked.
     *
     * With a depth of 1 or more, the field types are checked.
     *
     * With a depth of 2 or more, the members of map, repeated
     * and message fields are checked.
     *
     * Message fields will be checked recursively with depth - 1.
     *
     * The number of map entries / repeated values being checked
     * is < depth.
     */
    is(message: any, depth: number, allowExcessProperties?: boolean): boolean;
    private field;
    private message;
    private messages;
    private scalar;
    private scalars;
    private mapKeys;
}
