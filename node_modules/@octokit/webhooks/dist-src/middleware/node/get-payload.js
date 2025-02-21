function getPayload(request) {
  if (typeof request.body === "object" && "rawBody" in request && request.rawBody instanceof Buffer) {
    return Promise.resolve(request.rawBody.toString("utf8"));
  } else if (typeof request.body === "string") {
    return Promise.resolve(request.body);
  }
  return new Promise((resolve, reject) => {
    let data = [];
    request.on(
      "error",
      (error) => reject(new AggregateError([error], error.message))
    );
    request.on("data", (chunk) => data.push(chunk));
    request.on(
      "end",
      () => (
        // setImmediate improves the throughput by reducing the pressure from
        // the event loop
        setImmediate(
          resolve,
          data.length === 1 ? data[0].toString("utf8") : Buffer.concat(data).toString("utf8")
        )
      )
    );
  });
}
export {
  getPayload
};
