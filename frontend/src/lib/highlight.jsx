/**
 * A tiny JavaScript highlighter for short, known snippets. It tokenises one
 * line at a time into comments, strings, keywords, numbers and function names.
 */
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|for|if|else|new|module|exports|require|await|async|import|from|export|default)\b|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)(?=\s*\()/g;

const CLASS_FOR_GROUP = ["", "tok-comment", "tok-string", "tok-keyword", "tok-number", "tok-fn"];

export function highlightLine(line) {
  const parts = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    const group = match.findIndex((value, index) => index > 0 && value !== undefined);
    parts.push(
      <span key={match.index} className={CLASS_FOR_GROUP[group]}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length ? parts : " ";
}
