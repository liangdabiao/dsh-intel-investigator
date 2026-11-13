import test from 'node:test'
import assert from 'node:assert/strict'
import { platformContent, charCount, PLATFORM_CONTENT_LIMIT } from '../lib/platformContent.js'

const META = {
  title: '舆情事件调查：黄仁勋',
  subject: '黄仁勋',
  modeLabel: '舆情事件调查',
  credibility: { confirmed: 23, pending: 7, refuted: 1, single: 5, total_marks: 36 },
}

const longReport = [
  '# 📋 舆情事件调查报告',
  '',
  '## 1. 事件概况',
  '',
  '| 维度 | 内容 |',
  '|:---|:---|',
  '| 事件概述 | ' + '英伟达创始人辞职风波，涉及婚外情指控与国安疑云。'.repeat(20) + ' |',
  '',
  '## 2. 事件时间线',
  '',
  '| 时间 | 事件 | 可信度 |',
  '|:---|:---|:---|',
  ...Array.from({ length: 30 }, (_, i) => `| 11月${i + 1}日 | 时间线事件第 ${i + 1} 条，含来源与可信度标注 | ✅ A级 |`),
  '',
  '## 3. 关键信息验证',
  '',
  '| 待验证信息 | 验证结果 | 支持来源 |',
  '|:---|:---|:---|',
  '| 已辞去CEO | ✅ 已确认 | 官方公告 |',
  '| 疑似间谍 | ⚠️ 待确认 | 媒体报道 |',
  '',
  '## 4. 关键结论',
  '',
  '1. 事实层面已经落地的是辞职，不是定罪。',
  '2. 这是一次私德事件被国安化的典型升级。',
  '3. 最需要跟踪的三个变量已列明。',
  '',
  '## 5. 风险评估',
  '',
  '| 风险项 | 影响级别 | 说明 |',
  '|:---|:---|:---|',
  '| 政策与地缘风险 | 🔴 高 | 被嵌入出口管制议程 |',
  '',
  '---',
  '',
  '*数据来源：多源交叉调查*',
].join('\n')

test('短报告原样上传，不做摘要', () => {
  const short = '# 报告\n\n- 结论 ✅ 已确认'
  const out = platformContent(short, META)
  assert.equal(out.content, short)
  assert.equal(out.summarized, false)
  assert.equal(out.note, '')
})

test('长报告转结构化摘要且不超上限', () => {
  assert.ok(charCount(longReport) > PLATFORM_CONTENT_LIMIT, 'fixture 必须超长')
  const out = platformContent(longReport, META)
  assert.equal(out.summarized, true)
  assert.ok(charCount(out.content) <= PLATFORM_CONTENT_LIMIT, `实际 ${charCount(out.content)} 字符`)
  assert.ok(out.content.includes('关键结论'))
  assert.ok(out.content.includes('事实层面已经落地的是辞职'))
  assert.ok(out.content.includes('关键信息验证'))
  assert.ok(out.content.includes('✅23 ⚠️7 ❌1 🔍5'))
  assert.ok(out.content.includes('全文 ' + charCount(longReport) + ' 字符'))
  assert.ok(out.note.includes('结构化摘要'))
})

test('抽不出章节时退回正文摘录', () => {
  const plain = '这是一段没有小标题的超长正文。'.repeat(400)
  assert.ok(charCount(plain) > PLATFORM_CONTENT_LIMIT)
  const out = platformContent(plain, META)
  assert.ok(charCount(out.content) <= PLATFORM_CONTENT_LIMIT)
  assert.ok(out.content.includes('正文摘录'))
})

test('无换行的超长单行也能压到上限内', () => {
  const oneLine = 'X'.repeat(9000)
  const out = platformContent(oneLine, META)
  assert.ok(charCount(out.content) <= PLATFORM_CONTENT_LIMIT)
})

test('meta 缺字段时不产出 undefined 字样', () => {
  const out = platformContent(longReport, {})
  assert.ok(charCount(out.content) <= PLATFORM_CONTENT_LIMIT)
  assert.ok(!out.content.includes('undefined'))
  assert.ok(!out.content.includes('null'))
})
