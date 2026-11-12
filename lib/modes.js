// 五种调查模式的策略编排数据（移植自上游 core_workflow.md / investigation-modes.md，确定性 plan 生成）。
// 关键词模板中 {subject} 会被调查目标替换。

export const MODES = {
  stock: {
    label: 'A股情报调查',
    aliases: ['A股', '股票', '股', '公司', '上市公司', '财报', '基本面', '概念', '资金'],
    purpose: 'A股公司基本面、行业赛道、概念热点、资金动态、公告事件',
    rounds: [
      {
        goal: '基本面扫描',
        engines: [
          { name: 'Baidu', query: '{subject} 基本面 财报 主营业务', aim: '建立全景认知' },
          { name: '东方财富', query: '{subject} F10 财务数据', aim: '核心财务指标' },
          { name: '同花顺', query: '{subject} 概念 题材 行业', aim: '概念板块定位' },
        ],
      },
      {
        goal: '深度挖掘',
        engines: [
          { name: '雪球', query: 'site:xueqiu.com {subject}', aim: '投资者深度讨论' },
          { name: '巨潮资讯', query: 'site:cninfo.com.cn {subject}', aim: '公告原文检索' },
          { name: '证券时报', query: '{subject} 研报 评级 目标价', aim: '机构观点汇总' },
        ],
      },
      {
        goal: '交叉验证',
        engines: [
          { name: '新浪财经', query: '{subject} 营收 净利润 增长率', aim: '财务数据核实' },
          { name: '东方财富', query: '{subject} 所属行业 政策 利好 利空', aim: '行业环境研判' },
          { name: 'Baidu', query: '{subject} 公告 事件 新闻', aim: '事件驱动复核' },
        ],
      },
    ],
    dimensions: ['公司概况', '财务表现', '行业赛道', '概念热度', '资金动态', '舆论风向', '机构观点', '风险提示', '综合评估', '调查结论'],
    template: 'stock',
  },
  competitor: {
    label: '竞品情报调查',
    aliases: ['竞品', '竞争对手', '产品调查', '对比'],
    purpose: '分析竞品产品、市场策略、用户口碑',
    rounds: [
      {
        goal: '广域扫描',
        engines: [
          { name: 'Baidu', query: '{subject} 产品 功能 定价', aim: '建立全景认知' },
          { name: 'Google', query: '{subject} product review', aim: '国际化视角' },
          { name: 'Bing INT', query: '{subject} vs alternatives', aim: '竞品对比' },
        ],
      },
      {
        goal: '深度挖掘',
        engines: [
          { name: 'WeChat', query: '{subject} 分析 测评', aim: '深度分析文章' },
          { name: 'Toutiao', query: '{subject} 用户 评价', aim: '自媒体评价' },
          { name: 'DuckDuckGo', query: '{subject} site:reddit.com OR site:producthunt.com', aim: '社区真实反馈' },
        ],
      },
      {
        goal: '交叉验证',
        engines: [
          { name: 'Baidu', query: '{subject} 融资 营收', aim: '国内商业数据' },
          { name: 'Google', query: '{subject} funding revenue', aim: '国际商业数据' },
          { name: 'Brave', query: '{subject} market share', aim: '市场份额验证' },
        ],
      },
    ],
    dimensions: ['产品定位', '核心功能', '用户口碑', '市场表现', '竞争优势', '潜在风险'],
    template: 'competitor',
  },
  event: {
    label: '舆情事件调查',
    aliases: ['舆情', '事件', '热点', '舆论', '危机', '追踪'],
    purpose: '热点事件追踪、舆论走向分析、危机监测',
    rounds: [
      {
        goal: '事件还原',
        engines: [
          { name: 'Baidu', query: '{subject}（时间过滤 tbs=qdr:d）', aim: '国内最新报道' },
          { name: 'Google', query: '{subject}（tbs=qdr:d）', aim: '国际最新报道' },
          { name: 'Toutiao', query: '{subject}', aim: '热点实时追踪' },
        ],
      },
      {
        goal: '多视角收集',
        engines: [
          { name: 'WeChat', query: '{subject} 评论 分析', aim: '公众号深度解读' },
          { name: 'Sogou', query: '{subject} 观点', aim: '知乎等中文社区' },
          { name: 'DuckDuckGo', query: '{subject} site:reddit.com', aim: '国际社区讨论' },
        ],
      },
      {
        goal: '时间线重建',
        engines: [
          { name: 'Google', query: '{subject}（tbs=qdr:w）', aim: '一周内演变' },
          { name: 'Bing INT', query: '{subject} timeline', aim: '国际时间线' },
          { name: 'Baidu', query: '{subject} 时间线 经过 回顾', aim: '国内时间线' },
        ],
      },
    ],
    dimensions: ['时间线', '舆论分布（支持/反对/中立）', '待验证信息', '关键结论'],
    template: 'event',
  },
  person: {
    label: '人物背景调查',
    aliases: ['人物', '背景调查', '创始人', '履历', '背景'],
    purpose: '商务合作前的背景调查、行业人物了解',
    rounds: [
      {
        goal: '身份核实',
        engines: [
          { name: 'Baidu', query: '{subject} 简介 背景 职务', aim: '基本信息核实' },
          { name: 'Google', query: '{subject} biography', aim: '国际信息补全' },
          { name: 'Bing INT', query: '{subject} 团队 公司', aim: '跨国信息对比' },
        ],
      },
      {
        goal: '专业验证',
        engines: [
          { name: 'DuckDuckGo', query: '!gh {subject}', aim: '技术成果（GitHub）' },
          { name: 'Google Scholar', query: 'author:"{subject}"', aim: '学术成果' },
          { name: 'WeChat', query: '{subject} 专访 演讲', aim: '行业影响力' },
        ],
      },
      {
        goal: '风险排查',
        engines: [
          { name: 'Baidu', query: '{subject} 争议 诉讼 负面', aim: '国内风险信号' },
          { name: 'Google', query: '{subject} controversy', aim: '国际风险信号' },
          { name: 'Bing INT', query: '{subject} fraud lawsuit', aim: '跨国诉讼排查' },
        ],
      },
    ],
    dimensions: ['身份信息', '职业履历', '专业成就', '行业口碑', '风险信号', '综合评估'],
    template: 'person',
  },
  verify: {
    label: '信息交叉验证',
    aliases: ['验证', '辟谣', '真实性', '真假', '核实'],
    purpose: '验证信息真实性、对比不同来源说法',
    rounds: [
      {
        goal: '信息溯源',
        engines: [
          { name: 'Google', query: '"{subject}"（精确匹配）', aim: '寻找首发源' },
          { name: 'Baidu', query: '"{subject}"', aim: '国内首发源' },
        ],
      },
      {
        goal: '多源比对',
        engines: [
          { name: 'DuckDuckGo', query: '{subject}（不同索引）', aim: '独立索引交叉' },
          { name: 'Brave', query: '{subject}', aim: '无过滤视角' },
          { name: 'Startpage', query: '{subject}', aim: 'Google 结果免追踪' },
        ],
      },
      {
        goal: '权威验证',
        engines: [
          { name: 'Google', query: 'site:gov.cn {subject}', aim: '官方信源确认' },
          { name: 'Google', query: 'site:reuters.com OR site:bloomberg.com {subject}', aim: '权威媒体确认' },
          { name: 'WolframAlpha', query: '{subject}（数值型信息）', aim: '数据计算验证' },
        ],
      },
    ],
    dimensions: ['首发溯源', '传播路径', '反驳信息（辟谣）', '权威信源结论', '验证结论（✅已确认/⚠️待确认/❌已否定/🔍单一来源）'],
    template: 'verify',
  },
}

export const MODE_KEYS = Object.keys(MODES)

export function resolveMode(input) {
  const kw = String(input || '').trim()
  if (!kw) return null
  if (MODE_KEYS.includes(kw)) return kw
  const direct = Object.entries(MODES).find(([k, v]) => v.label === kw)
  if (direct) return direct[0]
  for (const [key, mode] of Object.entries(MODES)) {
    if (mode.aliases.some((a) => kw.includes(a) || a.includes(kw))) return key
  }
  return null
}

// 确定性调查计划：subject 填入关键词模板 → 三轮执行清单
export function buildPlan(modeKey, subject) {
  const mode = MODES[modeKey]
  if (!mode) throw new Error(`未知调查模式：${modeKey}（可选：${MODE_KEYS.join(' / ')}）`)
  const s = String(subject || '').trim() || '{调查目标}'
  const lines = [`**调查模式**：${mode.label} —— ${mode.purpose}`, '', '**三轮搜索执行计划**（每轮结束落一条关键发现，标注可信度）：', '']
  mode.rounds.forEach((round, i) => {
    lines.push(`**第${i + 1}轮 · ${round.goal}**`)
    lines.push('')
    lines.push('| 引擎 | 搜索词 | 目的 |')
    lines.push('|:---|:---|:---|')
    for (const e of round.engines) {
      lines.push(`| ${e.name} | ${e.query.replaceAll('{subject}', s)} | ${e.aim} |`)
    }
    lines.push('')
  })
  lines.push(`**报告输出维度**（模板 template="${mode.template}"）：${mode.dimensions.join('、')}`)
  lines.push('')
  lines.push('**可信度标注**：✅ 已确认（2+独立来源一致）· ⚠️ 待确认（来源矛盾）· ❌ 已否定（权威信源反驳）· 🔍 单一来源（仅1个来源）。信息源分级 A（官方/权威媒体）→ B（行业媒体）→ C（社交/自媒体）→ D（匿名/未验证），结论权重 A > B > C > D。')
  return lines.join('\n')
}
