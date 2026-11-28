/** No notifications on web (STO-1191): the store's daily-bonus card is the reminder there. */
export async function scheduleStreakReminder(_current: number, _now?: number): Promise<void> {}
export async function cancelStreakReminder(): Promise<void> {}
export function streakReminderOn(): boolean {
  return false;
}
export function setStreakReminderOn(_on: boolean): void {}
