/**
 * @name Undeclared action input
 * @description Code tries to use an input parameter that is not defined for this action.
   Perhaps this code is shared by multiple actions.
 * @kind problem
 * @problem.severity error
 * @id javascript/codeql-action/undeclared-action-input
 */

import javascript

/**
 * A declaration of a github action, including its inputs and entrypoint.
 */
class ActionDeclaration extends File {
  ActionDeclaration() {
    getRelativePath().matches("%/action.yml")
  }

  /**
   * The name of the action.
   */
  string getName() {
    result = getRelativePath().regexpCapture("(.*)/action.yml", 1)
  }

  YAMLDocument getRootNode() {
    result.getFile() = this
  }

  /**
   * The name of any input to this action.
   */
  string getAnInput() {
    result = getRootNode().(YAMLMapping).lookup("inputs").(YAMLMapping).getKey(_).(YAMLString).getValue()
  }

  /**
   * The function that is the entrypoint to this action.
   */
  FunctionDeclStmt getEntrypoint() {
    result.getFile().getRelativePath() = getRootNode().
      (YAMLMapping).lookup("runs").
      (YAMLMapping).lookup("main").
      (YAMLString).getValue().regexpReplaceAll("\\.\\./lib/(.*)\\.js", "src/$1.ts") and
    result.getName() = "run"
  }
}

/**
 * A function declared on CodeQL interface from codeql.ts
 */
class CodeQLFunction extends Function {
  CodeQLFunction() {
    exists(Function getCodeQLForCmd, ObjectExpr obj |
      getCodeQLForCmd.getName() = "getCodeQLForCmd" and
      obj = getCodeQLForCmd.getAStmt().(ReturnStmt).getExpr() and
      obj.getAProperty().getInit() = this)
  }
}

/**
 * Any expr that is a transitive child of the given function.
 */
Expr getAFunctionChildExpr(Function f) {
  result.getContainer() = f
}

/*
 * Result is a function that is called from the body of the given function `f`
 */
Function calledBy(Function f) {
  result = getAFunctionChildExpr(f).(InvokeExpr).getResolvedCallee()
  or
  // Assume outer function causes inner function to be called,
  // except for the special case of the CodeQL functions.
  (result.getEnclosingContainer() = f and not result instanceof CodeQLFunction)
  or
  // Handle calls to CodeQL functions by name
  getAFunctionChildExpr(f).(InvokeExpr).getCalleeName() = result.(CodeQLFunction).getName()
}

/**
 * A call to the core.getInput method.
 */
class GetInputMethodCallExpr extends MethodCallExpr {
  GetInputMethodCallExpr() {
    getMethodName() = "getInput"
  }

  /**
   * The name of the input being accessed.
   */
  string getInputName() {
    result = getArgument(0).(StringLiteral).getValue()
  }
}

from ActionDeclaration action, GetInputMethodCallExpr getInputCall, string inputName
where getAFunctionChildExpr(calledBy*(action.getEntrypoint())) = getInputCall and
  inputName = getInputCall.getInputName() and
  not inputName = action.getAnInput()
select getInputCall, "The $@ input is not defined for the $@ action", inputName, inputName, action, action.getName()