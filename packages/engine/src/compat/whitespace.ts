// Python's whitespace (`str.isspace()`, and `\s` in a `str` pattern) as a
// RegExp class for the `u` flag. JavaScript's `\s` adds U+FEFF and leaves
// out U+001C to U+001F and U+0085.
export const PY_WHITESPACE_CLASS =
  '[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u{1680}\\u{2000}-\\u{200a}\\u{2028}\\u{2029}\\u{202f}\\u{205f}\\u{3000}]'
