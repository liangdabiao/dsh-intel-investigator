// 可信度标注统计：从报告 Markdown 提取 ✅⚠️❌🔍 四类标注（行级计数，行内多标按一次算）。
const MARKS = [
  { mark: '✅', key: 'confirmed', label: '已确认' },
  { mark: '⚠️', key: 'pending', label: '待确认' },
  { mark: '❌', key: 'refuted', label: '已否定' },
  { mark: '🔍', key: 'single', label: '单一来源' },
]

export function tallyCredibility(reportMd) {
  const text = String(reportMd ?? '')
  const lines = text.split('\n')
  const tally = { confirmed: 0, pending: 0, refuted: 0, single: 0, total_marks: 0 }
  for (const mark of MARKS) {
    tally[mark.key] = lines.filter((l) => l.includes(mark.mark)).length
    tally.total_marks += tally[mark.key]
  }
  return tally
}

// 报告结构完整性检查：按模式的输出维度做软校验（缺维度给 warning，不拒绝——上游未强约束）
export function checkReportStructure(reportMd, modeKey) {
  const text = String(reportMd ?? '')
  const problems = []
  if (text.trim().length < 200) problems.push('报告内容过短（<200 字符），调查可能不完整')
  if (!/#/.test(text)) problems.push('报告缺少 Markdown 标题结构')
  if (!tallyCredibility(text).total_marks) problems.push('报告没有任何可信度标注（✅⚠️❌🔍）——按可信度标注规范补齐')
  return { ok: problems.length === 0, problems }
}

export { MARKS }
