/// <reference types="node" />
import { TwirpContext, TwirpServer } from "../index";
import { Size, Hat, FindHatRPC, ListHatRPC } from "./service";
interface Rpc {
    request(service: string, method: string, contentType: "application/json" | "application/protobuf", data: object | Uint8Array): Promise<object | Uint8Array>;
}
export interface HaberdasherClient {
    MakeHat(request: Size): Promise<Hat>;
    FindHat(request: FindHatRPC): Promise<FindHatRPC>;
    ListHat(request: ListHatRPC): Promise<ListHatRPC>;
}
export declare class HaberdasherClientJSON implements HaberdasherClient {
    private readonly rpc;
    constructor(rpc: Rpc);
    MakeHat(request: Size): Promise<Hat>;
    FindHat(request: FindHatRPC): Promise<FindHatRPC>;
    ListHat(request: ListHatRPC): Promise<ListHatRPC>;
}
export declare class HaberdasherClientProtobuf implements HaberdasherClient {
    private readonly rpc;
    constructor(rpc: Rpc);
    MakeHat(request: Size): Promise<Hat>;
    FindHat(request: FindHatRPC): Promise<FindHatRPC>;
    ListHat(request: ListHatRPC): Promise<ListHatRPC>;
}
export interface HaberdasherTwirp<T extends TwirpContext = TwirpContext> {
    MakeHat(ctx: T, request: Size): Promise<Hat>;
    FindHat(ctx: T, request: FindHatRPC): Promise<FindHatRPC>;
    ListHat(ctx: T, request: ListHatRPC): Promise<ListHatRPC>;
}
export declare enum HaberdasherMethod {
    MakeHat = "MakeHat",
    FindHat = "FindHat",
    ListHat = "ListHat"
}
export declare const HaberdasherMethodList: HaberdasherMethod[];
export declare function createHaberdasherServer<T extends TwirpContext = TwirpContext>(service: HaberdasherTwirp<T>): TwirpServer<HaberdasherTwirp<TwirpContext<import("http").IncomingMessage, import("http").ServerResponse>>, T>;
export {};
