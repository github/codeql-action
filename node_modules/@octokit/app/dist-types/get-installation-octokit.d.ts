import type { Octokit } from "@octokit/core";
import type { App } from "./index.js";
export declare function getInstallationOctokit(app: App, installationId: number): Promise<Octokit>;
