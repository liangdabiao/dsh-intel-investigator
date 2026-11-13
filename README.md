# dsh-intel-investigator · A股情报调查员

> 深度情报调查与分析：快速完成公司研究、竞品对比、事件追踪、背景核实和信息验证，输出结构化调查报告。

dsh 插件（技能 + 工具 + 档案看板完整形态）。核心聚焦 A 股市场（基本面、行业产业链、概念热点、资金流向、公告研报、股吧舆情），同时覆盖竞品/舆情/人物/信息验证四类通用调查。移植自 [redfox-community](https://github.com/redfox-data/redfox-community) 的 skills/ai-intelligence-investigator。

## 与数据型插件的区别

调查执行由 **agent 对话完成**（三轮搜索方法论：广域扫描 → 深度挖掘 → 交叉验证），插件负责**调查计划生成**与**报告存证归档**——本插件不抓行情数据，调查发现的真实性由可信度标注纪律约束。

## 功能

- **intel_investigate 工具**（agent 对话内使用）
  - `plan`：按模式生成三轮搜索执行清单（引擎编排 + 关键词模板 + 输出维度），自然语言自动映射模式
  - `save`：报告存证（本地档案必存 + RedFox 平台上传），自动统计可信度标注，结构完整性软校验。RedFox 存证接口对正文限 2000 字符，超长报告自动改传结构化摘要（关键结论 + 关键信息验证 + 风险评估），全文仍完整保留在本地档案；历史档案可用 `npm run reupload` 批量补传。
  - `get` / `list`：档案读取与列表
- **五种调查模式**：stock（A股情报）/ competitor（竞品）/ event（舆情事件）/ person（人物背景）/ verify（信息交叉验证）
- **可信度标注**：✅ 已确认（2+ 独立来源）/ ⚠️ 待确认（来源矛盾）/ ❌ 已否定（权威反驳）/ 🔍 单一来源；信息源 A/B/C/D 分级
- **intel-investigator 技能**：完整方法论快照（执行流程 / 调查模式 / 引擎策略 / 报告模板集）+ 硬规则注入（无搜索工具时如实告知、不编造调查发现、每条发现带来源+标注）
- **档案看板**：按模式归档、四色可信度统计、报告渲染查看（可打印/导 PDF）、平台存证状态与重新上传、粘贴 Markdown 直存补录通道

## 安装

```bash
dsh plugin --profile web add file:D:/dsh-research/dsh-intel-investigator
```

前置：dsh >= 0.2.1-rc.2。RedFox API Key（[红狐 hub 获取](https://redfox.hk/settings/api-keys?source=github)，`ak_` 开头）用于报告存证到平台；不配置时只存本地档案。

## 开发

```bash
npm install        # 安装依赖并构建 dist/client.js
npm test           # 单测（node --test）
npm run smoke      # 离线冒烟：假存证服务器 + 工具直调 + 面板 API 全路由
npm run dev        # 开发预览：DSH_HOME=<数据目录> node scripts/devserver.mjs 5190
```

数据目录：`$DSH_HOME/intel-investigator/`（settings.json + reports/<id>/meta.json、report.md）。

## License

MIT
