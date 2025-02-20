import { request as defaultRequest } from "@octokit/request";
async function deleteToken(options) {
  const request = options.request || defaultRequest;
  const auth = btoa(`${options.clientId}:${options.clientSecret}`);
  return request(
    "DELETE /applications/{client_id}/token",
    {
      headers: {
        authorization: `basic ${auth}`
      },
      client_id: options.clientId,
      access_token: options.token
    }
  );
}
export {
  deleteToken
};
