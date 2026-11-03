import {
  applyEdits,
  findNodeAtLocation,
  modify,
  parse as parseJsoncValue,
  parseTree,
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

// Sets one value at one path, creating its parents, or deletes it when `value` is undefined. Unlike a
// root property set, everything beside that path, comments included, keeps its bytes.
// Deletes one property and its own separating comma. jsonc-parser's removal edit also swallows comments
// between the neighbouring properties, which belong to the user's entries, not to the removed one.
export function removeJsoncProperty(text, path) {
  const property = findNodeAtLocation(parseTree(text, [], parseOptions), path)?.parent;
  if (property?.type !== "property") return text;
  const siblings = property.parent.children;
  const index = siblings.indexOf(property);
  const separators = [];
  visit(text, { onSeparator: (character, offset) => { if (character === ",") separators.push(offset); } }, parseOptions);
  const commaIn = (from, to) => separators.find((offset) => offset >= from && offset < to);
  const propertyEnd = property.offset + property.length;
  let start = property.offset;
  let end = propertyEnd;
  let out = text;
  const nextStart = index < siblings.length - 1 ? siblings[index + 1].offset : property.parent.offset + property.parent.length;
  const ownComma = commaIn(propertyEnd, nextStart);
  if (ownComma !== undefined) {
    end = ownComma + 1;
  } else if (index > 0) {
    const previous = siblings[index - 1];
    const comma = commaIn(previous.offset + previous.length, start);
    if (comma !== undefined) {
      out = out.slice(0, comma) + out.slice(comma + 1);
      start -= 1;
      end -= 1;
    }
  }
  // A property on lines of its own leaves no blank line behind.
  const lineStart = out.lastIndexOf("\n", start - 1) + 1;
  const newline = out.indexOf("\n", end);
  const lineEnd = newline === -1 ? out.length : newline;
  if (/^[ \t]*$/.test(out.slice(lineStart, start)) && /^[ \t\r]*$/.test(out.slice(end, lineEnd))) {
    return out.slice(0, lineStart) + out.slice(newline === -1 ? out.length : newline + 1);
  }
  return out.slice(0, start) + out.slice(end);
}

export function setJsoncPath(text, path, value) {
  return applyEdits(text, modify(text, path, value, {
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
