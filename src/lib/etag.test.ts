import assert from "node:assert/strict";

import { etagMatches, makeEtag } from "./etag";

const tag = makeEtag(["5-10", 12]);
assert.equal(tag, '"5-10:12"');

function request(header?: string) {
  return new Request("http://127.0.0.1/api/booths/5-10", {
    headers: header ? { "If-None-Match": header } : {},
  });
}

assert.equal(etagMatches(request(), tag), false);
assert.equal(etagMatches(request(tag), tag), true);
assert.equal(etagMatches(request(`W/${tag}`), tag), true);
assert.equal(etagMatches(request(`"${tag.slice(1, -1)}", "other"`), tag), true);
assert.equal(etagMatches(request('"nope"'), tag), false);

console.log("etag checks passed");
