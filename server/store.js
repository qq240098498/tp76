const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const TEMP_FILE = path.join(DATA_DIR, 'db.json.tmp');

const MAX_TRANSLATION_LENGTH = 200;
const MAX_NOTE_LENGTH = 200;
const MAX_OPERATOR_LENGTH = 40;
const UNNAMED = '未署名';

// 初始数据：四种语言、四个模块的十五条文案。繁体与英语故意留了几条没译，
// 日语整条语言处于停用状态，英语里还有一条把 {minutes} 占位符写丢了
function seedData() {
  return {
    languages: [
      { code: 'zh-CN', name: '简体中文', enabled: true, isDefault: true, createdAt: '2026-09-05T01:00:00.000Z' },
      { code: 'zh-TW', name: '繁体中文', enabled: true, isDefault: false, createdAt: '2026-09-05T01:05:00.000Z' },
      { code: 'en-US', name: '英语（美国）', enabled: true, isDefault: false, createdAt: '2026-09-05T01:10:00.000Z' },
      { code: 'ja-JP', name: '日语', enabled: false, isDefault: false, createdAt: '2026-09-05T01:15:00.000Z' },
    ],
    entries: [
      {
        id: 'entry-1001',
        module: 'home',
        key: 'home.banner.title',
        translations: {
          'zh-CN': '限时折扣，精选好物直降',
          'zh-TW': '限時折扣，精選好物直降',
          'en-US': 'Limited-time deals on selected items',
        },
        note: '首页顶部轮播主标题',
        updatedBy: '陈晓',
        createdAt: '2026-09-08T02:10:00.000Z',
        updatedAt: '2026-09-16T09:30:00.000Z',
      },
      {
        id: 'entry-1002',
        module: 'home',
        key: 'home.banner.subtitle',
        translations: {
          'zh-CN': '单笔满{amount}元包邮',
          'en-US': 'Free shipping on orders over {amount}',
        },
        note: '首页顶部轮播副标题',
        updatedBy: '李文',
        createdAt: '2026-09-08T02:12:00.000Z',
        updatedAt: '2026-09-16T09:32:00.000Z',
      },
      {
        id: 'entry-1003',
        module: 'home',
        key: 'home.search.placeholder',
        translations: {
          'zh-CN': '搜索商品或品牌',
          'zh-TW': '搜尋商品或品牌',
          'en-US': 'Search products or brands',
          'ja-JP': '商品やブランドを検索',
        },
        note: '首页搜索框占位提示',
        updatedBy: '王凯',
        createdAt: '2026-09-08T02:20:00.000Z',
        updatedAt: '2026-09-15T11:05:00.000Z',
      },
      {
        id: 'entry-1004',
        module: 'home',
        key: 'home.empty.tip',
        translations: {
          'zh-CN': '换个关键词再试试',
          'en-US': 'Try another keyword',
        },
        note: '搜索无结果时的提示',
        updatedBy: '陈晓',
        createdAt: '2026-09-09T03:40:00.000Z',
        updatedAt: '2026-09-15T11:20:00.000Z',
      },
      {
        id: 'entry-1005',
        module: 'order',
        key: 'order.confirm.title',
        translations: {
          'zh-CN': '确认订单',
          'zh-TW': '確認訂單',
          'en-US': 'Confirm order',
        },
        note: '下单确认页标题',
        updatedBy: '李文',
        createdAt: '2026-09-09T04:00:00.000Z',
        updatedAt: '2026-09-14T06:15:00.000Z',
      },
      {
        id: 'entry-1006',
        module: 'order',
        key: 'order.confirm.itemCount',
        translations: {
          'zh-CN': '共{count}件商品',
          'zh-TW': '共{count}件商品',
          'en-US': '{count} items in total',
        },
        note: '下单确认页商品件数',
        updatedBy: '李文',
        createdAt: '2026-09-09T04:05:00.000Z',
        updatedAt: '2026-09-14T06:18:00.000Z',
      },
      {
        id: 'entry-1007',
        module: 'order',
        key: 'order.detail.payTip',
        translations: {
          'zh-CN': '请在{minutes}分钟内完成支付',
          'zh-TW': '請在{minutes}分鐘內完成支付',
          'en-US': 'Please complete the payment within 30 minutes',
        },
        note: '订单详情页支付倒计时提示',
        updatedBy: '王凯',
        createdAt: '2026-09-09T04:20:00.000Z',
        updatedAt: '2026-09-16T02:45:00.000Z',
      },
      {
        id: 'entry-1008',
        module: 'order',
        key: 'order.status.pending',
        translations: {
          'zh-CN': '待付款',
          'zh-TW': '待付款',
          'en-US': 'Pending payment',
        },
        note: '订单状态标签',
        updatedBy: '陈晓',
        createdAt: '2026-09-10T01:30:00.000Z',
        updatedAt: '2026-09-16T02:50:00.000Z',
      },
      {
        id: 'entry-1009',
        module: 'account',
        key: 'account.login.title',
        translations: {
          'zh-CN': '登录账号',
          'zh-TW': '登入帳號',
          'en-US': 'Sign in',
        },
        note: '登录页标题',
        updatedBy: '李文',
        createdAt: '2026-09-10T05:00:00.000Z',
        updatedAt: '2026-09-13T08:00:00.000Z',
      },
      {
        id: 'entry-1010',
        module: 'account',
        key: 'account.login.placeholder',
        translations: {
          'zh-CN': '手机号或邮箱',
          'en-US': 'Phone number or email',
        },
        note: '登录页账号输入框占位提示',
        updatedBy: '王凯',
        createdAt: '2026-09-10T05:02:00.000Z',
        updatedAt: '2026-09-13T08:05:00.000Z',
      },
      {
        id: 'entry-1011',
        module: 'account',
        key: 'account.register.agree',
        translations: {
          'zh-CN': '我已阅读并同意{link}',
          'en-US': '',
        },
        note: '注册页协议勾选文案，{link} 由前端替换成协议链接',
        updatedBy: '陈晓',
        createdAt: '2026-09-11T05:30:00.000Z',
        updatedAt: '2026-09-13T08:20:00.000Z',
      },
      {
        id: 'entry-1012',
        module: 'common',
        key: 'common.action.confirm',
        translations: {
          'zh-CN': '确定',
          'zh-TW': '確定',
          'en-US': 'OK',
        },
        note: '通用确认按钮',
        updatedBy: '王凯',
        createdAt: '2026-09-11T06:00:00.000Z',
        updatedAt: '2026-09-12T03:10:00.000Z',
      },
      {
        id: 'entry-1013',
        module: 'common',
        key: 'common.action.cancel',
        translations: {
          'zh-CN': '取消',
          'zh-TW': '取消',
          'en-US': 'Cancel',
        },
        note: '通用取消按钮',
        updatedBy: '王凯',
        createdAt: '2026-09-11T06:02:00.000Z',
        updatedAt: '2026-09-12T03:12:00.000Z',
      },
      {
        id: 'entry-1014',
        module: 'common',
        key: 'common.error.network',
        translations: {
          'zh-CN': '网络开小差了，请稍后重试',
          'zh-TW': '網絡開小差了，請稍後重試',
          'en-US': 'Network error, please try again later',
        },
        note: '通用网络异常提示',
        updatedBy: '李文',
        createdAt: '2026-09-11T06:10:00.000Z',
        updatedAt: '2026-09-12T03:20:00.000Z',
      },
      {
        id: 'entry-1015',
        module: 'common',
        key: 'common.loading.text',
        translations: {
          'zh-CN': '正在加载',
          'zh-TW': '正在載入',
          'en-US': 'Loading',
        },
        note: '通用加载中提示',
        updatedBy: '陈晓',
        createdAt: '2026-09-11T06:15:00.000Z',
        updatedAt: '2026-09-12T03:25:00.000Z',
      },
    ],
  };
}

// 把单条语言整理成固定结构，避免数据文件被手工改动后出现缺字段
function normalizeLanguage(item, fallbackIndex) {
  const source = item && typeof item === 'object' ? item : {};
  const code = typeof source.code === 'string' && source.code.trim() ? source.code.trim() : `lang-${fallbackIndex + 1}`;
  return {
    code,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : code,
    enabled: source.enabled !== false,
    isDefault: source.isDefault === true,
    createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString(),
  };
}

// 把单条文案整理成固定结构：译文只保留字符串取值，其余一律丢弃
function normalizeEntry(item, fallbackIndex) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString();
  const translations = {};
  if (source.translations && typeof source.translations === 'object' && !Array.isArray(source.translations)) {
    Object.keys(source.translations).forEach((code) => {
      const value = source.translations[code];
      if (typeof value === 'string') translations[code] = value;
    });
  }
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `entry-restored-${fallbackIndex + 1}`,
    module: typeof source.module === 'string' && source.module.trim() ? source.module.trim() : 'default',
    key: typeof source.key === 'string' && source.key.trim() ? source.key.trim() : `entry.restored.${fallbackIndex + 1}`,
    translations,
    note: typeof source.note === 'string' ? source.note : '',
    updatedBy: typeof source.updatedBy === 'string' && source.updatedBy.trim() ? source.updatedBy.trim() : UNNAMED,
    createdAt,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt,
  };
}

// 整份数据保证 languages 与 entries 结构一致；默认语言有且只有一个
function normalize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seed = seedData();

  // 旧数据文件里没有 languages 这一段时补上种子语言，显式写成空数组时尊重用户的清空动作
  const languages = Array.isArray(source.languages)
    ? source.languages.map((item, index) => normalizeLanguage(item, index))
    : seed.languages;

  const seenCodes = new Set();
  const dedupedLanguages = [];
  languages.forEach((item) => {
    const lower = item.code.toLowerCase();
    if (seenCodes.has(lower)) return;
    seenCodes.add(lower);
    dedupedLanguages.push(item);
  });

  if (dedupedLanguages.length) {
    const defaultIndex = dedupedLanguages.findIndex((item) => item.isDefault);
    const keep = defaultIndex === -1 ? 0 : defaultIndex;
    dedupedLanguages.forEach((item, index) => {
      item.isDefault = index === keep;
    });
    // 默认语言必须处于启用状态，否则前端一进来就没有可填写的语言
    dedupedLanguages[keep].enabled = true;
  }

  const known = new Set(dedupedLanguages.map((item) => item.code));
  const entries = Array.isArray(source.entries)
    ? source.entries
        .map((item, index) => normalizeEntry(item, index))
        .filter((item) => item.id)
        .map((item) => {
          const kept = {};
          Object.keys(item.translations).forEach((code) => {
            if (known.has(code)) kept[code] = item.translations[code];
          });
          return { ...item, translations: kept };
        })
    : [];

  return { languages: dedupedLanguages, entries };
}

// 读取数据文件：文件缺失或内容损坏时回落到初始数据并立刻补写
function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return normalize(JSON.parse(raw));
  } catch (err) {
    const data = seedData();
    save(data);
    return data;
  }
}

// 先写临时文件再改名，写入中途被打断也不会把正式数据文件写坏
function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const text = `${JSON.stringify(normalize(data), null, 2)}\n`;
  fs.writeFileSync(TEMP_FILE, text, 'utf8');
  fs.renameSync(TEMP_FILE, DATA_FILE);
}

module.exports = {
  load,
  save,
  seedData,
  normalize,
  normalizeLanguage,
  normalizeEntry,
  MAX_TRANSLATION_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_OPERATOR_LENGTH,
  UNNAMED,
  DATA_FILE,
};
