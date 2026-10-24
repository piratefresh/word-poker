/** Two-letter initials from a player's display name. */
export function initialsFromName(name: string): string {
  const [first, second] = name.trim().split(/\s+/);
  if (!first) return "";
  if (second !== undefined) return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  return first.slice(0, 2).toUpperCase();
}
