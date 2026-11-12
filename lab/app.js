// A股情报调查员 · 面板逻辑：档案室（模式筛选 + 报告列表）/ 档案详情（报告渲染 + 存证状态 + 重新上传）/ 设置。
// 调查执行走 agent 对话：嵌入 dsh → postMessage（client.js startSession，有 start-ok 握手）；
// 独立浏览器预览 → 复制草稿。面板支持粘贴 Markdown 报告直存（补录通道）。
(() => {
  const $app = document.getElementById('app')
  const $toast = document.getElementById('toast')
  const EMBEDDED = (() => { try { return window.parent !== window } catch { return false } })()

  const state = { catalog: null, mode: '' }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  async function api(path) {
    const res = await fetch(`/intel-investigator${path}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(body.error || `HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    return body
  }
  async function apiPost(path, payload) {
    const res = await fetch(`/intel-investigator${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }
  async function apiDelete(path) {
    const res = await fetch(`/intel-investigator${path}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }

  let toastTimer = null
  function toast(msg, isErr) {
    $toast.textContent = msg
    $toast.className = `toast show${isErr ? ' err' : ''}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { $toast.className = 'toast' }, 2600)
  }
  function copyFallback(prompt, reason) {
    navigator.clipboard?.writeText(prompt).then(
      () => toast(`${reason}，草稿已复制到剪贴板——请粘贴到 dsh 对话`, true),
      () => toast(`${reason}，复制也失败了`, true))
  }

  const ICONS = {
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 .33-1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    trash: '<path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    ext: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v5H5V6h5"/>',
    back: '<path d="M14 6l-6 6 6 6"/>',
    play: '<path d="M8 5l11 7-11 7V5z"/>',
    upload: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  }
  const ic = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`

  const CRED = [
    ['confirmed', '✅', '已确认', 'ok'],
    ['pending', '⚠️', '待确认', 'warn'],
    ['refuted', '❌', '已否定', 'bad'],
    ['single', '🔍', '单一来源', 'single'],
  ]
  function credChips(cred) {
    if (!cred || !cred.total_marks) return '<span class="cred-chip">无标注</span>'
    return CRED.map(([k, icon, label, cls]) =>
      `<span class="cred-chip ${cls}">${icon}${label} ${cred[k] ?? 0}</span>`).join('')
  }

  async function loadCatalog() {
    state.catalog = await api('/api/catalog')
    renderNavCounts()
    renderRailFoot()
    return state.catalog
  }
  function renderNavCounts() {
    const c = state.catalog
    if (!c) return
    document.querySelectorAll('[data-count]').forEach((n) => {
      if (n.dataset.count === 'reports') n.textContent = (c.reports || []).length
    })
  }
  function renderRailFoot() {
    const c = state.catalog
    if (!c) return
    const latest = (c.reports || [])[0]
    document.getElementById('rail-foot').innerHTML =
      `<div class="v-head">INTEL DESK v${esc(c.version)}</div>` +
      `<div class="v-row"><span>API Key</span><span>${c.has_key ? '已配置' : '未配置'}</span></div>` +
      `<div class="v-row"><span>档案数</span><span>${(c.reports || []).length}</span></div>` +
      `<div class="v-row"><span>最近调查</span><span>${esc(latest?.subject || '—')}</span></div>`
  }

  // ---------- 送 prompt 到 agent 对话 ----------
  function sendAgentPrompt(prompt, okMsg = '已在宿主开新对话——agent 处理中') {
    if (!EMBEDDED) {
      navigator.clipboard?.writeText(prompt).then(
        () => toast('草稿已复制——粘贴到 dsh 对话即可开始'),
        () => copyFallback(prompt, '复制失败'))
      return
    }
    let done = false
    const cleanup = () => { done = true; clearTimeout(timer); removeEventListener('message', onMsg) }
    const onMsg = (e) => {
      if (e.origin !== location.origin) return
      if (e.data?.type === 'intel-investigator:start-ok') { if (!done) { cleanup(); toast(okMsg) } }
      else if (e.data?.type === 'intel-investigator:start-failed') { if (!done) { cleanup(); toast(`没能开新对话：${e.data.message || ''}`, true) } }
    }
    const timer = setTimeout(() => { if (!done) { cleanup(); copyFallback(prompt, '未收到宿主确认') } }, 1500)
    addEventListener('message', onMsg)
    parent.postMessage({ type: 'intel-investigator:refresh', prompt }, location.origin)
  }

  function investigatePrompt(mode, subject) {
    return [
      `请做一次「${subject}」的情报调查（模式：${mode}）：`,
      `1. intel_investigate(action="plan", mode="${mode}", subject="${subject}") 拿三轮搜索执行清单`,
      '2. 用你可用的搜索工具逐轮执行（每轮结束落关键发现+来源+可信度标注 ✅⚠️❌🔍）',
      '3. 按 intel-investigator 技能的模板撰写结构化调查报告',
      `4. intel_investigate(action="save", mode="${mode}", subject="${subject}", reportMd=…) 存证，然后完整输出报告（含可信度标注），末尾逐字附页脚。`,
    ].join('\n')
  }

  // ---------- 视图：档案室 ----------
  function viewHome() {
    const c = state.catalog
    const reports = c.reports || []
    const modeOptions = (c.modes || []).map((m) =>
      `<option value="${esc(m.key)}">${esc(m.label)} · ${esc(m.purpose)}</option>`).join('')
    const cur = state.mode
    const shown = cur ? reports.filter((r) => r.mode === cur) : reports
    const chips = [`<button class="mode-chip${cur === '' ? ' on' : ''}" data-mode="">全部 <span class="n">${reports.length}</span></button>`]
      .concat((c.modes || []).map((m) =>
        `<button class="mode-chip${cur === m.key ? ' on' : ''}" data-mode="${esc(m.key)}">${esc(m.label)} <span class="n">${c.by_mode?.[m.key] ?? 0}</span></button>`))
      .join('')
    return `
      <header class="head">
        <span class="eyebrow">INTEL INVESTIGATOR</span>
        <div class="head-row">
          <h1>情报<strong>调查员</strong></h1>
          <div class="actions"><button class="btn accent" id="new-flow">${ic('spark')}发起调查</button></div>
        </div>
        <p>五种调查模式（A股 / 竞品 / 舆情 / 人物 / 信息交叉验证）· 三轮搜索方法论 · 可信度标注（✅⚠️❌🔍）。调查由 agent 对话执行，报告在这里归档与存证。</p>
      </header>
      <section class="sec" style="margin-top:0">
        <div class="sec-head"><span class="num">01</span><h2>发起新调查</h2></div>
        <div class="form" style="max-width:760px">
          <div class="field"><label>MODE · 调查模式</label>
            <select id="f-mode">${modeOptions}</select></div>
          <div class="field"><label>SUBJECT · 调查目标（公司/竞品/事件/人物/待验证信息）</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="f-subject" placeholder="如：宁德时代 / Notion / XX融资消息" style="flex:1;min-width:220px">
              <button class="btn accent" id="f-go">${ic('play')}去对话调查</button>
            </div>
            <div class="hint">agent 拿到计划后会用搜索工具三轮调查并写报告；报告自动存进本档案室（配置 Key 后同时存证 RedFox 平台）。</div>
          </div>
        </div>
      </section>
      <section class="sec">
        <div class="sec-head"><span class="num">02</span><h2>调查档案</h2></div>
        <div class="mode-chips">${chips}</div>
        ${shown.length ? `<div class="cards">${shown.map((r) => `
          <a class="card" href="#/r/${encodeURIComponent(r.report_id)}">
            <div class="c-top">
              <div class="c-title">${esc(r.title)}</div>
              ${r.uploaded ? '<span class="chip done">已存证</span>' : r.upload_error ? '<span class="chip bad">仅本地</span>' : '<span class="chip">本地</span>'}
            </div>
            <div class="c-sub">${esc(r.mode_label)} · ${r.bytes >= 1024 ? (r.bytes / 1024).toFixed(1) + ' KB' : r.bytes + ' B'}</div>
            <div class="c-sub" style="margin-top:6px"><span class="cred-chips">${credChips(r.credibility)}</span></div>
            <div class="c-foot"><span>${esc(String(r.saved_at).slice(0, 16).replace('T', ' '))}</span>${(r.tags || []).length ? `<span style="margin-left:auto">${esc(r.tags.join(' / '))}</span>` : ''}</div>
          </a>`).join('')}</div>`
        : `<div class="empty"><div class="e-title">${cur ? '该模式下还没有档案' : '还没有调查档案'}</div><p>填调查目标点「去对话调查」——agent 三轮调查写完报告会自动归档到这里。</p></div>`}
      </section>`
  }

  // ---------- 视图：档案详情 ----------
  async function viewReport(id) {
    let data
    try {
      data = await api(`/api/reports/${encodeURIComponent(id)}`)
    } catch (e) {
      const netDown = !e.status
      return `<a class="back" href="#/">${ic('back')} 档案</a><div class="empty"><div class="e-title">${netDown ? '面板服务连接失败' : '调查档案不存在'}</div><p>${netDown ? '开发预览：DSH_HOME=<数据目录> node scripts/devserver.mjs' : esc(e.message)}</p></div>`
    }
    const meta = data.report
    const cred = meta.credibility || {}
    return `
      <a class="back" href="#/">${ic('back')} 档案</a>
      <div class="detail-head">
        <div>
          <h1>${esc(meta.title)}</h1>
          <div class="c-sub" style="margin-top:4px">${esc(meta.mode_label)} · 调查目标 ${esc(meta.subject)} · 归档于 ${esc(String(meta.saved_at).slice(0, 16).replace('T', ' '))}${meta.uploaded ? ' · 已存证 RedFox 平台' : meta.upload_error ? ` · <span style="color:var(--warn)">存证未完成：${esc(meta.upload_error)}</span>` : ' · 本地档案'}</div>
        </div>
        <div class="actions">
          ${meta.uploaded ? '' : `<button class="btn accent" id="re-upload">${ic('upload')}重新上传</button>`}
          <button class="btn ghost" data-del-report="${esc(id)}" title="删除档案">${ic('trash')}</button>
        </div>
      </div>
      <div class="pstats">
        <div class="pstat" style="--pc:var(--ok)"><div class="p-name">✅ 已确认</div><div class="p-num">${cred.confirmed ?? 0}</div><div class="p-sub">2+ 独立来源一致</div></div>
        <div class="pstat" style="--pc:var(--warn)"><div class="p-name">⚠️ 待确认</div><div class="p-num">${cred.pending ?? 0}</div><div class="p-sub">来源说法矛盾</div></div>
        <div class="pstat" style="--pc:var(--miss)"><div class="p-name">❌ 已否定</div><div class="p-num">${cred.refuted ?? 0}</div><div class="p-sub">权威信源反驳</div></div>
        <div class="pstat" style="--pc:#7c5cbf"><div class="p-name">🔍 单一来源</div><div class="p-num">${cred.single ?? 0}</div><div class="p-sub">需进一步验证</div></div>
      </div>
      ${(meta.tags || []).length ? `<div class="mode-chips">${meta.tags.map((t) => `<span class="mode-chip">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="block">
        <div class="block-head"><h3>调查报告</h3><span class="mono">REPORT.MD</span>
          <div class="actions"><button class="btn ghost" id="open-raw">${ic('ext')}独立页打开</button></div>
        </div>
        <div class="report-body" id="report-body"><div class="loading">LOADING…</div></div>
      </div>`
  }

  function bindReport(id, data) {
    // 报告渲染走独立 iframe（report.html 自带样式），不污染面板样式
    const body = document.getElementById('report-body')
    if (body) {
      const frame = document.createElement('iframe')
      frame.src = `/intel-investigator/api/reports/${encodeURIComponent(id)}/report`
      frame.title = '调查报告'
      frame.style.cssText = 'width:100%;min-height:720px;border:0;background:var(--paper);display:block'
      body.innerHTML = ''
      body.appendChild(frame)
    }
    const del = document.querySelector('[data-del-report]')
    if (del) del.onclick = async () => {
      if (!confirm('删除这份调查档案？（报告一并删除，不可恢复）')) return
      try {
        await apiDelete(`/api/reports/${encodeURIComponent(id)}`)
        toast('已删除')
        location.hash = '#/'
      } catch (e) { toast(e.message, true) }
    }
    const up = document.getElementById('re-upload')
    if (up) up.onclick = async () => {
      up.disabled = true
      try {
        await apiPost(`/api/reports/${encodeURIComponent(id)}/upload`)
        toast('已存证 RedFox 平台')
        location.reload()
      } catch (e) { toast(e.message, true); up.disabled = false }
    }
    const raw = document.getElementById('open-raw')
    if (raw) raw.onclick = () => openReportView(id)
  }

  // ---------- 报告查看器（覆盖层，避免依赖 window.open） ----------
  async function openReportView(id) {
    document.getElementById('report-view')?.remove()
    const el = document.createElement('div')
    el.id = 'report-view'
    el.className = 'report-view'
    el.innerHTML = `
      <div class="rv-panel" role="dialog" aria-modal="true" aria-label="调查报告">
        <div class="rv-bar">
          <div class="rv-title">${ic('ext')}<span>调查报告（独立页可打印/导 PDF）</span></div>
          <div class="rv-actions">
            <button class="btn ghost" id="rv-close">关闭</button>
          </div>
        </div>
        <div class="rv-body"><div class="loading">LOADING…</div></div>
      </div>`
    document.body.appendChild(el)
    const body = el.querySelector('.rv-body')
    const close = () => {
      removeEventListener('keydown', onKey)
      el.remove()
    }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    addEventListener('keydown', onKey)
    el.querySelector('#rv-close').onclick = close
    el.addEventListener('click', (e) => { if (e.target === el) close() })
    try {
      const res = await fetch(`/intel-investigator/api/reports/${encodeURIComponent(id)}/report`, { cache: 'no-store' })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.error || `HTTP ${res.status}`)
      }
      const html = await res.text()
      const frame = document.createElement('iframe')
      frame.className = 'rv-frame'
      frame.title = '调查报告'
      frame.srcdoc = html
      body.innerHTML = ''
      body.appendChild(frame)
    } catch (e) {
      body.innerHTML = `<div class="empty"><div class="e-title">报告打不开</div><p>${esc(e.message)}</p></div>`
    }
  }

  // ---------- 视图：设置 ----------
  function viewSettings() {
    return `
      <a class="back" href="#/">${ic('back')} 档案</a>
      <header class="head">
        <span class="eyebrow">SETTINGS</span>
        <h1>设<strong>置</strong></h1>
        <p>RedFox API Key 用于把调查报告存证到红狐平台（本地归档始终可用）。这里保存的 Key 优先于环境变量，低于插件配置。</p>
      </header>
      <div class="form">
        <div class="field"><label>API KEY · RedFox API Key（ak_ 开头）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-key" placeholder="ak_…" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-key-save">保存 Key</button>
          </div>
          <div class="hint" id="s-key-hint">…</div>
          <div class="hint">获取：<a href="https://redfox.hk/settings/api-keys?source=github" target="_blank" rel="noreferrer">redfox.hk/settings/api-keys ↗</a>。保存在本机 dsh 数据目录，不上传。</div>
        </div>
        <div class="field"><label>AUTO UPLOAD · 报告自动存证平台（面板直存通道）</label>
          <div class="checks" id="s-auto-wrap">
            <label><input type="checkbox" id="s-auto" checked> 存盘后自动上传（未配 Key 时只存本地）</label>
          </div>
        </div>
        <div class="field"><label>PROXY · HTTP(S) 代理（访问 redfox.hk 走代理时填；清空 = 直连）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-proxy" placeholder="http://127.0.0.1:7890" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-proxy-save">保存代理</button>
          </div>
        </div>
        <div class="field"><label>API BASE · 接口地址（测试/自建网关用，默认 https://redfox.hk）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-base" placeholder="https://redfox.hk" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-base-save">保存地址</button>
          </div>
        </div>
      </div>`
  }

  async function bindSettings() {
    async function refreshSettings() {
      try {
        const { settings } = await api('/api/settings')
        const keyHint = document.getElementById('s-key-hint')
        if (keyHint) keyHint.textContent = settings.has_key
          ? `已配置（…${settings.key_tail || '******'}${settings.from_env ? '，其中环境变量可用' : ''}）。重新输入会覆盖。`
          : '未配置。'
        const inp = document.getElementById('s-key')
        if (inp && document.activeElement !== inp) inp.placeholder = settings.has_key ? `已配置（…${settings.key_tail}），输入新值覆盖` : 'ak_…'
        const proxy = document.getElementById('s-proxy')
        if (proxy && document.activeElement !== proxy) proxy.value = settings.proxy_url || ''
        const base = document.getElementById('s-base')
        if (base && document.activeElement !== base) base.value = settings.api_base || ''
        const auto = document.getElementById('s-auto')
        if (auto) auto.checked = settings.auto_upload !== false
      } catch { /* 宿主未就绪 */ }
    }
    await refreshSettings()
    const bind = (id, payload) => {
      const btn = document.getElementById(id)
      if (!btn) return
      btn.onclick = async () => {
        try {
          const input = btn.parentElement.querySelector('input')
          await apiPost('/api/settings', payload(input.value.trim()))
          toast('设置已保存')
          await refreshSettings()
          loadCatalog().catch(() => {})
        } catch (e) { toast(e.message, true) }
      }
    }
    bind('s-key-save', (v) => ({ api_key: v }), )
    bind('s-proxy-save', (v) => ({ proxy_url: v }))
    bind('s-base-save', (v) => ({ api_base: v }))
    const auto = document.getElementById('s-auto')
    if (auto) auto.onchange = async () => {
      try {
        await apiPost('/api/settings', { auto_upload: auto.checked })
        toast('设置已保存')
      } catch (e) { toast(e.message, true) }
    }
  }

  // ---------- 渲染辅助 ----------
  function bindCommon() {
    const go = document.getElementById('f-go')
    if (go) go.onclick = () => {
      const mode = document.getElementById('f-mode')?.value || 'stock'
      const subject = document.getElementById('f-subject')?.value.trim() || ''
      if (!subject) { toast('先填调查目标', true); return }
      sendAgentPrompt(investigatePrompt(mode, subject), '已在宿主开新对话——agent 三轮调查后归档到这里')
    }
    const newFlow = document.getElementById('new-flow')
    if (newFlow) newFlow.onclick = () => {
      sendAgentPrompt([
        '请发起一次情报调查（A股情报调查员）：',
        '1. 先问我要调查什么（公司/竞品/热点事件/人物/待验证信息）',
        '2. intel_investigate(action="plan", mode=…, subject=…) 生成三轮搜索清单',
        '3. 用可用的搜索工具逐轮执行，按 intel-investigator 技能模板写报告',
        '4. intel_investigate(action="save", reportMd=…) 存证后完整输出（含可信度标注与页脚）。',
      ].join('\n'), '已在宿主开新对话——agent 会先问你调查什么')
    }
    document.querySelectorAll('.mode-chip[data-mode]').forEach((b) => {
      b.onclick = () => {
        state.mode = b.dataset.mode || ''
        render().catch(() => {})
      }
    })
  }

  // ---------- 路由 ----------
  async function render() {
    try { await loadCatalog() } catch {}
    const hash = location.hash || '#/'
    const mr = hash.match(/^#\/r\/(.+)$/)
    const reportId = mr ? decodeURIComponent(mr[1]) : null
    document.querySelectorAll('.nav a').forEach((a) => {
      const cur = reportId ? '' : hash === '#/' ? 'home' : hash.startsWith('#/settings') ? 'settings' : 'home'
      a.classList.toggle('on', a.dataset.view === cur)
    })
    if (reportId && /^[\p{L}\p{N}_-]+$/u.test(reportId)) {
      $app.innerHTML = await viewReport(reportId)
      bindCommon()
      try {
        const data = await api(`/api/reports/${encodeURIComponent(reportId)}`)
        bindReport(reportId, data)
      } catch { /* 卡片已在 HTML 中提示错误 */ }
      return
    }
    if (hash.startsWith('#/settings')) { $app.innerHTML = viewSettings(); bindCommon(); bindSettings(); return }
    $app.innerHTML = viewHome()
    bindCommon()
  }

  async function boot() {
    try { await loadCatalog() } catch {
      state.catalog = { version: '-', has_key: false, key_source: 'none', modes: [], reports: [], settings: {} }
      renderNavCounts()
    }
    render().catch(() => {})
  }
  addEventListener('hashchange', () => render())
  boot()
  setTimeout(() => { if (!state.catalog?.version || state.catalog.version === '-') boot() }, 2500)
})()
