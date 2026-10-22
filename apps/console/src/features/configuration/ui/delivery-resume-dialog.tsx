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
import { useAppSettingsMutation } from "#/features/configuration/api/use-app-settings-mutation";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Resume is not a plain toggle.
 *
 * The worker claims queued rows as soon as the pause is lifted, and a succeeded
 * app-mode Feishu delivery of a still-firing alert pages its receivers again.
 * A pause that lasted hours therefore resumes as a burst of phone calls, so
 * both resume entry points ask for confirmation and say why. Pausing stays a
 * single click: it only stops sending.
 */
export function DeliveryResumeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const mutation = useAppSettingsMutation();

  async function resume() {
    try {
      // Only the pause flag: this dialog may have been rendered from a settings
      // snapshot that another tab has since updated.
      await mutation.mutateAsync({ deliveryPaused: false });
      toast.success(t("deliveries.paused.resumed"));
      onOpenChange(false);
    } catch (error) {
      toast.error(t("deliveries.paused.resumeFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deliveries.resumeDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block">{t("deliveries.resumeDialog.description")}</span>
            <span className="text-destructive mt-1.5 block font-medium">
              {t("deliveries.resumeDialog.urgentWarning")}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t("deliveries.resumeDialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction disabled={mutation.isPending} onClick={() => void resume()}>
            {t("deliveries.resumeDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
