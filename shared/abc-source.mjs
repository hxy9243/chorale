/** Source-preserving preparation and voice identity for parsed ABC. */
export function isNotationOffset(abc, offset) {
  const lineStart = abc.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  // An actual field may begin here; its prose/options/lyrics are not inline notation.
  if (/^[ \t]*[A-Za-z]:/.test(abc.slice(lineStart)) && offset !== lineStart) return false;
  let quoted = false;
  for (let i = lineStart; i < offset; i++) {
    if (abc[i] === '"') {
      let escapes = 0;
      for (let j = i - 1; j >= lineStart && abc[j] === '\\'; j--) escapes++;
      if (escapes % 2 === 0) quoted = !quoted;
    } else if (abc[i] === '%' && !quoted) return false;
  }
  return !quoted;
}

export function prepareAbcWithMap(abc) {
  // These layout/tempo directives are also ignored by Chorale's playback model.
  const sanitized = abc.replace(/\[Q:[^\]]+\]|\[I:staff\s+[+-]?\d+\]/gi,
    (text, offset) => isNotationOffset(abc, offset) ? ' '.repeat(text.length) : text)
    // abcjs recognizes :: but warns on the equivalent legacy :|: spelling.
    // Keep the source width so every parsed range still points to original ABC.
    .replace(/:\|:/g, (text, offset) => isNotationOffset(abc, offset) ? ':: ' : text);
  const parts = sanitized.split(/(\r?\n)/);
  const inserted = [];
  let offset = 0;
  for (let i = 0; i < parts.length; i += 2) {
    if (!(i === parts.length - 1 && parts[i] === '') && /^[ \t]*$/.test(parts[i])) {
      if (parts[i].length) parts[i] = '%' + parts[i].slice(1);
      else { parts[i] = '%'; inserted.push(offset); }
    }
    offset += parts[i].length + (parts[i + 1]?.length || 0);
  }
  return {
    prepared: parts.join(''),
    toOriginalOffset(value) {
      let low = 0; let high = inserted.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (inserted[middle] < value) low = middle + 1; else high = middle;
      }
      return Math.max(0, value - low);
    },
  };
}

export function createVoiceResolver(abc, toOriginalOffset = (value) => value) {
  const ids = [];
  const markers = [];
  for (const match of abc.matchAll(/^[ \t]*V:\s*([^\s%\]]+)|\[V:\s*([^\]\s%]+)/gm)) {
    if (!isNotationOffset(abc, match.index)) continue;
    const id = match[1] || match[2];
    if (!ids.includes(id)) ids.push(id);
    markers.push({ offset: match.index, id });
  }
  return (voice, slot) => {
    const first = voice.find((element) => Number.isInteger(element.startChar) && element.startChar >= 0);
    if (!first) return ids[slot] || `voice-${slot + 1}`;
    const offset = toOriginalOffset(first.startChar);
    let low = 0; let high = markers.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (markers[middle].offset <= offset) low = middle + 1; else high = middle;
    }
    return low ? markers[low - 1].id : ids[slot] || `voice-${slot + 1}`;
  };
}

/** Locate actual voice-scoped fields; quoted prose/comments cannot change state. */
export function collectVoiceContextFields(abc) {
  const fields = [];
  let voiceId = 'voice-1';
  let headerEnded = false;
  let headerKey = 'C';
  for (const match of abc.matchAll(/^[ \t]*([VK]):([^\r\n]*)|\[([VK]):([^\]]*)\]/gm)) {
    if (!isNotationOffset(abc, match.index)) continue;
    const type = match[1] || match[3];
    const raw = stripAbcComment(match[2] ?? match[4]).trim();
    if (type === 'V') {
      const declaration = /^([^\s]+)(.*)$/.exec(raw);
      if (!declaration) continue;
      voiceId = declaration[1];
      fields.push({ type: 'voice', voiceId, value: declaration[2].trim(), offset: match.index });
    } else if (!headerEnded && match[1] === 'K') {
      headerEnded = true;
      headerKey = raw;
    } else {
      fields.push({ type: 'key', voiceId, value: raw, offset: match.index });
    }
  }
  return { headerKey, fields };
}

export function stripAbcComment(line) {
  for (const match of line.matchAll(/%/g)) {
    if (isNotationOffset(line, match.index)) return line.slice(0, match.index);
  }
  return line;
}
