/* 持仓本地存储（localStorage），首次打开写入示例持仓占位数据 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'fund_holdings_v1';

  var DEMO_HOLDINGS = [
    { fundCode: '000001', fundName: '华夏成长混合（示例）', shares: 1000, costNav: 1.2 },
    { fundCode: '161725', fundName: '招商中证白酒指数(示例)', shares: 500, costNav: 1.1 },
  ];

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
      return Array.isArray(list) ? list : [];
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
