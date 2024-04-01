/**
 * @name Required action input
 * @description For action inputs the core.input represents input with no value as the emptystring.
 *   This doesn't promote good type checking. Instead, use either actions-util.getOptionalInput or
 *   actions-util.getRequiredInput depending on if the input always has a value or not. The input
 *   will always have a value if it is required or has a default value.
 * @kind problem
 * @problem.severity error
 * @id javascript/codeql-action/required-action-input
 */

import javascript

/**
 * A declaration of a github action.
 */
class ActionDeclaration extends File {
  ActionDeclaration() {
    getRelativePath().matches("%/action.yml")
  }

  YamlDocument getRootNode() {
    result.getFile() = this
  }

  /**
   * The name of any input to this action.
   */
  string getAnInput() {
    result = getRootNode().(YamlMapping).lookup("inputs").(YamlMapping).getKey(_).(YamlString).getValue()
  }

  /**
   * The given input always has a value, either because it is required,
   * or because it has a default value.
   */
  predicate inputAlwaysHasValue(string input) {
    exists(YamlMapping value |
      value = getRootNode().(YamlMapping).lookup("inputs").(YamlMapping).lookup(input) and
      (exists(value.lookup("default")) or
       value.lookup("required").(YamlBool).getBoolValue() = true))
  }
}

/**
 * An import from "@actions/core"
 */
class ActionsLibImport extends ImportDeclaration {
  ActionsLibImport() {
    getImportedPath().getValue() = "@actions/core"
  }

  Variable getAProvidedVariable() {
    result = getASpecifier().getLocal().getVariable()
  }
}

/**
 * A call to the core.getInput method.
 */
class CoreGetInputMethodCallExpr extends MethodCallExpr {
  CoreGetInputMethodCallExpr() {
    getMethodName() = "getInput" and
    exists(ActionsLibImport libImport |
      this.getReceiver() = libImport.getAProvidedVariable().getAnAccess() or
      this.getReceiver().(PropAccess).getBase() = libImport.getAProvidedVariable().getAnAccess())
  }

  /**
   * The name of the input being accessed.
   */
  string getInputName() {
    result = getArgument(0).(StringLiteral).getValue()
  }
}

from ActionDeclaration action, CoreGetInputMethodCallExpr getInputCall, string inputName, string alternateFunction
where action.getAnInput() = inputName
  // We don't want to create an alert for the users core.getInput in the getRequiredInput
  // and getOptionalInput functions themselves, and this check here does that in a
  // roundabout way by checking the parameter is a string literal. This should be enough
  // and hopefully won't discount any real calls to core.getInput, but is worth noting here.
  and getInputCall.getInputName() = inputName
  and ((action.inputAlwaysHasValue(inputName) and alternateFunction = "getRequiredInput")
    or (not action.inputAlwaysHasValue(inputName) and alternateFunction = "geOptionalInput"))
select getInputCall, "This input may be undefined. Please use actions-util.$@ instead.", alternateFunction, alternateFunction