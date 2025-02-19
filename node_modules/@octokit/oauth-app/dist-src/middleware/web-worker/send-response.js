function sendResponse(octokitResponse) {
  const responseOptions = {
    status: octokitResponse.status
  };
  if (octokitResponse.headers) {
    Object.assign(responseOptions, { headers: octokitResponse.headers });
  }
  return new Response(octokitResponse.text, responseOptions);
}
export {
  sendResponse
};
