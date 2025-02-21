import type { EmitterWebhookEventName, State } from "../types.js";
export declare function removeListener(state: State, webhookNameOrNames: "*" | EmitterWebhookEventName | EmitterWebhookEventName[], handler: Function): void;
