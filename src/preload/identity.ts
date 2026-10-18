import { webFrame } from 'electron'
import { identityPatchScript } from '../shared/identity'

// 浏览器身份补丁：早于页面脚本执行，注入主世界。
// 内容与改写逻辑见 shared/identity.ts（请求头与页面 JS 必须共用一份品牌表，
// 否则 Cloudflare/Google 风控交叉比对出不一致会拒绝服务）。
void webFrame.executeJavaScript(identityPatchScript())
