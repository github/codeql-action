import type { State, EventHandlerContext, ClientType, Options } from "./types.js";
export declare function emitEvent(state: State, context: EventHandlerContext<Options<ClientType>>): Promise<void>;
