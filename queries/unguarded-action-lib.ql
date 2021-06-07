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
    getImportedPath().getValue().matches("%/actions-util$")
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
 * A generic check to see if we are in actions or runner mode in a particular block of code.
 */
abstract class ActionsGuard extends IfStmt {

  /**
   * Get a statement block that is only executed on actions
   */
  abstract Stmt getActionsBlock();

  /**
    * Gets an expr that is only executed on actions
   */
  final Expr getAnActionsExpr() { getActionsBlock().getAChildStmt*().getAChildExpr*() = result }

}

/**
 * A check of whether we are in actions mode or runner mode, based on
 * the presense of a call to `isActions()` in the condition of an if statement.
 */
class IsActionsGuard extends ActionsGuard {
  IsActionsGuard() {
    getCondition().(CallExpr).getCalleeName() = "isActions"
  }

  /**
   * Get the "then" block that is the "actions" path.
   */
  override Stmt getActionsBlock() {
    result = getThen()
  }
}

/**
 * A check of whether we are in actions mode or runner mode, based on
 * the presense of a call to `!isActions()` in the condition of an if statement.
 */
class NegatedIsActionsGuard extends ActionsGuard {
  NegatedIsActionsGuard() {
    getCondition().(LogNotExpr).getOperand().(CallExpr).getCalleeName() = "isActions"
  }

  /**
   * Get the "else" block that is the "actions" path.
   */
  override Stmt getActionsBlock() {
    result = getElse()
  }
}

class ModeAccess extends PropAccess {
  ModeAccess() {
    (
      // eg- Mode.actions
      getBase().(Identifier).getName() = "Mode" or
      // eg- actionUtil.Mode.actions
      getBase().(PropAccess).getPropertyName() = "Mode"
    ) and
    (getPropertyName() = "actions" or getPropertyName() = "runner")
  }

  predicate isActions() {
    getPropertyName() = "actions"
  }

  predicate isRunner() {
    getPropertyName() = "runner"
  }
}

/**
 * A check of whether we are in actions mode or runner mode.
 */
class ModeGuard extends ActionsGuard {
  ModeGuard() {
    getCondition().(EqualityTest).getAnOperand().(ModeAccess).isActions() or
    getCondition().(EqualityTest).getAnOperand().(ModeAccess).isRunner()
  }

  ModeAccess getOperand() {
    result = getCondition().(EqualityTest).getAnOperand()
  }

  predicate isPositive() {
    getCondition().(EqualityTest).getPolarity() = true
  }

  /**
   * Get the then or else block that is the "actions" path.
   */
  override Stmt getActionsBlock() {
    (getOperand().isActions() and isPositive() and result = getThen())
    or
    (getOperand().isRunner() and not isPositive() and result = getThen())
    or
    (getOperand().isActions() and not isPositive() and result = getElse())
    or
    (getOperand().isRunner() and isPositive() and result = getElse())
  }
}

/**
 * Any expr that is a transitive child of the given function
 * and is not only called on actions.
 */
Expr getAFunctionChildExpr(Function f) {
  not exists(ActionsGuard guard | guard.getAnActionsExpr() = result) and
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
    not exists(ActionsGuard guard | guard.getAnActionsExpr() = invokeExpr)
  )
  or
  // Assume outer function causes inner function to be called
  (result instanceof Expr and
  result.getEnclosingContainer() = f and
  not exists(ActionsGuard guard | guard.getAnActionsExpr() = result))
}

from VarAccess v, ActionsLibImport actionsLib, RunnerEntrypoint runnerEntry
where actionsLib.getAProvidedVariable() = v.getVariable()
  and getAFunctionChildExpr(calledBy*(runnerEntry)) = v
  and not (isSafeActionLibWithActionsEnvVars(actionsLib.getName()) and runnerEntry.setsActionsEnvVars())
select v, "$@ is imported from $@ and this code can be called from $@",
  v, v.getName(),
  actionsLib, actionsLib.getName(),
  runnerEntry, "the runner"
