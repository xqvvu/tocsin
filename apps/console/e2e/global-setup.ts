import { rm } from "node:fs/promises";

import { e2eDatabasePath } from "../playwright.config";

/**
 * Start every run from an empty database.
 *
 * The suite asserts the first-run setup flow, which by definition only appears on
 * an instance with no users. Reusing a database from a previous run would leave
 * the app on the login screen and the "create owner" step would never render —
 * and the failure would look like a UI bug rather than stale test state.
 */
export default async function globalSetup(): Promise<void> {
  const path = process.env.TOCSIN_E2E_DATABASE_PATH ?? "/tmp/tocsin-e2e.sqlite";

  for (const suffix of ["", "-wal", "-shm"]) {
    await rm(`${path}${suffix}`, { force: true });
  }

  // Keep the import honest so the two files cannot drift apart.
  void e2eDatabasePath();
}
