/**
 * @name Import action entrypoint
 * @description Importing the entrypoint file for an action is dangerous
 * because the code from that action will be run when the file is imported.
 * @kind problem
 * @problem.severity error
 * @id javascript/codeql-action/import-action-entrypoint
 */

import javascript

class ActionEntrypointFile extends File {
  ActionEntrypointFile() {
    exists(Module m | m.getPath() = this.getAbsolutePath() and
       // This is quite a broad check and relies on the function name, but hopefully it'll be accurate enough
       m.getAStmt().getAChildExpr+().(CallExpr).getCalleeName() = "run") and
    // Requiring the relative path to exist limits us to files in the code repository and avoid libraries
    exists(this.getRelativePath())
  }
}

from ImportDeclaration i
where exists(ActionEntrypointFile f | i.getImportedModule().getPath() = f.getAbsolutePath())
select i, "This imports the entrypoint file for an action. This will execute the code from the action."
