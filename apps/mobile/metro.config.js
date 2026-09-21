const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

// @colyseus/sdk imports the Node `ws` package even when React Native's native
// WebSocket implementation is the one that will be used at runtime.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "ws") {
    return {
      filePath: path.resolve(__dirname, "src/lib/ws-shim.ts"),
      type: "sourceFile",
    };
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
