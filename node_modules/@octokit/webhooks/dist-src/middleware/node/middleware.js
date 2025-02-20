import { getMissingHeaders } from "./get-missing-headers.js";
import { getPayload } from "./get-payload.js";
import { onUnhandledRequestDefault } from "./on-unhandled-request-default.js";
async function middleware(webhooks, options, request, response, next) {
  let pathname;
  try {
    pathname = new URL(request.url, "http://localhost").pathname;
  } catch (error) {
    response.writeHead(422, {
      "content-type": "application/json"
    });
    response.end(
      JSON.stringify({
        error: `Request URL could not be parsed: ${request.url}`
      })
    );
    return true;
  }
  if (pathname !== options.path) {
    next?.();
    return false;
  } else if (request.method !== "POST") {
    onUnhandledRequestDefault(request, response);
    return true;
  }
  if (!request.headers["content-type"] || !request.headers["content-type"].startsWith("application/json")) {
    response.writeHead(415, {
      "content-type": "application/json",
      accept: "application/json"
    });
    response.end(
      JSON.stringify({
        error: `Unsupported "Content-Type" header value. Must be "application/json"`
      })
    );
    return true;
  }
  const missingHeaders = getMissingHeaders(request).join(", ");
  if (missingHeaders) {
    response.writeHead(400, {
      "content-type": "application/json"
    });
    response.end(
      JSON.stringify({
        error: `Required headers missing: ${missingHeaders}`
      })
    );
    return true;
  }
  const eventName = request.headers["x-github-event"];
  const signatureSHA256 = request.headers["x-hub-signature-256"];
  const id = request.headers["x-github-delivery"];
  options.log.debug(`${eventName} event received (id: ${id})`);
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    response.statusCode = 202;
    response.end("still processing\n");
  }, 9e3).unref();
  try {
    const payload = await getPayload(request);
    await webhooks.verifyAndReceive({
      id,
      name: eventName,
      payload,
      signature: signatureSHA256
    });
    clearTimeout(timeout);
    if (didTimeout) return true;
    response.end("ok\n");
    return true;
  } catch (error) {
    clearTimeout(timeout);
    if (didTimeout) return true;
    const err = Array.from(error.errors)[0];
    const errorMessage = err.message ? `${err.name}: ${err.message}` : "Error: An Unspecified error occurred";
    response.statusCode = typeof err.status !== "undefined" ? err.status : 500;
    options.log.error(error);
    response.end(
      JSON.stringify({
        error: errorMessage
      })
    );
    return true;
  }
}
export {
  middleware
};
