import type {
  CreateFeishuAppCommand,
  FeishuAppSummary,
  UpdateFeishuAppCommand,
} from "@tocsin/core";

export interface FeishuAppFormValues {
  name: string;
  appId: string;
  appSecret: string;
}

export const emptyFeishuAppFormValues: FeishuAppFormValues = {
  name: "",
  appId: "",
  appSecret: "",
};

/** Edit forms start with an empty secret; submitting it empty keeps the stored one. */
export function feishuAppFormValuesFromApp(app: FeishuAppSummary): FeishuAppFormValues {
  return {
    name: app.name,
    appId: app.appId,
    appSecret: "",
  };
}

export function feishuAppCreateCommandFromValues(
  values: FeishuAppFormValues,
): CreateFeishuAppCommand {
  return {
    name: values.name.trim(),
    appId: values.appId.trim(),
    appSecret: values.appSecret,
  };
}

export function feishuAppUpdateCommandFromValues(
  id: string,
  values: FeishuAppFormValues,
): UpdateFeishuAppCommand {
  return {
    id,
    name: values.name.trim(),
    appId: values.appId.trim(),
    appSecret: values.appSecret.length > 0 ? values.appSecret : undefined,
  };
}
