const crypto = require('crypto');
const { load, save, MAX_TRANSLATION_LENGTH, MAX_NOTE_LENGTH, MAX_OPERATOR_LENGTH, UNNAMED } = require('./store');
const { ApiError, pickText } = require('./errors');

const MODULE_PATTERN = /^[a-z][a-z0-9-]{0,29}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/;
const MAX_KEY_LENGTH = 120;

// 占位符形如 {amount}：花括号包住字母起头的名字，平台原样保存，只检查各语言是否对得上
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

// 成对的括号与中文引号：左字符对应右字符，配对检查用栈维护嵌套层次
const PAIR_OPEN_TO_CLOSE = {
  '(': ')',
  '[': ']',
  '{': '}',
  '（': '）',
  '【': '】',
  '《': '》',
  '〈': '〉',
  '「': '」',
  '『': '』',
  '“': '”',
  '‘': '’',
};
const PAIR_CLOSE_TO_OPEN = {};
Object.keys(PAIR_OPEN_TO_CLOSE).forEach((ch) => {
  PAIR_CLOSE_TO_OPEN[PAIR_OPEN_TO_CLOSE[ch]] = ch;
});

// 单词中间的撇号不算引号：don't、it's 是缩略，users' 是复数所有格
function isApostrophe(chars, index) {
  const before = chars[index - 1] || '';
  const after = chars[index + 1] || '';
  if (/[A-Za-z]/.test(before) && /[A-Za-z]/.test(after)) return true;
  if (/[sS]/.test(before) && !/[A-Za-z]/.test(after)) return true;
  return false;
}

// 弯引号 ’ 夹在英文字母中间时是撇号（don’t），其余情况按右引号参与配对
function isCurlyApostrophe(chars, index) {
  return /[A-Za-z]/.test(chars[index - 1] || '') && /[A-Za-z]/.test(chars[index + 1] || '');
}

// 括号与引号的配对检查：遇到不配对就指出是第几个字符、期望看到什么。
// 英文直引号没有方向，成对出现即可；中文引号分方向，跟括号一起走栈
function checkPairs(code, value) {
  const chars = Array.from(value);
  const stack = [];
  let doubleQuoteAt = -1;
  let singleQuoteAt = -1;

  chars.forEach((ch, index) => {
    const pos = index + 1;
    if (ch === '’' && isCurlyApostrophe(chars, index)) return;
    if (PAIR_OPEN_TO_CLOSE[ch]) {
      stack.push({ ch, pos });
      return;
    }
    if (PAIR_CLOSE_TO_OPEN[ch]) {
      const top = stack[stack.length - 1];
      if (!top) {
        throw new ApiError(400, 'TRANSLATION_PAIR_MISMATCH',
          `${code} 的译文里第 ${pos} 个字符「${ch}」是多余的，前面没有与它配对的「${PAIR_CLOSE_TO_OPEN[ch]}」`,
          `translations.${code}`);
      }
      if (PAIR_OPEN_TO_CLOSE[top.ch] !== ch) {
        throw new ApiError(400, 'TRANSLATION_PAIR_MISMATCH',
          `${code} 的译文里第 ${pos} 个字符「${ch}」与第 ${top.pos} 个字符「${top.ch}」对不上，这里应当先出现「${PAIR_OPEN_TO_CLOSE[top.ch]}」`,
          `translations.${code}`);
      }
      stack.pop();
      return;
    }
    if (ch === '"') {
      doubleQuoteAt = doubleQuoteAt === -1 ? pos : -1;
      return;
    }
    if (ch === "'" && !isApostrophe(chars, index)) {
      singleQuoteAt = singleQuoteAt === -1 ? pos : -1;
    }
  });

  if (stack.length) {
    const top = stack[stack.length - 1];
    throw new ApiError(400, 'TRANSLATION_PAIR_MISMATCH',
      `${code} 的译文里第 ${top.pos} 个字符「${top.ch}」没有等到与它配对的「${PAIR_OPEN_TO_CLOSE[top.ch]}」`,
      `translations.${code}`);
  }
  if (doubleQuoteAt !== -1) {
    throw new ApiError(400, 'TRANSLATION_PAIR_MISMATCH',
      `${code} 的译文里第 ${doubleQuoteAt} 个字符「"」是落单的引号，直引号要成对出现`,
      `translations.${code}`);
  }
  if (singleQuoteAt !== -1) {
    throw new ApiError(400, 'TRANSLATION_PAIR_MISMATCH',
      `${code} 的译文里第 ${singleQuoteAt} 个字符「'」是落单的引号，直引号要成对出现`,
      `translations.${code}`);
  }
}

// 首尾空白检查：空串表示还没翻译是允许的，但只填空白字符不行
function checkWhitespace(code, value) {
  if (value === value.trim()) return;
  if (!value.trim()) {
    throw new ApiError(400, 'TRANSLATION_WHITESPACE',
      `${code} 的译文只填了空白字符，要么清空表示还没翻译，要么填写正文`,
      `translations.${code}`);
  }
  const lead = (value.match(/^\s+/) || [''])[0].length;
  const trail = (value.match(/\s+$/) || [''])[0].length;
  const parts = [];
  if (lead) parts.push(`开头 ${lead} 个`);
  if (trail) parts.push(`结尾 ${trail} 个`);
  throw new ApiError(400, 'TRANSLATION_WHITESPACE',
    `${code} 的译文首尾有多余空白：${parts.join('、')}空白字符，请去掉后再保存`,
    `translations.${code}`);
}

// 取出一条译文里的全部占位符，返回 名字 -> 出现次数；同名出现多次要累计，跨语言比较时数量也要一致
function collectPlaceholders(value) {
  const counts = new Map();
  Array.from(value.matchAll(PLACEHOLDER_PATTERN)).forEach((match) => {
    const name = match[1];
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return counts;
}

// 同一条文案下，各语言译文用到的占位符要对得上：名字集合一致，每个名字出现的次数也一致。
// 以默认语言（默认语言没填时取第一种有译文的语言）为基准逐个比较；留空的译文表示还没翻译，不参与比较
function checkPlaceholdersAcrossLanguages(translations, languages) {
  const filled = languages
    .map((item) => item.code)
    .filter((code) => typeof translations[code] === 'string' && translations[code] !== '');
  if (filled.length < 2) return;

  const fallback = languages.find((item) => item.isDefault);
  const refCode = fallback && translations[fallback.code] ? fallback.code : filled[0];
  const expected = collectPlaceholders(translations[refCode]);

  filled.forEach((code) => {
    if (code === refCode) return;
    const actual = collectPlaceholders(translations[code]);
    const problems = [];
    expected.forEach((count, name) => {
      const got = actual.get(name) || 0;
      if (got === 0) problems.push(`缺少 {${name}}（期望 ${count} 次）`);
      else if (got !== count) problems.push(`{${name}} 期望 ${count} 次、实际 ${got} 次`);
    });
    actual.forEach((count, name) => {
      if (!expected.has(name)) problems.push(`多出 {${name}}（实际 ${count} 次）`);
    });
    if (problems.length) {
      throw new ApiError(400, 'TRANSLATION_PLACEHOLDER_MISMATCH',
        `${code} 的占位符与 ${refCode} 对不上：${problems.join('，')}`,
        `translations.${code}`);
    }
  });
}

function validateModule(value) {
  const module = pickText(value);
  if (!module) throw new ApiError(400, 'MODULE_REQUIRED', '请填写模块名', 'module');
  if (!MODULE_PATTERN.test(module)) {
    throw new ApiError(400, 'MODULE_INVALID', '模块名要小写字母起头，后面可以跟数字与短横线，最长 30 个字符', 'module');
  }
  return module;
}

function validateKey(value) {
  const key = pickText(value);
  if (!key) throw new ApiError(400, 'KEY_REQUIRED', '请填写文案键', 'key');
  if (key.length > MAX_KEY_LENGTH) {
    throw new ApiError(400, 'KEY_TOO_LONG', `文案键不能超过 ${MAX_KEY_LENGTH} 个字符`, 'key');
  }
  if (!KEY_PATTERN.test(key)) {
    throw new ApiError(400, 'KEY_INVALID', '文案键要写成 home.banner.title 这样的形式，由小写字母、数字、下划线与短横线组成，并用点号至少分成两段', 'key');
  }
  return key;
}

// 译文逐条校验：语言必须是登记过的，取值必须是文本，长度、首尾空白、括号引号配对逐条过关；
// 全部译文各自过关之后，再检查同一条文案下各语言的占位符是否对得上
function validateTranslations(raw, languages) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError(400, 'TRANSLATIONS_INVALID', '译文需要按语言逐条填写', 'translations');
  }
  const known = new Map();
  languages.forEach((item) => known.set(item.code.toLowerCase(), item.code));

  const result = {};
  Object.keys(raw).forEach((code) => {
    const value = raw[code];
    const actual = known.get(String(code).toLowerCase());
    if (!actual) {
      throw new ApiError(400, 'LANGUAGE_UNKNOWN', `语言 ${code} 没有登记过，请先在语言区登记这种语言`, `translations.${code}`);
    }
    if (typeof value !== 'string') {
      throw new ApiError(400, 'TRANSLATION_INVALID', `${actual} 的译文需要是文本`, `translations.${actual}`);
    }
    if (value.length > MAX_TRANSLATION_LENGTH) {
      throw new ApiError(400, 'TRANSLATION_TOO_LONG', `${actual} 的译文不能超过 ${MAX_TRANSLATION_LENGTH} 个字符，当前 ${value.length} 个字符`, `translations.${actual}`);
    }
    checkWhitespace(actual, value);
    checkPairs(actual, value);
    // 留空表示这条还没翻译，原样保留一个空串，方便页面上看出是空的还是根本没这一项
    result[actual] = value;
  });
  checkPlaceholdersAcrossLanguages(result, languages);
  return result;
}

function validateNote(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new ApiError(400, 'NOTE_INVALID', '备注需要是文本', 'note');
  }
  if (value.length > MAX_NOTE_LENGTH) {
    throw new ApiError(400, 'NOTE_TOO_LONG', `备注不能超过 ${MAX_NOTE_LENGTH} 个字符`, 'note');
  }
  return value.trim();
}

// 操作者：页面顶栏填的名字，留空按未署名记录，只做长度检查
function validateOperator(value, fallback) {
  if (value === undefined || value === null) return fallback || UNNAMED;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'OPERATOR_INVALID', '操作者需要是文本', 'operator');
  }
  const name = value.trim();
  if (!name) return UNNAMED;
  if (name.length > MAX_OPERATOR_LENGTH) {
    throw new ApiError(400, 'OPERATOR_TOO_LONG', `操作者名字不能超过 ${MAX_OPERATOR_LENGTH} 个字符`, 'operator');
  }
  return name;
}

// 同一个模块下不允许出现重复的键，比较时忽略大小写
function assertKeyFree(data, module, key, selfId) {
  const hit = data.entries.find((item) => item.module === module
    && item.id !== selfId
    && item.key.toLowerCase() === key.toLowerCase());
  if (hit) {
    throw new ApiError(409, 'KEY_DUPLICATED', `模块 ${module} 下已经有 ${hit.key} 这条文案了`, 'key');
  }
}

function sortEntries(list) {
  return list.slice().sort((a, b) => {
    if (a.module !== b.module) return a.module < b.module ? -1 : 1;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

// 按模块与关键词筛选：关键词同时匹配文案键与任意一种语言的译文
function listEntries(options) {
  const input = options && typeof options === 'object' ? options : {};
  const module = pickText(input.module);
  const keyword = pickText(input.keyword).toLowerCase();
  const data = load();

  let list = data.entries;
  if (module) list = list.filter((item) => item.module === module);
  if (keyword) {
    list = list.filter((item) => {
      if (item.key.toLowerCase().includes(keyword)) return true;
      return Object.keys(item.translations).some((code) => item.translations[code].toLowerCase().includes(keyword));
    });
  }

  const counts = {};
  data.entries.forEach((item) => {
    counts[item.module] = (counts[item.module] || 0) + 1;
  });
  const modules = Object.keys(counts).sort().map((name) => ({ module: name, count: counts[name] }));

  return { entries: sortEntries(list), modules };
}

function getEntry(id) {
  const data = load();
  const found = data.entries.find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'ENTRY_NOT_FOUND', '这条文案不存在或已被删除', '');
  return found;
}

function createEntry(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = load();
  const module = validateModule(input.module);
  const key = validateKey(input.key);
  const translations = validateTranslations(input.translations, data.languages);
  const note = validateNote(input.note);
  const operator = validateOperator(input.operator, UNNAMED);
  assertKeyFree(data, module, key, '');

  const now = new Date().toISOString();
  const created = {
    id: crypto.randomUUID(),
    module,
    key,
    translations,
    note,
    updatedBy: operator,
    createdAt: now,
    updatedAt: now,
  };
  data.entries.push(created);
  save(data);
  return created;
}

function updateEntry(id, payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = load();
  const found = data.entries.find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'ENTRY_NOT_FOUND', '这条文案不存在或已被删除', '');

  const module = input.module === undefined ? found.module : validateModule(input.module);
  const key = input.key === undefined ? found.key : validateKey(input.key);
  const translations = input.translations === undefined
    ? found.translations
    : validateTranslations(input.translations, data.languages);
  const note = input.note === undefined ? found.note : validateNote(input.note);
  const operator = validateOperator(input.operator, found.updatedBy);
  assertKeyFree(data, module, key, found.id);

  found.module = module;
  found.key = key;
  found.translations = translations;
  found.note = note;
  found.updatedBy = operator;
  found.updatedAt = new Date().toISOString();
  save(data);
  return found;
}

function deleteEntry(id) {
  const data = load();
  const index = data.entries.findIndex((item) => item.id === id);
  if (index === -1) throw new ApiError(404, 'ENTRY_NOT_FOUND', '这条文案不存在或已被删除', '');
  const [removed] = data.entries.splice(index, 1);
  save(data);
  return { id: removed.id, key: removed.key };
}

module.exports = {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  validateModule,
  validateKey,
  validateTranslations,
  validateOperator,
};
