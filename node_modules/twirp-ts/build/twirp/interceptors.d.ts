import { TwirpContext } from "./context";
export declare type Next<Context extends TwirpContext = TwirpContext, Request = any, Response = any> = (ctx: Context, typedRequest: Request) => Promise<Response>;
export declare type Interceptor<Context extends TwirpContext, Request, Response> = (ctx: Context, typedRequest: Request, next: Next<Context, Request, Response>) => Promise<Response>;
export declare function chainInterceptors<Context extends TwirpContext, Request, Response>(...interceptors: Interceptor<Context, Request, Response>[]): Interceptor<Context, Request, Response> | undefined;
