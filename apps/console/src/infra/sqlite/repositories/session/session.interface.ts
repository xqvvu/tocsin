/**
 * One live dashboard session, projected for the account-security panel.
 *
 * Deliberately not the `session` row: `token` and the auth runtime's internal
 * columns have no business above the repository, and the type is what would
 * otherwise carry them into a DTO.
 */
export interface ActiveSessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SessionRepository {
  /**
   * Lists one user's unexpired sessions, most recent activity first.
   *
   * The user id is a parameter rather than a filter the caller can forget, and
   * the projection is an explicit column list so the token is never read.
   */
  listActiveForUser(userId: string): Promise<ActiveSessionRecord[]>;
}
