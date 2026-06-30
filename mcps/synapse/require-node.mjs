// Fail fast with a clear message when run under a Node that lacks a stable node:sqlite
// (<22.17), instead of letting build/test children crash deep with ERR_UNKNOWN_BUILTIN_MODULE.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 22 || (major === 22 && minor >= 17)) process.exit(0);
process.stderr.write(
  `synapse needs Node >=22.17 for node:sqlite; found ${process.version}.\n` +
  `Use Node 22.17+ (nvm/homebrew) or point PATH/SYNAPSE_NODE at one before running.\n`,
);
process.exit(1);
