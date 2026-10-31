import os from "node:os";

// Adapters that are never the real LAN connection (Hyper-V/WSL, VMs, VPNs, Docker).
const VIRTUAL = /vethernet|virtualbox|vmware|wsl|hyper-v|docker|loopback|tailscale|zerotier|vpn/i;

const isPrivate = (ip) =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

/** Returns this machine's LAN IPv4 address, or undefined if none is found. */
export function getLanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      // Lower score = better: physical adapters with private IPs first.
      const score = (VIRTUAL.test(name) ? 2 : 0) + (isPrivate(a.address) ? 0 : 1);
      candidates.push({ address: a.address, score });
    }
  }
  candidates.sort((x, y) => x.score - y.score);
  return candidates[0]?.address;
}
