import { RiLogoutBoxRLine } from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { activeSessionsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { useSessionMutations } from "#/features/configuration/api/use-session-mutations";
import { useOperationDateFormatter } from "#/features/operations/model/operation-format";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Read-only session inventory plus one emergency action.
 *
 * "Sign out other devices" is incident response — a lost laptop, a shared owner
 * password, someone leaving — not routine account management: the instance has
 * one dashboard account and no password-reset flow. Per-row revocation, signing
 * out the current session, and sign-in history are deliberately absent; the
 * current session stays labelled so nobody mistakes it for a stale one.
 *
 * Unknown IP and client are rendered as "unknown" instead of falling back to a
 * loopback address: behind a reverse proxy the recorded address is whatever the
 * proxy forwarded, and an invented value would be worse than an absent one.
 */
export function SettingsSecurityPanel() {
  const t = useTranslations();
  const dateFormatter = useOperationDateFormatter();
  const { data } = useSuspenseQuery(activeSessionsQueryOptions());
  const mutations = useSessionMutations();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const otherSessions = data.sessions.filter((session) => !session.current);

  async function revokeOthers() {
    try {
      const result = await mutations.revokeOtherSessions();

      if (result.status) {
        toast.success(t("configuration.sessions.revoked"));
      } else {
        toast.error(t("configuration.sessions.revokeFailed"));
      }

      setConfirmOpen(false);
    } catch (error) {
      toast.error(t("configuration.sessions.revokeFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <section
      aria-labelledby="settings-sessions-title"
      className="border-border flex min-w-0 flex-col border"
    >
      <header className="border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 id="settings-sessions-title" className="text-sm font-medium">
            {t("configuration.sessions.title")}
          </h2>
          <p className="text-muted-foreground text-xs">{t("configuration.sessions.description")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={otherSessions.length === 0 || mutations.revoking}
          onClick={() => setConfirmOpen(true)}
        >
          <RiLogoutBoxRLine data-icon="inline-start" aria-hidden />
          {t("configuration.sessions.revokeOthers")}
        </Button>
      </header>
      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("configuration.sessions.client")}</TableHead>
              <TableHead>{t("configuration.sessions.ipAddress")}</TableHead>
              <TableHead>{t("configuration.sessions.lastActive")}</TableHead>
              <TableHead>{t("configuration.sessions.expiresAt")}</TableHead>
              <TableHead>{t("configuration.sessions.state")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="max-w-[22rem] min-w-0">
                  <span
                    className="block truncate font-mono text-xs"
                    title={session.userAgent ?? undefined}
                  >
                    {session.userAgent ?? t("configuration.sessions.unknownClient")}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {session.ipAddress ?? t("configuration.sessions.unknown")}
                </TableCell>
                <TableCell className="text-xs">
                  {dateFormatter.formatDateTime(session.updatedAt)}
                </TableCell>
                <TableCell className="text-xs">
                  {dateFormatter.formatDateTime(session.expiresAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={session.current ? "default" : "secondary"}>
                    {session.current
                      ? t("configuration.sessions.current")
                      : t("configuration.sessions.other")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("configuration.sessions.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("configuration.sessions.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.revoking}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={mutations.revoking} onClick={() => void revokeOthers()}>
              {t("configuration.sessions.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
