import type { MdvApi } from '../shared/types'

declare global {
  interface Window {
    mdv: MdvApi
  }
}

export {}
