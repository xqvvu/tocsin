import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sql } from "kysely";
import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";

describe("sqlite connection", () => {
  it("creates the database parent directory before opening a file database", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tocsin-sqlite-"));
    const databasePath = path.join(tempDir, "data", "tocsin.sqlite");

    try {
      const db = createSqliteDatabase({ databasePath });

      try {
        expect(fs.existsSync(path.dirname(databasePath))).toBe(true);
        expect(fs.existsSync(databasePath)).toBe(true);
      } finally {
        await db.destroy();
      }
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("creates a Kysely SQLite database handle", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });

    try {
      await sql`CREATE TABLE probe (value INTEGER NOT NULL)`.execute(db);
      await sql`INSERT INTO probe (value) VALUES (${42})`.execute(db);

      const result = await sql<{ value: number }>`SELECT value FROM probe`.execute(db);

      expect(result.rows).toEqual([{ value: 42 }]);
    } finally {
      await db.destroy();
    }
  });
});
