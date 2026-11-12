// A股情报调查员 · 数据层。
//   $DSH_HOME/intel-investigator/
//   ├── settings.json          api_key / api_base(测试用) / proxy_url / auto_upload
//   └── reports/index.json     调查档案索引（新→旧）
//   └── reports/<id>/report.md 调查报告 Markdown
// 原子写（tmp + rename）与前序插件同款。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, normalize } from 'node:path'
import { tallyCredibility } from './credibility.js'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'intel-investigator')
const REPORTS_DIR = join(DATA_DIR, 'reports')
const INDEX_FILE = join(REPORTS_DIR, 'index.json')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

const nowIso = () => new Date().toISOString()

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

// ── 设置 ───────────────────────────────────────────────────────────────
export function getSettings() {
  return readJson(SETTINGS_FILE, {}) || {}
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch, updated_at: nowIso() }
  writeJson(SETTINGS_FILE, next)
  return next
}

// ── 调查档案 ───────────────────────────────────────────────────────────
function reportDir(id) {
  const safe = String(id).replace(/[^\p{L}\p{N}_-]+/gu, '')
  if (!safe || safe !== String(id)) throw new Error('非法档案 id')
  const dir = join(REPORTS_DIR, safe)
  if (normalize(dir) !== normalize(join(REPORTS_DIR, safe))) throw new Error('非法档案 id')
  return dir
}

export function createReportId(subject) {
  const ts = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const slug = String(subject).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'target'
  return `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}${String(ts.getMilliseconds()).padStart(3, '0')}-${slug}`
}

function writeReportMd(file, content) {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, String(content ?? ''), 'utf8')
  renameSync(tmp, file)
  return file
}

// meta 对外视图
export function publicMeta(meta) {
  return {
    report_id: meta.report_id,
    mode: meta.mode,
    mode_label: meta.mode_label,
    subject: meta.subject,
    title: meta.title,
    tags: meta.tags || [],
    saved_at: meta.saved_at,
    bytes: meta.bytes || 0,
    credibility: meta.credibility || {},
    uploaded: Boolean(meta.uploaded),
    upload_error: meta.upload_error || '',
  }
}

// 保存报告（本地必存；uploaded/upload_error 由调用方按远端结果标注）
export function saveReport({ mode, modeLabel, subject, title, reportMd, tags = [], uploaded = false, uploadError = '' }) {
  const id = createReportId(subject || title)
  const dir = reportDir(id)
  mkdirSync(dir, { recursive: true })
  writeReportMd(join(dir, 'report.md'), reportMd)
  const meta = {
    report_id: id,
    mode,
    mode_label: modeLabel,
    subject,
    title,
    tags,
    saved_at: nowIso(),
    bytes: Buffer.byteLength(String(reportMd), 'utf8'),
    credibility: tallyCredibility(reportMd),
    uploaded: Boolean(uploaded),
    upload_error: String(uploadError || '').slice(0, 300),
  }
  writeJson(join(dir, 'meta.json'), meta)
  const index = getReportIndex().filter((i) => i.report_id !== id)
  index.unshift({ report_id: id, saved_at: meta.saved_at })
  writeJson(INDEX_FILE, index.slice(0, 200))
  return meta
}

export function updateUploadState(reportId, { uploaded, uploadError = '' } = {}) {
  const meta = readJson(join(reportDir(reportId), 'meta.json'))
  if (!meta) throw new Error(`档案不存在：${reportId}`)
  meta.uploaded = Boolean(uploaded)
  meta.upload_error = String(uploadError || '').slice(0, 300)
  writeJson(join(reportDir(reportId), 'meta.json'), meta)
  return meta
}

export function getMeta(reportId) {
  return readJson(join(reportDir(reportId), 'meta.json'))
}

export function getReportMd(reportId) {
  const file = join(reportDir(reportId), 'report.md')
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

function getReportIndex() {
  return readJson(INDEX_FILE, []) || []
}

export function listReports({ limit = 50, mode } = {}) {
  const index = getReportIndex()
  const out = []
  for (const item of index.slice(0, limit * 2)) {
    const meta = getMeta(item.report_id)
    if (!meta) continue
    if (mode && meta.mode !== mode) continue
    out.push(publicMeta(meta))
    if (out.length >= limit) break
  }
  return out
}

// 缺省解析为最新一份报告
export function resolveReport(reportId) {
  if (reportId) {
    const meta = getMeta(reportId)
    if (!meta) throw new Error(`调查档案不存在：${reportId}。用 history/list 查看已有档案。`)
    return meta
  }
  const [latest] = listReports({ limit: 1 })
  if (!latest) throw new Error('还没有调查档案。先完成调查再 save。')
  return getMeta(latest.report_id)
}

export function deleteReport(reportId) {
  const dir = reportDir(reportId)
  if (!existsSync(dir)) return { ok: false, error: `调查档案不存在: ${reportId}` }
  rmSync(dir, { recursive: true, force: true })
  writeJson(INDEX_FILE, getReportIndex().filter((i) => i.report_id !== reportId))
  return { ok: true }
}
