import type { NextConfig } from "next";
import { getLanIp } from "./lib/lan-ip.mjs";

const lanIp = process.env.LAN_IP ?? getLanIp();

const nextConfig: NextConfig = {
  // Allow other devices on the LAN to load dev assets / HMR (IP auto-detected).
  allowedDevOrigins: lanIp ? [lanIp] : [],
  cacheComponents: true,
  partialPrefetching: true,
  // Load the SQL Server drivers with Node's require instead of bundling them.
  serverExternalPackages: ["mssql", "tedious", "msnodesqlv8", "exceljs", "sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
