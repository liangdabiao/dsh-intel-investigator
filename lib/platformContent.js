// RedFox 存证接口对 body.content 有硬上限：2000 字符（实测回执 code=1003，且回执里的字符数与 JS 字符串长度一致）。
// 调查报告普遍远超这个长度，所以「原样上传」注定失败。
// 这里做的是：本地档案永远保留全文（store.js 只写 report.md），上传平台时超长则改发结构化摘要。
// 摘要优先级：关键结论 > 关键信息验证 > 风险评估；抽不出章节时退回正文开头。
export const PLATFORM_CONTENT_LIMIT = 2000

const SUMMARY_MARK = '*（RedFox 存证限 2000 字符，以上为结构化摘要；完整报告见面板本地档案）*'

export function charCount(value) {
  return String(value ?? '').length
}

// 按字符数裁剪（尽量落在换行处，避免把表格行切断一半）
function clamp(text, max) {
  const s = String(text ?? '').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, Math.max(0, max - 1))
  const nl = cut.lastIndexOf('\n')
  const head = nl > max * 0.5 ? cut.slice(0, nl) : cut
  return `${head.trimEnd()}…`
}

function headingText(line) {
  return String(line).replace(/^#{1,6}\s*/, '').replace(/^[\d.、)\s]+/, '').trim()
}

// 取「标题命中 names」的章节正文，到下一个同级/更高级标题或 --- 分隔线为止
function extractSection(md, names, max) {
  const lines = String(md ?? '').split(/\r?\n/)
  const start = lines.findIndex((line) => /^#{2,3}\s/.test(line) && names.some((n) => headingText(line).startsWith(n)))
  if (start < 0) return ''
  const body = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^#{1,3}\s/.test(line) || /^\s*-{3,}\s*$/.test(line)) break
    body.push(line)
  }
  return clamp(body.join('\n'), max)
}

/**
 * 生成要发给 RedFox 的 content。
 * @param {string} reportMd 报告全文
 * @param {{title?:string, subject?:string, modeLabel?:string, mode_label?:string, credibility?:object}} meta
 * @returns {{content:string, summarized:boolean, note:string}}
 */
export function platformContent(reportMd, meta = {}) {
  const md = String(reportMd ?? '')
  if (charCount(md) <= PLATFORM_CONTENT_LIMIT) {
    return { content: md, summarized: false, note: '' }
  }

  const cred = meta.credibility || {}
  const title = String(meta.title || (meta.subject ? `调查报告：${meta.subject}` : '调查报告')).trim()
  const subject = String(meta.subject || '').trim()
  const modeLabel = String(meta.modeLabel || meta.mode_label || '').trim()

  const lines = [`# ${title}`, '']
  if (modeLabel) lines.push(`- 调查模式：${modeLabel}`)
  if (subject) lines.push(`- 调查目标：${subject}`)
  if (cred.total_marks || cred.confirmed || cred.pending || cred.refuted || cred.single) {
    lines.push(`- 可信度标注：✅${cred.confirmed ?? 0} ⚠️${cred.pending ?? 0} ❌${cred.refuted ?? 0} 🔍${cred.single ?? 0}`)
  }
  lines.push(`- 报告长度：全文 ${charCount(md)} 字符（本地档案完整保留）`, '')

  const conclusions = extractSection(md, ['关键结论', '核心结论', '调查结论', '验证结论', '综合评估'], 720)
  const verified = extractSection(md, ['关键信息验证', '关键发现验证', '信息验证', '验证过程'], 420)
  const risks = extractSection(md, ['风险评估', '风险提示', '风险信号'], 240)

  if (conclusions) lines.push('## 关键结论', '', conclusions, '')
  if (verified) lines.push('## 关键信息验证', '', verified, '')
  if (risks) lines.push('## 风险评估', '', risks, '')
  if (!conclusions && !verified && !risks) {
    lines.push('## 正文摘录', '', clamp(md.replace(/\r?\n{2,}/g, '\n\n'), 820), '')
  }

  // 给摘要标记预留位置，保证最终长度不超上限
  const budget = PLATFORM_CONTENT_LIMIT - SUMMARY_MARK.length - 2
  const body = clamp(lines.join('\n'), budget)
  const content = `${body}\n\n${SUMMARY_MARK}`
  return {
    content: charCount(content) <= PLATFORM_CONTENT_LIMIT ? content : clamp(content, PLATFORM_CONTENT_LIMIT),
    summarized: true,
    note: `平台存证为结构化摘要（全文 ${charCount(md)} 字符，仅本地保留）`,
  }
}
