// RedFox API · 情报调查员传输层（报告存证 record/save）。
// 与 geo-analyzer/cn30/xhs-darkhorse 同款传输：JSON POST + 可选 CONNECT 隧道代理。
// 存证接口鉴权：X-API-KEY 请求头（放 body 会返回 code:3106）。
import http from 'node:http'
import https from 'node:https'
import { TLSSocket } from 'node:tls'

export const DEFAULT_API_BASE = 'https://redfox.hk'
export const RECORD_SAVE_PATH = '/story/api/skill/record/save'
export const SOURCE_LABEL = '智能情报调查员-dsh'

export function resolveApiKey({ settings = {}, config = {} } = {}) {
  return String(config.apiKey || settings.api_key || process.env.REDFOX_API_KEY || process.env.X_API_KEY || '').trim()
}

export function resolveApiBase({ settings = {} } = {}) {
  const base = String(settings.api_base || process.env.REDFOX_API_BASE || '').trim()
  return (base || DEFAULT_API_BASE).replace(/\/+$/, '')
}

function connectTunnel(proxyUrl, targetHost, targetPort, timeout) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl)
    const req = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: { host: `${targetHost}:${targetPort}` },
      timeout,
    })
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); reject(new Error(`proxy CONNECT ${res.statusCode}`)); return }
      resolve(socket)
    })
    req.on('timeout', () => req.destroy(new Error('proxy connect timeout')))
    req.on('error', reject)
    req.end()
  })
}

export function httpPostJson(url, body, { timeout = 30000, proxyUrl = '', headers = {} } = {}) {
  const u = new URL(url)
  const isHttp = u.protocol === 'http:'
  const port = Number(u.port) || (isHttp ? 80 : 443)
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  const transport = isHttp ? http : https
  const opts = {
    host: u.hostname,
    port,
    method: 'POST',
    path: `${u.pathname}${u.search}`,
    headers: {
      'content-type': 'application/json',
      'content-length': payload.length,
      ...headers,
    },
  }
  return new Promise((resolve, reject) => {
    const finish = (socket) => {
      const req = transport.request(socket ? { ...opts, socket, agent: false } : { ...opts, agent: false }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ status: res.statusCode, json: JSON.parse(text) })
          } catch {
            reject(new Error(`响应不是合法 JSON（HTTP ${res.statusCode}）：${text.slice(0, 200)}`))
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(timeout, () => req.destroy(new Error(`请求超时（${timeout}ms）`)))
      req.end(payload)
    }
    if (proxyUrl && !isHttp) {
      connectTunnel(proxyUrl, u.hostname, port, timeout)
        .then((socket) => finish(new TLSSocket(socket, { servername: u.hostname })))
        .catch(reject)
    } else {
      finish()
    }
  })
}

export class InsufficientCreditsError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InsufficientCreditsError'
  }
}

export function friendlyApiError(json) {
  const code = json?.code
  const msg = String(json?.msg || json?.message || '')
  if (code === 3201 || msg.includes('积分不足')) {
    return new InsufficientCreditsError('RedFox 账户积分不足（3201）：请到 https://redfox.hk/dashboard/recharge 充值，或确认 Key 已绑定可用积分。')
  }
  if (code === 3203 || msg.includes('付费调用')) {
    return new Error('RedFox 该接口已转为付费调用（3203）：请到 https://redfox.hk/dashboard/recharge 充值后重试。')
  }
  if (code === 3106 || msg.includes('3106')) return new Error('RedFox 存证鉴权失败（3106）：API Key 必须放在 X-API-KEY 请求头（插件已自动处理，若仍报错请检查 Key）。')
  if (code === 3108) return new Error('RedFox 提交被限频（3108），稍等片刻再试。')
  if (code === 401 || code === 403) return new Error(`RedFox 鉴权失败（${code}）：请检查面板「设置」页的 API Key。`)
  return new Error(`API 错误（code=${code ?? '?'}）：${msg || JSON.stringify(json).slice(0, 200)}`)
}

// 报告存证（code=2000 成功；3201 抛积分不足；3108 退避重试）
export async function saveRecord({ title, content, tags = [], apiKey, apiBase, proxyUrl = '', timeout = 30000, maxRetries = 3 } = {}) {
  if (!apiKey) {
    throw new Error('未配置 RedFox API Key。请到面板「设置」页填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
  }
  const headers = {
    'X-API-KEY': apiKey,
    'REDFOX_API_KEY': apiKey,
    'User-Agent': 'intel-investigator/0.1',
  }
  let lastErr = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { json } = await httpPostJson(`${apiBase}${RECORD_SAVE_PATH}`, {
        source: SOURCE_LABEL, title, content, tags,
      }, { timeout, proxyUrl, headers })
      const code = json?.code
      if (code === 3108) {
        lastErr = friendlyApiError(json)
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
        continue
      }
      if (code === 3201) throw friendlyApiError(json)
      if (code !== 200 && code !== 2000) throw friendlyApiError(json)
      return json
    } catch (err) {
      if (err instanceof InsufficientCreditsError) throw err
      lastErr = err
      if (attempt < maxRetries - 1) await new Promise((r) => setTimeout(r, 2000 ** attempt))
    }
  }
  throw lastErr || new Error(`存证请求失败（已尝试 ${maxRetries} 次）`)
}
