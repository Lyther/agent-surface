"""Detector tests: fixtures are trimmed real control trajectories (SQ0.2) plus constructed workspace-read cases."""

import json
import tempfile
import unittest
from pathlib import Path

from evals.detect import verdict

FIXTURES = Path(__file__).parent / "fixtures"
SKILL_DIRS = {"opencode": ".config/opencode/skills", "droid": ".agents/skills", "claude-code": ".claude/skills", "codex": ".agents/skills"}


def fixture(host: str, control: str) -> Path:
    return FIXTURES / f"{host}-{control}"


class RealControls(unittest.TestCase):
    def check(self, host, control, loaded, evidence=None, disagreements=0):
        got = verdict(fixture(host, control), host)
        self.assertEqual(got["loaded"], loaded)
        if evidence:
            self.assertEqual(got["evidence"], evidence)
        self.assertEqual(len(got["disagreements"]), disagreements)
        self.assertEqual(got["workspace_skill_reads"], [])
        self.assertEqual(got["failed_lookups"], [])

    def test_opencode_use_by_name(self):
        self.check("opencode", "use-by-name", ["dev-fix"], {"dev-fix": "skill tool call"})

    def test_opencode_use_by_file(self):
        self.check("opencode", "use-by-file", ["dev-fix"], {"dev-fix": "read of SKILL.md"})

    def test_opencode_no_skill(self):
        self.check("opencode", "no-skill", [])

    def test_droid_use_by_name_is_invisible_to_the_audit(self):
        got = verdict(fixture("droid", "use-by-name"), "droid")
        self.assertEqual(got["evidence"], {"dev-fix": "Skill tool call"})
        self.assertEqual(got["audit_loads"], [])
        self.assertIn("opens no skill file", got["disagreements"][0]["cause"])

    def test_droid_use_by_file(self):
        self.check("droid", "use-by-file", ["dev-fix"], {"dev-fix": "Read of SKILL.md"})

    def test_droid_no_skill(self):
        self.check("droid", "no-skill", [])

    def test_claude_code_use_by_name_is_invisible_to_the_audit(self):
        got = verdict(fixture("claude-code", "use-by-name"), "claude-code")
        self.assertEqual(got["evidence"], {"dev-fix": "Skill tool call"})
        self.assertEqual(got["audit_loads"], [])
        self.assertIn("opens no skill file", got["disagreements"][0]["cause"])

    def test_claude_code_use_by_file(self):
        self.check("claude-code", "use-by-file", ["dev-fix"], {"dev-fix": "Read of SKILL.md"})

    def test_claude_code_no_skill(self):
        self.check("claude-code", "no-skill", [])

    def test_codex_use_by_name_reads_the_file_through_the_shell(self):
        self.check("codex", "use-by-name", ["dev-fix"], {"dev-fix": "exec_command of SKILL.md"})

    def test_codex_use_by_file(self):
        self.check("codex", "use-by-file", ["dev-fix"], {"dev-fix": "exec_command of SKILL.md"})

    def test_codex_no_skill(self):
        self.check("codex", "no-skill", [])

    def test_startup_scan_alone_is_not_a_load(self):
        for host in ("opencode", "droid", "claude-code", "codex"):
            got = verdict(fixture(host, "no-skill"), host)
            self.assertGreater(got["scanned"], 0)  # the scan was observed
            self.assertEqual(got["audit_loads"], [])


class Constructed(unittest.TestCase):
    """An arm A attempt (dev-fix not installed) whose workspace carries the repository's skills."""

    def attempt(self, host, calls, installed=("qa-review",), opens=()):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        agent = Path(tmp.name) / "agent"
        agent.mkdir()
        (agent / "arm-skills.txt").write_text("".join(f"{SKILL_DIRS[host]}/{n}/SKILL.md\n" for n in installed))
        (agent / "skill-opens.log").write_text("".join(f"{t} OPEN /root/{SKILL_DIRS[host]}/{n}/SKILL.md\n" for t, n in opens))
        if host == "opencode":
            events = [{"type": "step_start", "timestamp": 1000000}]
            events += [{"type": "tool_use", "timestamp": 1001000 + i, "part": {"type": "tool", "tool": t, "state": {"input": p}}} for i, (t, p) in enumerate(calls)]
            (agent / "opencode.txt").write_text("".join(json.dumps(e) + "\n" for e in events))
        elif host == "droid":
            events = [{"type": "system", "subtype": "init", "cwd": "/app"}]
            events += [{"type": "tool_call", "toolName": t, "parameters": p, "timestamp": 1001000 + i} for i, (t, p) in enumerate(calls)]
            (agent / "droid.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
        elif host == "claude-code":
            events = [{"type": "system", "subtype": "init", "cwd": "/app"}]
            events += [{"type": "assistant", "timestamp": f"1970-01-01T00:16:41.{i:03d}Z", "message": {"content": [{"type": "tool_use", "name": t, "input": p}]}} for i, (t, p) in enumerate(calls)]
            (agent / "claude.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
        else:
            events = [{"timestamp": "1970-01-01T00:16:40.000Z", "type": "turn_context", "payload": {"cwd": "/app"}}]
            events += [{"timestamp": f"1970-01-01T00:16:41.{i:03d}Z", "type": "response_item", "payload": {"type": "function_call", "name": t, "arguments": json.dumps(p)}} for i, (t, p) in enumerate(calls)]
            (agent / "codex-sessions").mkdir()
            (agent / "codex-sessions" / "rollout-x.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
        return Path(tmp.name)

    def test_claude_code_workspace_read_is_not_a_load(self):
        got = verdict(self.attempt("claude-code", [("Read", {"file_path": "/app/skills/dev-fix/SKILL.md"})]), "claude-code")
        self.assertEqual(got["loaded"], [])
        self.assertEqual(got["workspace_skill_reads"], [{"tool": "Read", "path": "/app/skills/dev-fix/SKILL.md"}])

    def test_codex_relative_workspace_read_is_not_a_load(self):
        call = ("exec_command", {"cmd": "sed -n '1,40p' skills/dev-fix/SKILL.md", "workdir": "/app"})
        got = verdict(self.attempt("codex", [call]), "codex")
        self.assertEqual(got["loaded"], [])
        self.assertEqual(got["workspace_skill_reads"], [{"tool": "exec_command", "path": "/app/skills/dev-fix/SKILL.md"}])

    def test_codex_read_of_the_installed_file_is_a_load(self):
        call = ("exec_command", {"cmd": "cat /root/.agents/skills/qa-review/SKILL.md", "workdir": "/app"})
        got = verdict(self.attempt("codex", [call], opens=[(1002.0, "qa-review")]), "codex")
        self.assertEqual(got["loaded"], ["qa-review"])

    def test_opencode_workspace_read_is_not_a_load(self):
        got = verdict(self.attempt("opencode", [("read", {"filePath": "/app/skills/dev-fix/SKILL.md"})]), "opencode")
        self.assertEqual(got["loaded"], [])
        self.assertEqual(got["workspace_skill_reads"], [{"tool": "read", "path": "/app/skills/dev-fix/SKILL.md"}])
        self.assertEqual(got["disagreements"], [])

    def test_droid_relative_workspace_command_is_not_a_load(self):
        got = verdict(self.attempt("droid", [("Execute", {"command": "cat skills/dev-fix/SKILL.md"})]), "droid")
        self.assertEqual(got["loaded"], [])
        self.assertEqual(got["workspace_skill_reads"], [{"tool": "Execute", "path": "/app/skills/dev-fix/SKILL.md"}])

    def test_skill_tool_for_an_uninstalled_skill_is_a_failed_lookup(self):
        for host, tool, key in (("opencode", "skill", "name"), ("droid", "Skill", "skill"), ("claude-code", "Skill", "skill")):
            got = verdict(self.attempt(host, [(tool, {key: "dev-fix"})]), host)
            self.assertEqual(got["loaded"], [])
            self.assertEqual(got["failed_lookups"], [{"tool": tool, "name": "dev-fix"}])

    def test_installed_file_read_through_home_is_a_load(self):
        for host, tool, key in (("opencode", "bash", "command"), ("droid", "Execute", "command")):
            path = f"~/{SKILL_DIRS[host]}/qa-review/SKILL.md"
            got = verdict(self.attempt(host, [(tool, {key: f"head -5 {path}"})], opens=[(1002.0, "qa-review")]), host)
            self.assertEqual(got["loaded"], ["qa-review"])
            self.assertEqual(got["workspace_skill_reads"], [])

    def test_leading_cd_resolves_a_relative_installed_path(self):
        command = f"cd /root/{SKILL_DIRS['droid']}/qa-review && cat SKILL.md"
        self.assertEqual(verdict(self.attempt("droid", [("Execute", {"command": command})]), "droid")["loaded"], ["qa-review"])

    def test_unresolvable_path_counts_only_with_audit_proof(self):
        command = f"cd /tmp && cd /var && cat {SKILL_DIRS['droid']}/qa-review/SKILL.md"
        calls = [("Execute", {"command": command})]
        without = verdict(self.attempt("droid", calls), "droid")
        self.assertEqual(without["loaded"], [])
        self.assertEqual(len(without["workspace_skill_reads"]), 1)
        self.assertEqual(verdict(self.attempt("droid", calls, opens=[(1002.0, "qa-review")]), "droid")["loaded"], ["qa-review"])


if __name__ == "__main__":
    unittest.main()
