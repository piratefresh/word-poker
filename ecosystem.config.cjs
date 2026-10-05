const path = require("path");

/**
 * Colyseus Cloud deploys from the repository root, so it looks for its pm2 config here.
 * The server's own config (apps/server/ecosystem.config.cjs) is the one source; this
 * only points its script at the server's directory. The script path has to be absolute:
 * Colyseus's post-deploy agent overwrites `cwd` with the repository root.
 */
const server = require("./apps/server/ecosystem.config.cjs");

module.exports = {
  apps: server.apps.map((app) => ({ ...app, script: path.join(__dirname, "apps/server", app.script) })),
};
