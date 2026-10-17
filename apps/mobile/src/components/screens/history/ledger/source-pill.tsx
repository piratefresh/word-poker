import { Pill } from "@/components/ui/pill";
import { colors } from "@/constants/theme";

const sources = {
  player: { label: "PLAYER", backgroundColor: colors.goldHi, color: colors.onGold },
  bot: { label: "BOT", backgroundColor: colors.info, color: colors.onGold },
  timeout: { label: "TIMEOUT", backgroundColor: colors.warning, color: colors.onGold },
} as const;

export function SourcePill({ source }: { source: keyof typeof sources }) {
  const pill = sources[source];
  return (
    <Pill
      label={pill.label}
      backgroundColor={pill.backgroundColor}
      color={pill.color}
      size="xs"
    />
  );
}
