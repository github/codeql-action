/**
 * @name Inconsistent action input
 * @description If multiple actions define an input with the same name, then the input
 *   must be defined in an identical way to avoid confusion for the user.
 *   This also makes writing queries like required-action-input.ql easier.
 * @kind problem
 * @severity error
 * @id javascript/codeql-action/inconsistent-action-input
 */

import javascript

/**
 * A declaration of a github action.
 */
class ActionDeclaration extends File {
  ActionDeclaration() {
    getRelativePath().matches("%/action.yml") and
    // Ignore internal Actions
    not getRelativePath().matches(".github/actions/%")
  }

  /**
   * The name of the action.
   */
  string getName() {
    result = getRelativePath().regexpCapture("(.*)/action.yml", 1)
  }

  YamlDocument getRootNode() {
    result.getFile() = this
  }

  YamlValue getInput(string inputName) {
    result = getRootNode().(YamlMapping).lookup("inputs").(YamlMapping).lookup(inputName)
  }
}

predicate areNotEquivalent(YamlValue x, YamlValue y) {
  x.getTag() != y.getTag()
  or
  x.(YamlScalar).getValue() != y.(YamlScalar).getValue()
  or
  x.getNumChild() != y.getNumChild()
  or
  exists(int i | areNotEquivalent(x.getChild(i), y.getChild(i)))
}

from ActionDeclaration actionA, ActionDeclaration actionB, string inputName
where actionA.getName() < actionB.getName() // prevent duplicates which are permutations of the names
  and areNotEquivalent(actionA.getInput(inputName), actionB.getInput(inputName))
  // ram and threads inputs in different actions are supposed to have different description
  and inputName != "ram" and inputName != "threads"
select actionA, "Action $@ and action $@ both declare input $@, however their definitions are not identical. This may be confusing to users.",
  actionA, actionA.getName(), actionB, actionB.getName(), inputName, inputName
