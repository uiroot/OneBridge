import type { OneBridgeApi } from '@shared/api'

declare global {
  interface Window {
    api: OneBridgeApi
  }
}

export {}
