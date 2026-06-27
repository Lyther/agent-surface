#!/usr/bin/env bash
# synapse MCP — end-to-end protocol test through stdio.
# Exercises every tool via real MCP JSON-RPC over stdio.
set -euo pipefail
cd "$(dirname "$0")/.."

DBDIR=$(mktemp -d /tmp/synapse-e2e-XXXX)
export SYNAPSE_AGENT_ID=e2e-agent
export SYNAPSE_DB_DIR="$DBDIR"
export SYNAPSE_NAMESPACE=e2e-ns

# Helper: send MCP requests and capture responses.
# Each request is a line; we pipe all at once and parse.
REQUESTS=''

# 1. initialize
REQUESTS+='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"e2e","version":"0.0.1"}}}
'
# 2. notifications/initialized
REQUESTS+='{"jsonrpc":"2.0","method":"notifications/initialized"}
'
# 3. tools/list
REQUESTS+='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
'
# 4. synapse_status
REQUESTS+='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"synapse_status","arguments":{}}}
'
# 5. bus_publish
REQUESTS+='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"bus_publish","arguments":{"topic":"build-status","body":"agent A starting work on src/auth.ts"}}}
'
# 6. bus_subscribe
REQUESTS+='{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"bus_subscribe","arguments":{"topics":["build-status"]}}}
'
# 7. bus_messages
REQUESTS+='{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"bus_messages","arguments":{"since":0,"limit":50}}}
'
# 8. bus_dm
REQUESTS+='{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"bus_dm","arguments":{"to":"agent-b","body":"hey can you review my PR?"}}}
'
# 9. bus_reserve
REQUESTS+='{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"bus_reserve","arguments":{"resourceGlob":"src/auth.ts","ttlMs":300000}}}
'
# 10. bus_reservations
REQUESTS+='{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"bus_reservations","arguments":{}}}
'
# 11. bus_presence
REQUESTS+='{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"bus_presence","arguments":{"caps":["code","review"]}}}
'
# 12. memory_remember (with a secret to test redaction)
REQUESTS+='{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"memory_remember","arguments":{"content":"The API key is Bearer ya29.a0ARrdaM-abc123 and the GitHub token is ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD","scope":"shared","type":"fact"}}}
'
# 13. memory_remember (clean fact)
REQUESTS+='{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"memory_remember","arguments":{"content":"Auth service uses JWT at /v2/token endpoint","scope":"shared","type":"decision","tags":["auth","api"]}}}
'
# 14. memory_recall
REQUESTS+='{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"memory_recall","arguments":{"query":"JWT auth API","limit":10}}}
'
# 15. memory_supersede (supersede the clean fact)
REQUESTS+='{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"memory_supersede","arguments":{"targetId":12,"content":"Auth moved to /v3/token","reason":"endpoint changed"}}}
'
# 16. memory_recall (should find the new fact)
REQUESTS+='{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"memory_recall","arguments":{"query":"auth token endpoint","limit":10}}}
'
# 17. memory_history (should show both old and new)
REQUESTS+='{"jsonrpc":"2.0","id":16,"method":"tools/call","params":{"name":"memory_history","arguments":{"query":"auth token","limit":10}}}
'
# 18. synapse_export
REQUESTS+='{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"synapse_export","arguments":{"limit":100}}}
'
# 19. bus_release
REQUESTS+='{"jsonrpc":"2.0","id":18,"method":"tools/call","params":{"name":"bus_release","arguments":{"resourceGlob":"src/auth.ts"}}}
'
# 20. synapse_record_delete (tombstone the leaked-secret memory)
REQUESTS+='{"jsonrpc":"2.0","id":19,"method":"tools/call","params":{"name":"synapse_record_delete","arguments":{"targetId":11,"reason":"contains leaked secrets"}}}
'
# 21. memory_recall (should NOT find the tombstoned record)
REQUESTS+='{"jsonrpc":"2.0","id":20,"method":"tools/call","params":{"name":"memory_recall","arguments":{"query":"API key Bearer GitHub token","limit":10}}}
'

echo "$REQUESTS" | timeout 10 node --import tsx -e "
import { createServer } from './src/server.ts';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const { server: s } = createServer();
const t = new StdioServerTransport();
await s.connect(t);
await new Promise(r => process.stdin.on('close', r));
" 2>/dev/null > "$DBDIR/output.json"

# Parse and verify each response
node -e "
const fs = require('fs');
const lines = fs.readFileSync('$DBDIR/output.json', 'utf8').split('\n').filter(l => l.trim());
const results = {};
for (const l of lines) {
  try { const r = JSON.parse(l); if (r.id) results[r.id] = r; } catch {}
}

let pass = 0, fail = 0;
function check(id, label, fn) {
  const r = results[id];
  if (!r) { console.log('FAIL: ' + label + ' (no response)'); fail++; return; }
  if (r.error) { console.log('FAIL: ' + label + ' (error: ' + JSON.stringify(r.error) + ')'); fail++; return; }
  try { fn(r); console.log('PASS: ' + label); pass++; }
  catch(e) { console.log('FAIL: ' + label + ' (' + e.message + ')'); fail++; }
}

// 1. initialize
check(1, 'initialize', r => {
  if (!r.result.serverInfo || r.result.serverInfo.name !== 'synapse') throw new Error('wrong server name');
});
// 2. tools/list
check(2, 'tools/list', r => {
  const names = r.result.tools.map(t => t.name);
  const expected = ['synapse_status','synapse_export','synapse_record_delete','bus_publish','bus_subscribe','bus_messages','bus_dm','bus_reserve','bus_release','bus_reservations','bus_presence','memory_remember','memory_recall','memory_supersede','memory_history'];
  for (const e of expected) { if (!names.includes(e)) throw new Error('missing tool: ' + e); }
  if (names.length !== 15) throw new Error('expected 15 tools, got ' + names.length);
});
// 3. synapse_status
check(3, 'synapse_status', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.namespace !== 'e2e-ns') throw new Error('wrong namespace');
  if (d.agentId !== 'e2e-agent') throw new Error('wrong agentId');
});
// 4. bus_publish
check(4, 'bus_publish', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (!d.offset || !d.ts) throw new Error('missing offset/ts');
});
// 5. bus_subscribe
check(5, 'bus_subscribe', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.ok !== true) throw new Error('subscribe not ok');
});
// 6. bus_messages
check(6, 'bus_messages', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (!d.messages || d.messages.length === 0) throw new Error('no messages returned');
  if (d.messages[0].body !== 'agent A starting work on src/auth.ts') throw new Error('wrong message body');
});
// 7. bus_dm
check(7, 'bus_dm', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (!d.offset) throw new Error('missing offset');
});
// 8. bus_reserve
check(8, 'bus_reserve', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.ok !== true) throw new Error('reserve failed');
  if (d.reservation.resourceGlob !== 'src/auth.ts') throw new Error('wrong glob');
});
// 9. bus_reservations
check(9, 'bus_reservations', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.reservations.length !== 1) throw new Error('expected 1 reservation');
});
// 10. bus_presence
check(10, 'bus_presence', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.agents.length === 0) throw new Error('no agents in presence');
  if (!d.agents.some(a => a.agentId === 'e2e-agent')) throw new Error('e2e-agent not in presence');
});
// 11. memory_remember (with secret)
check(11, 'memory_remember with redaction', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.redactions < 2) throw new Error('expected >=2 redactions, got ' + d.redactions);
});
// 12. memory_remember (clean)
check(12, 'memory_remember clean', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.redactions !== 0) throw new Error('expected 0 redactions');
});
// 13. memory_recall
check(13, 'memory_recall', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (!d.results || d.results.length === 0) throw new Error('no results');
  if (!d.results.some(m => m.content.includes('JWT'))) throw new Error('JWT not found in results');
});
// 14. memory_supersede
check(14, 'memory_supersede', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (!d.offset) throw new Error('missing offset');
});
// 15. memory_recall (new fact)
check(15, 'memory_recall after supersede', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (!d.results.some(m => m.content.includes('/v3/token'))) throw new Error('new fact not found');
  if (d.results.some(m => m.content.includes('/v2/token'))) throw new Error('old fact should be hidden');
});
// 16. memory_history (both)
check(16, 'memory_history', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.records.length < 2) throw new Error('expected >=2 history records');
});
// 17. synapse_export
check(17, 'synapse_export', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.events.length === 0) throw new Error('no events exported');
});
// 18. bus_release
check(18, 'bus_release', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.released !== true) throw new Error('release failed');
});
// 19. synapse_record_delete (tombstone)
check(19, 'synapse_record_delete', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (!d.offset) throw new Error('missing offset');
});
// 20. memory_recall (tombstoned should be gone)
check(20, 'memory_recall after tombstone', r => {
  const d = JSON.parse(r.result.content[0].text);
  if (d.results.some(m => m.content.includes('REDACTED'))) throw new Error('tombstoned record still in recall');
  // Note: the content was already redacted, so we check it's excluded from FTS.
  if (d.results.some(m => m.id === 11)) throw new Error('tombstoned record id 11 still in recall');
});

console.log('\\n=== E2E RESULTS: ' + pass + ' pass, ' + fail + ' fail ===');
if (fail > 0) process.exit(1);
"

EXIT=$?
rm -rf "$DBDIR"
exit $EXIT
