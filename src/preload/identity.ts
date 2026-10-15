import { webFrame } from 'electron'

// 深度伪装浏览器身份：Google OAuth 会通过 JS 层的
// navigator.userAgentData.brands / plugins 识别嵌入式浏览器并拒绝登录。
// preload 里用 webFrame.executeJavaScript 把补丁打进主世界，早于页面脚本执行。
const patch = `(function () {
  if (window.__wuIdentityPatched) return
  window.__wuIdentityPatched = true
  var major = (navigator.userAgent.match(/Chrome\\/(\\d+)/) || [])[1] || '130'
  var brands = [
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
    { brand: 'Not=A?Brand', version: '24' }
  ]
  var fullBrands = brands.map(function (b) {
    return { brand: b.brand, version: b.version + '.0.0.0' }
  })
  try {
    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      get: function () {
        return {
          brands: brands,
          mobile: false,
          platform: 'Windows',
          getHighEntropyValues: function (hints) {
            var all = {
              architecture: 'x86',
              bitness: '64',
              model: '',
              platformVersion: '10.0.0',
              uaFullVersion: major + '.0.0.0',
              fullVersionList: fullBrands,
              wow64: false
            }
            var out = { brands: brands, mobile: false, platform: 'Windows' }
            for (var i = 0; i < hints.length; i++) {
              if (all[hints[i]] !== undefined) out[hints[i]] = all[hints[i]]
            }
            return Promise.resolve(out)
          },
          toJSON: function () {
            return { brands: brands, mobile: false, platform: 'Windows' }
          }
        }
      },
      configurable: true
    })
  } catch (e) {}
  try {
    if (navigator.plugins.length === 0) {
      var mk = function (name) {
        return { name: name, filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
      }
      var plugins = [mk('PDF Viewer'), mk('Chrome PDF Viewer'), mk('Chromium PDF Viewer'), mk('Microsoft Edge PDF Viewer'), mk('WebKit built-in PDF')]
      Object.defineProperty(navigator, 'plugins', { get: function () { return plugins }, configurable: true })
    }
  } catch (e) {}
})()`

void webFrame.executeJavaScript(patch)
