import type { FeishuApp, IsoDateTimeString } from "@tocsin/core";

export interface FeishuAppRow {
  id: string;
  name: string;
  app_id: string;
  app_secret: string;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
}

export interface FeishuAppRepository {
  /** Full runtime rows, including the secret; the service projects safe DTOs. */
  list(): Promise<FeishuApp[]>;
  get(id: string): Promise<FeishuApp | null>;
  create(input: CreateFeishuAppInput): Promise<FeishuApp>;
  update(id: string, input: UpdateFeishuAppInput): Promise<FeishuApp>;
  delete(id: string): Promise<void>;
}

export interface CreateFeishuAppInput {
  id?: string;
  name: string;
  appId: string;
  appSecret: string;
  createdAt?: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
}

export interface UpdateFeishuAppInput {
  name?: string;
  appId?: string;
  appSecret?: string;
  updatedAt?: IsoDateTimeString;
}
