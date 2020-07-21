/**
 * @name Undeclared action input
 * @description Code tries to use an input parameter that is not defined for this action.
   Perhaps this code is shared by multiple actions.
 * @kind problem
 * @problem.severity error
 * @id javascript/codeql-action/undeclared-action-input
 */

import javascript

class ActionDeclaration extends File {
  ActionDeclaration() {
    getRelativePath().matches("%/action.yml")
  }

  string getName() {
    result = getRelativePath().regexpCapture("(.*)/action.yml", 1)
  }

  YAMLDocument getRootNode() {
    result.getFile() = this
  }

  string getAnInput() {
    result = getRootNode().(YAMLMapping).lookup("inputs").(YAMLMapping).getKey(_).(YAMLString).getValue()
  }

  FunctionDeclStmt getEntrypoint() {
    result.getFile().getRelativePath() = getRootNode().
      (YAMLMapping).lookup("runs").
      (YAMLMapping).lookup("main").
      (YAMLString).getValue().regexpReplaceAll("\\.\\./lib/(.*)\\.js", "src/$1.ts") and
    result.getName() = "run"
  }
}

Expr getAFunctionChildExpr(Function f) {
  result.getContainer() = f
}

/*
 * Result is a function that is called from the body of the given function `f`
 */
Function calledBy(Function f) {
  result = getAFunctionChildExpr(f).(InvokeExpr).getResolvedCallee()
  or
  result.getEnclosingContainer() = f // assume outer function causes inner function to be called
}

class GetInputMethodCallExpr extends MethodCallExpr {
  GetInputMethodCallExpr() {
    getMethodName() = "getInput"
  }

  string getInputName() {
    result = getArgument(0).(StringLiteral).getValue()
  }
}

from ActionDeclaration action, GetInputMethodCallExpr getInputCall, string inputName
where getAFunctionChildExpr(calledBy*(action.getEntrypoint())) = getInputCall and
  inputName = getInputCall.getInputName() and
  not inputName = action.getAnInput()
select getInputCall, "The $@ input is not defined for the $@ action", inputName, inputName, action, action.getName()
