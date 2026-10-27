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
      { text: "事件", link: "/guide/events" },
      { text: "路由", link: "/guide/routes" },
      { text: "告警接入", link: "/integrations/providers" },
      { text: "通知目标", link: "/integrations/destinations" },
      { text: "运维", link: "/operations/deploy-docker" },
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
          { text: "通知目标参考", link: "/integrations/destinations" },
        ],
      },
      {
        text: "部署与运维",
        collapsed: false,
        items: [
          { text: "Docker 生产部署", link: "/operations/deploy-docker" },
          { text: "认证与账号安全", link: "/operations/authentication" },
          { text: "可移植配置参考", link: "/operations/portable-config" },
          { text: "备份、恢复与升级", link: "/operations/backup-restore" },
          { text: "投递生命周期与重试", link: "/operations/deliveries" },
          { text: "日志与可观测性", link: "/operations/observability" },
          { text: "告警静默与维护时段", link: "/operations/suppressions" },
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
