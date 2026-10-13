const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

// Rive files are bundled as local assets by `useRiveFile(require(...))`.
if (!config.resolver.assetExts.includes("riv")) {
  config.resolver.assetExts.push("riv");
}

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

// Dev only: `API_PROXY=https://<host>` forwards /api/* to a hosted backend, so the web build talks
// to it same-origin (no CORS, first-party session cookie). Leave EXPO_PUBLIC_AUTH_URL unset with it.
const apiProxy = process.env.API_PROXY;
if (apiProxy) {
  config.server.enhanceMiddleware = (metroMiddleware) => async (req, res, next) => {
    if (!req.url.startsWith("/api/")) return metroMiddleware(req, res, next);
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = { ...req.headers, origin: apiProxy }; // Better Auth checks Origin against its trusted list
      for (const name of ["host", "connection", "content-length", "accept-encoding"]) delete headers[name];
      const upstream = await fetch(apiProxy + req.url, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: "manual",
      });
      res.statusCode = upstream.status;
      upstream.headers.forEach((value, name) => {
        if (!["set-cookie", "content-encoding", "content-length"].includes(name)) res.setHeader(name, value);
      });
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = config;
