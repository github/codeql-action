export type OctokitRequest = {
    method: string;
    url: string;
    headers: Record<string, string>;
    text: () => Promise<string>;
};
export type OctokitResponse = {
    status: number;
    headers?: Record<string, string>;
    text?: string;
};
export type HandlerOptions = {
    pathPrefix?: string;
};
