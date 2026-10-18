// 诊断脚本：打印 GPU 加速状态与 WebGL 渲染器字符串（Cloudflare Turnstile 会采集后者）
const { app, BrowserWindow } = require('electron')

app.whenReady().then(async () => {
  const features = app.getGPUFeatureStatus()
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<canvas></canvas>')
  const info = await win.webContents.executeJavaScript(`(function () {
    function read(proto) {
      if (!proto) return null
      var c = document.createElement('canvas')
      var gl = c.getContext('webgl2') || c.getContext('webgl')
      if (!gl) return { error: 'no webgl context' }
      var ext = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        unmaskedVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null
      }
    }
    return { webgl: read(window.WebGLRenderingContext), webgl2: read(window.WebGL2RenderingContext) }
  })()`)
  console.log('GPU_FEATURE_STATUS=' + JSON.stringify(features, null, 2))
  console.log('WEBGL_INFO=' + JSON.stringify(info, null, 2))
  console.log('UA=' + app.getLocale() + ' | electron=' + process.versions.electron + ' | chrome=' + process.versions.chrome)
  win.destroy()
  app.quit()
})
