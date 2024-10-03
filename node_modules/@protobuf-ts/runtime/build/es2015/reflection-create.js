import { reflectionScalarDefault } from "./reflection-scalar-default";
import { MESSAGE_TYPE } from './message-type-contract';
/**
 * Creates an instance of the generic message, using the field
 * information.
 */
export function reflectionCreate(type) {
    /**
     * This ternary can be removed in the next major version.
     * The `Object.create()` code path utilizes a new `messagePrototype`
     * property on the `IMessageType` which has this same `MESSAGE_TYPE`
     * non-enumerable property on it. Doing it this way means that we only
     * pay the cost of `Object.defineProperty()` once per `IMessageType`
     * class of once per "instance". The falsy code path is only provided
     * for backwards compatibility in cases where the runtime library is
     * updated without also updating the generated code.
     */
    const msg = type.messagePrototype
        ? Object.create(type.messagePrototype)
        : Object.defineProperty({}, MESSAGE_TYPE, { value: type });
    for (let field of type.fields) {
        let name = field.localName;
        if (field.opt)
            continue;
        if (field.oneof)
            msg[field.oneof] = { oneofKind: undefined };
        else if (field.repeat)
            msg[name] = [];
        else
            switch (field.kind) {
                case "scalar":
                    msg[name] = reflectionScalarDefault(field.T, field.L);
                    break;
                case "enum":
                    // we require 0 to be default value for all enums
                    msg[name] = 0;
                    break;
                case "map":
                    msg[name] = {};
                    break;
            }
    }
    return msg;
}
