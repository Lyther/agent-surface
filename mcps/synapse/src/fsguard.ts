// Owner-only protection for the synapse data directory.
//
// POSIX gets it from the mode bits each file is written with. Windows ignores those — chmod there
// only toggles the read-only attribute — so a bearer token, a discovery file carrying that token,
// and the memory databases would all keep whatever ACL they inherited and stay readable by every
// account on the machine. Restrict the DIRECTORY instead of each file: SQLite creates -wal and -shm
// siblings of its own, and an inherited-from-the-directory ACL covers them without this module
// having to know every filename.
import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";

const guarded = new Set<string>();

/** Idempotent, and a no-op off Windows. Reports rather than failing: losing memory is worse. */
export function ensureOwnerOnlyDir(dir: string): void {
  if (process.platform !== "win32" || guarded.has(dir)) return;
  guarded.add(dir);
  const user = userInfo().username;
  // icacls parses its own command line; a Windows path and a username cannot contain a quote, so
  // neither argument can break out. (OI)(CI)F = full control, inherited by files and subdirectories.
  const result = spawnSync("icacls", [dir, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`], { windowsHide: true, encoding: "utf8" });
  if (result.status === 0) return;
  process.stderr.write(`[synapse] could not restrict ${dir} to ${user} (icacls ${result.status ?? result.error?.message}); its contents may be readable by other accounts on this machine\n`);
}
