type CursorValue = string | null;
type PageInfoForward = {
    hasNextPage: boolean;
    endCursor: CursorValue;
};
type PageInfoBackward = {
    hasPreviousPage: boolean;
    startCursor: CursorValue;
};
type PageInfo = PageInfoForward | PageInfoBackward;
type PageInfoContext = {
    pageInfo: PageInfo;
    pathInQuery: string[];
};
declare const getCursorFrom: (pageInfo: PageInfo) => CursorValue;
declare const hasAnotherPage: (pageInfo: PageInfo) => boolean;
export { getCursorFrom, hasAnotherPage };
export type { PageInfo, PageInfoForward, PageInfoBackward, PageInfoContext, CursorValue, };
