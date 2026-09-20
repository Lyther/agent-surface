export function approximateTokens(text) {
  return Math.ceil(text.length / 4);
}

// One escaper for a double-quoted scalar in YAML or TOML: both use backslash escapes and neither
// wants embedded newlines in a single-line description.
export function quotedScalar(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/\s+/g, " ").trim();
}

export function tomlMultilineString(value) {
  if (!value.includes("'''")) return `'''${value}'''`;
  return JSON.stringify(value);
}
