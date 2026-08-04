/* 持仓本地存储（localStorage），首次打开写入示例持仓占位数据 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'fund_holdings_v1';

  // amount/profit 是用户在「持仓管理」里直接填写的持仓金额与盈亏金额（照抄支付宝里看到的数字即可）；
  // shares/costNav 是添加时用当天估值反推出来的等效份额与成本净值，仅用于后续实时追踪计算，不需要用户关心。
  var DEMO_HOLDINGS = [
    { fundCode: '000001', fundName: '华夏成长混合（示例）', amount: 1200, profit: 0, shares: 1000, costNav: 1.2 },
    { fundCode: '161725', fundName: '招商中证白酒指数(示例)', amount: 550, profit: 0, shares: 500, costNav: 1.1 },
  ];

  // 兼容旧版本（份额+成本净值）存下的数据：缺 amount/profit 字段时用 shares*costNav 反推一个占位值
  function normalize(h) {
    if (h.amount !== undefined && h.profit !== undefined) return h;
    var shares = h.shares || 0;
    var costNav = h.costNav || 0;
    return Object.assign({}, h, {
      amount: h.amount !== undefined ? h.amount : Math.round(shares * costNav * 100) / 100,
      profit: h.profit !== undefined ? h.profit : 0,
    });
  }

  function getHoldings() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return DEMO_HOLDINGS.slice();
    }
    if (!raw) {
      saveHoldings(DEMO_HOLDINGS);
      return DEMO_HOLDINGS.slice();
    }
    try {
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      var needsMigration = list.some(function (h) { return h.amount === undefined || h.profit === undefined; });
      var normalized = list.map(normalize);
      if (needsMigration) saveHoldings(normalized);
      return normalized;
    } catch (e) {
      return [];
    }
  }

  function saveHoldings(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      /* storage unavailable (e.g. private mode) — ignore, in-memory state still works for this session */
    }
  }

  function addHolding(item) {
    var list = getHoldings();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].fundCode === item.fundCode) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], item);
    else list.push(item);
    saveHoldings(list);
    return list;
  }

  function removeHolding(fundCode) {
    var list = getHoldings().filter(function (h) {
      return h.fundCode !== fundCode;
    });
    saveHoldings(list);
    return list;
  }

  global.FundStorage = {
    getHoldings: getHoldings,
    saveHoldings: saveHoldings,
    addHolding: addHolding,
    removeHolding: removeHolding,
  };
})(window);
