import { expectType } from "tsd";
import githubAppJwt from ".";

export async function test() {
  const result = await githubAppJwt({
    id: 123,
    privateKey: "",
  });

  expectType<number>(result.appId);
  expectType<number>(result.expiration);
  expectType<string>(result.token);
}

// Test case to verify `id` can be set to a string
export async function testWithStringId() {
  const resultWithStringId = await githubAppJwt({
    id: "client_id_string",
    privateKey: "",
  });

  expectType<string>(resultWithStringId.appId);
  expectType<number>(resultWithStringId.expiration);
  expectType<string>(resultWithStringId.token);
}
