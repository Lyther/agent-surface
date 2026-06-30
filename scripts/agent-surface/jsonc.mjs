export function parseJsonc(text, label) {
  const result = parseJsoncResult(text);
  if (result.ok) return result.value;
  throw new Error(`${label}: invalid JSONC: ${result.error.message}`);
}

export function parseJsoncResult(text) {
  try {
    return { ok: true, value: JSON.parse(stripJsonc(text)) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function mergeKiloInstructionJsonc(text, addInstructions, removeInstructions) {
  const tokens = jsoncTokens(text);
  const instructionsRange = findJsoncPropertyArray(tokens, "instructions");
  if (instructionsRange) {
    return replaceJsoncArrayStrings(text, instructionsRange, addInstructions, removeInstructions);
  }
  return insertJsoncRootProperty(text, tokens, "instructions", addInstructions);
}

export function mergeJsoncRootObjectProperty(text, key, entries) {
  const parsed = parseJsonc(text, key);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key}: root config must be an object`);
  }
  const current = parsed[key] ?? {};
  if (current === null || typeof current !== "object" || Array.isArray(current)) {
    throw new Error(`${key}: ${key} must be an object`);
  }

  const tokens = jsoncTokens(text);
  const merged = { ...current, ...entries };
  const range = findJsoncPropertyObject(tokens, key);
  if (range) return replaceJsoncValue(text, range, merged);
  return insertJsoncRootProperty(text, tokens, key, merged);
}

function stripJsonc(text) {
  return removeJsonTrailingCommas(removeJsoncComments(text));
}

function removeJsoncComments(text) {
  let out = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      out += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }

    out += char;
  }

  return out;
}

function removeJsonTrailingCommas(text) {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      out += char;
      continue;
    }

    if (char === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(text[nextIndex] ?? "")) nextIndex += 1;
      if (text[nextIndex] === "}" || text[nextIndex] === "]") continue;
    }

    out += char;
  }

  return out;
}

function replaceJsoncArrayStrings(text, range, addValues, removeValues) {
  const values = [
    ...range.tokens
      .filter((token) => token.type === "string")
      .map((token) => token.value)
      .filter((value) => !removeValues.includes(value)),
    ...addValues,
  ];
  const openLineStart = lineStart(text, range.open.start);
  const closeLineStart = lineStart(text, range.close.start);
  if (openLineStart === closeLineStart) {
    return `${text.slice(0, range.open.end)}${values.map((value) => JSON.stringify(value)).join(", ")}${text.slice(range.close.start)}`;
  }
  const closeIndent = text.slice(closeLineStart, range.close.start);
  const valueIndent = `${closeIndent}  `;
  const arrayContent = values.map((value) => `${valueIndent}${JSON.stringify(value)}`).join(",\n");
  const replacement = arrayContent ? `\n${arrayContent}\n${closeIndent}` : "";
  return `${text.slice(0, range.open.end)}${replacement}${text.slice(range.close.start)}`;
}

function insertJsoncRootProperty(text, tokens, key, value) {
  const rootOpen = tokens.find((token) => token.type === "{" && token.depth === 0);
  const rootClose = tokens.findLast((token) => token.type === "}" && token.depth === 0);
  if (!rootOpen || !rootClose) return `${JSON.stringify({ [key]: value }, null, 2)}\n`;
  if (lineStart(text, rootOpen.start) === lineStart(text, rootClose.start)) {
    const parsed = parseJsoncResult(text);
    if (parsed.ok && parsed.value !== null && typeof parsed.value === "object" && !Array.isArray(parsed.value)) {
      return `${JSON.stringify({ ...parsed.value, [key]: value }, null, 2)}\n`;
    }
  }

  const keyJson = JSON.stringify(key);
  const valueJson = JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
  const closeLineStart = lineStart(text, rootClose.start);
  const closeIndent = text.slice(closeLineStart, rootClose.start);
  const propIndent = `${closeIndent}  `;
  const property = `${propIndent}${keyJson}: ${valueJson}\n`;
  const rootTokens = tokens.filter((token) => token.start > rootOpen.start && token.end <= rootClose.start);

  if (rootTokens.length === 0) {
    return `${text.slice(0, closeLineStart)}${property}${text.slice(closeLineStart)}`;
  }

  const lastToken = rootTokens.at(-1);
  if (lastToken.type === ",") {
    return `${text.slice(0, closeLineStart)}${property}${text.slice(closeLineStart)}`;
  }

  return `${text.slice(0, lastToken.end)},${text.slice(lastToken.end, closeLineStart)}${property}${text.slice(closeLineStart)}`;
}

function replaceJsoncValue(text, range, value) {
  const valueLineStart = lineStart(text, range.open.start);
  const valuePrefix = text.slice(valueLineStart, range.open.start);
  const indent = valuePrefix.match(/^\s*/)?.[0] ?? "";
  const valueJson = JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join("\n");
  return `${text.slice(0, range.open.start)}${valueJson}${text.slice(range.close.end)}`;
}

function findJsoncPropertyArray(tokens, key) {
  for (let index = 0; index < tokens.length - 2; index += 1) {
    const keyToken = tokens[index];
    const colon = tokens[index + 1];
    const open = tokens[index + 2];
    if (keyToken.type !== "string" || keyToken.value !== key || keyToken.depth !== 1) continue;
    if (colon.type !== ":" || open.type !== "[") continue;

    let depth = 0;
    for (let closeIndex = index + 2; closeIndex < tokens.length; closeIndex += 1) {
      const token = tokens[closeIndex];
      if (token.type === "[") depth += 1;
      if (token.type === "]") depth -= 1;
      if (depth === 0) {
        return {
          open,
          close: token,
          tokens: tokens.slice(index + 3, closeIndex),
        };
      }
    }
  }
  return null;
}

function findJsoncPropertyObject(tokens, key) {
  for (let index = 0; index < tokens.length - 2; index += 1) {
    const keyToken = tokens[index];
    const colon = tokens[index + 1];
    const open = tokens[index + 2];
    if (keyToken.type !== "string" || keyToken.value !== key || keyToken.depth !== 1) continue;
    if (colon.type !== ":" || open.type !== "{") continue;

    let depth = 0;
    for (let closeIndex = index + 2; closeIndex < tokens.length; closeIndex += 1) {
      const token = tokens[closeIndex];
      if (token.type === "{") depth += 1;
      if (token.type === "}") depth -= 1;
      if (depth === 0) {
        return {
          open,
          close: token,
          tokens: tokens.slice(index + 3, closeIndex),
        };
      }
    }
  }
  return null;
}

function jsoncTokens(text) {
  const tokens = [];
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }

    if (char === "\"") {
      const start = index;
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === "\"") break;
        index += 1;
      }
      const raw = text.slice(start, index + 1);
      tokens.push({ type: "string", value: JSON.parse(raw), start, end: index + 1, depth });
      continue;
    }

    if (char === "{" || char === "[") {
      tokens.push({ type: char, start: index, end: index + 1, depth });
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]") {
      depth -= 1;
      tokens.push({ type: char, start: index, end: index + 1, depth });
      continue;
    }

    if (char === ":" || char === ",") {
      tokens.push({ type: char, start: index, end: index + 1, depth });
    }
  }

  return tokens;
}

function lineStart(text, index) {
  return text.lastIndexOf("\n", index - 1) + 1;
}
