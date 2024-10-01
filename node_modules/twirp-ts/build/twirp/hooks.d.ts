import { TwirpContext } from "./context";
import { TwirpError } from "./errors";
export interface ServerHooks<T extends TwirpContext = TwirpContext> {
    requestReceived?: (ctx: T) => void | Promise<void>;
    requestRouted?: (ctx: T) => void | Promise<void>;
    /**@deprecated Use responsePrepared instead*/
    requestPrepared?: (ctx: T) => void | Promise<void>;
    responsePrepared?: (ctx: T) => void | Promise<void>;
    /**@deprecated Use responseSent instead*/
    requestSent?: (ctx: T) => void | Promise<void>;
    responseSent?: (ctx: T) => void | Promise<void>;
    error?: (ctx: T, err: TwirpError) => void | Promise<void>;
}
export declare function chainHooks<T extends TwirpContext = TwirpContext>(...hooks: ServerHooks<T>[]): ServerHooks<T> | null;
export declare function isHook<T extends TwirpContext = TwirpContext>(object: any): object is ServerHooks<T>;
