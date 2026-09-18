// 译文格式把关：首尾空白、括号与引号配对、占位符跨语言一致
// 占位符形如 {amount}：花括号包起来，名字字母起头，后面可以跟字母、数字与下划线
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

// 成对的符号：kind 用来在报错时区分「括号」与「引号」
const PAIR_GROUPS = [
  { kind: '括号', pairs: [['(', ')'], ['[', ']'], ['{', '}'], ['（', '）'], ['【', '】'], ['《', '》']] },
  { kind: '引号', pairs: [['「', '」'], ['『', '』'], ['“', '”'], ['‘', '’']] },
];

const OPENERS = new Map(); // 左符号 -> { closer, kind }
const CLOSERS = new Map(); // 右符号 -> { kind }
PAIR_GROUPS.forEach((group) => {
  group.pairs.forEach(([open, close]) => {
    OPENERS.set(open, { closer: close, kind: group.kind });
    CLOSERS.set(close, { kind: group.kind });
  });
});

// 单词字符（含中日韩文字），用来识别 don’t 这类撇号
const WORD_CHAR = /[\p{L}\p{N}]/u;

// 夹在两个单词字符中间的引号按撇号处理，不参与配对
function isApostrophe(chars, index) {
  return index > 0 && index < chars.length - 1
    && WORD_CHAR.test(chars[index - 1])
    && WORD_CHAR.test(chars[index + 1]);
}

// 首尾多余空白：返回 { leading, trailing } 各自的空白字符数，没有则返回 null
function findEdgeWhitespace(text) {
  const leadMatch = text.match(/^\s+/);
  const leading = leadMatch ? leadMatch[0].length : 0;
  const trailMatch = text.slice(leading).match(/\s+$/);
  const trailing = trailMatch ? trailMatch[0].length : 0;
  if (!leading && !trailing) return null;
  return { leading, trailing };
}

// 扫描括号与引号是否两两配对，发现第一处问题就返回，全部配对返回 null
// 英文直引号 " 与 ' 没有左右之分，只要求总数是偶数；' 夹在单词中间时按撇号跳过
function findPairProblem(text) {
  const chars = Array.from(text);
  const stack = [];
  let doubleQuotes = 0;
  let singleQuotes = 0;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const opener = OPENERS.get(char);
    if (opener) {
      stack.push({ char, index, kind: opener.kind, closer: opener.closer });
      continue;
    }
    const closer = CLOSERS.get(char);
    if (closer) {
      if (char === '’' && isApostrophe(chars, index)) continue;
      const top = stack[stack.length - 1];
      if (top && top.closer === char) {
        stack.pop();
        continue;
      }
      return { type: 'closing', char, index, kind: closer.kind };
    }
    if (char === '"') doubleQuotes += 1;
    if (char === "'" && !isApostrophe(chars, index)) singleQuotes += 1;
  }

  if (stack.length) {
    const top = stack[stack.length - 1];
    return { type: 'opening', char: top.char, index: top.index, kind: top.kind };
  }
  if (doubleQuotes % 2 === 1) return { type: 'straight', char: '"', count: doubleQuotes };
  if (singleQuotes % 2 === 1) return { type: 'straight', char: "'", count: singleQuotes };
  return null;
}

// 把配对问题翻译成一句中文说明，指出具体是第几个字符、期望什么
function describePairProblem(problem) {
  if (problem.type === 'closing') {
    return `第 ${problem.index + 1} 个字符「${problem.char}」没有与之配对的左${problem.kind}`;
  }
  if (problem.type === 'opening') {
    return `第 ${problem.index + 1} 个字符「${problem.char}」没有与之配对的右${problem.kind}`;
  }
  if (problem.char === '"') {
    return `英文双引号 " 需要两两配对，当前一共 ${problem.count} 个`;
  }
  return `英文单引号 ' 需要两两配对（单词中间的撇号不算），当前一共 ${problem.count} 个`;
}

// 提取文本里的占位符，返回 Map：名字 -> 出现次数
function extractPlaceholders(text) {
  const counts = new Map();
  Array.from(text.matchAll(PLACEHOLDER_PATTERN)).forEach((match) => {
    counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  });
  return counts;
}

// 以 reference 为基准比较 target 的占位符，名称集合与出现次数都要一致
// 返回差异说明列表（期望即基准的用法），完全一致时返回空数组
function diffPlaceholders(reference, target) {
  const problems = [];
  const names = Array.from(new Set([...reference.keys(), ...target.keys()])).sort();
  names.forEach((name) => {
    const expected = reference.get(name) || 0;
    const actual = target.get(name) || 0;
    if (expected === actual) return;
    if (actual === 0) {
      problems.push(`缺少 {${name}}（期望 ${expected} 处，实际 0 处）`);
    } else if (expected === 0) {
      problems.push(`多出 {${name}}（期望 0 处，实际 ${actual} 处）`);
    } else {
      problems.push(`{${name}} 的数量对不上（期望 ${expected} 处，实际 ${actual} 处）`);
    }
  });
  return problems;
}

module.exports = {
  findEdgeWhitespace,
  findPairProblem,
  describePairProblem,
  extractPlaceholders,
  diffPlaceholders,
};
