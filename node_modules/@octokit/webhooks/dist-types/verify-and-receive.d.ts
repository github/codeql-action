import type { EmitterWebhookEventWithStringPayloadAndSignature, State } from "./types.js";
import type { EventHandler } from "./event-handler/index.js";
export declare function verifyAndReceive(state: State & {
    secret: string;
    eventHandler: EventHandler<unknown>;
}, event: EmitterWebhookEventWithStringPayloadAndSignature): Promise<void>;
