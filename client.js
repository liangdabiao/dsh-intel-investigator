// ============================================================================
// A股情报调查员 · 浏览器半边
//   - 侧栏加「A股情报调查员」入口，主区域是插件页面（/intel-investigator/，iframe）
//   - 页面发 intel-investigator:refresh：postMessage 一段草稿，这里开新对话并填进输入框（不自动发送）
//   - 明暗跟随 dsh 主题
//
// 注意：这里**不要**自己写 window.__ModuleLoader__.load(...)——scripts/build.mjs 的
// banner 已包了一层注册，再包一次会 duplicate factory registration 让 web boot 失败。
// ============================================================================
const React = require('react')
const h = React.createElement

const PANEL = 'intel-investigator'
const SRC = '/intel-investigator/'

// 侧栏图标：调查放大镜 + 时针 + 声呐双弧
function PanelIcon(props) {
  const s = (props && props.size) || 18
  return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
    h('path', { d: 'M15.5 15.5 21 21' }),
    h('path', { d: 'M10.5 7.5v3l2 1.5' }))
}

function apply(ctx) {
  const frames = new Set()
  let scheme = null
  const post = (frame) => {
    try { if (scheme && frame.contentWindow) frame.contentWindow.postMessage({ type: 'intel-investigator:scheme', scheme }, location.origin) } catch {}
  }
  ctx.inject(['theme'], (c) => {
    const push = (snap) => { scheme = snap.active.colorScheme; frames.forEach(post) }
    try { push(c.theme.getTheme()) } catch {}
    c.on('theme/change', push)
  })

  function IntelPanel() {
    const ref = React.useRef(null)
    React.useEffect(() => {
      const self = ref.current
      if (self) frames.add(self)
      function onMessage(e) {
        const frame = ref.current
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return
        const m = e.data
        if (!m || m.type !== 'intel-investigator:refresh' || typeof m.prompt !== 'string') return
        try {
          ctx.uiWorkspace.startSession(undefined, { prompt: m.prompt, whenDraftExists: 'replace' })
          try { frame.contentWindow.postMessage({ type: 'intel-investigator:start-ok' }, location.origin) } catch {}
        } catch (err) {
          console.error('[intel-investigator] 开新对话失败', err)
          try { frame.contentWindow.postMessage({ type: 'intel-investigator:start-failed', message: String((err && err.message) || err) }, location.origin) } catch {}
        }
      }
      addEventListener('message', onMessage)
      return () => { removeEventListener('message', onMessage); frames.delete(self) }
    }, [])
    return h('iframe', {
      ref,
      src: SRC,
      title: 'A股情报调查员',
      allow: 'fullscreen',
      onLoad: (e) => post(e.currentTarget),
      style: { width: '100%', height: '100%', border: 0, display: 'block' },
    })
  }

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 17, label: () => 'A股情报调查员' }, PanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, IntelPanel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
