// Native loads Skia with the app, so the table paints directly; the web waits on CanvasKit
// (`table-art.web.tsx`).
export { TableArtCanvas as TableArt } from "./table-art-canvas";
export type { TableArtProps } from "./table-art-canvas";
