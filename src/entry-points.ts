import * as analyzeAction from "./analyze-action";
import * as autobuildAction from "./autobuild-action";
import * as initAction from "./init-action";
import * as resolveEnvironmentAction from "./resolve-environment-action";
import * as setupCodeqlAction from "./setup-codeql-action";
import * as startProxyAction from "./start-proxy-action";
import * as uploadSarifAction from "./upload-sarif-action";
import * as analyzePostAction from "./analyze-action-post";
import * as initPostAction from "./init-action-post";
import * as startProxyPostAction from "./start-proxy-action-post";
import * as uploadSarifPostAction from "./upload-sarif-action-post";

export async function runAnalyzeAction() {
  void analyzeAction.runWrapper();
}

export async function runAutobuildAction() {
  void autobuildAction.runWrapper();
}

export async function runInitAction() {
  void initAction.runWrapper();
}

export async function runResolveEnvironmentAction() {
  void resolveEnvironmentAction.runWrapper();
}

export async function runSetupCodeqlAction() {
  void setupCodeqlAction.runWrapper();
}

export async function runStartProxyAction() {
  void startProxyAction.runWrapper();
}

export async function runUploadSarifAction() {
  void uploadSarifAction.runWrapper();
}

export async function runAnalyzePostAction() {
  void analyzePostAction.runWrapper();
}

export async function runInitPostAction() {
  void initPostAction.runWrapper();
}

export async function runStartProxyPostAction() {
  void startProxyPostAction.runWrapper();
}

export async function runUploadSarifPostAction() {
  void uploadSarifPostAction.runWrapper();
}
