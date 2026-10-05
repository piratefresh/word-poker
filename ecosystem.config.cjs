const path = require("path");

/**
 * Colyseus Cloud deploys from the repository root, so it looks for its pm2 config here.
 * The server's own config (apps/server/ecosystem.config.cjs) is the one source; this
 * only runs it from the server's directory.
 */
const server = require("./apps/server/ecosystem.config.cjs");

module.exports = {
  apps: server.apps.map((app) => ({ ...app, cwd: path.join(__dirname, "apps/server") })),
};
