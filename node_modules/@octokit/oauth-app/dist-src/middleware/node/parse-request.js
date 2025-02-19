function parseRequest(request) {
  const { method, url, headers } = request;
  async function text() {
    const text2 = await new Promise((resolve, reject) => {
      let bodyChunks = [];
      request.on("error", reject).on("data", (chunk) => bodyChunks.push(chunk)).on("end", () => resolve(Buffer.concat(bodyChunks).toString()));
    });
    return text2;
  }
  return { method, url, headers, text };
}
export {
  parseRequest
};
