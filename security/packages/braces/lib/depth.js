'use strict';

// A hard ceiling, not an option callers can disable. Check supplied ASTs
// iteratively too, so direct compile/expand/stringify calls cannot bypass it.
const MAX_DEPTH = 64;
const assertDepth = ast => {
  const pending = [[ast, 0]];
  const seen = new Set();
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > MAX_DEPTH || seen.has(node)) {
      throw new SyntaxError('Brace pattern exceeds safe nesting depth');
    }
    seen.add(node);
    for (const child of node.nodes || []) pending.push([child, depth + 1]);
  }
};

module.exports = { MAX_DEPTH, assertDepth };
