/**
 * Absolute dashboard links for one Event or one Delivery.
 *
 * `tocsin.eventUrl` and `tocsin.deliveryUrl` are offered in the template
 * variable panel, but a render site can only fill them when it knows the
 * deployment's public address. The server resolves that address from
 * `SERVER_URL` and passes the result through the send input. Without a
 * configured base URL the variable stays empty rather than emitting a relative
 * link that is useless in an alert.
 */
export function eventDetailUrl(baseUrl: string | undefined, eventId: string): string | undefined {
  return detailUrl(baseUrl, "events", eventId);
}

/**
 * Absolute dashboard link for one Delivery.
 *
 * One Event fans out to every matching destination, so a recipient who only has
 * the event link still has to pick their delivery out of the list. This link
 * lands on the exact attempt and its transport response.
 */
export function deliveryDetailUrl(
  baseUrl: string | undefined,
  deliveryId: string,
): string | undefined {
  return detailUrl(baseUrl, "deliveries", deliveryId);
}

function detailUrl(baseUrl: string | undefined, segment: string, id: string): string | undefined {
  const trimmed = baseUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  return `${trimmed.replace(/\/+$/, "")}/${segment}/${encodeURIComponent(id)}`;
}
