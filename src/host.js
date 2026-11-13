// A股情报调查员 · Host 半边（intel_investigate 原生工具 + intel-investigator 技能提供方 + 硬规则注入 + 面板数据面）。
// 调查执行（多轮搜索+交叉验证+报告撰写）由会话模型按技能完成；工具负责计划生成与报告存证。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import { saveRecord, resolveApiKey, resolveApiBase } from '../lib/redfox.js'
import { platformContent } from '../lib/platformContent.js'
import { MODE_KEYS, MODES, resolveMode, buildPlan } from '../lib/modes.js'
import { tallyCredibility, checkReportStructure } from '../lib/credibility.js'
import {
  saveReport, getMeta, getReportMd, listReports, publicMeta, getSettings, resolveReport,
} from '../lib/store.js'

export const name = 'intel-investigator' // = cordis.patch.yml 的 id

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入情报调查工作流到系统提示'),
  apiKey: Schema.string().default('').description('RedFox API Key（ak_ 开头；留空读面板设置或环境变量 REDFOX_API_KEY）'),
  proxyUrl: Schema.string().default('').description('HTTP(S) 代理（访问 redfox.hk 用），留空直连'),
})

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：调查计划/报告全文/档案列表' },
      footer: { type: 'string', description: '可选：输出时需逐字附带的引擎页脚' },
    },
  },
  render: (_args, value) => text([value.summary, value.data, value.footer].filter(Boolean).join('\n\n')),
}

const result = (ok, summary, data = '', footer = '') => ({ ok, summary, data, footer })

const MAX_TEXT = 58000

function buildFooter(meta) {
  const cred = meta.credibility || {}
  const parts = []
  if (cred.total_marks) {
    parts.push(`✅${cred.confirmed ?? 0} ⚠️${cred.pending ?? 0} ❌${cred.refuted ?? 0} 🔍${cred.single ?? 0}`)
  }
  const upload = meta.uploaded
    ? (meta.upload_note ? '已存证 RedFox 平台（摘要版，全文仅本地）' : '已存证 RedFox 平台')
    : meta.upload_error ? `本地档案（平台存证失败：${String(meta.upload_error).slice(0, 40)}）` : '本地档案'
  return `🔍 A股情报调查员 · ${meta.mode_label} · 调查目标 ${meta.subject}${parts.length ? ' · 可信度 ' + parts.join('/') : ''} · ${upload} · 记录 ${meta.report_id}`
}

// ---------------------------------------------------------------------------
// 工具：intel_investigate —— plan / save / get / list / delete
// ---------------------------------------------------------------------------
export const intelInvestigateTool = {
  name: 'intel_investigate',
  description:
    'A股情报调查员：深度情报调查与分析（A股公司/竞品/舆情事件/人物背景/信息交叉验证五种模式）。' +
    '流程：plan 拿三轮搜索执行清单（引擎编排+关键词模板+输出维度）→ 用可用的搜索工具逐轮执行调查 → 按技能模板撰写报告（每条关键发现带来源+可信度标注 ✅⚠️❌🔍）→ save 存证（本地档案+RedFox 平台）→ 向用户完整输出报告。' +
    '没有搜索工具时如实告知，绝不编造调查发现。报告存证到平台需要 RedFox API Key（面板「设置」页或环境变量 REDFOX_API_KEY）。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('plan 调查计划；save 报告存证；get 读档案；list 历史档案', { enum: ['plan', 'save', 'get', 'list'] }),
      mode: str('plan/save：调查模式 stock=A股情报 / competitor=竞品 / event=舆情事件 / person=人物背景 / verify=信息交叉验证；也可以传自然语言（如"竞品调查"）'),
      subject: str('plan/save：调查目标（如 "宁德时代"、"Notion"、"某融资消息"）'),
      reportMd: str('save：调查报告 Markdown 全文（按 intel-investigator 技能模板撰写；关键发现带来源与可信度标注）'),
      tags: str('save：标签，逗号分隔（可选）'),
      reportId: str('get 定位：目标档案 id；缺省=最新一份'),
      limit: num_placeholder(),
    },
  },
  output: OUTPUT,
  async execute(args, ctxConfig) {
    check(args, this.parameters)
    const cfg = ctxConfig || {}

    // ── plan ─────────────────────────────────────────────────────────────
    if (args.action === 'plan') {
      const subject = String(args.subject || '').trim()
      if (!subject) throw new Error('plan 需要 subject（调查目标）。目标太模糊（如只有一个行业词）先请用户具体化。')
      const mode = resolveMode(args.mode || subject)
      if (!mode) {
        return result(false,
          `无法从「${args.mode || subject}」识别调查模式。请用户确认是哪类调查：stock=A股情报 / competitor=竞品 / event=舆情事件 / person=人物背景 / verify=信息交叉验证。不要猜模式自动开查。`)
      }
      const plan = buildPlan(mode, subject)
      return result(true,
        `已生成「${MODES[mode].label}」调查计划（目标：${subject}）。按三轮清单用可用搜索工具逐轮执行：每轮结束落关键发现+来源+可信度标注；三轮完成后按 ${MODES[mode].template} 模板（investigation-templates.md）撰写报告，写完用 action="save" 存证。`,
        plan)
    }

    // ── save ─────────────────────────────────────────────────────────────
    if (args.action === 'save') {
      const reportMd = String(args.reportMd || '').trim()
      if (!reportMd) throw new Error('save 需要 reportMd（报告 Markdown 全文）。')
      const subject = String(args.subject || '').trim()
      const mode = resolveMode(args.mode || subject)
      if (!mode) throw new Error(`save 需要 mode（${MODE_KEYS.join(' / ')}）。`)
      if (!subject) throw new Error('save 需要 subject（调查目标）。')
      const structure = checkReportStructure(reportMd, mode)
      const title = `${MODES[mode].label}：${subject}`
      const tags = String(args.tags || '').split(/[,，]/).map((t) => t.trim()).filter(Boolean).slice(0, 10)

      const settings = getSettings()
      const opts = { apiKey: resolveApiKey({ settings, config: cfg }), apiBase: resolveApiBase({ settings }), proxyUrl: cfg?.proxyUrl || settings.proxy_url || '' }
      let uploaded = false
      let uploadError = ''
      let uploadNote = ''
      if (opts.apiKey) {
        try {
          const payload = platformContent(reportMd, {
            title, subject, modeLabel: MODES[mode].label, credibility: tallyCredibility(reportMd),
          })
          await saveRecord({ title, content: payload.content, tags: [MODES[mode].label, subject, ...tags], ...opts })
          uploaded = true
          uploadNote = payload.note
        } catch (e) {
          uploadError = String(e?.message || e)
        }
      } else {
        uploadError = '未配置 RedFox API Key，仅存本地'
      }
      const meta = saveReport({ mode, modeLabel: MODES[mode].label, subject, title, reportMd, tags, uploaded, uploadError, uploadNote })

      const cred = meta.credibility
      const summary =
        `报告已存档（reportId=${meta.report_id}）${uploaded ? (uploadNote ? '，并已存证 RedFox 平台（超长报告按结构化摘要上传，全文保留在本地档案）' : '，并已存证 RedFox 平台') : uploadError ? `。平台存证未完成：${uploadError}（可稍后用面板「重新上传」）` : ''}。` +
        `可信度标注统计：✅${cred.confirmed} ⚠️${cred.pending} ❌${cred.refuted} 🔍${cred.single}。` +
        (structure.ok ? '' : ` 结构提示：${structure.problems.join('；')}。`) +
        ` 把报告全文完整输出给用户（含可信度标注），末尾逐字附页脚。${uploaded ? '' : '如实转述存证状态，不要声称已上传平台。'}` +
        ` 桌面端 WebContentsView 会 deny window.open/target=_blank，报告只能在面板内查看——告诉用户点侧栏「A股情报调查员」的档案详情（reportId=${meta.report_id}），不要把磁盘路径当成可点开的入口。`

      return result(true, summary, reportMd.slice(0, MAX_TEXT), buildFooter(meta))
    }

    // ── get ──────────────────────────────────────────────────────────────
    if (args.action === 'get') {
      const meta = resolveReport(args.reportId)
      const md = getReportMd(meta.report_id)
      if (!md) throw new Error(`报告内容缺失：${meta.report_id}`)
      return result(true,
        `档案 ${meta.report_id}（${meta.mode_label} · ${meta.subject}）。引用结论时保留可信度标注与来源。`,
        md.slice(0, MAX_TEXT), buildFooter(meta))
    }

    // ── list ─────────────────────────────────────────────────────────────
    if (args.action === 'list') {
      const list = listReports({ limit: 20 })
      if (!list.length) return result(false, '还没有调查档案。先完成调查再 save。')
      const lines = list.map((r) => {
        const c = r.credibility || {}
        return `${r.report_id}｜${r.mode_label}｜${r.subject}｜✅${c.confirmed ?? 0} ⚠️${c.pending ?? 0} ❌${c.refuted ?? 0} 🔍${c.single ?? 0}${r.uploaded ? (r.upload_note ? '｜已存证·摘要' : '｜已存证') : r.upload_error ? '｜仅本地' : ''}`
      })
      return result(true, `共 ${list.length} 份调查档案（新→旧）。读全文用 action="get"。`, lines.join('\n').slice(0, MAX_TEXT))
    }

    throw new Error(`未知 action：${args.action}`)
  },
}

// 工具 schema 里 number 类型占位（limit 暂未启用分页，保留扩展位）
function num_placeholder() {
  return { type: 'number', description: 'list：最多返回档案数，默认 20（可选）' }
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------
export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  const toolWithConfig = { ...intelInvestigateTool, execute(args) { return intelInvestigateTool.execute(args, config) } }

  ctx.effect(() => ctx.tools.register(toolWithConfig), `${name}: tool`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: workflow`)
  }
  ctx.effect(() => registerApi(ctx, { config }), `${name}: routes`)
}

export { publicMeta, tallyCredibility }
