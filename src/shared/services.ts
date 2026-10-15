/**
 * 服务注册表：新增/删除一家 AI 只需要改这个数组。
 * - cleanupKeywords：净化规则，隐藏包含这些文字的悬浮/弹层元素（下载提示等）
 * - cleanupCss：净化规则，直接隐藏的 CSS 选择器
 * - hideBottomLeftIcon：净化规则，隐藏页面左下角的小图标按钮（如豆包页脚的下载图标）
 * - browserLogin：需代理且 Google OAuth 会被拦的服务，提供"系统浏览器登录+会话收割"入口
 * - cookieDomains：系统浏览器登录收割会话时，除本域外还要一并收取的关联域
 *   （如 Grok 的 SSO 同时落在 grok.com 与 x.ai）
 */
export interface ServiceDef {
  id: string
  name: string
  url: string
  partition: string
  color: string
  cleanupKeywords: string[]
  cleanupCss: string[]
  hideBottomLeftIcon?: boolean
  browserLogin?: boolean
  cookieDomains?: string[]
}

export const SERVICES: ServiceDef[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    partition: 'persist:deepseek',
    color: '#4D6BFE',
    cleanupKeywords: ['下载 App', '下载客户端', '下载桌面版', '获取手机App'],
    cleanupCss: []
  },
  {
    id: 'doubao',
    name: '豆包',
    url: 'https://www.doubao.com/chat/',
    partition: 'persist:doubao',
    color: '#5A5CE6',
    cleanupKeywords: ['关于豆包', '下载豆包', '下载桌面版', '下载客户端', '打开豆包App', '打开 App', 'App 内打开', '继续使用网页版'],
    cleanupCss: [],
    hideBottomLeftIcon: true
  },
  {
    id: 'qwen',
    name: '通义千问',
    url: 'https://www.tongyi.com/',
    partition: 'persist:qwen',
    color: '#615CED',
    cleanupKeywords: ['订阅会员', '下载电脑端', '下载客户端', '下载App', '打开APP', '打开 App'],
    cleanupCss: [],
    cookieDomains: ['openai.com']
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    partition: 'persist:chatgpt',
    color: '#74AA9C',
    cleanupKeywords: ['Download the app', 'Get the app'],
    cleanupCss: [],
    browserLogin: true,
    cookieDomains: ['openai.com']
  },
  {
    id: 'grok',
    name: 'Grok',
    url: 'https://grok.com/',
    partition: 'persist:grok',
    color: '#0d0d0d',
    cleanupKeywords: ['Download the app', 'Get the app'],
    cleanupCss: [],
    browserLogin: true,
    cookieDomains: ['x.ai', 'x.com']
  }
]

export const SERVICE_IDS = SERVICES.map((s) => s.id)

export function serviceById(id: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.id === id)
}
