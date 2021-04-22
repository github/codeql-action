/**
 * @name Unguarded actions library use
 * @description Code that runs outside of GitHub Actions tries to use a library that should only be used when running on actions.
 * @kind problem
 * @problem.severity error
 * @id javascript/codeql-action/unguarded-action-lib
 */

import javascript

/**
 * Although these libraries are designed for use on actions they
 * have been deemed safe to use outside of actions as well.
 */
bindingset[lib]
predicate isSafeActionLib(string lib) {
  lib = "@actions/http-client" or
  lib = "@actions/exec" or
  lib = "@actions/io" or
  lib.matches("@actions/exec/%")
}

/**
 * Matches libraries that are not always safe to use outside of actions
 * but can be made so by setting certain environment variables.
 */
predicate isSafeActionLibWithActionsEnvVars(string lib) {
    lib = "@actions/tool-cache"
}

/**
 * Matches the names of runner commands that set action env vars
 */
predicate commandSetsActionsEnvVars(string commandName) {
    commandName = "init" or commandName = "autobuild" or commandName = "analyze"
}

/**
 * An import from a library that is meant for GitHub Actions and
 * we do not want to be using outside of actions.
 */
class ActionsLibImport extends ImportDeclaration {
  ActionsLibImport() {
    getImportedPath().getValue().matches("@actions/%") and
    not isSafeActionLib(getImportedPath().getValue()) or
    getImportedPath().getValue() = "./actions-util"
  }

  string getName() {
    result = getImportedPath().getValue()
  }

  Variable getAProvidedVariable() {
    result = getASpecifier().getLocal().getVariable()
  }
}

/**
 * An entrypoint to the CodeQL runner.
 */
class RunnerEntrypoint extends Function {
  RunnerEntrypoint() {
    getFile().getAbsolutePath().matches("%/runner.ts")
  }

  /**
   * Does this runner entry point set the RUNNER_TEMP and
   * RUNNER_TOOL_CACHE env vars which make some actions libraries
   * safe to use outside of actions.
   * See "setupActionsVars" in "util.ts".
   */
  predicate setsActionsEnvVars() {
    // This is matching code of the following format, where "this"
    // is the function being passed to the "action" method.
    //
    // program
    //   .command("init")
    //   ...
    //   .action(async (cmd: InitArgs) => {
    //     ...
    //   })
    exists(MethodCallExpr actionCall,
        MethodCallExpr commandCall |
        commandCall.getMethodName() = "command" and
        commandCall.getReceiver().(VarAccess).getVariable().getName() = "program" and
        commandSetsActionsEnvVars(commandCall.getArgument(0).(StringLiteral).getValue()) and
        actionCall.getMethodName() = "action" and
        actionCall.getReceiver().getAChildExpr*() = commandCall and
        actionCall.getArgument(0).getAChildExpr*() = this)
  }
}

/**
 * A check of whether we are in actions mode or runner mode.
 */
class ModeGuard extends IfStmt {
  ModeGuard() {
    getCondition().(EqualityTest).getAnOperand().(StringLiteral).getValue() = "actions" or
    getCondition().(EqualityTest).getAnOperand().(StringLiteral).getValue() = "runner"
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
    (getOperand() = "runner" and not isPositive() and result = getThen())
    or
    (getOperand() = "actions" and not isPositive() and result = getElse())
    or
    (getOperand() = "runner" and isPositive() and result = getElse())
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

from VarAccess v, ActionsLibImport actionsLib, RunnerEntrypoint runnerEntry 
where actionsLib.getAProvidedVariable() = v.getVariable()
  and getAFunctionChildExpr(calledBy*(runnerEntry)) = v
  and not (isSafeActionLibWithActionsEnvVars(actionsLib.getName()) and runnerEntry.setsActionsEnvVars())
select v, "$@ is imported from $@ and this code can be called from $@",
  v, v.getName(),
  actionsLib, actionsLib.getName(),
  runnerEntry, "the runner"
