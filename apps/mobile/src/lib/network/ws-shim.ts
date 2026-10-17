// React Native provides the WebSocket global. The Colyseus SDK's Node `ws`
// dependency is only a fallback, but its static import is not native-safe.
const WebSocketShim = globalThis.WebSocket;

export default WebSocketShim;
