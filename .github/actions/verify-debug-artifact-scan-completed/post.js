// Post step - runs after the workflow completes, when artifact scan has finished
const process = require("process");

const scanFinished = process.env.CODEQL_ACTION_ARTIFACT_SCAN_FINISHED;

if (scanFinished !== "true") {
  console.error("Error: Best-effort artifact scan did not complete. Expected CODEQL_ACTION_ARTIFACT_SCAN_FINISHED=true");
  process.exit(1);
}

console.log("✓ Best-effort artifact scan completed successfully");
