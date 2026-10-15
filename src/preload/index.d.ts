import type { WuApi } from '../shared/types'

declare global {
  interface Window {
    wu: WuApi
  }
}

export {}
