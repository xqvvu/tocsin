import { RiRefreshLine } from "@remixicon/react";
import { useSuspenseQueries } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Button } from "#/components/ui/button";
import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { useSuppressionMutations } from "#/features/suppressions/api/suppression.mutations";
import { suppressionsQueryOptions } from "#/features/suppressions/api/suppression.queries";
import { SuppressionAddDialog } from "#/features/suppressions/ui/suppression-add-dialog";
import { SuppressionsSection } from "#/features/suppressions/ui/suppressions-section";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function SuppressionsPage() {
  const t = useTranslations();
  const [{ data: suppressions }, { data: sources }, { data: destinations }] = useSuspenseQueries({
    queries: [suppressionsQueryOptions(), sourcesQueryOptions(), destinationsQueryOptions()],
  });
  const {
    createSuppression,
    deleteSuppression,
    invalidateSuppressions,
    setSuppressionEnabled,
    updateSuppression,
  } = useSuppressionMutations();
  const [editingSuppressionId, setEditingSuppressionId] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const editingSuppression = editingSuppressionId
    ? (suppressions.find((suppression) => suppression.id === editingSuppressionId) ?? null)
    : null;
  const pending = pendingAction !== null;

  async function refreshSuppressions(): Promise<boolean> {
    try {
      await invalidateSuppressions();
      return true;
    } catch (error) {
      toast.error(t("suppressions.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function submitAction<T>(action: string, fn: () => Promise<T>): Promise<T | null> {
    setPendingAction(action);

    try {
      const result = await fn();
      await refreshSuppressions();
      return result;
    } catch (error) {
      toast.error(t("suppressions.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <DashboardContentLayout
      main={
        <>
          <PageToolbar
            title={t("suppressions.page.title")}
            description={t("suppressions.page.description")}
            actions={
              <>
                <SuppressionAddDialog
                  sources={sources}
                  destinations={destinations}
                  pending={pending}
                  onSubmit={(input) =>
                    void submitAction("create-suppression", () => createSuppression(input))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => void refreshSuppressions()}
                  title={t("suppressions.page.refreshTitle")}
                  className="w-fit"
                >
                  <RiRefreshLine data-icon="inline-start" aria-hidden />
                  {t("common.actions.refresh")}
                </Button>
              </>
            }
          />
          <SuppressionsSection
            suppressions={suppressions}
            sources={sources}
            destinations={destinations}
            editingSuppression={editingSuppression}
            pending={pending}
            onEdit={setEditingSuppressionId}
            onCancelEdit={() => setEditingSuppressionId(null)}
            onToggle={(suppression) =>
              void submitAction(`toggle-suppression-${suppression.id}`, () =>
                setSuppressionEnabled({
                  id: suppression.id,
                  enabled: !suppression.enabled,
                }),
              )
            }
            onDelete={(suppression) =>
              void submitAction(`delete-suppression-${suppression.id}`, () =>
                deleteSuppression({
                  id: suppression.id,
                }),
              )
            }
            onSubmitEdit={(input) =>
              void submitAction(`edit-suppression-${input.id}`, async () => {
                const result = await updateSuppression(input);

                setEditingSuppressionId(null);

                return result;
              })
            }
          />
        </>
      }
    />
  );
}
