// 把本地已有档案按「当前」上传策略补传 RedFox 平台，并回写存证状态。
// 用途：历史报告在旧版本里因超长（>2000 字符）存证失败，升级后可一次性补齐，不必重跑调查。
//
// 用法：
//   node scripts/reupload.mjs                       列出可补传的档案
//   node scripts/reupload.mjs <reportId>            补传指定档案
//   node scripts/reupload.mjs --all                 补传全部未存证档案
//   node scripts/reupload.mjs --all --force         连已存证的也重传一遍
//   node scripts/reupload.mjs --mark-only <reportId> 平台已收到但本地状态没写成时，只回写状态（不重复提交）
import { getSettings, getMeta, getReportMd, listReports, updateUploadState } from '../lib/store.js'
import { saveRecord, resolveApiKey, resolveApiBase } from '../lib/redfox.js'
import { platformContent } from '../lib/platformContent.js'

const args = process.argv.slice(2)
const all = args.includes('--all')
const force = args.includes('--force')
// 只在「平台已收到、本地状态没写进去」时用：不重复提交，仅按当前策略回写状态
const markOnly = args.includes('--mark-only')
const ids = args.filter((a) => !a.startsWith('--'))

const settings = getSettings()
const apiKey = resolveApiKey({ settings })
const apiBase = resolveApiBase({ settings })

if (!apiKey && !markOnly) {
  console.error('未配置 RedFox API Key：在面板「设置」页填，或设环境变量 REDFOX_API_KEY。')
  process.exit(1)
}

const archives = listReports({ limit: 200 })
if (!ids.length && !all) {
  console.log(`共 ${archives.length} 份本地档案（apiBase=${apiBase}）：`)
  for (const r of archives) {
    const state = r.uploaded ? (r.upload_note ? '已存证·摘要' : '已存证') : r.upload_error ? '仅本地（有失败原因）' : '仅本地'
    console.log(`  ${r.report_id}  [${state}]  ${r.title}`)
  }
  console.log('\n补传：node scripts/reupload.mjs <reportId>   或   node scripts/reupload.mjs --all')
  process.exit(0)
}

const targets = all ? archives.filter((r) => force || !r.uploaded).map((r) => r.report_id) : ids
if (!targets.length) {
  console.log('没有需要补传的档案（都已存证）。要强制重传加 --force。')
  process.exit(0)
}

let failed = 0
for (const id of targets) {
  const meta = getMeta(id)
  if (!meta) {
    console.log(`SKIP ${id}  档案不存在`)
    failed += 1
    continue
  }
  const md = getReportMd(id) || ''
  const payload = platformContent(md, {
    title: meta.title, subject: meta.subject, modeLabel: meta.mode_label, credibility: meta.credibility,
  })
  try {
    if (markOnly) {
      updateUploadState(id, { uploaded: true, uploadError: '', uploadNote: payload.note })
      console.log(`MARK ${id}  仅回写状态：${payload.note || '全文存证'}`)
      continue
    }
    await saveRecord({
      title: meta.title,
      content: payload.content,
      tags: [meta.mode_label, ...(meta.tags || [])],
      apiKey,
      apiBase,
      proxyUrl: settings.proxy_url || '',
    })
    updateUploadState(id, { uploaded: true, uploadError: '', uploadNote: payload.note })
    const detail = payload.summarized
      ? `摘要 ${payload.content.length} 字符（全文 ${md.length} 字符仅本地）`
      : `全文 ${payload.content.length} 字符`
    console.log(`OK   ${id}  ${detail}`)
  } catch (e) {
    updateUploadState(id, { uploaded: false, uploadError: String(e?.message || e) })
    console.log(`FAIL ${id}  ${e?.message || e}`)
    failed += 1
  }
}

console.log(failed ? `\n${failed} 项失败` : '\n全部补传完成')
process.exitCode = failed ? 1 : 0
