import {
  RiAddLine,
  RiEditLine,
  RiEyeLine,
  RiQuestionLine,
  RiResetLeftLine,
} from "@remixicon/react";
import { useForm } from "@tanstack/react-form";
import * as React from "react";

import type { AdapterConfigHelp, FeishuAppListItem } from "@tocsin/core";
import { defaultFeishuCardTemplate as defaultFeishuCardTemplateObject } from "@tocsin/destinations/feishu/default-card";

import { Button } from "#/components/ui/button";
import {
  Field as UiField,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import {
  destinationConfigFromForm,
  destinationConfigPatchFromForm,
  applyDynamicStatusColor,
  canApplyDynamicStatusColor,
  createDefaultDestinationTemplateFormState,
  destinationTemplateBodyCopy,
  destinationTemplateBodyFormField,
  destinationTemplateBodyStarter,
  destinationTemplateModeDescriptionKey,
  destinationTemplateModeHelp,
  destinationTemplateModes,
  isDestinationTemplateBodyDraft,
  isDestinationTemplateJsonMode,
  resolveDestinationTemplateFormMode,
  templateBindingsJsonFromFormState,
  type DestinationTemplateFormMode,
  type DestinationTemplateFormSource,
  type DestinationTemplateModeOption,
  type DestinationFormKind,
} from "#/features/destinations/model/destination-form";
import type {
  DestinationCatalog,
  DestinationFormMode,
  DestinationFormPreviewInput,
  DestinationFormSubmitInput,
  DestinationFormValues,
  DestinationSubmitHandler,
} from "#/features/destinations/ui/destination-ui-types";
import { FeishuDynamicPropertiesField } from "#/features/destinations/ui/feishu-dynamic-properties-field";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

export function DestinationForm({
  mode,
  layout = "panel",
  pending,
  destinationCatalog,
  feishuApps,
  defaultValues,
  onPreview,
  onSubmit,
  onCancel,
}: {
  mode: DestinationFormMode;
  layout?: "panel" | "dialog";
  pending: boolean;
  destinationCatalog: DestinationCatalog;
  /** Registered Feishu apps for the app send mode picker. */
  feishuApps: FeishuAppListItem[];
  defaultValues: DestinationFormValues;
  onPreview: DestinationSubmitHandler<DestinationFormPreviewInput>;
  onSubmit: DestinationSubmitHandler<DestinationFormSubmitInput>;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const isDialogLayout = layout === "dialog";

  const submitIntent = React.useRef<"preview" | "submit">("submit");
  const secretFieldDescription =
    mode === "create"
      ? t("destinations.form.secretDescriptionCreate")
      : t("destinations.form.secretDescriptionEdit");
  const destinationKindItems = [
    { value: "generic_webhook", label: t("destinations.kinds.generic_webhook") },
    { value: "feishu", label: t("destinations.kinds.feishu") },
    { value: "slack", label: t("destinations.kinds.slack") },
    { value: "email", label: t("destinations.kinds.email") },
  ];
  const webhookMethodEditItems = [
    { value: null, label: t("destinations.form.keepExisting") },
    ...webhookMethodCreateItems,
  ];
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const selectedKind = value.kind;
      // The manifest decides which modes this kind offers, so a mode drafted
      // for another kind can never be submitted as a template its adapter
      // would reject.
      const templateMode = resolveDestinationTemplateFormMode(
        value.templateMode,
        destinationTemplateModes(destinationCatalog, selectedKind),
      );
      const data = destinationValuesToFormData({ ...value, templateMode });
      const input: DestinationFormSubmitInput = {
        name: value.name,
        kind: selectedKind,
        config:
          mode === "create"
            ? destinationConfigFromForm(selectedKind, data)
            : destinationConfigPatchFromForm(selectedKind, data),
      };
      const result =
        submitIntent.current === "preview"
          ? await onPreview({ ...input, sampleStatus: value.templatePreviewStatus })
          : await onSubmit(input);

      if (mode === "create" && submitIntent.current === "submit" && result !== false) {
        form.reset();
      }
    },
  });

  const requiresSecrets = mode === "create";
  const feishuAppItems = feishuApps.map((app) => ({ value: app.id, label: app.name }));
  const feishuSendModeItems = [
    { value: "webhook", label: t("destinations.form.feishuSendModeWebhook") },
    { value: "app", label: t("destinations.form.feishuSendModeApp") },
  ];
  const feishuUserIdTypeItems = [
    { value: "open_id", label: t("destinations.form.feishuUserIdTypeOpenId") },
    { value: "user_id", label: t("destinations.form.feishuUserIdTypeUserId") },
    { value: "union_id", label: t("destinations.form.feishuUserIdTypeUnionId") },
  ];
  const urgentSeverityItems = [
    { value: "critical", label: t("common.severity.critical") },
    { value: "warning", label: t("common.severity.warning") },
    { value: "info", label: t("common.severity.info") },
    { value: "unknown", label: t("common.severity.unknown") },
  ];

  const renderTextField = ({
    label,
    name,
    type = "text",
    placeholder,
    required,
    description,
  }: {
    label: string;
    name: keyof DestinationFormValues;
    type?: string;
    placeholder?: string;
    required?: boolean;
    description?: string;
  }) => (
    <form.Field name={name}>
      {(field) => (
        <UiField>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
          <Input
            id={field.name}
            name={field.name}
            type={type}
            placeholder={placeholder}
            required={required}
            value={field.state.value as string}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.currentTarget.value)}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
        </UiField>
      )}
    </form.Field>
  );

  const renderTextareaField = ({
    label,
    name,
    id,
    className,
    placeholder,
    required,
    description,
  }: {
    label: string;
    name: keyof DestinationFormValues;
    id: string;
    className: string;
    placeholder: string;
    required?: boolean;
    description?: string;
  }) => (
    <form.Field name={name}>
      {(field) => (
        <UiField>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Textarea
            id={id}
            name={field.name}
            className={className}
            placeholder={placeholder}
            required={required}
            value={field.state.value as string}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.currentTarget.value)}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
        </UiField>
      )}
    </form.Field>
  );

  const renderHeaderLinesField = () =>
    renderTextareaField({
      label: t("destinations.form.headers"),
      name: "headers",
      id: "headers",
      className: "min-h-16 max-h-32 resize-y overflow-auto font-mono text-[11px]",
      placeholder: "Authorization: Bearer ...",
      description: t("destinations.form.headersDescription"),
    });

  const renderTemplateFields = (kind: DestinationFormKind) => {
    // Which modes this kind offers — and what each one is called — comes from
    // the adapter manifest, so a destination never exposes an editor for a mode
    // its adapter would reject.
    const modeOptions = destinationTemplateModes(destinationCatalog, kind);

    return (
      <>
        {kind === "feishu" ? (
          <form.Field name="templateSource">
            {(field) => (
              <UiField>
                <FieldLabel>{t("destinations.form.templateSource")}</FieldLabel>
                <ToggleGroup
                  value={[String(field.state.value)]}
                  variant="outline"
                  size="sm"
                  onValueChange={(value) => {
                    const next = value[0] as DestinationTemplateFormSource | undefined;

                    if (next) {
                      field.handleChange(next);
                      form.setFieldValue("templateMode", "feishu_card");
                    }
                  }}
                >
                  <ToggleGroupItem
                    value="builtin"
                    aria-label={t("destinations.form.templateSourceBuiltin")}
                  >
                    {t("destinations.form.templateSourceBuiltin")}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="custom"
                    aria-label={t("destinations.form.templateSourceCustom")}
                  >
                    {t("destinations.form.templateSourceCustom")}
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  {field.state.value === "builtin"
                    ? t("destinations.form.templateSourceBuiltinDescription")
                    : t("destinations.form.templateSourceCustomDescription")}
                </FieldDescription>
              </UiField>
            )}
          </form.Field>
        ) : null}
        <form.Subscribe
          selector={(state) => ({
            source: state.values.templateSource,
            mode: state.values.templateMode,
          })}
        >
          {({ source: templateSource, mode: draftedMode }) => {
            const templateMode = resolveDestinationTemplateFormMode(draftedMode, modeOptions);
            // The built-in Feishu reference has no editable body of its own.
            const editingCustomTemplate = kind !== "feishu" || templateSource === "custom";

            if (!editingCustomTemplate) {
              return null;
            }

            return (
              <>
                {modeOptions.length > 1 ? renderTemplateModeSelector(modeOptions) : null}
                {renderTemplateBodyField(kind, templateMode)}
              </>
            );
          }}
        </form.Subscribe>
        <form.Subscribe
          selector={(state) => ({
            source: state.values.templateSource,
            mode: state.values.templateMode,
            card: state.values.templateCard,
            enabled: state.values.templateColorEnabled,
            selector: state.values.templateColorSelector,
            cases: state.values.templateColorCases,
            fallback: state.values.templateColorFallback,
            previewStatus: state.values.templatePreviewStatus,
          })}
        >
          {({
            source: templateSource,
            mode: templateMode,
            card,
            enabled,
            selector,
            cases,
            fallback,
            previewStatus,
          }) =>
            kind === "feishu" &&
            (templateSource === "builtin" || templateMode === "feishu_card") ? (
              <FeishuDynamicPropertiesField
                enabled={enabled}
                canApply={canApplyDynamicStatusColor(card)}
                selector={selector}
                cases={cases}
                fallback={fallback}
                previewStatus={previewStatus}
                onApply={() => {
                  form.setFieldValue("templateCard", applyDynamicStatusColor(card));
                  form.setFieldValue("templateColorEnabled", true);
                }}
                onSelectorChange={(nextSelector, nextCases) => {
                  form.setFieldValue("templateColorSelector", nextSelector);
                  form.setFieldValue("templateColorCases", nextCases);
                }}
                onCaseChange={(caseName, color) => {
                  form.setFieldValue("templateColorCases", {
                    ...cases,
                    [caseName]: color,
                  });
                }}
                onFallbackChange={(color) => {
                  form.setFieldValue("templateColorFallback", color);
                }}
                onPreviewStatusChange={(status) => {
                  form.setFieldValue("templatePreviewStatus", status);
                }}
              />
            ) : null
          }
        </form.Subscribe>
        {kind !== "feishu" ? renderTemplateVariableReference(modeOptions) : null}
        {kind === "feishu" ? (
          <form.Subscribe selector={(state) => state.values.templateSource}>
            {(templateSource) =>
              templateSource === "custom" ? renderTemplateVariableReference(modeOptions) : null
            }
          </form.Subscribe>
        ) : null}
      </>
    );
  };

  /**
   * Template type control. One item per mode the manifest declares for this
   * kind, labelled from the manifest too, so manifests stay the single source
   * of what is selectable.
   *
   * Drafts are kept per body field: switching away from a mode preserves what
   * was drafted for it, and switching to an empty JSON mode seeds that mode's
   * starter document instead of an editor the operator must fill from scratch.
   */
  const renderTemplateModeSelector = (modeOptions: DestinationTemplateModeOption[]) => (
    <form.Field name="templateMode">
      {(field) => {
        const templateMode = resolveDestinationTemplateFormMode(field.state.value, modeOptions);

        return (
          <UiField>
            <FieldLabel>{t("destinations.form.templateMode")}</FieldLabel>
            <ToggleGroup
              value={[templateMode]}
              variant="outline"
              size="sm"
              onValueChange={(value) => {
                const next = value[0] as DestinationTemplateFormMode | undefined;

                if (!next) {
                  return;
                }

                field.handleChange(next);

                if (isDestinationTemplateJsonMode(next)) {
                  const bodyField = destinationTemplateBodyFormField(next);

                  if (!String(form.getFieldValue(bodyField)).trim()) {
                    form.setFieldValue(bodyField, destinationTemplateBodyStarter(next));
                  }
                }
              }}
            >
              {modeOptions.map((option) => (
                <ToggleGroupItem
                  key={option.mode}
                  value={option.mode}
                  aria-label={t(option.labelKey)}
                >
                  {t(option.labelKey)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              {t(destinationTemplateModeDescriptionKey(modeOptions, templateMode))}
            </FieldDescription>
          </UiField>
        );
      }}
    </form.Field>
  );

  /** Body editor for the selected mode: one text area, one JSON editor. */
  const renderTemplateBodyField = (
    kind: DestinationFormKind,
    templateMode: DestinationTemplateFormMode,
  ) =>
    isDestinationTemplateJsonMode(templateMode)
      ? renderJsonTemplateField(kind, templateMode)
      : renderTextTemplateField(kind, templateMode);

  const renderTextTemplateField = (
    kind: DestinationFormKind,
    templateMode: DestinationTemplateFormMode,
  ) => {
    const copy = destinationTemplateBodyCopy(templateMode);

    return renderTextareaField({
      label: t(copy.labelKey),
      name: destinationTemplateBodyFormField(templateMode),
      id: `message-template-${kind}`,
      className: "min-h-20 max-h-40 resize-y overflow-auto font-mono text-[11px]",
      placeholder: "{{event.title}} on {{source.name}}",
      description: t(copy.descriptionKey),
    });
  };

  const renderConfigHelp = (help: AdapterConfigHelp | null) => {
    if (!help) {
      return null;
    }

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t(help.labelKey)}
              className="shrink-0 border-0"
            />
          }
        >
          <RiQuestionLine data-icon="inline-start" aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="max-w-96 items-start text-left" side="top">
          <span className="flex flex-col gap-1">
            {help.descriptionKey ? <span>{t(help.descriptionKey)}</span> : null}
            {help.links?.map((link) => (
              <span key={link.href} className="font-mono break-all">
                {link.labelKey ? `${t(link.labelKey)}: ` : null}
                {link.href}
              </span>
            ))}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  };

  /**
   * JSON body editor. Feishu cards, generic webhook payloads, and Slack blocks
   * are all one JSON object drafted as text, so they share this editor and only
   * differ in the copy and in the mode help the manifest carries.
   */
  const renderJsonTemplateField = (
    kind: DestinationFormKind,
    templateMode: DestinationTemplateFormMode,
  ) => {
    const copy = destinationTemplateBodyCopy(templateMode);
    const isFeishuCard = kind === "feishu" && templateMode === "feishu_card";

    return (
      <form.Field
        name={destinationTemplateBodyFormField(templateMode)}
        validators={{
          // Caught at submit so a half-written document reports on the field
          // instead of throwing out of the config builder.
          onSubmit: ({ value }) =>
            isDestinationTemplateBodyDraft(value)
              ? undefined
              : t("destinations.form.templateBodyInvalidJson"),
        }}
      >
        {(field) => (
          <UiField data-invalid={field.state.meta.errors.length > 0}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <FieldLabel htmlFor={`json-template-${kind}`}>{t(copy.labelKey)}</FieldLabel>
                {renderConfigHelp(
                  destinationTemplateModeHelp(destinationCatalog, kind, templateMode),
                )}
              </div>
              {isFeishuCard ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    const defaults = createDefaultDestinationTemplateFormState();

                    form.setFieldValue("templateSource", "builtin");
                    form.setFieldValue("templateMode", "feishu_card");
                    form.setFieldValue("templateBindings", defaults.templateBindings);
                    form.setFieldValue("templateColorEnabled", defaults.templateColorEnabled);
                    form.setFieldValue("templateColorSelector", defaults.templateColorSelector);
                    form.setFieldValue("templateColorCases", defaults.templateColorCases);
                    form.setFieldValue("templateColorFallback", defaults.templateColorFallback);
                  }}
                >
                  <RiResetLeftLine data-icon="inline-start" aria-hidden />
                  {t("destinations.form.restoreDefaultCard")}
                </Button>
              ) : null}
            </div>
            <Textarea
              id={`json-template-${kind}`}
              name={field.name}
              className="max-h-[min(42dvh,28rem)] min-h-56 resize-y overflow-auto font-mono text-[11px]"
              placeholder={destinationTemplateBodyStarter(templateMode)}
              value={String(field.state.value)}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
            />
            <FieldDescription>{t(copy.descriptionKey)}</FieldDescription>
            <FieldError
              errors={field.state.meta.errors.map((error) => ({
                message: String(error),
              }))}
            />
          </UiField>
        )}
      </form.Field>
    );
  };

  const renderTemplateVariableReference = (modeOptions: DestinationTemplateModeOption[]) => (
    <form.Subscribe
      selector={(state) => ({
        mode: state.values.templateMode,
        text: state.values.templateText,
        card: state.values.templateCard,
        payload: state.values.templatePayload,
      })}
    >
      {({ mode: draftedMode, text, card, payload }) => {
        // Insert into whichever body the selected mode actually edits, so a
        // card, payload, or text draft gets the variable and the others do not.
        const templateMode = resolveDestinationTemplateFormMode(draftedMode, modeOptions);
        const bodyField = destinationTemplateBodyFormField(templateMode);
        return (
          <UiField>
            <FieldLabel>{t("destinations.form.variables")}</FieldLabel>
            <div className="flex flex-wrap gap-1">
              {templateVariablePaths.map((path) => (
                <Button
                  key={path}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    const variable = `{{${path}}}`;
                    const current =
                      bodyField === "templateText"
                        ? text
                        : bodyField === "templateCard"
                          ? card
                          : payload;

                    form.setFieldValue(bodyField, appendTemplateVariable(current, variable));
                  }}
                >
                  {path}
                </Button>
              ))}
            </div>
            <FieldDescription>{t("destinations.form.variablesDescription")}</FieldDescription>
          </UiField>
        );
      }}
    </form.Subscribe>
  );

  const renderDestinationConfigFields = (kind: DestinationFormKind) => (
    <>
      {kind === "email" ? (
        <>
          {renderTextField({
            label: t("destinations.form.emailGatewayUrl"),
            name: "endpointUrl",
            type: "url",
            placeholder: "https://mail-gateway.example/send",
            required: requiresSecrets,
            description: secretFieldDescription,
          })}
          {renderTextareaField({
            label: t("destinations.form.to"),
            name: "to",
            id: "email-to",
            className: "min-h-16 resize-y font-mono text-[11px]",
            placeholder: "sre@example.com, audit@example.com",
            required: requiresSecrets,
            description: t("destinations.form.toDescription"),
          })}
          {renderTextField({
            label: t("destinations.form.from"),
            name: "from",
            type: "email",
            placeholder: "tocsin@example.com",
            required: requiresSecrets,
            description: t("destinations.form.fromDescription"),
          })}
          {renderTextField({
            label: t("destinations.form.replyTo"),
            name: "replyTo",
            type: "email",
            placeholder: "ops@example.com",
            description: t("destinations.form.replyToDescription"),
          })}
          {renderTextField({
            label: t("destinations.form.subjectPrefix"),
            name: "subjectPrefix",
            placeholder: "[Tocsin]",
            description: t("destinations.form.subjectPrefixDescription"),
          })}
          {renderTextField({
            label: t("destinations.form.subjectTemplate"),
            name: "subjectTemplate",
            placeholder: "[{{event.severity}}] {{event.title}}",
            description: t("destinations.form.subjectTemplateDescription"),
          })}
          {renderTextareaField({
            label: t("destinations.form.htmlTemplate"),
            name: "htmlTemplate",
            id: "html-template",
            className: "min-h-20 max-h-40 resize-y overflow-auto font-mono text-[11px]",
            placeholder: "<h1>{{event.title}}</h1><p>{{event.message}}</p>",
            description: t("destinations.form.htmlTemplateDescription"),
          })}
          {renderHeaderLinesField()}
        </>
      ) : kind === "feishu" ? (
        <>
          <form.Field name="sendMode">
            {(field) => (
              <UiField>
                <FieldLabel htmlFor={field.name}>
                  {t("destinations.form.feishuSendMode")}
                </FieldLabel>
                <Select
                  id={field.name}
                  name={field.name}
                  items={feishuSendModeItems}
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value === "app" ? "app" : "webhook")}
                >
                  <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="webhook">
                        {t("destinations.form.feishuSendModeWebhook")}
                      </SelectItem>
                      <SelectItem value="app">
                        {t("destinations.form.feishuSendModeApp")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t("destinations.form.feishuSendModeDescription")}
                </FieldDescription>
              </UiField>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.sendMode}>
            {(sendMode) =>
              sendMode === "app" ? (
                <>
                  <form.Field name="appRef">
                    {(field) => (
                      <UiField>
                        <FieldLabel htmlFor={field.name}>
                          {t("destinations.form.feishuAppRef")}
                        </FieldLabel>
                        <Select
                          id={field.name}
                          name={field.name}
                          items={feishuAppItems}
                          value={field.state.value || null}
                          onValueChange={(value) => field.handleChange(value ?? "")}
                        >
                          <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                            <SelectValue
                              placeholder={t("destinations.form.feishuAppRefPlaceholder")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {feishuApps.map((app) => (
                                <SelectItem key={app.id} value={app.id}>
                                  {app.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          {feishuApps.length === 0
                            ? t("destinations.form.feishuAppRefEmpty")
                            : t("destinations.form.feishuAppRefDescription")}
                        </FieldDescription>
                      </UiField>
                    )}
                  </form.Field>
                  {renderTextField({
                    label: t("destinations.form.feishuChatId"),
                    name: "chatId",
                    placeholder: t("destinations.form.feishuChatIdPlaceholder"),
                    description: t("destinations.form.feishuChatIdDescription"),
                  })}
                  <FieldSet className="border-border gap-3 border p-3">
                    <FieldLegend variant="label">
                      {t("destinations.form.feishuUrgentLegend")}
                    </FieldLegend>
                    <FieldGroup className="gap-3">
                      <form.Field name="urgentAutoEnabled">
                        {(field) => (
                          <UiField>
                            <FieldLabel>
                              {t("destinations.form.feishuUrgentAutoEnabled")}
                            </FieldLabel>
                            <ToggleGroup
                              value={[String(field.state.value)]}
                              variant="outline"
                              size="sm"
                              onValueChange={(value) => {
                                const next = value[0];

                                if (next) {
                                  field.handleChange(next === "true");
                                }
                              }}
                            >
                              <ToggleGroupItem
                                value="true"
                                aria-label={t("destinations.form.feishuUrgentAutoOn")}
                              >
                                {t("destinations.form.feishuUrgentAutoOn")}
                              </ToggleGroupItem>
                              <ToggleGroupItem
                                value="false"
                                aria-label={t("destinations.form.feishuUrgentAutoOff")}
                              >
                                {t("destinations.form.feishuUrgentAutoOff")}
                              </ToggleGroupItem>
                            </ToggleGroup>
                            <FieldDescription>
                              {t("destinations.form.feishuUrgentAutoEnabledDescription")}
                            </FieldDescription>
                          </UiField>
                        )}
                      </form.Field>
                      <form.Field name="urgentSeverities">
                        {(field) => (
                          <UiField>
                            <FieldLabel>{t("destinations.form.feishuUrgentSeverities")}</FieldLabel>
                            <ToggleGroup
                              multiple
                              value={field.state.value}
                              variant="outline"
                              size="sm"
                              onValueChange={(value) => field.handleChange(value)}
                            >
                              {urgentSeverityItems.map((item) => (
                                <ToggleGroupItem
                                  key={item.value}
                                  value={item.value}
                                  aria-label={item.label}
                                >
                                  {item.label}
                                </ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                            <FieldDescription>
                              {t("destinations.form.feishuUrgentSeveritiesDescription")}
                            </FieldDescription>
                          </UiField>
                        )}
                      </form.Field>
                      <form.Field name="urgentUserIdType">
                        {(field) => (
                          <UiField>
                            <FieldLabel htmlFor={field.name}>
                              {t("destinations.form.feishuUrgentUserIdType")}
                            </FieldLabel>
                            <Select
                              id={field.name}
                              name={field.name}
                              items={feishuUserIdTypeItems}
                              value={field.state.value}
                              onValueChange={(value) =>
                                field.handleChange(
                                  value === "user_id" || value === "union_id" ? value : "open_id",
                                )
                              }
                            >
                              <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="open_id">
                                    {t("destinations.form.feishuUserIdTypeOpenId")}
                                  </SelectItem>
                                  <SelectItem value="user_id">
                                    {t("destinations.form.feishuUserIdTypeUserId")}
                                  </SelectItem>
                                  <SelectItem value="union_id">
                                    {t("destinations.form.feishuUserIdTypeUnionId")}
                                  </SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FieldDescription>
                              {t("destinations.form.feishuUrgentUserIdTypeDescription")}
                            </FieldDescription>
                          </UiField>
                        )}
                      </form.Field>
                      <form.Field name="urgentReceivers">
                        {(field) => (
                          <UiField>
                            <FieldLabel htmlFor={field.name}>
                              {t("destinations.form.feishuUrgentReceivers")}
                            </FieldLabel>
                            <Textarea
                              id={field.name}
                              name={field.name}
                              value={field.state.value}
                              placeholder={t("destinations.form.feishuUrgentReceiversPlaceholder")}
                              className="min-h-16 resize-y font-mono text-[11px]"
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.currentTarget.value)}
                            />
                            <FieldDescription>
                              {t("destinations.form.feishuUrgentReceiversDescription")}
                            </FieldDescription>
                          </UiField>
                        )}
                      </form.Field>
                    </FieldGroup>
                  </FieldSet>
                </>
              ) : (
                <>
                  {renderTextField({
                    label: t("destinations.form.feishuWebhookUrl"),
                    name: "webhookUrl",
                    type: "url",
                    placeholder: "https://...",
                    required: requiresSecrets,
                    description: secretFieldDescription,
                  })}
                  {renderTextField({
                    label: t("destinations.form.signSecret"),
                    name: "signSecret",
                    placeholder: t("destinations.form.optionalPlaceholder"),
                    description: secretFieldDescription,
                  })}
                </>
              )
            }
          </form.Subscribe>
        </>
      ) : (
        <>
          {renderTextField({
            label:
              kind === "slack"
                ? t("destinations.form.slackWebhookUrl")
                : t("destinations.form.webhookUrl"),
            name: "webhookUrl",
            type: "url",
            placeholder: "https://...",
            required: requiresSecrets,
            description: secretFieldDescription,
          })}
          {kind === "generic_webhook" ? (
            <>
              <form.Field name="method">
                {(field) => (
                  <UiField>
                    <FieldLabel htmlFor={field.name}>{t("destinations.form.method")}</FieldLabel>
                    <Select
                      id={field.name}
                      name={field.name}
                      items={mode === "edit" ? webhookMethodEditItems : webhookMethodCreateItems}
                      value={field.state.value || null}
                      onValueChange={(value) => field.handleChange(value ?? "")}
                    >
                      <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                        <SelectValue placeholder={t("destinations.form.keepExisting")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {mode === "edit" ? (
                            <SelectItem value={null}>
                              {t("destinations.form.keepExisting")}
                            </SelectItem>
                          ) : null}
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                          <SelectItem value="PATCH">PATCH</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>{t("destinations.form.methodDescription")}</FieldDescription>
                  </UiField>
                )}
              </form.Field>
              {renderHeaderLinesField()}
            </>
          ) : null}
        </>
      )}
    </>
  );

  return (
    <form
      className={cn(
        "flex flex-col",
        isDialogLayout
          ? "min-h-0 max-h-[calc(min(760px,calc(100dvh-2rem))-6rem)] overflow-hidden"
          : "gap-3",
      )}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div
        className={cn(
          isDialogLayout ? "-mx-4 flex min-h-0 flex-1 overflow-y-auto" : "flex flex-col gap-3",
        )}
      >
        <div
          className={cn(
            isDialogLayout ? "flex min-w-0 flex-1 flex-col gap-4 px-4 pb-1" : "flex flex-col gap-3",
          )}
        >
          <FieldSet className="gap-3">
            {isDialogLayout ? (
              <FieldLegend variant="label">{t("destinations.form.section.identity")}</FieldLegend>
            ) : null}
            <FieldGroup className="gap-3">
              <form.Field
                name="name"
                validators={{
                  onSubmit: ({ value }) =>
                    value.trim().length === 0
                      ? t("destinations.form.validation.nameRequired")
                      : undefined,
                }}
              >
                {(field) => (
                  <UiField data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor={field.name}>{t("destinations.form.nameLabel")}</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder={t("destinations.form.namePlaceholder")}
                      required
                      aria-invalid={field.state.meta.errors.length > 0}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                    />
                    <FieldError
                      errors={field.state.meta.errors.map((error) => ({
                        message: String(error),
                      }))}
                    />
                    <FieldDescription>{t("destinations.form.nameDescription")}</FieldDescription>
                  </UiField>
                )}
              </form.Field>
              {mode === "create" ? (
                <form.Field name="kind">
                  {(field) => (
                    <UiField>
                      <FieldLabel htmlFor={field.name}>
                        {t("destinations.form.kindLabel")}
                      </FieldLabel>
                      <Select
                        id={field.name}
                        name={field.name}
                        items={destinationKindItems}
                        value={field.state.value}
                        onValueChange={(value) => {
                          const nextKind = value as DestinationFormKind;

                          field.handleChange(nextKind);
                          // Each kind offers its own template modes, so a mode drafted
                          // for the previous kind is clamped to what the new kind
                          // actually declares.
                          form.setFieldValue(
                            "templateMode",
                            resolveDestinationTemplateFormMode(
                              form.getFieldValue("templateMode"),
                              destinationTemplateModes(destinationCatalog, nextKind),
                            ),
                          );
                        }}
                      >
                        <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="generic_webhook">
                              {t("destinations.kinds.generic_webhook")}
                            </SelectItem>
                            <SelectItem value="feishu">{t("destinations.kinds.feishu")}</SelectItem>
                            <SelectItem value="slack">{t("destinations.kinds.slack")}</SelectItem>
                            <SelectItem value="email">{t("destinations.kinds.email")}</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>{t("destinations.form.kindDescription")}</FieldDescription>
                    </UiField>
                  )}
                </form.Field>
              ) : (
                <form.Field name="kind">
                  {(field) => (
                    <UiField>
                      <FieldLabel htmlFor={field.name}>
                        {t("destinations.form.kindLabel")}
                      </FieldLabel>
                      <Input id={field.name} value={field.state.value} readOnly aria-readonly />
                      <FieldDescription>
                        {t("destinations.form.kindReadonlyDescription")}
                      </FieldDescription>
                    </UiField>
                  )}
                </form.Field>
              )}
            </FieldGroup>
          </FieldSet>
          <div
            className={cn(
              isDialogLayout
                ? "grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
                : "flex flex-col gap-3",
            )}
          >
            <FieldSet className="min-w-0 gap-3">
              {isDialogLayout ? (
                <FieldLegend variant="label">{t("destinations.form.section.delivery")}</FieldLegend>
              ) : null}
              <FieldGroup className="gap-3">
                <form.Subscribe selector={(state) => state.values.kind}>
                  {(kind) => renderDestinationConfigFields(kind)}
                </form.Subscribe>
              </FieldGroup>
            </FieldSet>
            <FieldSet className="min-w-0 gap-3">
              {isDialogLayout ? (
                <FieldLegend variant="label">{t("destinations.form.section.template")}</FieldLegend>
              ) : null}
              <FieldGroup className="gap-3">
                <form.Subscribe selector={(state) => state.values.kind}>
                  {(kind) => renderTemplateFields(kind)}
                </form.Subscribe>
              </FieldGroup>
            </FieldSet>
          </div>
        </div>
      </div>
      <div
        className={cn(
          "flex flex-col gap-2 sm:flex-row sm:justify-end",
          isDialogLayout ? "border-border bg-popover shrink-0 border-t pt-3" : "",
        )}
      >
        {mode === "edit" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-fit"
            disabled={pending}
            onClick={onCancel}
          >
            {t("destinations.form.cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="w-full sm:w-fit"
          disabled={pending}
          onClick={() => {
            submitIntent.current = "preview";
          }}
        >
          <RiEyeLine data-icon="inline-start" aria-hidden />
          {t("destinations.form.preview")}
        </Button>
        <Button
          type="submit"
          size="sm"
          className="w-full sm:w-fit"
          disabled={pending}
          onClick={() => {
            submitIntent.current = "submit";
          }}
        >
          {mode === "create" ? (
            <RiAddLine data-icon="inline-start" aria-hidden />
          ) : (
            <RiEditLine data-icon="inline-start" aria-hidden />
          )}
          {mode === "create"
            ? t("destinations.form.create.submit")
            : t("destinations.form.edit.submit")}
        </Button>
      </div>
    </form>
  );
}

export function createDestinationDefaults(): DestinationFormValues {
  const templateDefaults = createDefaultDestinationTemplateFormState();

  return {
    ...templateDefaults,
    name: "",
    kind: "generic_webhook",
    endpointUrl: "",
    to: "",
    from: "",
    replyTo: "",
    subjectPrefix: "",
    subjectTemplate: "",
    htmlTemplate: "",
    headers: "",
    url: "",
    webhookUrl: "",
    method: "POST",
    signSecret: "",
    sendMode: "webhook",
    appRef: "",
    chatId: "",
    urgentAutoEnabled: true,
    urgentSeverities: ["critical"],
    urgentUserIdType: "open_id",
    urgentReceivers: "",
    templateCard: defaultFeishuCardTemplate,
  };
}

const webhookMethodCreateItems = [
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
];

function destinationValuesToFormData(values: DestinationFormValues): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  data.set(
    "templateBindings",
    values.kind === "feishu" &&
      (values.templateSource === "builtin" || values.templateMode === "feishu_card")
      ? templateBindingsJsonFromFormState(values)
      : values.templateBindings,
  );

  return data;
}

function appendTemplateVariable(currentValue: string, variable: string): string {
  return currentValue.trimEnd() ? `${currentValue} ${variable}` : variable;
}

const templateVariablePaths = [
  "event.title",
  "event.message",
  "event.severity",
  "event.severityDisplay",
  "event.status",
  "event.statusDisplay",
  "event.occurredAtDisplay",
  "event.fingerprint",
  "event.labels.service",
  "event.labels.environment",
  "source.name",
  "destination.name",
  "presentation.labels.summary",
  "presentation.labels.status",
  "presentation.labels.severity",
  "presentation.labels.source",
  "presentation.labels.occurredAt",
  "tocsin.eventUrl",
];

const defaultFeishuCardTemplate = JSON.stringify(defaultFeishuCardTemplateObject, null, 2);
