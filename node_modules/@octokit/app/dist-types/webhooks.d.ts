import type { Octokit } from "@octokit/core";
import { Webhooks, type EmitterWebhookEvent } from "@octokit/webhooks";
import type { Options } from "./types.js";
export declare function webhooks(appOctokit: Octokit, options: Required<Options>["webhooks"]): Webhooks<EmitterWebhookEvent & {
    octokit: Octokit;
}>;
