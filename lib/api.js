// 面板数据面：/intel-investigator 前缀路由（档案管理 + 报告查看 + 重新上传 + 设置；调查执行走 agent 对话）。
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  saveReport, getMeta, getReportMd, listReports, deleteReport, getSettings, saveSettings,
  publicMeta, updateUploadState, DATA_DIR,
} from './store.js'
import { saveRecord, resolveApiKey, resolveApiBase } from './redfox.js'
import { platformContent } from './platformContent.js'
import { tallyCredibility } from './credibility.js'
import { MODE_KEYS, MODES } from './modes.js'
import { formatReportHtml } from './report.js'
import { openExternal, injectOpenLinks } from './open.js'

const BASE = '/intel-investigator'
const LAB = fileURLToPath(new URL('../lab/', import.meta.url))

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
}

function json(res, statusCode, value) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权
  return connection.requestRejection({ headers: req.headers })
}

function safeFile(dir, rel) {
  if (!dir || String(rel).split('/').some((p) => p.startsWith('.'))) return null
  let base
  try { base = realpathSync(dir) } catch { return null }
  const file = normalize(join(base, rel))
  if (!file.startsWith(base + sep) || !existsSync(file)) return null
  const real = realpathSync(file)
  return real.startsWith(base + sep) && statSync(real).isFile() ? real : null
}

function serveFile(req, res, file) {
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

function readJson(req, max = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('type'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => { size += c.length; if (size > max) req.destroy(); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(Object.assign(e, { status: 400 })) } })
    req.on('error', reject)
  })
}

function readVersion() {
  try { return JSON.parse(readFileSync(join(LAB, '..', 'package.json'), 'utf8')).version } catch { return '' }
}

export function registerApi(ctx, hooks = {}) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })

        const url = new URL(req.url, 'http://x')
        if (!url.pathname.startsWith(BASE + '/') && url.pathname !== BASE) return json(res, 404, { error: 'not found' })
        const path = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'

        // ---- API ----
        if (path === '/api/catalog' && req.method === 'GET') {
          const settings = getSettings()
          const reports = listReports({ limit: 100 })
          const byMode = Object.fromEntries(MODE_KEYS.map((k) => [k, reports.filter((r) => r.mode === k).length]))
          return json(res, 200, {
            version: readVersion(),
            dataDir: DATA_DIR,
            modes: MODE_KEYS.map((k) => ({ key: k, label: MODES[k].label, purpose: MODES[k].purpose })),
            by_mode: byMode,
            has_key: Boolean(settings.api_key || process.env.REDFOX_API_KEY || process.env.X_API_KEY),
            key_source: settings.api_key ? 'settings' : ((process.env.REDFOX_API_KEY || process.env.X_API_KEY) ? 'env' : 'none'),
            reports,
            settings: { proxy_url: settings.proxy_url || '', api_base: settings.api_base || '' },
          })
        }

        if (path === '/api/reports' && req.method === 'GET') {
          const mode = new URL(req.url, 'http://x').searchParams.get('mode') || ''
          return json(res, 200, { reports: listReports({ limit: 100, mode: MODE_KEYS.includes(mode) ? mode : undefined }) })
        }

        if (path === '/api/reports' && req.method === 'POST') {
          // 面板直存（粘贴 Markdown 报告的通道；调查执行仍走 agent 对话）
          try {
            const body = await readJson(req)
            const mode = String(body.mode || '').trim()
            if (!MODE_KEYS.includes(mode)) return json(res, 400, { ok: false, error: `mode 必须是 ${MODE_KEYS.join(' / ')} 之一` })
            const subject = String(body.subject || '').trim()
            const reportMd = String(body.report_md || '')
            if (!subject) return json(res, 400, { ok: false, error: 'subject 必填' })
            if (reportMd.trim().length < 50) return json(res, 400, { ok: false, error: 'report_md 太短（<50 字符）' })
            const title = String(body.title || '').trim() || `${MODES[mode].label}：${subject}`
            const tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 10) : []
            const settings = getSettings()
            const opts = { apiKey: resolveApiKey({ settings, config: hooks.config }), apiBase: resolveApiBase({ settings }), proxyUrl: settings.proxy_url || '' }
            let uploaded = false
            let uploadError = ''
            let uploadNote = ''
            if (opts.apiKey && settings.auto_upload !== false) {
              try {
                const payload = platformContent(reportMd, {
                  title, subject, modeLabel: MODES[mode].label, credibility: tallyCredibility(reportMd),
                })
                await saveRecord({ title, content: payload.content, tags: [MODES[mode].label, ...tags], ...opts })
                uploaded = true
                uploadNote = payload.note
              } catch (e) {
                uploadError = String(e?.message || e)
              }
            }
            const meta = saveReport({ mode, modeLabel: MODES[mode].label, subject, title, reportMd, tags, uploaded, uploadError, uploadNote })
            return json(res, 200, { ok: true, report: publicMeta(meta) })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }

        const rMatch = path.match(/^\/api\/reports\/([^/]+)(\/.*)?$/)
        if (rMatch) {
          const reportId = rMatch[1]
          const sub = rMatch[2] || ''
          const meta = getMeta(reportId)
          if (!meta) return json(res, 404, { error: `调查档案不存在: ${reportId}` })

          if (!sub && req.method === 'GET') {
            const md = getReportMd(reportId)
            return json(res, 200, { report: publicMeta(meta), md: md || '' })
          }
          if (!sub && req.method === 'DELETE') return json(res, 200, deleteReport(reportId))
          if (sub === '/report' && (req.method === 'GET' || req.method === 'HEAD')) {
            const md = getReportMd(reportId)
            if (!md) return json(res, 404, { error: '报告内容缺失' })
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' })
            if (req.method === 'HEAD') return res.end()
            return res.end(injectOpenLinks(formatReportHtml(meta, md)))
          }
          if (sub === '/upload' && req.method === 'POST') {
            // 重新上传到 RedFox 平台（补传/失败重传）
            try {
              const settings = getSettings()
              const opts = { apiKey: resolveApiKey({ settings, config: hooks.config }), apiBase: resolveApiBase({ settings }), proxyUrl: settings.proxy_url || '' }
              if (!opts.apiKey) return json(res, 400, { ok: false, error: '未配置 RedFox API Key（设置页或插件配置/环境变量 REDFOX_API_KEY）' })
              const md = getReportMd(reportId)
              if (!md) return json(res, 404, { ok: false, error: '报告内容缺失' })
              const payload = platformContent(md, {
                title: meta.title, subject: meta.subject, modeLabel: meta.mode_label, credibility: meta.credibility,
              })
              await saveRecord({ title: meta.title, content: payload.content, tags: [meta.mode_label, ...meta.tags], ...opts })
              updateUploadState(reportId, { uploaded: true, uploadError: '', uploadNote: payload.note })
              return json(res, 200, { ok: true, summarized: payload.summarized, note: payload.note })
            } catch (e) {
              updateUploadState(reportId, { uploaded: false, uploadError: String(e?.message || e) })
              return json(res, e.status || 400, { ok: false, error: e.message })
            }
          }
          return json(res, 404, { error: 'not found' })
        }

        if (path === '/api/settings' && req.method === 'GET') {
          const settings = getSettings()
          const key = String(settings.api_key || '')
          return json(res, 200, {
            settings: {
              has_key: Boolean(key || process.env.REDFOX_API_KEY || process.env.X_API_KEY),
              key_tail: key ? key.slice(-6) : '',
              from_env: Boolean(process.env.REDFOX_API_KEY || process.env.X_API_KEY),
              proxy_url: settings.proxy_url || '',
              api_base: settings.api_base || '',
              auto_upload: settings.auto_upload !== false,
            },
          })
        }
        if (path === '/api/settings' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const patch = {}
            if (body.api_key !== undefined) {
              const key = String(body.api_key).trim()
              if (key && !key.startsWith('ak_')) return json(res, 400, { ok: false, error: 'RedFox API Key 以 ak_ 开头，请检查' })
              patch.api_key = key
            }
            if (body.proxy_url !== undefined) patch.proxy_url = String(body.proxy_url).trim()
            if (body.api_base !== undefined) patch.api_base = String(body.api_base).trim()
            if (body.auto_upload !== undefined) patch.auto_upload = Boolean(body.auto_upload)
            const next = saveSettings(patch)
            return json(res, 200, { ok: true, has_key: Boolean(next.api_key || process.env.REDFOX_API_KEY) })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }
        // 打开外部链接：桌面端 iframe 里 window.open 会被 deny，只能由宿主用系统浏览器打开
        if (path === '/api/open' && req.method === 'POST') {
          try {
            const body = await readJson(req, 4 * 1024)
            const opened = await openExternal(body.url)
            return json(res, 200, { ok: true, mode: 'system', opened })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }
        if (path.startsWith('/api/')) return json(res, 404, { error: 'not found' })

        // ---- 静态页面 ----
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' })
        const file = safeFile(LAB, path === '/' ? 'index.html' : path.replace(/^\/+/, ''))
        return file ? serveFile(req, res, file) : json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, 500, { error: err?.message || '内部错误' })
      }
    },
  })
}

// 供 host 复用（tallyCredibility 与 store 无关的 re-export 免去重复 import）
export { tallyCredibility }
