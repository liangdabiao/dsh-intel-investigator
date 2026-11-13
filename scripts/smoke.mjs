// 冒烟测试（离线）：假 RedFox 存证服务器 + 工具直调全链路 + 面板 API 全路由。
// 运行：npm run smoke
const { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const http = await import('node:http')

const tmp = mkdtempSync(join(tmpdir(), 'dsh-intel-smoke-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY
delete process.env.X_API_KEY

let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!cond) failed++
}

// ── 假 RedFox 存证接口 ──
let savedBodies = []
const srv = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const reply = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    // 鉴权必须在 X-API-KEY 头（3106 = key 放 body 的错误形态）
    if (req.headers['x-api-key'] !== 'ak_smoke') return reply({ code: 3106, msg: 'key 必须在 X-API-KEY 头' })
    const parsed = JSON.parse(body || '{}')
    // 与真实接口一致：body.content 限 2000 字符（超长返回 1003）
    const len = String(parsed.content ?? '').length
    if (len > 2000) return reply({ code: 1003, msg: `body.content 参数长度超过限制（${len}字符），最大允许2000字符` })
    savedBodies.push(parsed)
    reply({ code: 2000, data: 1, msg: '成功' })
  })
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
mkdirSync(join(tmp, 'intel-investigator'), { recursive: true })
writeFileSync(join(tmp, 'intel-investigator', 'settings.json'), JSON.stringify({ api_key: 'ak_smoke', api_base: `http://127.0.0.1:${srv.address().port}` }))

const REPORT = [
  '# 📈 A股情报调查报告：宁德时代',
  '',
  '## 1. 公司概况',
  '',
  '| 维度 | 内容 | 来源 | 可信度 |',
  '|:---|:---|:---|:---|',
  '| 主营业务 | 动力电池系统 | 巨潮+年报 | ✅ 已确认 |',
  '| 总市值 | 约 1.2 万亿 | 东方财富 | ✅ 已确认 |',
  '',
  '## 2. 财务表现',
  '',
  '| 指标 | 数值 | 来源 | 可信度 |',
  '|:---|:---|:---|:---|',
  '| 营收 | 4000亿+ | 东方财富+新浪 | ✅ 已确认 |',
  '| 海外产能 | 匈牙利工厂 2026 投产 | 🔍 行业媒体 | 🔍 单一来源 |',
  '',
  '## 3. 调查结论',
  '',
  '- **结论A** - 行业龙头地位稳固（多源确认）',
  '- **结论B** - 有传闻称扩产不及预期，❌ 已否定（巨潮公告反驳）',
  '- **结论C** - 新电池技术进展 ⚠️ 待确认',
  '',
].join('\n')

// 超长报告 fixture：真实接口限 2000 字符，必须走结构化摘要才能上传
const LONG_REPORT = [
  '# 📋 舆情事件调查报告：超长测试',
  '',
  '## 1. 事件概况',
  '',
  '背景描述。'.repeat(420),
  '',
  '## 2. 关键结论',
  '',
  '1. **结论甲** - 事实层面成立 ✅ 已确认',
  '2. **结论乙** - 仍有争议 ⚠️ 待确认',
  '',
  '## 3. 风险评估',
  '',
  '| 风险项 | 影响级别 |',
  '|:---|:---|',
  '| 政策风险 | 🔴 高 |',
].join('\n')

// ── 工具直调 ──
const { intelInvestigateTool } = await import('../src/host.js')
const call = async (args) => {
  try { return await intelInvestigateTool.execute(args, {}) } catch (e) { return { ok: false, summary: String(e?.message || e) } }
}
{
  const r = await call({ action: 'plan', mode: 'stock', subject: '宁德时代' })
  check('plan 生成三轮清单', r.ok && r.data.includes('三轮搜索执行计划') && r.data.includes('第1轮 · 基本面扫描'), '')
  check('plan 关键词带目标', r.data.includes('宁德时代 基本面 财报 主营业务') && r.data.includes('site:xueqiu.com 宁德时代'), '')
  check('plan 输出维度与可信度规范', r.data.includes('调查结论') && r.data.includes('✅'), '')
}
{
  const r = await call({ action: 'plan', mode: '帮我调查竞品', subject: 'Notion' })
  check('plan 自然语言映射模式', r.ok && r.data.includes('竞品情报调查'), '')
  const r2 = await call({ action: 'plan', mode: '完全不认识的词', subject: 'X' })
  check('plan 模式不明先追问', !r2.ok && r2.summary.includes('哪类调查'), r2.summary.slice(0, 50))
  const r3 = await call({ action: 'plan', subject: '' })
  check('plan 空目标报错', !r3.ok && r3.summary.includes('subject'), '')
}
let rid
{
  const r = await call({ action: 'save', mode: 'stock', subject: '宁德时代', reportMd: REPORT, tags: '电池,新能源' })
  check('save 存档+平台存证', r.ok && r.summary.includes('reportId=') && r.summary.includes('已存证 RedFox 平台'), r.summary.slice(0, 80))
  rid = r.summary.match(/reportId=([\p{L}\p{N}-]+)/u)?.[1]
  check('save 可信度统计', r.summary.includes('✅3') && r.summary.includes('🔍1') && r.summary.includes('❌1') && r.summary.includes('⚠️1'), r.summary.match(/可信度标注统计[^\。]*/)?.[0] || '')
  check('save 页脚带记录', (r.footer || '').includes('宁德时代') && (r.footer || '').includes(rid), (r.footer || '').slice(0, 90))
  check('远端收到存证（头鉴权）', savedBodies.length === 1 && savedBodies[0].source === '智能情报调查员-dsh' && savedBodies[0].title.includes('宁德时代'), JSON.stringify(savedBodies[0] || {}).slice(0, 60))
}
{
  const r = await call({ action: 'get', reportId: rid })
  check('get 读全文', r.ok && r.data.includes('A股情报调查报告') && r.data.includes('巨潮'), '')
  const r2 = await call({ action: 'get' })
  check('get 缺省最新', r2.ok && r2.data.includes('宁德时代'), '')
}
{
  const r = await call({ action: 'list' })
  check('list 档案行', r.ok && r.data.includes('宁德时代') && r.data.includes('已存证'), r.data.split('\n')[0] || '')
}
{
  // 超长报告：原样上传必被服务端拒（1003），必须自动摘要
  check('fixture 超过平台上限', LONG_REPORT.length > 2000, `len=${LONG_REPORT.length}`)
  const before = savedBodies.length
  const r = await call({ action: 'save', mode: 'event', subject: '超长报告测试', reportMd: LONG_REPORT, tags: '测试' })
  const sent = savedBodies[before]
  check('超长报告按摘要存证成功', r.ok && r.summary.includes('已存证 RedFox 平台') && r.summary.includes('结构化摘要'), r.summary.slice(0, 110))
  check('上传内容不超 2000 字符', Boolean(sent) && String(sent.content).length <= 2000, `len=${sent?.content?.length}`)
  check('摘要保留关键结论', Boolean(sent) && sent.content.includes('结论甲') && sent.content.includes('限 2000 字符'), '')
  const full = await call({ action: 'get' })
  check('本地仍保留全文', full.ok && full.data.includes('结论乙') && full.data.includes('事件概况'), '')
  check('list 标注摘要版', (await call({ action: 'list' })).data.includes('已存证·摘要'), '')
  check('页脚标注摘要版', (r.footer || '').includes('摘要版'), (r.footer || '').slice(0, 90))
}
{
  const bad = await call({ action: 'save', mode: 'stock', subject: 'X', reportMd: '太短' })
  check('save 短报告给结构提示', bad.ok && bad.summary.includes('结构提示'), bad.summary.slice(0, 80))
  const bad2 = await call({ action: 'plan', mode: 'stock' })
  check('plan 缺 subject 报错', !bad2.ok, '')
  const unknown = await call({ action: 'destroy' })
  check('未知 action 报错', !unknown.ok && unknown.summary.includes('只能是'), '')
}

// ── 面板 API（无 Key 环境：只存本地，如实标注） ──
delete process.env.X_API_KEY
const { registerApi } = await import('../lib/api.js')
const { Writable } = await import('node:stream')
const { EventEmitter } = await import('node:events')
const routes = {}
registerApi({ get: () => undefined, webServer: { register: (r) => { routes[r.path] = r.handler } } }, { config: {} })
const req = async (method, path, body) => {
  const reqObj = new EventEmitter()
  reqObj.method = method
  reqObj.url = `/intel-investigator${path}`
  reqObj.headers = body ? { 'content-type': 'application/json', host: 'x', origin: 'http://x' } : { host: 'x' }
  const chunks = []
  const resObj = new Writable({ write(c, _e, cb) { chunks.push(c); cb() } })
  resObj.statusCode = 0
  resObj.writeHead = (code) => { resObj.statusCode = code }
  const done = new Promise((resolve) => {
    const origEnd = resObj.end.bind(resObj)
    resObj.end = (...args) => { origEnd(...args); resolve({ status: resObj.statusCode, json: (() => { try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null } })(), text: () => Buffer.concat(chunks).toString('utf8') }) }
  })
  const p = routes['/intel-investigator'](reqObj, resObj)
  if (body) reqObj.emit('data', Buffer.from(JSON.stringify(body)))
  reqObj.emit('end')
  await p
  return done
}
{
  const cat = await req('GET', '/api/catalog')
  check('catalog：key/5模式/档案', cat.status === 200 && cat.json.has_key && cat.json.modes.length === 5 && cat.json.reports.length >= 1, `modes=${cat.json?.modes?.length}`)
  const one = await req('GET', `/api/reports/${rid}`)
  check('档案详情带 md', one.status === 200 && one.json.md?.includes('宁德时代'), '')
  const rep = await req('GET', `/api/reports/${rid}/report`)
  const html = rep.text ? rep.text() : ''
  check('报告渲染 HTML', rep.status === 200 && html.includes('<table') && html.includes('cred-已确认'), '')
  check('渲染无占位残留', !html.includes('[object Object]') && !html.includes('>undefined<'), '')
  // 面板直存（粘贴通道；settings 里有 ak_smoke → 假服务器可存，应上传成功）
  const created = await req('POST', '/api/reports', { mode: 'verify', subject: '测试验证消息', report_md: '# 信息验证报告\n\n**首发溯源** - 测试内容 ' + 'x'.repeat(60) + '\n- 结论 ⚠️ 待确认' })
  check('面板直存（平台存证成功）', created.status === 200 && created.json.ok && created.json.report.uploaded === true, `uploaded=${created.json?.report?.uploaded}`)
  const badMode = await req('POST', '/api/reports', { mode: 'nope', subject: 'x', report_md: 'x'.repeat(60) })
  check('未知 mode 400', badMode.status === 400, '')
  const del = await req('DELETE', `/api/reports/${created.json.report.report_id}`)
  check('面板删档案', del.status === 200 && del.json.ok, '')
}
{
  // 面板直存超长报告（自动上传开启）：应自动转摘要
  const direct = await req('POST', '/api/reports', { mode: 'event', subject: '面板超长直存', report_md: LONG_REPORT })
  check('面板直存超长报告（摘要存证）', direct.status === 200 && direct.json.report.uploaded === true && Boolean(direct.json.report.upload_note), `note=${direct.json?.report?.upload_note}`)
  // 关闭自动上传后只存本地，再用「重新上传」补传（必须同样走摘要）
  await req('POST', '/api/settings', { auto_upload: false })
  const local = await req('POST', '/api/reports', { mode: 'event', subject: '重传摘要测试', report_md: LONG_REPORT })
  const localId = local.json.report.report_id
  check('关闭自动上传时仅存本地', local.status === 200 && local.json.report.uploaded === false && !local.json.report.upload_note, '')
  const up = await req('POST', `/api/reports/${encodeURIComponent(localId)}/upload`)
  check('重传超长报告成功（摘要）', up.status === 200 && up.json.ok === true && up.json.summarized === true, up.json?.note || '')
  const reread = await req('GET', `/api/reports/${encodeURIComponent(localId)}`)
  check('重传后状态回写', reread.json.report.uploaded === true && Boolean(reread.json.report.upload_note), '')
  await req('DELETE', `/api/reports/${encodeURIComponent(localId)}`)
  await req('DELETE', `/api/reports/${encodeURIComponent(direct.json.report.report_id)}`)
  await req('POST', '/api/settings', { auto_upload: true })
}
{
  const st = await req('GET', '/api/settings')
  check('settings GET 尾号', st.status === 200 && st.json.settings.has_key && st.json.settings.key_tail.length === 6, String(st.json.settings.key_tail))
  const bad = await req('POST', '/api/settings', { api_key: 'no-prefix' })
  check('settings 非 ak_ 拒绝', bad.status === 400, '')
  const auto = await req('POST', '/api/settings', { auto_upload: false })
  check('settings auto_upload 可关', auto.status === 200 && auto.json.ok, '')
}
{
  const idx = readFileSync(new URL('../lab/index.html', import.meta.url), 'utf8')
  check('lab 引用 scheme/app', idx.includes('app.js') && idx.includes('scheme.js'), '')
  const appjs = readFileSync(new URL('../lab/app.js', import.meta.url), 'utf8')
  check('lab 消息类型与 client 对齐', appjs.includes('intel-investigator:refresh') && appjs.includes('intel-investigator:start-ok'), '')
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  check('client 消息类型一致', client.includes('intel-investigator:refresh') && client.includes('intel-investigator:start-ok'), '')
  const skill = readFileSync(new URL('../skills/intel-investigator/SKILL.md', import.meta.url), 'utf8')
  check('技能快照带 references', skill.includes('investigation-templates.md'), '')
}

srv.close()
rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
