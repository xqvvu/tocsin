---
layout: home

hero:
  name: Tocsin
  text: 自托管告警路由
  tagline: 把上游告警接入一个可审计的事件、路由与投递链路。
  actions:
    - theme: brand
      text: 开始部署
      link: /guide/quick-start
    - theme: alt
      text: Docker 生产部署
      link: /operations/deploy-docker

features:
  - title: 接收并规范化
    details: 为上游系统分别创建告警源。Webhook 被保存为事件，再由 Provider 解析为统一告警字段。
  - title: 路由并投递
    details: 用可检查的条件把事件发往一个或多个通知目标；异步投递会保留尝试记录与失败状态。
  - title: 面向单实例运维
    details: 单进程、SQLite 与一个持久数据卷，不要求 Redis、PostgreSQL 或独立 Worker。
---

## 从第一条告警开始

1. [部署并完成首次 setup](/guide/quick-start)
2. [理解告警处理链路](/guide/concepts)
3. [创建、轮换或停用告警源](/guide/sources)
4. [定位 Event 并读取匹配证据](/guide/events)
5. [选择并验证通知目标](/integrations/destinations)
6. [配置路由匹配](/guide/routes)
7. [检查投递状态与重试](/operations/deliveries)
8. [在变更窗口内静默告警](/operations/suppressions)
9. [生产 Docker 部署](/operations/deploy-docker)
10. [完成首个 owner 与账号安全设置](/operations/authentication)
11. [备份、恢复与升级](/operations/backup-restore)
12. [查看日志、健康检查与 Worker 状态](/operations/observability)

::: warning 发布状态
Tocsin 当前是可试用的自托管 MVP，尚非稳定发布版。生产使用前请评估单实例限制，并先演练备份与恢复。
:::
