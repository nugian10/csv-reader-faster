// csv-reader-faster — a fast, exact drop-in for csv-reader 1.0.0.
//
// Reads one CSV input {text, header} and answers {columns, rows, errors},
// value for value what csv-reader 1.0.0 returns, without its one-character-
// at-a-time loop. Most records are plain: no quote anywhere on the line and
// no stray carriage return. Those are cut field by field out of the text
// with indexOf, no intermediate copy of the line. Only a record that actually
// stray CR, or a quote that never closes goes through the exact,
// field-by-field reader below, which follows the same broken-row policy
// character for character. Pure and deterministic: no clock, no random
// numbers, nothing kept from one call to the next.

/** How a field ended: at a comma (the record goes on), at a line break, or at the end of the text. */
const COMMA = 0;
const BREAK = 1;
const END = 2;

/** The reading of one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1; // a U+FEFF at the very start is dropped

  // The record being read: the line it starts on, and its index in rows (null while the header is unread).
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `start`, up to the next comma or line break. A CR not followed by LF is
  // dropped and recorded as stray_cr. Returns the field, how it ended, and how many characters were kept
  // (the caller needs the count to tell real quote junk from nothing at all).
  function readUnquoted(start) {
    let value = start;
    let added = 0;
    while (pos < n) {
      // Jump to the next character that can end or break the field.
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      const cr = text.indexOf('\r', pos);
      let cut = n;
      let kind = END;
      if (comma !== -1 && comma < cut) { cut = comma; kind = COMMA; }
      if (lf !== -1 && lf < cut) { cut = lf; kind = BREAK; }
      if (cr !== -1 && cr < cut) { cut = cr; kind = 3; }
      if (cut > pos) {
        value += text.slice(pos, cut);
        added += cut - pos;
        pos = cut;
      }
      if (kind === END) return { value, ended: END, added };
      if (kind === COMMA) {
        pos += 1;
        return { value, ended: COMMA, added };
      }
      if (kind === BREAK) {
        pos += 1;
        line += 1;
        return { value, ended: BREAK, added };
      }
      // A lone CR: dropped, and the field carries on after it.
      if (text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return { value, ended: BREAK, added };
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos += 1;
    }
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field and how it ended.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < n) {
      // Jump to the next quote, CR or LF inside the field.
      const quote = text.indexOf('"', pos);
      const cr = text.indexOf('\r', pos);
      const lf = text.indexOf('\n', pos);
      let cut = n;
      let kind = -1;
      if (quote !== -1 && quote < cut) { cut = quote; kind = 0; }
      if (cr !== -1 && cr < cut) { cut = cr; kind = 1; }
      if (lf !== -1 && lf < cut) { cut = lf; kind = 2; }
      if (cut > pos) {
        value += text.slice(pos, cut);
        pos = cut;
      }
      if (kind === -1) break; // ran out of text with the quote still open
      if (kind === 0) {
        if (text.charCodeAt(pos + 1) === 34) {
          value += '"'; // a doubled quote is one literal quote
          pos += 2;
          continue;
        }
        pos += 1;
        closed = true;
        break;
      }
      if (kind === 1) {
        // CRLF and a lone CR inside quotes are each one LF.
        value += '\n';
        line += 1;
        pos += text.charCodeAt(pos + 1) === 10 ? 2 : 1;
        continue;
      }
      value += '\n';
      line += 1;
      pos += 1;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  // Settles a finished record: a line left with no characters is no record; the first record sets the
  // width (and is the header when header is true); later records are padded or cut to it.
  function settle(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines left with no characters are no records.
    while (pos < n) {
      if (text.charCodeAt(pos) === 10) {
        pos += 1;
        line += 1;
      } else if (text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record's line, up to its line break, holds no quote and no stray CR, so every
    // field in it is unquoted. Walk its commas with indexOf and cut each field out directly — no
    // intermediate copy of the whole line, and no split.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    const quoteAt = text.indexOf('"', pos);
    const crAt = text.indexOf('\r', pos);
    const hasQuote = quoteAt !== -1 && quoteAt < lineEnd;
    const hasStrayCr = crAt !== -1 && crAt < lineEnd && !(crAt === lineEnd - 1 && nl !== -1);
    if (!hasQuote && !hasStrayCr) {
      const end = nl !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
      const fields = [];
      let start = pos;
      while (true) {
        const comma = text.indexOf(',', start);
        if (comma === -1 || comma >= end) {
          fields.push(text.slice(start, end));
          break;
        }
        fields.push(text.slice(start, comma));
        start = comma + 1;
      }
      pos = nl === -1 ? n : nl + 1;
      if (nl !== -1) line += 1;
      settle(fields, false);
      continue;
    }

    // Slow path: the record holds a quote or a stray CR, so read it field by field.
    const fields = [];
    let quoted = false;
    let field;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);
    settle(fields, quoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
