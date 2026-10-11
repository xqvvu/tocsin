import "@tanstack/react-start/server-only";
import process from "node:process";

import { getLogger } from "@logtape/logtape";

import packageJson from "../../../../../package.json";

const logger = getLogger(["tocsin", "runtime"]);

export interface SystemInformation {
  version: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  architecture: string;
  environment: string;
  sqliteDriver: "better-sqlite3";
  sqliteVersion: string;
}

type WriteSystemInformation = (message: string, properties: Record<string, unknown>) => void;

export function loadSystemInformation(sqliteVersion: string): SystemInformation {
  return {
    version: packageJson.version,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    environment: import.meta.env.MODE,
    sqliteDriver: "better-sqlite3",
    sqliteVersion,
  };
}

export function logSystemInformation(
  information: SystemInformation,
  writeInfo: WriteSystemInformation = (message, properties) => logger.info(message, properties),
): void {
  writeInfo("Version: {version}", { version: information.version });
  writeInfo("Environment: {environment}", { environment: information.environment });
  writeInfo("Node version: {nodeVersion}", { nodeVersion: information.nodeVersion });
  writeInfo("Platform: {platform}", { platform: information.platform });
  writeInfo("Architecture: {architecture}", { architecture: information.architecture });
  writeInfo("SQLite version: {sqliteVersion}", { sqliteVersion: information.sqliteVersion });
  writeInfo("SQLite driver: {sqliteDriver}", { sqliteDriver: information.sqliteDriver });
}
