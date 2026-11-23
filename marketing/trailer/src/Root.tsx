import { Composition } from "remotion";
import { FPS, TOTAL, Trailer } from "./Trailer";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="BetaTrailer" component={Trailer} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
  </>
);
