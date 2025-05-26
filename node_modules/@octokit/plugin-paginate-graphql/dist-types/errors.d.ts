import type { CursorValue, PageInfoContext } from "./page-info.js";
declare class MissingCursorChange extends Error {
    readonly pageInfo: PageInfoContext;
    readonly cursorValue: CursorValue;
    name: string;
    constructor(pageInfo: PageInfoContext, cursorValue: CursorValue);
}
declare class MissingPageInfo extends Error {
    readonly response: any;
    name: string;
    constructor(response: any);
}
export { MissingCursorChange, MissingPageInfo };
