import { Link } from "@tanstack/react-router";

import type { EventFingerprintOccurrence } from "@tocsin/core";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { SeverityBadge } from "#/features/events/ui/severity-badge";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The most recent earlier occurrences of one fingerprint.
 *
 * Each row links to its own event so an operator can walk the recurrence
 * backwards without pasting the fingerprint into the search box. The id stays
 * visible under the title for correlation with upstream systems, matching the
 * event cell used elsewhere.
 */
export function EventFingerprintOccurrencesTable({
  occurrences,
}: {
  occurrences: EventFingerprintOccurrence[];
}) {
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("events.detail.fingerprint.occurrencesTitle")}</h3>
      <div className="border-border bg-background overflow-auto border">
        <Table className="min-w-140">
          <TableHeader className="bg-muted/50 text-muted-foreground">
            <TableRow>
              <TableHead className="w-[22%]">{t("events.detail.terms.received")}</TableHead>
              <TableHead className="w-[14%]">{t("events.detail.terms.severity")}</TableHead>
              <TableHead className="w-[14%]">{t("events.detail.terms.status")}</TableHead>
              <TableHead>{t("events.detail.terms.title")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {occurrences.map((occurrence) => (
              <TableRow key={occurrence.id} className="align-top">
                <TableCell className="text-xs whitespace-nowrap">
                  <OperationTimestamp format="dateTime" value={occurrence.receivedAt} />
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={occurrence.severity} />
                </TableCell>
                <TableCell
                  className={
                    occurrence.status === "firing"
                      ? "text-destructive text-xs font-medium"
                      : "text-xs"
                  }
                >
                  {t(`common.alertStatus.${occurrence.status}`)}
                </TableCell>
                <TableCell className="min-w-0">
                  <Link
                    to="/events/$eventId"
                    params={{ eventId: occurrence.id }}
                    className="font-medium hover:underline"
                    title={occurrence.title}
                  >
                    {occurrence.title}
                  </Link>
                  <div className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                    {occurrence.id}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
