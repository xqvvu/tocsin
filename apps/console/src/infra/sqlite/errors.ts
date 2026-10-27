export class SqliteError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class SqliteDataIntegrityError extends SqliteError {}

export class SqliteMigrationError extends SqliteError {}

/**
 * The database was written by a build that knows migrations this build does
 * not, so upgrading cannot proceed. Kept distinct from other migration errors
 * so readiness probes can tell an incompatible image from a failed migration
 * without parsing error text.
 */
export class SqliteMigrationCompatibilityError extends SqliteMigrationError {}

export class RecordNotFoundError extends SqliteError {
  constructor(
    readonly resource: string,
    readonly id?: string,
  ) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`);
  }
}
