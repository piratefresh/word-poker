const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
const seconds = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function clock(date: Date | number): string {
  return time.format(date);
}

export function clockSeconds(date: Date | number): string {
  return seconds.formatToParts(date)
    .filter((part) => ["hour", "minute", "second"].includes(part.type))
    .map((part) => part.value).join(":");
}

export function dayLabel(date: Date | number, now = new Date()): string {
  const value = new Date(date);
  const sameDay = (other: Date) => value.getFullYear() === other.getFullYear()
    && value.getMonth() === other.getMonth() && value.getDate() === other.getDate();
  if (sameDay(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return sameDay(yesterday) ? "Yesterday" : day.format(value);
}
