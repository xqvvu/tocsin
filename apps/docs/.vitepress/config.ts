import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Tocsin",
  description: "Tocsin 自托管告警路由与投递运维文档",
  lang: "zh-CN",
  appearance: false,
  themeConfig: {
    nav: [
      { text: "快速开始", link: "/guide/quick-start" },
      { text: "概念", link: "/guide/concepts" },
      { text: "架构", link: "/operations/architecture" },
      { text: "事件", link: "/guide/events" },
      { text: "路由", link: "/guide/routes" },
      {
        text: "告警接入",
        items: [
          { text: "Provider 接入参考", link: "/integrations/providers" },
          { text: "Provider 接入验收配方", link: "/integrations/provider-verification" },
        ],
      },
      {
        text: "通知目标",
        items: [
          { text: "通知目标参考", link: "/integrations/destinations" },
          { text: "目标验收与失败判读", link: "/integrations/destination-verification" },
          { text: "邮件网关接入与验收", link: "/integrations/email-gateway" },
          { text: "飞书应用与电话加急", link: "/integrations/feishu-app" },
        ],
      },
      {
        text: "运维",
        items: [
          { text: "设置与运行态操作", link: "/operations/settings" },
          { text: "Docker 生产部署", link: "/operations/deploy-docker" },
          { text: "故障排查", link: "/operations/troubleshooting" },
        ],
      },
      { text: "GitHub", link: "https://github.com/xqvvu/tocsin" },
    ],
    sidebar: [
      {
        text: "使用 Tocsin",
        collapsed: false,
        items: [
          { text: "快速开始", link: "/guide/quick-start" },
          { text: "处理链路与概念", link: "/guide/concepts" },
          { text: "告警源接入与生命周期", link: "/guide/sources" },
          { text: "事件检索与证据", link: "/guide/events" },
          { text: "路由规则与匹配", link: "/guide/routes" },
        ],
      },
      {
        text: "集成",
        collapsed: false,
        items: [
          { text: "告警源接入参考", link: "/integrations/providers" },
          { text: "Provider 接入验收配方", link: "/integrations/provider-verification" },
          { text: "通知目标参考", link: "/integrations/destinations" },
          { text: "通知目标验收与失败判读", link: "/integrations/destination-verification" },
          { text: "邮件网关接入与验收", link: "/integrations/email-gateway" },
          { text: "飞书应用与电话加急", link: "/integrations/feishu-app" },
        ],
      },
      {
        text: "部署与运维",
        collapsed: false,
        items: [
          { text: "单实例架构与故障边界", link: "/operations/architecture" },
          { text: "Docker 生产部署", link: "/operations/deploy-docker" },
          { text: "TLS 反向代理", link: "/operations/reverse-proxy" },
          { text: "设置与运行态操作", link: "/operations/settings" },
          { text: "环境变量与运行时配置", link: "/operations/configuration" },
          { text: "数据保留与 SQLite 容量", link: "/operations/data-retention" },
          { text: "认证与账号安全", link: "/operations/authentication" },
          { text: "可移植配置参考", link: "/operations/portable-config" },
          { text: "备份与恢复", link: "/operations/backup-restore" },
          { text: "版本升级与回滚", link: "/operations/upgrade-rollback" },
          { text: "投递检索、生命周期与重试", link: "/operations/deliveries" },
          { text: "日志与可观测性", link: "/operations/observability" },
          { text: "生产监控与告警基线", link: "/operations/monitoring" },
          { text: "告警静默与维护时段", link: "/operations/suppressions" },
          { text: "告警风暴与急停处置", link: "/operations/incident-playbook" },
          { text: "值班交接与通知链路验收", link: "/operations/oncall-handoff" },
          { text: "故障排查", link: "/operations/troubleshooting" },
        ],
      },
    ],
    outline: { label: "本页目录" },
    docFooter: { prev: "上一页", next: "下一页" },
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/xqvvu/tocsin" }],
  },
});
