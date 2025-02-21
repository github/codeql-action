import type { OctokitRequest } from "./types.js";
export declare function unknownRouteResponse(request: OctokitRequest): {
    status: number;
    headers: {
        "content-type": string;
    };
    text: string;
};
