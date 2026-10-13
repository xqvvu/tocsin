import { RiShieldKeyholeLine } from "@remixicon/react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { authQueryKeys, dashboardSessionQueryOptions } from "#/features/auth/api/auth.queries";
import { useTranslations } from "#/i18n/use-i18n";
import { authClient } from "#/lib/auth.client";

/**
 * "Signed in, but no dashboard access."
 *
 * Distinct from the login redirect on purpose: bouncing an authenticated user to
 * the sign-in page told them their session was gone, which was untrue and
 * unfixable — signing in again lands them right back here. This says what is
 * actually wrong and offers the one action that helps: sign out, then sign in
 * with an account that has access.
 *
 * Lives in an `-impl` file because it imports the browser auth client; the
 * wrapper in `dashboard-forbidden.tsx` loads it client-only.
 */
export function DashboardForbiddenClient() {
  const t = useTranslations();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);

  async function signOut() {
    setPending(true);

    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: async () => {
            queryClient.setQueryData(dashboardSessionQueryOptions().queryKey, null);
            await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
            await navigate({ to: "/login", search: { redirect: "/" } as never });
          },
        },
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-10">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RiShieldKeyholeLine aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t("shell.forbidden.title")}</EmptyTitle>
          <EmptyDescription>{t("shell.forbidden.description")}</EmptyDescription>
        </EmptyHeader>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => void signOut()}
        >
          {t("shell.forbidden.signOut")}
        </Button>
      </Empty>
    </div>
  );
}
