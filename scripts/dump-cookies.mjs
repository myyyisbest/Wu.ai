// 诊断：列出专用浏览器（9223）全部 Cookie 的域分布（Node 内置 WebSocket）
const ver = await (await fetch('http://127.0.0.1:9223/json/version')).json()
const ws = new WebSocket(ver.webSocketDebuggerUrl)
const timer = setTimeout(() => {
  console.error('TIMEOUT')
  process.exit(1)
}, 10000)
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' }))
ws.onmessage = (ev) => {
  if (!ev.data) return
  let msg
  try {
    msg = JSON.parse(ev.data)
  } catch {
    return
  }
  if (msg.id === 1) {
    clearTimeout(timer)
    const cookies = msg.result?.cookies ?? []
    const byDomain = {}
    for (const c of cookies) {
      const dom = c.domain.replace(/^\./, '')
      byDomain[dom] = byDomain[dom] || []
      byDomain[dom].push(c.name + (c.value.length > 20 ? '(长)' : ''))
    }
    for (const [dom, names] of Object.entries(byDomain)) {
      console.log(`== ${dom} (${names.length}) == ${names.slice(0, 10).join(', ')}`)
    }
    process.exit(0)
  }
}
ws.onerror = (e) => {
  console.error('WS error')
  process.exit(1)
}
