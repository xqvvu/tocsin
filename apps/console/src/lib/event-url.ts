/**
 * Absolute dashboard link for one Event.
 *
 * `tocsin.eventUrl` is offered in the template variable panel, but every render
 * site used to leave it empty because nothing knew the deployment's public
 * address. The server resolves that address from `SERVER_URL` and passes the
 * result through the send input. Without a configured base URL the variable
 * stays empty rather than emitting a relative link that is useless in an alert.
 */
export function eventDetailUrl(baseUrl: string | undefined, eventId: string): string | undefined {
  const trimmed = baseUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  return `${trimmed.replace(/\/+$/, "")}/events/${encodeURIComponent(eventId)}`;
}
