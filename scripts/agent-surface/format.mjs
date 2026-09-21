export function approximateTokens(text) {
  return Math.ceil(text.length / 4);
}

// One escaper for a double-quoted scalar in YAML or TOML: both use backslash escapes and neither
// wants embedded newlines in a single-line description.
export function quotedScalar(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/\s+/g, " ").trim();
}

// A YAML folded block carries its scalar literally: it folds line breaks into spaces and performs
// no escape processing, so the value needs its whitespace collapsed and nothing escaped.
export function foldedBlockScalar(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function tomlMultilineString(value) {
  if (!value.includes("'''")) return `'''${value}'''`;
  return JSON.stringify(value);
}
