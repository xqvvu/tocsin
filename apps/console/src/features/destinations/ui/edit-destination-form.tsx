import { RiEditLine } from "@remixicon/react";

import type { DestinationEditorDraftResult, FeishuAppListItem } from "@tocsin/core";

import { Skeleton } from "#/components/ui/skeleton";
import { destinationTemplateFormStateFromDraft } from "#/features/destinations/model/destination-form";
import {
  createDestinationDefaults,
  DestinationForm,
} from "#/features/destinations/ui/destination-form";
import type {
  DestinationCatalog,
  DestinationListItem,
  DestinationSubmitHandler,
  EditDestinationFormInput,
  PreviewEditDestinationFormInput,
} from "#/features/destinations/ui/destination-ui-types";
import { useTranslations } from "#/i18n/use-i18n";

export function EditDestinationForm({
  destinationCatalog,
  feishuApps,
  showHeader = true,
  framed = true,
  layout = "panel",
  destination,
  editorDraft,
  pending,
  onCancel,
  onPreview,
  onSubmit,
}: {
  destinationCatalog: DestinationCatalog;
  feishuApps: FeishuAppListItem[];
  showHeader?: boolean;
  framed?: boolean;
  layout?: "panel" | "dialog";
  destination:
    | DestinationListItem
    | { id: string; name: string; kind: DestinationListItem["kind"] };
  editorDraft: DestinationEditorDraftResult;
  pending: boolean;
  onCancel: () => void;
  onPreview: DestinationSubmitHandler<PreviewEditDestinationFormInput>;
  onSubmit: DestinationSubmitHandler<EditDestinationFormInput>;
}) {
  const t = useTranslations();

  return (
    <section className={framed ? "border-border bg-muted/30 mt-3 border p-3" : undefined}>
      {showHeader ? (
        <div className="mb-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold">
            <RiEditLine aria-hidden />
            {t("destinations.form.edit.title")}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("destinations.form.edit.description")}
          </p>
        </div>
      ) : null}
      <DestinationForm
        mode="edit"
        layout={layout}
        pending={pending}
        destinationCatalog={destinationCatalog}
        feishuApps={feishuApps}
        defaultValues={{
          ...createDestinationDefaults(),
          ...destinationTemplateFormStateFromDraft(editorDraft.template),
          name: destination.name,
          kind: destination.kind,
          endpointUrl: editorDraft.form.endpointUrl,
          to: editorDraft.form.to,
          from: editorDraft.form.from,
          replyTo: editorDraft.form.replyTo,
          subjectPrefix: editorDraft.form.subjectPrefix,
          headers: editorDraft.form.headers,
          url: editorDraft.form.url,
          webhookUrl: editorDraft.form.webhookUrl,
          method: editorDraft.form.method,
          signSecret: "",
          sendMode: editorDraft.form.sendMode,
          appRef: editorDraft.form.appRef,
          chatId: editorDraft.form.chatId,
          urgentAutoEnabled: editorDraft.form.urgentAutoEnabled,
          urgentSeverities: editorDraft.form.urgentSeverities,
          urgentUserIdType: editorDraft.form.urgentUserIdType,
          urgentReceivers: editorDraft.form.urgentReceivers,
        }}
        onCancel={onCancel}
        onPreview={(input) =>
          onPreview({
            id: destination.id,
            ...input,
          })
        }
        onSubmit={(input) =>
          onSubmit({
            id: destination.id,
            ...input,
          })
        }
      />
    </section>
  );
}

EditDestinationForm.Skeleton = function EditDestinationFormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-14 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="flex justify-end gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
};
