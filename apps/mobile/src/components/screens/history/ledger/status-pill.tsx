import { Pill } from "@/components/ui/pill";
import { colors } from "@/constants/theme";

const statuses = {
  synced: { label: "SYNCED", backgroundColor: colors.successHi, color: colors.onGold },
  onDevice: { label: "ON DEVICE", backgroundColor: colors.goldHi, color: colors.onGold },
  uploading: { label: "UPLOADING…", backgroundColor: colors.goldHi, color: colors.onGold },
  verified: { label: "VERIFIED", backgroundColor: colors.successHi, color: colors.onGold },
  rejected: { label: "REJECTED", backgroundColor: colors.danger, color: colors.onGold },
} as const;

export type StatusVariant = keyof typeof statuses;

export function StatusPill({ variant, text }: { variant: StatusVariant; text?: string }) {
  const status = statuses[variant];
  return (
    <Pill
      label={text ?? status.label}
      backgroundColor={status.backgroundColor}
      color={status.color}
      size="sm"
      animateBackground
    />
  );
}
