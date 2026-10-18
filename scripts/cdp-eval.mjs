// 在应用的指定页面里执行 JS 并返回结果（经 CDP）
// 用法: node scripts/cdp-eval.mjs <url包含片段> <表达式>
const port = Number(process.argv[4] || 9222)
const list = await (await fetch(`http://localhost:${port}/json`)).json()
const frag = process.argv[2] || ''
const expr = process.argv[3] || 'location.href'
const target = list.find((t) => t.type === 'page' && t.url.includes(frag))
if (!target) {
  console.error('TARGET NOT FOUND: ' + frag)
  console.error('pages:\n' + list.filter((t) => t.type === 'page').map((t) => t.url).join('\n'))
  process.exit(1)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
ws.onopen = () =>
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true }
    })
  )
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id === 1) {
    if (msg.result?.exceptionDetails) {
      console.error('EXCEPTION: ' + JSON.stringify(msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails, null, 1))
    } else {
      console.log(JSON.stringify(msg.result?.result?.value ?? msg.result, null, 1))
    }
    process.exit(0)
  }
}
setTimeout(() => {
  console.error('TIMEOUT')
  process.exit(1)
}, 15000)
