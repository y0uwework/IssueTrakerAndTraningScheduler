// Usage: node scripts/lan.mjs dev|start
// Detects this machine's LAN IP and runs `next <mode>` bound to it.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { getLanIp } from "../lib/lan-ip.mjs";

const mode = process.argv[2] ?? "dev";
const port = process.env.PORT ?? "3000";
const ip = getLanIp();

if (!ip) {
  console.error("Could not detect a LAN IP address. Are you connected to a network?");
  process.exit(1);
}

console.log(`\n  LAN URL: http://${ip}:${port}\n`);

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, mode, "--hostname", ip, "--port", port], {
  stdio: "inherit",
  env: { ...process.env, LAN_IP: ip },
});
child.on("exit", (code) => process.exit(code ?? 0));
