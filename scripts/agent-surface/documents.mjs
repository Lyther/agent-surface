// The OS Documents folder. Cline's pre-SDK extension reads its user workflows and rules there (its
// getDocumentsPath), and a OneDrive backup or an XDG user-dirs entry moves it away from ~/Documents,
// the folder the Cline CLI and SDK bundle read.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

// PowerShell's first start on a cold Windows runner can take several seconds.
const QUERY_TIMEOUT_MS = 15_000;

// PowerShell prints the folder as Base64 of its UTF-8 bytes. That output is plain ASCII, so a
// non-ASCII path survives whatever code page the hidden console gives the pipe.
const WINDOWS_QUERY = "[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments)))";
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

// The queries the extension runs: the MyDocuments special folder on Windows, which follows a
// OneDrive redirect, and `xdg-user-dir DOCUMENTS` on Linux.
const QUERIES = {
  win32: { command: "powershell", args: ["-NoProfile", "-Command", WINDOWS_QUERY], decode: (out) => (BASE64.test(out) ? Buffer.from(out, "base64").toString("utf8") : "") },
  linux: { command: "xdg-user-dir", args: ["DOCUMENTS"], decode: (out) => out },
};

// Elsewhere, or when the query fails or prints nothing, the extension uses ~/Documents, and so does
// this. xdg-user-dir prints the home itself when no DOCUMENTS entry is configured, and the extension
// then reads ~/Cline, so that answer stands.
export function osDocumentsDir(platform = process.platform) {
  const fallback = path.join(os.homedir(), "Documents");
  const query = QUERIES[platform];
  if (!query) return fallback;
  try {
    const out = query.decode(execFileSync(query.command, query.args, { encoding: "utf8", timeout: QUERY_TIMEOUT_MS, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim());
    return out ? path.resolve(out) : fallback;
  } catch {
    return fallback;
  }
}

// The Documents folder of each signed-in OneDrive account, which the Cline CLI and SDK bundle also
// scan for user rules (not workflows).
export function oneDriveDocumentsDirs(env = process.env) {
  return ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]
    .map((name) => env[name]?.trim())
    .filter(Boolean)
    .map((dir) => path.resolve(dir, "Documents"));
}

export function samePath(left, right, platform = process.platform) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
