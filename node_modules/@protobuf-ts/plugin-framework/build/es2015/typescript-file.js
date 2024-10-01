import * as ts from "typescript";
export class TypescriptFile {
    constructor(filename) {
        this.sf = ts.createSourceFile(filename, "", ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    }
    getFilename() {
        return this.sf.fileName;
    }
    /**
     * Add the new statement to the file.
     */
    addStatement(statement, atTop = false) {
        const newStatements = atTop
            ? [statement, ...this.sf.statements]
            : this.sf.statements.concat(statement);
        this.sf = ts.updateSourceFileNode(this.sf, newStatements);
    }
    /**
     * The underlying SourceFile
     */
    getSourceFile() {
        return this.sf;
    }
    /**
     * Are there any statements in this file?
     */
    isEmpty() {
        return this.sf.statements.length === 0;
    }
    /**
     * The full content of this file.
     * Returns an empty string if there are no statements.
     */
    getContent() {
        let printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
        return printer.printFile(this.sf);
    }
}
