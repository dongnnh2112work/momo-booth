import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CheckinInsertClient, CheckinRow, SupabaseErrorLike } from "./checkinRecord";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverOnlyEmpty = path.join(projectRoot, "node_modules/next/dist/compiled/server-only/empty.js");

type ResolveFilename = (this: unknown, request: string, ...args: unknown[]) => string;

const nodeModule = Module as unknown as { _resolveFilename: ResolveFilename };
const originalResolve = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return serverOnlyEmpty;
  return originalResolve.call(this, request, ...args);
};

const row: CheckinRow = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "A01",
  booth: "5-10",
  client_id: "client-12345678",
  created_at: "2026-11-11T00:00:00.000Z",
};

function conflictError(): SupabaseErrorLike {
  return {
    code: "23505",
    message: 'duplicate key value violates unique constraint "checkins_code_booth_key"',
    details: "Key (code, booth)=(A01, 5-10) already exists.",
  };
}

function mockInsert(error: SupabaseErrorLike): { client: CheckinInsertClient; rows: CheckinRow[]; calls: number } {
  const rows: CheckinRow[] = [];
  const state = { calls: 0 };
  const client: CheckinInsertClient = {
    from(table) {
      assert.equal(table, "checkins");
      return {
        insert(value) {
          state.calls += 1;
          rows.push(value);
          return Promise.resolve({ error });
        },
      };
    },
  };
  return { client, rows, get calls() { return state.calls; } };
}

async function main() {
  const { applyCheckinInsert, mapCheckinInsertError, toCheckinRow } = await import("./checkinRecord");

  assert.equal(mapCheckinInsertError(null), "checked-in");
  assert.equal(mapCheckinInsertError(conflictError()), "already-checked-in");
  assert.equal(
    mapCheckinInsertError({ code: "23505", message: "duplicate key value violates unique constraint" }),
    "already-checked-in",
  );
  assert.equal(mapCheckinInsertError({ code: "42501", message: "permission denied for table checkins" }), "error");
  assert.equal(mapCheckinInsertError({ message: "fetch failed" }), "error");

  const conflict = mockInsert(conflictError());
  const dirty = { ...row, name: "Hidden Name", photo: "/portraits/a01.jpg", department: "People" };
  const conflictResult = await applyCheckinInsert(conflict.client, dirty as CheckinRow);
  assert.equal(conflictResult.status, "already-checked-in");
  assert.equal(conflict.calls, 1);
  assert.deepEqual(conflict.rows, [row]);
  assert.deepEqual(conflictResult.payload, toCheckinRow(row));
  assert.equal("name" in conflictResult.payload, false);
  assert.equal("photo" in conflictResult.payload, false);
  assert.equal("department" in conflictResult.payload, false);

  const inserted = mockInsert(null);
  const insertedResult = await applyCheckinInsert(inserted.client, row);
  assert.equal(insertedResult.status, "checked-in");
  assert.equal(inserted.calls, 1);
  assert.deepEqual(inserted.rows[0], row);

  console.log("checkin conflict mapping passed");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "checkin conflict test failed";
  console.error(message);
  process.exit(1);
});
