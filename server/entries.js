const crypto = require('crypto');
const { load, save, MAX_TRANSLATION_LENGTH, MAX_NOTE_LENGTH, MAX_OPERATOR_LENGTH, UNNAMED } = require('./store');
const { ApiError, pickText } = require('./errors');

const MODULE_PATTERN = /^[a-z][a-z0-9-]{0,29}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/;
const MAX_KEY_LENGTH = 120;

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

// 译文逐条校验：语言必须是登记过的，取值必须是文本，长度不能超过上限
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
    // 留空表示这条还没翻译，原样保留一个空串，方便页面上看出是空的还是根本没这一项
    result[actual] = value;
  });
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
