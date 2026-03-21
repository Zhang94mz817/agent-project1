import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export function nowIso() {
  return new Date().toISOString();
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function ensureParentDir(filePath) {
  ensureDir(dirname(filePath));
}

export function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, data) {
  ensureParentDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function ensureJsonFile(filePath, createDefault) {
  const existing = readJson(filePath, null);
  if (existing) return existing;
  const value = typeof createDefault === "function" ? createDefault() : createDefault;
  writeJson(filePath, value);
  return value;
}
