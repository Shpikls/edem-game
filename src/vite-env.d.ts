/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_YM_ID?: string
  readonly VITE_UMAMI_ID?: string
  readonly VITE_UMAMI_URL?: string
  /** 'yandex' for the Yandex Games build. */
  readonly VITE_PLATFORM?: string
}

/** Short commit id of the build ('dev' locally). */
declare const __BUILD__: string
