import {
  applyEdits,
  modify,
  parse as parseJsoncValue,
  printParseErrorCode,
  visit,
} from "jsonc-parser";

const parseOptions = { allowTrailingComma: true };

export function parseJsonc(text, label) {
  const result = parseJsoncResult(text);
  if (result.ok) return result.value;
  throw new Error(`${label}: invalid JSONC: ${result.error.message}`);
}
export function parseJsoncResult(text) {
  try {
    const errors = [];
    const value = parseJsoncValue(text, errors, parseOptions);
    if (errors.length > 0) {
      const first = errors[0];
      throw new Error(`${printParseErrorCode(first.error)} at offset ${first.offset}`);
    }
    const duplicate = duplicateProperty(text);
    if (duplicate) {
      throw new Error(`duplicate ${duplicate.root ? "root" : "object"} property: ${duplicate.key}`);
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
}

export function mergeKiloInstructionJsonc(text, addInstructions, removeInstructions) {
  const parsed = parseJsonc(text, "instructions");
  const current = parsed.instructions ?? [];
  if (!Array.isArray(current)) throw new Error("instructions: instructions must be an array");
  const removed = new Set(removeInstructions);
  return setJsoncRootProperty(text, "instructions", [
    ...current.filter((value) => !removed.has(value)),
    ...addInstructions,
  ]);
}

export function setJsoncRootProperty(text, key, value) {
  const parsed = parseJsonc(text, key);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key}: root config must be an object`);
  }
  return applyEdits(text, modify(text, [key], value, {
    formattingOptions: formattingOptions(text),
  }));
}

function duplicateProperty(text) {
  const seen = new Map();
  let duplicate = null;
  visit(text, {
    onObjectProperty(property, _offset, _length, _line, _character, pathSupplier) {
      if (duplicate) return;
      const path = pathSupplier();
      const scope = JSON.stringify(path);
      let keys = seen.get(scope);
      if (!keys) {
        keys = new Set();
        seen.set(scope, keys);
      }
      if (keys.has(property)) duplicate = { key: property, root: path.length === 0 };
      else keys.add(property);
    },
  }, parseOptions);
  return duplicate;
}

function formattingOptions(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = text.match(/\n([ \t]+)"/)?.[1] ?? "  ";
  return indent.includes("\t")
    ? { tabSize: 1, insertSpaces: false, eol }
    : { tabSize: Math.max(1, indent.length), insertSpaces: true, eol };
}
