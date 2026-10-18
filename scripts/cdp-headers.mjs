// 经 CDP 抓取指定页面主框架文档请求的最终请求头（含改写后的 Sec-CH-UA）
// 用法: node scripts/cdp-headers.mjs <url包含片段>
const port = 9222
const frag = process.argv[2] || 'grok.com'
const list = await (await fetch(`http://localhost:${port}/json`)).json()
const target = list.find((t) => t.type === 'page' && t.url.includes(frag))
if (!target) {
  console.error('TARGET NOT FOUND: ' + frag)
  process.exit(1)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
let sent = null
const extra = new Map()
let reported = false
function report() {
  if (reported) return
  reported = true
  const h = extra.get(sent) || {}
  const out = {}
  for (const k of Object.keys(h)) {
    if (/^(sec-ch-ua|user-agent|sec-fetch-site|accept-language)/i.test(k)) out[k] = h[k]
  }
  console.log(JSON.stringify(out, null, 1))
  process.exit(0)
}
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: 'Network.enable' }))
  ws.send(JSON.stringify({ id: 2, method: 'Page.reload', params: { ignoreCache: true } }))
}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (!m.method) return
  const p = m.params || {}
  if (m.method === 'Network.requestWillBeSent' && p.type === 'Document' && !sent && p.request.url.includes(frag)) {
    sent = p.requestId
  }
  if (m.method === 'Network.requestWillBeSentExtraInfo' && p.requestId) {
    extra.set(p.requestId, p.headers)
  }
  if (sent && (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') && p.requestId === sent) {
    setTimeout(report, 300)
  }
}
setTimeout(report, 15000)
