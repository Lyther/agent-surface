// Owner-only protection for the synapse data directory.
//
// Restrict the DIRECTORY rather than each file: SQLite creates -wal and -shm siblings under the
// process umask (0644 by default), and only the directory boundary covers them without this module
// having to know every filename. POSIX gets mode 0700. Windows ignores mode bits — chmod there only
// toggles the read-only attribute — so it gets an owner-only ACL that files inherit instead.
import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { userInfo } from "node:os";

const guarded = new Set<string>();

/** Idempotent. Reports rather than failing: losing memory is worse. */
export function ensureOwnerOnlyDir(dir: string): void {
  if (guarded.has(dir)) return;
  guarded.add(dir);
  if (process.platform !== "win32") {
    try { chmodSync(dir, 0o700); } catch (e) {
      process.stderr.write(`[synapse] could not restrict ${dir} to mode 0700 (${e instanceof Error ? e.message : String(e)}); its contents may be readable by other users on this machine\n`);
    }
    return;
  }
  const user = userInfo().username;
  // icacls parses its own command line; a Windows path and a username cannot contain a quote, so
  // neither argument can break out. (OI)(CI)F = full control, inherited by files and subdirectories.
  const result = spawnSync("icacls", [dir, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`], { windowsHide: true, encoding: "utf8" });
  if (result.status === 0) return;
  process.stderr.write(`[synapse] could not restrict ${dir} to ${user} (icacls ${result.status ?? result.error?.message}); its contents may be readable by other accounts on this machine\n`);
}
