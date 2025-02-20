import githubAppJwt from "../dist/default.js";

const APP_ID = 1;
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDVzv73Pk9p3s56
N5yxDRu7dqjM3e2KE+aWOee51v0bccQJ2ceVa7b9rWAH0lblMFD4BWm6b06THsp+
qR8Eov2ZweBIvTJYx2Mx806o22tCoqU3iQSnpEP77uwZvNt9n1qvCuUP8dIMBYZ0
YYlNI4Ezqkd6HIuZILcMmhH8JO7S9MZNZdCs7rhny3JdA+1U9v9hetxSFsGnyLvZ
v1eTLR8Po+QR5s7LQinnxdUCfZQ82U05I9LJ75CO2K6zQx3g2J7j5fyTBUjZCOTd
1KbSzD/vbQomR1UOatrJ6WO0oHHoC01CxJeDNBt4yaKoUWTCsbX7PHoTsfuOohD0
Hpu9YpcbAgMBAAECggEAPyQEE8vo8+ECpQErWvX+DJx8ORQJBE/gNtke37jnwmUU
ebxAvpWy0rOSunyZgNGF99jRYmdgkv3y2vji2iGwNuoUbCbDaYhoeOXbgu5ZfLI/
jGkAYOmX0hy6yNcHEtAunabgApdtanNvQ4tSWt9zVmig9yTa7PvGUwhk60uU4+Mv
PYO56NV7bglzDAfOtBYo58DXVH/17nQNWx6GdIf/DjpDvrfLgjQTcEihQyyiUQrO
HbJ0ADLOSBpsZAFS5qZmi01+8mgNd4KLUsPzI0JbJOViklkkMNeigFTkQCwK+E3W
xJGhpdauUxIMHuv8T5pDIq5rgo42q+agm4LbW9Ip4QKBgQDvJbrAGRWg2GBeeTxd
Jm/db5DTG11WmJ0l40YFadzOVmu6aa3jHDfGzrNX6sZQPLn3IOQrAEqMwxrjYyeL
tP0XHz4QpS6FUrc9VDJqOjJCoXBPUY5Ek3Nz95hDpVg4JILw7JmawEzan7QPgUXb
9pvBI8ybLQ2DIUsJQVVzc4QKmQKBgQDk4CYjfC3mz5yWDXypLsEpHYO44VavM1Vw
dheGPHy85JZXTfc7LfK91QECG70DUtSqnDIxr66ciDGa+ZQxAR3IdAxyAGxWzXR1
H+DbEaMwtzCPqSf7GvclUhmdtFPnRi4+F/6ezVJx2E/q6mj0jT+xGwi433oZvrkk
nH3iBDiT0wKBgE7lXqADZoxC9kAUtSJyDNO7+8Z5r6hi/u1B9pbQnwT/o9jDBpf3
djtDdA1cKgLMlfl+w2egV/fqYhOEYcaIdjrLltk89YUMjeFQxrUe7/fldLzmRg4/
qwYmN/iRMvKKsRw0olRYfsJdj7TRzC9OQ4JLgjPrgBqzwCKUiFFnWbd5AoGBAJRb
Wz1rNBHGB5kYWvMLdHfjQsvnfRoJ61r/oVYJBU4n2e/zgMtiiFNWq9WjB00NNv70
SnD8kPG0MntjRhTRxW13E84dyhwmB1QYetdlwmNEi3zDyD+zhfoyEpqwFib2zejA
AvMK4mMbNQpwMeI7YMq7XFcBvRLNFxPNQKft1oKzAoGBAM5g9nYkaaGJuoqOMsWb
SrOlxDpE+88rX/uDQ0ieaM8x5s/Qrp5I/HT3/j0npZMP74RqM3sWGS1RJjG6R1Zo
KhwBAlMM1g/Qrzwbiu0LYhjLkkWf1JbPmiHH//S77N39H9BFTMs7Dg3vb8e75Qbo
w23mINkUK1qlFoq3o69IHDLz
-----END PRIVATE KEY-----`;
// see https://runkit.com/gr2m/reproducable-jwt
const BEARER =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOi0zMCwiZXhwIjo1NzAsImlzcyI6MX0.q3foRa78U3WegM5PrWLEh5N0bH1SD62OqW66ZYzArp95JBNiCbo8KAlGtiRENCIfBZT9ibDUWy82cI4g3F09mdTq3bD1xLavIfmTksIQCz5EymTWR5v6gL14LSmQdWY9lSqkgUG0XCFljWUglEP39H4yeHbFgdjvAYg3ifDS12z9oQz2ACdSpvxPiTuCC804HkPVw8Qoy0OSXvCkFU70l7VXCVUxnuhHnk8-oCGcKUspmeP6UdDnXk-Aus-eGwDfJbU2WritxxaXw6B4a3flTPojkYLSkPBr6Pi0H2-mBsW_Nvs0aLPVLKobQd4gqTkosX3967DoAG8luUMhrnxe8Q";

// url_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("url test", async () => {
  const result = await githubAppJwt({
    id: APP_ID,
    privateKey: PRIVATE_KEY,
    now: 0,
  });

  assertEquals(result.appId, 1);
  assertEquals(result.expiration, 570);
  assertEquals(result.token, BEARER);
});
