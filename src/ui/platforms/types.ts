/** What a hosting platform (Yandex Games, VK) provides to the game. */
export interface PlatformAdapter {
  /** Cloud copies of the saved keys (missing keys are absent). */
  load(keys: readonly string[]): Promise<Record<string, string>>
  /** Snapshot of all saved keys; the adapter decides what to send. */
  save(data: Record<string, string>): Promise<void>
  /** The game is interactive: hide the platform loader. */
  ready(): void
  /** Active play on/off. */
  gameplay(active: boolean): void
  /** Interstitial; resolves when it's over or wasn't shown. */
  fullscreenAd(): Promise<void>
  /** Rewarded video; true when the reward is earned. */
  rewardedAd(): Promise<boolean>
  /** Whether a rewarded video can be shown right now (to show the offer at all). */
  rewardedReady(): Promise<boolean>
}

/** Platform overlays (ads, app hidden) pause the game through this. */
export type SetPaused = (paused: boolean) => void
