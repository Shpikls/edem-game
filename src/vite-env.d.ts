/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_YM_ID?: string
  readonly VITE_UMAMI_ID?: string
  readonly VITE_UMAMI_URL?: string
  /** 'yandex' | 'vk' for platform builds; unset = plain web. */
  readonly VITE_PLATFORM?: string
}

/** Short commit id of the build ('dev' locally). */
declare const __BUILD__: string
