/**
 * 页面净化脚本：在服务页面 dom-ready 时注入。
 * 三遍扫描，共同点：按"规范化文本"（去掉全部空白）匹配关键词，
 * 因为这类按钮常把文字拆进多个 span，innerText 里夹着换行：
 * 1. 悬浮/弹层类推广：position fixed/absolute + 命中关键词（下载提示条、升级横幅等）
 * 2. 按钮/链接级推广：button/a/[role=button] 整体文本命中
 * 3. 小组件兜底：全页面里"规范化文本 ≤ 24 字 + 命中关键词 + 可见尺寸小"的最小元素，
 *    隐藏它（或其小组件父级）——用于拆 span 的普通定位按钮（如豆包页头"下载豆包工作台"）
 */
export function buildCleanupScript(keywords: string[], hideBottomLeftIcon?: boolean): string {
  const cfg = JSON.stringify({ keywords, hideBottomLeftIcon: Boolean(hideBottomLeftIcon) })
  return `(function () {
  if (window.__wuCleanupInstalled) return
  window.__wuCleanupInstalled = true
  function norm(s) { return (s || '').replace(/\\s+/g, '') }
  var CFG = ${cfg}
  var KWS = CFG.keywords.map(norm)
  function matchKws(text) {
    for (var j = 0; j < KWS.length; j++) {
      if (text.indexOf(KWS[j]) !== -1) return true
    }
    return false
  }

  function sweep() {
    if (!KWS.length || !document.body) return

    // 第一遍：悬浮/弹层类
    var nodes = document.querySelectorAll('div, section, aside, button, a')
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (el.__wuHidden) continue
      var cs = getComputedStyle(el)
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue
      var rect = el.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 24 || rect.width > innerWidth) continue
      var text = (el.innerText || '')
      if (!text || text.length > 160) continue
      if (!matchKws(norm(text))) continue
      if (el.querySelector('textarea, input, video')) continue
      el.style.setProperty('display', 'none', 'important')
      el.__wuHidden = true
    }

    // 第二遍：按钮/链接级（命中后若父容器也是小组件，连父容器一起隐藏，
    // 例如豆包页脚"关于豆包"链接旁的下载图标按钮）
    var btns = document.querySelectorAll('button, a, [role="button"]')
    for (var b = 0; b < btns.length; b++) {
      var btn = btns[b]
      if (btn.__wuHidden) continue
      var t = norm(btn.innerText)
      if (!t || t.length > 30) continue
      if (!matchKws(t)) continue
      var target2 = btn
      var p2 = btn.parentElement
      if (p2 && !p2.__wuHidden) {
        var pr2 = p2.getBoundingClientRect()
        if (pr2.width <= 600 && pr2.height <= 120 && !p2.querySelector('textarea, input, video')) {
          target2 = p2
        }
      }
      target2.style.setProperty('display', 'none', 'important')
      target2.__wuHidden = true
      btn.__wuHidden = true
    }

    // 第三遍：小组件兜底（拆 span 的普通定位按钮）
    var best = null
    var bestArea = Infinity
    var all = document.querySelectorAll('span, div, button, a, p')
    for (var k = 0; k < all.length; k++) {
      var el3 = all[k]
      if (el3.__wuHidden) continue
      var t3 = norm(el3.innerText)
      if (!t3 || t3.length > 24) continue
      if (!matchKws(t3)) continue
      if (el3.querySelector('textarea, input, video')) continue
      var r = el3.getBoundingClientRect()
      if (r.width < 20 || r.height < 14 || r.width > 340 || r.height > 90) continue
      var area = r.width * r.height
      if (area < bestArea) { bestArea = area; best = el3 }
    }
    if (best) {
      // 优先隐藏带样式的小组件容器（父级），避免留下空边框
      var target = best
      var p = best.parentElement
      if (p && !p.__wuHidden) {
        var pr = p.getBoundingClientRect()
        if (pr.width <= 360 && pr.height <= 100 && !p.querySelector('textarea, input, video')) {
          target = p
        }
      }
      target.style.setProperty('display', 'none', 'important')
      target.__wuHidden = true
      best.__wuHidden = true
    }

    // 第四遍：页面左下角的小图标按钮（豆包页脚的下载图标，无文字匹配不到上面的规则）
    if (CFG.hideBottomLeftIcon) {
      var corner = document.querySelectorAll('button, a, [role="button"], [aria-label], span, div')
      for (var c = 0; c < corner.length; c++) {
        var cel = corner[c]
        if (cel.__wuHidden) continue
        var cr2 = cel.getBoundingClientRect()
        if (cr2.width < 16 || cr2.width > 64 || cr2.height < 16 || cr2.height > 64) continue
        if (cr2.left > 260 || cr2.bottom < innerHeight - 150) continue
        var ct = norm(cel.innerText)
        if (ct.length > 4) continue
        if (cel.querySelector('textarea, input, video')) continue
        var labelled = (cel.getAttribute('aria-label') || cel.title || '').indexOf('下载') !== -1
        if (!labelled && !cel.querySelector('svg, img, i')) continue
        cel.style.setProperty('display', 'none', 'important')
        cel.__wuHidden = true
      }
    }
  }

  var timer = null
  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(sweep, 300)
  }

  function start() {
    sweep()
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()`
}
