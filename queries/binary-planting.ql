/**
 * @name Exec call vulnerable to binary planting
 * @description On Windows, executing a binary with an unqualified name will execute a binary in the working directory in preference to a binary on PATH.
 * @kind path-problem
 * @problem.severity error
 * @id javascript/codeql-action/binary-planting
 */

import javascript
import DataFlow
import DataFlow::PathGraph

class SafeWhichBarrierGuardNode extends DataFlow::BarrierGuardNode, DataFlow::InvokeNode {
  SafeWhichBarrierGuardNode() { getCalleeName() = "safeWhich" }

  override predicate blocks(boolean outcome, Expr e) {
    outcome = true and
    e = getArgument(0).asExpr()
  }
}

class BinaryPlantingConfiguration extends DataFlow::Configuration {
  BinaryPlantingConfiguration() {
    this = "BinaryPlantingConfiguration"
  }

  override predicate isSource(Node node) {
    node.asExpr() instanceof StringLiteral and
    not node.asExpr().(StringLiteral).getValue().matches("%/%") and
    not node.getFile().getBaseName().matches("%.test.ts")
  }

  override predicate isSink(Node node) {
    node instanceof SystemCommandExecution or
    exists(InvokeExpr e | e.getCalleeName() = "ToolRunner" and e.getArgument(0) = node.asExpr())
  }

  override predicate isBarrierGuard(DataFlow::BarrierGuardNode guard) {
    guard instanceof SafeWhichBarrierGuardNode
  }
}

from BinaryPlantingConfiguration cfg, PathNode source, PathNode sink
where cfg.hasFlowPath(source, sink)
select source.getNode(), source, sink, "This exec call might be vulnerable to Windows binary planting vulnerabilities."
