/**
 * @name Some context properties may not exist in default setup workflows
 * @id javascript/codeql-action/default-setup-context-properties
 * @kind path-problem
 * @severity warning
 */

import javascript
import DataFlow::PathGraph

class NotParsedLabel extends DataFlow::FlowLabel {
  NotParsedLabel() { this = "not-parsed" }
}

class ParsedLabel extends DataFlow::FlowLabel {
  ParsedLabel() { this = "parsed" }
}

class EventContextAccessConfiguration extends DataFlow::Configuration {
  EventContextAccessConfiguration() { this = "EventContextAccessConfiguration" }

  override predicate isSource(DataFlow::Node source, DataFlow::FlowLabel lbl) {
    source = NodeJSLib::process().getAPropertyRead("env").getAPropertyRead("GITHUB_EVENT_PATH") and
    lbl instanceof NotParsedLabel
  }

  override predicate isSink(DataFlow::Node sink, DataFlow::FlowLabel lbl) {
    sink instanceof DataFlow::PropRead and lbl instanceof ParsedLabel
  }

  override predicate isAdditionalFlowStep(
    DataFlow::Node src, DataFlow::Node trg, DataFlow::FlowLabel inlbl, DataFlow::FlowLabel outlbl
  ) {
    src = trg.(FileSystemReadAccess).getAPathArgument() and inlbl = outlbl
    or
    exists(JsonParserCall c |
      src = c.getInput() and
      trg = c.getOutput() and
      inlbl instanceof NotParsedLabel and
      outlbl instanceof ParsedLabel
    )
    or
    (
      TaintTracking::sharedTaintStep(src, trg) or
      DataFlow::SharedFlowStep::step(src, trg) or
      DataFlow::SharedFlowStep::step(src, trg, _, _)
    ) and
    inlbl = outlbl
  }
}

from EventContextAccessConfiguration cfg, DataFlow::PathNode source, DataFlow::PathNode sink
where
  cfg.hasFlowPath(source, sink) and
  not sink.getNode().asExpr().getFile().getBaseName().matches("%.test.ts")
select sink.getNode(), source, sink,
  "This context property may not exist in default setup workflows. If all uses are safe, add it to the list of "
    + "context properties that are known to be safe in " +
    "'queries/default-setup-event-context.ql'. If this use is safe but others are not, " +
    "dismiss this alert as a false positive."
