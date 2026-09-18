// 对外的动作集合：页面只经过这一层，语言与文案两个模块各自管好自己的校验与落盘
const { ApiError, pickText } = require('./errors');
const languages = require('./languages');
const entries = require('./entries');

// 查询参数在页面与接口之间来回传的都是文本，这里统一去掉首尾空白并兜住空值
function readQuery(query, name) {
  return pickText(query && query[name]);
}

module.exports = {
  ApiError,
  readQuery,
  ...languages,
  ...entries,
};
