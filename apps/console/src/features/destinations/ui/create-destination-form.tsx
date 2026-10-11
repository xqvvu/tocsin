import { RiArrowRightLine } from "@remixicon/react";

import type { FeishuAppListItem } from "@tocsin/core";

import { FormPanel } from "#/components/common/content-panel";
import {
  createDestinationDefaults,
  DestinationForm,
} from "#/features/destinations/ui/destination-form";
import type {
  CreateDestinationFormInput,
  DestinationCatalog,
  DestinationSubmitHandler,
  PreviewDestinationFormInput,
} from "#/features/destinations/ui/destination-ui-types";
import { useTranslations } from "#/i18n/use-i18n";

export function CreateDestinationForm({
  destinationCatalog,
  feishuApps,
  showHeader = true,
  layout = "panel",
  pending,
  onPreview,
  onSubmit,
}: {
  destinationCatalog: DestinationCatalog;
  feishuApps: FeishuAppListItem[];
  showHeader?: boolean;
  layout?: "panel" | "dialog";
  pending: boolean;
  onPreview: DestinationSubmitHandler<PreviewDestinationFormInput>;
  onSubmit: DestinationSubmitHandler<CreateDestinationFormInput>;
}) {
  const t = useTranslations();

  const form = (
    <DestinationForm
      mode="create"
      layout={layout}
      pending={pending}
      destinationCatalog={destinationCatalog}
      feishuApps={feishuApps}
      defaultValues={createDestinationDefaults()}
      onPreview={onPreview}
      onSubmit={onSubmit}
    />
  );

  if (!showHeader) {
    return form;
  }

  return (
    <FormPanel title={t("destinations.form.create.title")} icon={<RiArrowRightLine aria-hidden />}>
      <p className="text-muted-foreground mb-3 text-xs leading-5">
        {t("destinations.form.create.description")}
      </p>
      {form}
    </FormPanel>
  );
}
