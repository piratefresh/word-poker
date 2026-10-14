/** The web build has no push; the in-app invite banner covers it (STO-585). */
export function usePushRegistration(_account: boolean): void {}

export async function unregisterPush(): Promise<void> {}
