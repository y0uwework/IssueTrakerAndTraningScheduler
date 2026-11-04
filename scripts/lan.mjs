// Usage: node scripts/lan.mjs dev|start
// Runs `next <mode>` on all interfaces so the app is reachable on both
// localhost and this machine's LAN IP at the same time.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { getLanIp } from "../lib/lan-ip.mjs";

const mode = process.argv[2] ?? "dev";
const port = process.env.PORT ?? "3000";
const ip = getLanIp();

console.log(`\n  Local: http://localhost:${port}`);
if (ip) console.log(`  LAN:   http://${ip}:${port}`);
else console.log("  LAN:   (no LAN IP detected - localhost only)");
console.log();

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBin, mode, "--hostname", ip ? "0.0.0.0" : "localhost", "--port", port],
  { stdio: "inherit", env: { ...process.env, ...(ip && { LAN_IP: ip }) } },
);
child.on("exit", (code) => process.exit(code ?? 0));
