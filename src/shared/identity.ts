/**
 * 浏览器身份一致性配置。
 *
 * Cloudflare（grok.com 的 Turnstile）、Google 等风控会交叉比对「Sec-CH-UA 请求头」
 * 与「页面内 navigator.userAgentData」。Electron 原生头自报品牌为 "Chromium"，
 * 若页面 JS 又伪装成 "Google Chrome"，两者不一致本身就是机器人特征——
 * 典型表现就是安全验证无限转圈。
 *
 * 因此请求头（主进程 sessions.ts 改写）与页面补丁（preload identity.ts 注入）
 * 必须共用这一份品牌表，任何一端单独改都会重新引入不一致。
 */

interface BrandEntry {
  brand: string
  /** 'MAJOR' 表示跟随当前 Chromium 主版本，否则为固定的 GREASE 占位版本 */
  versionToken: string
}

const BRAND_TABLE: BrandEntry[] = [
  { brand: 'Google Chrome', versionToken: 'MAJOR' },
  { brand: 'Chromium', versionToken: 'MAJOR' },
  { brand: 'Not=A?Brand', versionToken: '24' }
]

function brandList(major: string, full: string, suffix = ''): string {
  return BRAND_TABLE.map((b) => {
    // MAJOR 项用真实完整版本号（与 UA 头逐字一致），GREASE 占位项保持 x.0.0.0
    const v = b.versionToken === 'MAJOR' ? (suffix ? full : major) : b.versionToken
    return `"${b.brand}";v="${v}${suffix}"`
  }).join(', ')
}

/** 主进程改写请求头用：与页面补丁逐字一致 */
export function clientHintHeaders(major: string, full: string): Record<string, string> {
  return {
    'Sec-CH-UA': brandList(major, full),
    'Sec-CH-UA-Full-Version-List': brandList(major, full, '.0.0.0'),
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"'
  }
}

/**
 * preload 注入用：早于页面脚本执行的身份补丁。
 * 包含 userAgentData / plugins / window.chrome / webdriver / WebGL 渲染器归一化。
 */
export function identityPatchScript(): string {
  return `(function () {
  if (window.__wuIdentityPatched) return
  window.__wuIdentityPatched = true
  var nativeUAD = navigator.userAgentData
  var major = (navigator.userAgent.match(/Chrome\\/(\\d+)/) || [])[1] || '130'
  var full = (navigator.userAgent.match(/Chrome\\/([\\d.]+)/) || [])[1] || major + '.0.0.0'
  var brandDef = ${JSON.stringify(BRAND_TABLE)}
  var brands = brandDef.map(function (b) {
    return { brand: b.brand, version: b.versionToken === 'MAJOR' ? major : b.versionToken }
  })
  var fullBrands = brandDef.map(function (b) {
    return { brand: b.brand, version: b.versionToken === 'MAJOR' ? full : b.versionToken + '.0.0.0' }
  })
  // platformVersion 等高熵值异步取原生真实值后重装（Win10/11 版本号必须与原生
  // Sec-CH-UA-Platform-Version 头一致，写死 '10.0.0' 是可检出的破绽）
  var installUAD = function (he) {
    he = he || {}
    try {
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: function () {
          return {
            brands: brands,
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: function (hints) {
              var all = {
                architecture: he.architecture || 'x86',
                bitness: he.bitness || '64',
                model: he.model || '',
                platformVersion: he.platformVersion || '10.0.0',
                uaFullVersion: full,
                fullVersionList: fullBrands,
                wow64: !!he.wow64
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
  }
  installUAD(null)
  try {
    if (nativeUAD && nativeUAD.getHighEntropyValues) {
      nativeUAD.getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'model', 'wow64']).then(installUAD, function () {})
    }
  } catch (e) {}
  try {
    // 与主进程改写的 Accept-Language 头保持一致（Electron 原生只发 "zh-CN" 单值）
    Object.defineProperty(navigator, 'languages', {
      get: function () { return ['zh-CN', 'zh', 'en-US', 'en'] },
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
  try {
    if (!window.chrome) window.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {} }
  } catch (e) {}
  try {
    if (navigator.webdriver) {
      Object.defineProperty(navigator, 'webdriver', { get: function () { return false }, configurable: true })
    }
  } catch (e) {}
  try {
    // WebGL 软件渲染（SwiftShader/llvmpipe 等）是典型自动化特征；真实 GPU 字符串保持原样
    var SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software/i
    var REAL = {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)'
    }
    var hook = function (proto) {
      if (!proto || !proto.getParameter) return
      var orig = proto.getParameter
      proto.getParameter = function (p) {
        var v = orig.apply(this, arguments)
        try {
          if ((p === 37445 || p === 37446) && typeof v === 'string' && SOFTWARE_RE.test(v)) {
            return p === 37445 ? REAL.vendor : REAL.renderer
          }
        } catch (e) {}
        return v
      }
    }
    if (window.WebGLRenderingContext) hook(window.WebGLRenderingContext.prototype)
    if (window.WebGL2RenderingContext) hook(window.WebGL2RenderingContext.prototype)
  } catch (e) {}
})()`
}
