export function approximateTokens(text) {
  return Math.ceil(text.length / 4);
}

export function yamlString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/\s+/g, " ").trim();
}

export function tomlString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/\s+/g, " ").trim();
}

export function tomlMultilineString(value) {
  if (!value.includes("'''")) return `'''${value}'''`;
  return JSON.stringify(value);
}
