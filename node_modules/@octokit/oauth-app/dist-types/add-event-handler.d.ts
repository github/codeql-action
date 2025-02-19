import type { EventHandler, EventAndActionName, State, ClientType, Options } from "./types.js";
export declare function addEventHandler(state: State, eventName: EventAndActionName | EventAndActionName[], eventHandler: EventHandler<Options<ClientType>>): void;
