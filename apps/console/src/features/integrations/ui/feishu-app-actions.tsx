import { RiDeleteBinLine, RiEditLine, RiPlayLine } from "@remixicon/react";
import * as React from "react";

import type { FeishuAppListItem } from "@tocsin/core";

import { IconTooltip } from "#/components/common/icon-tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { useTranslations } from "#/i18n/use-i18n";

export function FeishuAppActions({
  app,
  pending,
  onTest,
  onEdit,
  onDelete,
}: {
  app: FeishuAppListItem;
  pending: boolean;
  onTest: (app: FeishuAppListItem) => void;
  onEdit: (app: FeishuAppListItem) => void;
  onDelete: (app: FeishuAppListItem) => void;
}) {
  const t = useTranslations();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const testLabel = t("integrations.table.actions.testTitle", { name: app.name });
  const editLabel = t("integrations.table.actions.edit");
  const deleteLabel = t("integrations.table.actions.deleteTitle", { name: app.name });

  return (
    <div className="flex justify-center gap-1">
      <IconTooltip label={testLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={testLabel}
          onClick={() => onTest(app)}
        >
          <RiPlayLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      <IconTooltip label={editLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={editLabel}
          onClick={() => onEdit(app)}
        >
          <RiEditLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!pending) {
            setDeleteDialogOpen(open);
          }
        }}
      >
        <IconTooltip label={deleteLabel}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                disabled={pending}
                aria-label={deleteLabel}
              />
            }
          >
            <RiDeleteBinLine data-icon="inline-start" aria-hidden />
          </AlertDialogTrigger>
        </IconTooltip>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("integrations.delete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("integrations.delete.confirmDescription", { appName: app.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("integrations.delete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setDeleteDialogOpen(false);
                onDelete(app);
              }}
            >
              {t("integrations.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
