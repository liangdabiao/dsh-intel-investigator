// 报告渲染：调查档案 Markdown → HTML（面板查看器用）。带表格支持的简易渲染器。
import { esc } from './html.js'
import { MARKS } from './credibility.js'

const MD_INLINE_LINK = /\[([^\]]+)\]\(([^)]+)\)/g
const MD_BOLD = /\*\*(.+?)\*\*/g
const MD_CODE = /`([^`]+)`/g

function mdInline(text) {
  let t = esc(text)
  t = t.replace(MD_CODE, (_m, code) => `<code>${code}</code>`)
  t = t.replace(MD_INLINE_LINK, (_m, label, url) => `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`)
  t = t.replace(MD_BOLD, (_m, body) => `<strong>${body}</strong>`)
  // 可信度标注徽章
  for (const { mark, label } of MARKS) {
    t = t.replaceAll(mark, `<span class="cred cred-${label}">${mark}${label}</span>`)
  }
  return t
}

export function mdToHtml(text) {
  const lines = String(text ?? '').split('\n')
  const out = []
  let inList = false
  let listTag = null
  let inTable = false
  let inCode = false
  const closeList = () => { if (inList) { out.push(`</${listTag}>`); inList = false; listTag = null } }
  const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false } }
  for (const line of lines) {
    const stripped = line.trim()
    if (inCode) {
      if (/^```/.test(stripped)) { inCode = false; out.push('</pre>') } else out.push(esc(line))
      continue
    }
    if (/^```/.test(stripped)) { closeList(); closeTable(); inCode = true; out.push('<pre class="code">'); continue }
    // 表格行
    if (/^\|.*\|$/.test(stripped)) {
      const cells = stripped.slice(1, -1).split('|').map((c) => c.trim())
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue // 分隔行
      if (!inTable) {
        closeList()
        out.push('<table class="md-table"><thead>')
        out.push(`<tr>${cells.map((c) => `<th>${mdInline(c)}</th>`).join('')}</tr></thead><tbody>`)
        inTable = true
      } else {
        out.push(`<tr>${cells.map((c) => `<td>${mdInline(c)}</td>`).join('')}</tr>`)
      }
      continue
    }
    closeTable()
    if (stripped.startsWith('#### ')) { closeList(); out.push(`<h5>${mdInline(stripped.slice(5))}</h5>`) }
    else if (stripped.startsWith('### ')) { closeList(); out.push(`<h4>${mdInline(stripped.slice(4))}</h4>`) }
    else if (stripped.startsWith('## ')) { closeList(); out.push(`<h3>${mdInline(stripped.slice(3))}</h3>`) }
    else if (stripped.startsWith('# ')) { closeList(); out.push(`<h2>${mdInline(stripped.slice(2))}</h2>`) }
    else if (stripped === '---') { closeList(); out.push('<hr>') }
    else if (stripped.startsWith('- ')) {
      if (!inList || listTag !== 'ul') { closeList(); out.push('<ul>'); inList = true; listTag = 'ul' }
      out.push(`<li>${mdInline(stripped.slice(2))}</li>`)
    } else if (/^\d+\.\s/.test(stripped)) {
      if (!inList || listTag !== 'ol') { closeList(); out.push('<ol>'); inList = true; listTag = 'ol' }
      out.push(`<li>${mdInline(stripped.replace(/^\d+\.\s/, ''))}</li>`)
    } else if (!stripped) {
      closeList()
      out.push('')
    } else {
      closeList()
      out.push(`<p>${mdInline(stripped)}</p>`)
    }
  }
  closeList()
  closeTable()
  if (inCode) out.push('</pre>')
  return out.join('\n')
}

const REPORT_CSS = `
  body{font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#262626;line-height:1.75;max-width:860px;margin:0 auto;padding:40px 28px;background:#fafaf8}
  h2{font-size:22px;font-weight:600;border-bottom:2px solid #0a6cf5;padding-bottom:8px;margin:36px 0 16px}
  h3{font-size:17px;font-weight:600;margin:28px 0 12px}
  h4{font-size:15px;font-weight:600;margin:20px 0 10px}
  table{border-collapse:collapse;width:100%;margin:14px 0;background:#fff;font-size:13px}
  th,td{border:1px solid #e0e0de;padding:7px 10px;text-align:left;vertical-align:top}
  th{background:#f0f4fa;font-weight:600}
  tr:hover td{background:#f6f8fb}
  ul,ol{padding-left:24px;margin:10px 0}
  li{margin:4px 0}
  code{background:#eef1f5;padding:1px 5px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
  pre.code{background:#1b1b1a;color:#f2f2f0;padding:14px 16px;overflow:auto;font-size:12px;line-height:1.6}
  hr{border:0;border-top:1px solid #d4d4d2;margin:28px 0}
  a{color:#0a6cf5}
  .cred{display:inline-block;padding:0 6px;font-size:12px;font-weight:600;white-space:nowrap}
  .cred-已确认{color:#2e7d32;background:#eef6ee}
  .cred-待确认{color:#b45309;background:#fffbeb}
  .cred-已否定{color:#dc2626;background:#fef2f2}
  .cred-单一来源{color:#7c5cbf;background:#f3effa}
  @media print{body{background:#fff;padding:0}}
`

export function formatReportHtml(meta, reportMd) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || meta.subject || '调查报告')}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
${mdToHtml(reportMd)}
</body>
</html>`
}
