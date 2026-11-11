import assert from "node:assert/strict";

import { publicBaseUrl } from "./publicBaseUrl";

const fallback = "http://localhost:3000/";

assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: "https://booth.example.com/" }, fallback), "https://booth.example.com");
assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: "https://booth.example.com///" }, fallback), "https://booth.example.com");
assert.equal(
  publicBaseUrl({ NEXT_PUBLIC_BASE_URL: "https://public.example.com/" }, fallback),
  "https://public.example.com",
);
assert.equal(
  publicBaseUrl(
    {
      PUBLIC_BASE_URL: "https://preferred.example.com/",
      NEXT_PUBLIC_BASE_URL: "https://public.example.com/",
    },
    fallback,
  ),
  "https://preferred.example.com",
);
assert.equal(publicBaseUrl({}, fallback), "http://localhost:3000");
assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: "  ", NEXT_PUBLIC_BASE_URL: "" }, fallback), "http://localhost:3000");
assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: "///" }, "http://127.0.0.1:3000"), "http://127.0.0.1:3000");

console.log("public base url checks passed");
