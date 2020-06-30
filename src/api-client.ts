import * as core from "@actions/core";
import * as octokit from "@octokit/rest";
import consoleLogLevel from "console-log-level";

const githubAPIURL = process.env["GITHUB_API_URL"] || "https://api.github.com";
export const client = new octokit.Octokit({
  auth: core.getInput("token"),
  baseUrl: githubAPIURL,
  userAgent: "CodeQL Action",
  log: consoleLogLevel({ level: "debug" })
});
