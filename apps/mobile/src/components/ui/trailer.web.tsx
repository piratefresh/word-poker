import { colors, radius } from "@/constants/theme";

/** The 9:16 trailer from `public/`, played by the browser's own `<video>` controls. */
export function Trailer() {
  return (
    <video
      controls
      playsInline
      poster="/trailer-poster.jpg"
      preload="metadata"
      src="/trailer.mp4"
      style={{
        aspectRatio: "9 / 16",
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.card,
        maxHeight: "70vh",
        maxWidth: "100%",
      }}
    />
  );
}
