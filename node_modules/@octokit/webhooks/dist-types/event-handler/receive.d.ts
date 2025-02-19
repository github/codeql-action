import type { EmitterWebhookEvent, State, WebhookError } from "../types.js";
export declare function receiverHandle(state: State, event: EmitterWebhookEvent | WebhookError): Promise<void>;
