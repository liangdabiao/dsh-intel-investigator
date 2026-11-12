import test from 'node:test'
import assert from 'node:assert/strict'
import { tallyCredibility, checkReportStructure } from '../lib/credibility.js'
import { mdToHtml, formatReportHtml } from '../lib/report.js'

test('tallyCredibility：行级计数（行内多标按一次）', () => {
  const md = [
    '结论A ✅ 已确认',
    '结论B ✅ 多源一致',
    '结论C ⚠️ 待确认',
    '结论D ❌ 已否定',
    '结论E 🔍 单一来源',
    '无标注行',
  ].join('\n')
  const t = tallyCredibility(md)
  assert.equal(t.confirmed, 2)
  assert.equal(t.pending, 1)
  assert.equal(t.refuted, 1)
  assert.equal(t.single, 1)
  assert.equal(t.total_marks, 5)
})

test('tallyCredibility：空输入', () => {
  assert.equal(tallyCredibility('').total_marks, 0)
  assert.equal(tallyCredibility(null).total_marks, 0)
})

test('checkReportStructure：短/无标注报告给提示', () => {
  const short = checkReportStructure('太短', 'stock')
  assert.equal(short.ok, false)
  assert.ok(short.problems.some((p) => p.includes('过短')))
  const noMark = checkReportStructure('# 报告\n\n' + '正文内容'.repeat(50), 'stock')
  assert.ok(noMark.problems.some((p) => p.includes('可信度标注')))
  const good = checkReportStructure('# 报告\n\n' + '正文内容'.repeat(50) + '\n\n结论 ✅ 已确认', 'stock')
  assert.equal(good.ok, true)
})

test('mdToHtml：表格/标题/标注徽章', () => {
  const md = [
    '# 调查报告',
    '',
    '| 指标 | 数值 | 可信度 |',
    '|:---|:---|:---|',
    '| 营收 | 4000亿 | ✅ 已确认 |',
    '',
    '- **要点** - 带 [链接](https://example.com)',
  ].join('\n')
  const html = mdToHtml(md)
  assert.ok(html.includes('<table') && html.includes('<th>指标</th>'))
  assert.ok(html.includes('cred-已确认'))
  assert.ok(html.includes('<strong>要点</strong>'))
  assert.ok(html.includes('href="https://example.com"'))
  assert.ok(html.includes('<h2>'))
})

test('formatReportHtml：完整页面', () => {
  const meta = { title: 'A股情报调查报告：X', subject: 'X', mode_label: 'A股情报调查' }
  const html = formatReportHtml(meta, '# 标题\n\n内容 ✅ 已确认')
  assert.ok(html.includes('<!doctype html>'))
  assert.ok(html.includes('A股情报调查报告：X'))
  assert.ok(!html.includes('[object Object]'))
})
