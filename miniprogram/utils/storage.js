/**
 * 持仓本地存储（my.storage），首次启动写入示例持仓占位数据，
 * 请在「持仓管理」页中替换为你自己的真实基金代码、份额与成本净值。
 */

const STORAGE_KEY = 'fund_holdings_v1';

const DEMO_HOLDINGS = [
  { fundCode: '000001', fundName: '华夏成长混合（示例）', shares: 1000, costNav: 1.2 },
  { fundCode: '161725', fundName: '招商中证白酒指数(示例)', shares: 500, costNav: 1.1 },
];

function getHoldings() {
  const list = my.getStorageSync({ key: STORAGE_KEY }).data;
  if (!list || !Array.isArray(list) || list.length === 0) {
    my.setStorageSync({ key: STORAGE_KEY, data: DEMO_HOLDINGS });
    return DEMO_HOLDINGS.slice();
  }
  return list;
}

function saveHoldings(list) {
  my.setStorageSync({ key: STORAGE_KEY, data: list });
}

function addHolding(item) {
  const list = getHoldings();
  const idx = list.findIndex((h) => h.fundCode === item.fundCode);
  if (idx >= 0) {
    list[idx] = Object.assign({}, list[idx], item);
  } else {
    list.push(item);
  }
  saveHoldings(list);
  return list;
}

function removeHolding(fundCode) {
  const list = getHoldings().filter((h) => h.fundCode !== fundCode);
  saveHoldings(list);
  return list;
}

module.exports = {
  getHoldings,
  saveHoldings,
  addHolding,
  removeHolding,
};
