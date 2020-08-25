/**
 * @name Unguarded actions library use
 * @description Code that runs outside of GitHub Actions tries to use a library that should only be used when running on actions.
 * @kind problem
 * @problem.severity error
 * @id javascript/codeql-action/unguarded-action-lib
 */

import javascript

/**
 * An import from a library that is meant for GitHub Actions and
 * we do not want to be using outside of actions.
 */
class ActionsLibImport extends ImportDeclaration {
  ActionsLibImport() {
    getImportedPath().getValue().matches("@actions/%")
  }

  string getName() {
    result = getImportedPath().getValue()
  }

  Variable getAProvidedVariable() {
    result = getASpecifier().getLocal().getVariable()
  }
}

/**
 * An entrypoint to the CLI.
 */
class ClIEntrypoint extends Function {
  ClIEntrypoint() {
    getFile().getAbsolutePath().matches("%/cli.ts")
  }
}

/**
 * A check of whether we are in actions mode or CLI mode.
 */
class ModeGuard extends IfStmt {
  ModeGuard() {
    getCondition().(EqualityTest).getAnOperand().(StringLiteral).getValue() = "actions" or
    getCondition().(EqualityTest).getAnOperand().(StringLiteral).getValue() = "cli"
  }

  string getOperand() {
    result = getCondition().(EqualityTest).getAnOperand().(StringLiteral).getValue()
  }

  predicate isPositive() {
    getCondition().(EqualityTest).getPolarity() = true
  }

  /**
   * Get the then or else block that is the "actions" path.
   */
  Stmt getActionsBlock() {
    (getOperand() = "actions" and isPositive() and result = getThen())
    or
    (getOperand() = "cli" and not isPositive() and result = getThen())
    or
    (getOperand() = "actions" and not isPositive() and result = getElse())
    or
    (getOperand() = "cli" and isPositive() and result = getElse())
  }

  /**
   * Get an expr that is only executed on actions
   */
  Expr getAnActionsExpr() {
    getActionsBlock().getAChildStmt*().getAChildExpr*() = result
  }
}

/**
 * Any expr that is a transitive child of the given function
 * and is not only called on actions.
 */
Expr getAFunctionChildExpr(Function f) {
  not exists(ModeGuard guard | guard.getAnActionsExpr() = result) and
  result.getContainer() = f
}

/*
 * Result is a function that is called from the body of the given function `f`
 * and is not only called on actions.
 */
Function calledBy(Function f) {
  exists(InvokeExpr invokeExpr |
    invokeExpr = getAFunctionChildExpr(f) and
    invokeExpr.getResolvedCallee() = result and
    not exists(ModeGuard guard | guard.getAnActionsExpr() = invokeExpr)
  )
  or
  // Assume outer function causes inner function to be called
  (result instanceof Expr and
  result.getEnclosingContainer() = f and
  not exists(ModeGuard guard | guard.getAnActionsExpr() = result))
}

from VarAccess v, ActionsLibImport actionsLib, ClIEntrypoint cliEntry 
where actionsLib.getAProvidedVariable() = v.getVariable()
  and getAFunctionChildExpr(calledBy*(cliEntry)) = v
select v, "$@ is imported from $@ and this code can be called from $@",
  v, v.getName(),
  actionsLib, actionsLib.getName(),
  cliEntry, "the CLI"
