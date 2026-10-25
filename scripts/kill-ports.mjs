// Frees the Expo dev-server ports so `pnpm start` never trips over a stale instance.
import { execSync } from 'node:child_process';

const PORTS = [8081, 8082];

function pidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      return out
        .split('\n')
        .filter((line) => line.includes('LISTENING') && line.includes(`:${port} `))
        .map((line) => line.trim().split(/\s+/).pop());
    }
    return execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter(Boolean);
  } catch {
    return []; // no listener (lsof exits 1) or tool missing
  }
}

for (const pid of new Set(PORTS.flatMap(pidsOnPort))) {
  try {
    process.kill(Number(pid), 'SIGKILL');
  } catch {
    // already gone
  }
}
