// Native loads Skia with the app, so the gradient mounts directly; the web waits on CanvasKit
// (`table-backdrop.web.tsx`).
export { TableBackdrop } from "./mesh-backdrop";
