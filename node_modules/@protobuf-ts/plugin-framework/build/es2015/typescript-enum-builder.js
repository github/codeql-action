import * as ts from "typescript";
import * as rt from "@protobuf-ts/runtime";
import { addCommentBlockAsJsDoc } from "./typescript-comments";
/**
 * Creates an enum declaration.
 */
export class TypescriptEnumBuilder {
    constructor() {
        this.values = [];
    }
    add(name, number, comment) {
        this.values.push({ name, number, comment });
    }
    build(name, modifiers) {
        this.validate();
        const members = [];
        for (let { name, number, comment } of this.values) {
            let member = ts.createEnumMember(ts.createIdentifier(name), ts.createNumericLiteral(number.toString()));
            if (comment) {
                addCommentBlockAsJsDoc(member, comment);
            }
            members.push(member);
        }
        return ts.createEnumDeclaration(undefined, modifiers, name, members);
    }
    validate() {
        if (this.values.map(v => v.name).some((name, i, a) => a.indexOf(name) !== i))
            throw new Error("duplicate names");
        let ei = {};
        for (let v of this.values) {
            ei[v.number] = v.name;
            ei[v.name] = v.number;
        }
        if (!rt.isEnumObject(ei)) {
            throw new Error("not a typescript enum object");
        }
    }
}
