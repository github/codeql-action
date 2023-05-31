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
    sink instanceof DataFlow::PropRead and
    lbl instanceof ParsedLabel and
    not exists(DataFlow::PropRead n | sink = n.getBase()) and
    not sink.asExpr().getFile().getBaseName().matches("%.test.ts")
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
where cfg.hasFlowPath(source, sink)
select sink.getNode(), source, sink,
  "This event context property may not exist in default setup workflows."
