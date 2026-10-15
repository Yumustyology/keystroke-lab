// The smallest single edit that turns `prev` into `next`: { at, del, ins }.
// Typing produces one contiguous change per input, so prefix/suffix matching is exact here.
export function diffText(prev, next) {
  if (prev === next) return null;
  let p = 0;
  const max = Math.min(prev.length, next.length);
  while (p < max && prev[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  return { at: p, del: prev.length - p - s, ins: next.slice(p, next.length - s) };
}

export function applyDiff(text, d) {
  return text.slice(0, d.at) + d.ins + text.slice(d.at + d.del);
}
