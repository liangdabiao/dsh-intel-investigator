import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-intel-store-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY

const { saveReport, getMeta, getReportMd, listReports, publicMeta, deleteReport, getSettings, saveSettings, resolveReport, updateUploadState } = await import('../lib/store.js')

test.after(() => { rmSync(tmp, { recursive: true, force: true }) })

const mdFixture = '# 报告：宁德时代\n\n主营动力电池 ✅ 已确认\n扩产传闻 ⚠️ 待确认'

test('saveReport/listReports/getMeta 全链路（可信度自动统计）', () => {
  const meta = saveReport({
    mode: 'stock', modeLabel: 'A股情报调查', subject: '宁德时代', title: 'A股情报调查报告：宁德时代',
    reportMd: mdFixture, tags: ['电池'], uploaded: true,
  })
  assert.ok(meta.report_id.includes('-宁德时代'))
  assert.equal(meta.credibility.confirmed, 1)
  assert.equal(meta.credibility.pending, 1)
  const got = getMeta(meta.report_id)
  assert.equal(got.mode, 'stock')
  assert.equal(got.uploaded, true)
  const md = getReportMd(meta.report_id)
  assert.ok(md.includes('宁德时代'))
  const pub = publicMeta(got)
  assert.equal(pub.has_report, undefined) // publicMeta 不含该字段
  assert.equal(pub.uploaded, true)
  const list = listReports()
  assert.equal(list.length, 1)
})

test('settings：merge', () => {
  saveSettings({ api_key: 'ak_test', proxy_url: '' })
  assert.equal(getSettings().api_key, 'ak_test')
  saveSettings({ auto_upload: false })
  assert.equal(getSettings().auto_upload, false)
  assert.equal(getSettings().api_key, 'ak_test')
})

test('listReports：按 mode 过滤', () => {
  saveReport({ mode: 'verify', modeLabel: '信息交叉验证', subject: '某消息', title: '验证：某消息', reportMd: mdFixture })
  assert.equal(listReports({ mode: 'verify' }).length, 1)
  assert.equal(listReports({ mode: 'stock' }).length, 1)
  assert.equal(listReports().length, 2)
})

test('resolveReport：缺省最新 + 不存在抛错', () => {
  const latest = resolveReport(undefined)
  assert.equal(latest.mode, 'verify')
  assert.equal(resolveReport(latest.report_id).report_id, latest.report_id)
  assert.throws(() => resolveReport('not-exist'), /不存在/)
})

test('updateUploadState', () => {
  const meta = listReports({ mode: 'verify' })[0]
  updateUploadState(meta.report_id, { uploaded: true })
  assert.equal(getMeta(meta.report_id).uploaded, true)
  updateUploadState(meta.report_id, { uploaded: false, uploadError: 'x' })
  assert.equal(getMeta(meta.report_id).upload_error, 'x')
})

test('upload_note：摘要版状态可存取', () => {
  const meta = saveReport({
    mode: 'event', modeLabel: '舆情事件调查', subject: '摘要测试', title: '舆情事件调查：摘要测试',
    reportMd: mdFixture, uploaded: true, uploadNote: '平台存证为结构化摘要（全文 7648 字符，仅本地保留）',
  })
  assert.ok(getMeta(meta.report_id).upload_note.includes('结构化摘要'))
  assert.ok(publicMeta(getMeta(meta.report_id)).upload_note.includes('结构化摘要'))
  updateUploadState(meta.report_id, { uploaded: true, uploadNote: '' })
  assert.equal(getMeta(meta.report_id).upload_note, '')
  deleteReport(meta.report_id)
})

test('deleteReport', () => {
  const meta = listReports({ mode: 'verify' })[0]
  assert.ok(existsSync(join(tmp, 'intel-investigator', 'reports', meta.report_id)))
  assert.deepEqual(deleteReport(meta.report_id), { ok: true })
  assert.equal(listReports({ mode: 'verify' }).length, 0)
  assert.equal(deleteReport(meta.report_id).ok, false)
})
