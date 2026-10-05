/**
 * The connection string handed to `pg`: libpq's `sslrootcert=system` is dropped, the rest kept.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pgConnectionString } from "../mikro-orm.config";

describe("pgConnectionString", () => {
  it("drops sslrootcert=system wherever it sits and keeps sslmode", () => {
    assert.equal(
      pgConnectionString("postgresql://u:p@h/db?sslmode=verify-full&sslrootcert=system"),
      "postgresql://u:p@h/db?sslmode=verify-full",
    );
    assert.equal(
      pgConnectionString("postgresql://u:p@h/db?sslrootcert=system&sslmode=require"),
      "postgresql://u:p@h/db?sslmode=require",
    );
    assert.equal(pgConnectionString("postgresql://u:p@h/db?sslrootcert=system"), "postgresql://u:p@h/db");
  });

  it("leaves a real certificate path and a plain URL alone", () => {
    const withFile = "postgresql://u:p@h/db?sslmode=verify-full&sslrootcert=/etc/ca.pem";
    assert.equal(pgConnectionString(withFile), withFile);
    assert.equal(pgConnectionString("postgresql://u:p@127.0.0.1:54329/wordpoker"), "postgresql://u:p@127.0.0.1:54329/wordpoker");
  });
});
