import type { AlertSeverity, AlertStatus } from "@tocsin/core";
import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from "@tocsin/core/presentation";

import type { DestinationPresentation } from "#destinations/types";

const copy = {
  "en-US": {
    severity: { critical: "Critical", warning: "Warning", info: "Info", unknown: "Unknown" },
    status: { firing: "Firing", resolved: "Resolved", unknown: "Unknown" },
    labels: {
      summary: "Alert summary",
      description: "Detailed description",
      status: "Status",
      source: "Source",
      severity: "Severity",
      provider: "Upstream system",
      service: "Service",
      environment: "Environment",
      fingerprint: "Fingerprint",
      occurredAt: "Occurred at",
      eventId: "Event ID",
      destination: "Destination",
      labels: "Labels",
      core: "Business core",
      viewAlertRule: "View alert rule",
      viewRelatedLogs: "View related logs",
      threshold: "Threshold",
      checkResult: "Check result",
      responseTime: "Response time",
      checkType: "Check type",
      monitorId: "Monitor ID",
      monitorPath: "Monitor path",
      checkUrl: "Check URL",
      lastFailure: "Last failure",
      fastgptModelProbe: "FastGPT model probe",
      modelProviderAndType: "Provider / type",
      modelId: "Model ID",
      modelTypeLlm: "Language model",
      modelTypeTts: "Text-to-speech",
      attempts: "Attempts",
      probeError: "Probe error",
      probeRecovered: "The model is responding again.",
      probeFailed: "Model probe failed",
    },
  },
  "zh-Hans": {
    severity: { critical: "严重", warning: "警告", info: "信息", unknown: "未知" },
    status: { firing: "触发中", resolved: "已恢复", unknown: "未知" },
    labels: {
      summary: "告警摘要",
      description: "详细描述",
      status: "状态",
      source: "告警源",
      severity: "级别",
      provider: "上游系统",
      service: "服务",
      environment: "环境",
      fingerprint: "指纹",
      occurredAt: "发生时间",
      eventId: "事件 ID",
      destination: "通知目标",
      labels: "标签",
      core: "业务核心",
      viewAlertRule: "查看告警规则",
      viewRelatedLogs: "查看关联日志",
      threshold: "阈值",
      checkResult: "检查结果",
      responseTime: "响应耗时",
      checkType: "检查类型",
      monitorId: "Monitor ID",
      monitorPath: "监控路径",
      checkUrl: "检查地址",
      lastFailure: "上次故障",
      fastgptModelProbe: "FastGPT 模型探测",
      modelProviderAndType: "服务商 / 类型",
      modelId: "模型 ID",
      modelTypeLlm: "大语言模型",
      modelTypeTts: "语音合成",
      attempts: "尝试次数",
      probeError: "错误详情",
      probeRecovered: "模型已恢复响应",
      probeFailed: "模型探测失败",
    },
  },
} as const;

export function resolveDestinationPresentation(
  presentation?: DestinationPresentation,
): DestinationPresentation {
  return {
    locale: presentation?.locale ?? DEFAULT_LOCALE,
    timeZone: presentation?.timeZone ?? DEFAULT_TIME_ZONE,
  };
}

export function destinationCopy(presentation?: DestinationPresentation) {
  return copy[resolveDestinationPresentation(presentation).locale];
}

export function displaySeverity(
  severity: AlertSeverity,
  presentation?: DestinationPresentation,
): string {
  return destinationCopy(presentation).severity[severity];
}

export function displayStatus(status: AlertStatus, presentation?: DestinationPresentation): string {
  return destinationCopy(presentation).status[status];
}

export function formatDestinationDateTime(
  value: string,
  presentation?: DestinationPresentation,
): string {
  const resolved = resolveDestinationPresentation(presentation);

  return new Intl.DateTimeFormat(resolved.locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: resolved.timeZone,
  }).format(new Date(value));
}
