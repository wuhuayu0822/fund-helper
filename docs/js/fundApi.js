/**
 * 基金数据接口封装（浏览器版）
 * 数据来源：天天基金网公开接口（无需 token，社区常用，仅供个人学习/参考使用）
 * 用 <script> 标签方式加载而不是 fetch/XHR，天然绕开浏览器的跨域(CORS)限制：
 * - 实时估值接口本身就是 JSONP 格式：jsonpgz({...})
 * - 历史净值接口返回的是一段会设置全局变量的 JS 代码，用 script 标签加载后直接读取全局变量即可
 */
(function (global) {
  'use strict';

  var estimateResolvers = {};

  global.jsonpgz = function (data) {
    var resolver = estimateResolvers[data.fundcode];
    if (resolver) resolver(data);
  };

  function loadScript(src, onload, onerror, timeoutMs) {
    var script = document.createElement('script');
    // 部分基金数据接口对来源页面（Referer）比较敏感，不发送 Referer 更容易被放行
    script.referrerPolicy = 'no-referrer';
    script.setAttribute('referrerpolicy', 'no-referrer');
    var timer;
    function cleanup() {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    script.onload = function () {
      cleanup();
      onload();
    };
    script.onerror = function () {
      cleanup();
      onerror(new Error('网络请求失败（域名可能被拦截，或该基金代码不存在）'));
    };
    timer = setTimeout(function () {
      cleanup();
      onerror(new Error('请求超时（网络较慢，或接口无响应）'));
    }, timeoutMs || 15000);
    script.src = src;
    document.head.appendChild(script);
    return cleanup;
  }

  /**
   * 获取基金实时估值
   * @param {string} fundCode 6位基金代码
   * @returns {Promise<{fundCode,name,lastNav,lastNavDate,estimateNav,estimateChangePct,estimateTime}>}
   */
  function fetchEstimate(fundCode) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      estimateResolvers[fundCode] = function (data) {
        if (settled) return;
        settled = true;
        delete estimateResolvers[fundCode];
        resolve({
          fundCode: data.fundcode,
          name: data.name,
          lastNav: parseFloat(data.dwjz),
          lastNavDate: data.jzrq,
          estimateNav: parseFloat(data.gsz),
          estimateChangePct: parseFloat(data.gszzl),
          estimateTime: data.gztime,
        });
      };
      var url = 'https://fundgz.1234567.com.cn/js/' + encodeURIComponent(fundCode) + '.js?rt=' + Date.now();
      loadScript(
        url,
        function () {
          /* jsonpgz callback handles resolve; if it never fires, the timeout below rejects */
        },
        function (err) {
          if (settled) return;
          settled = true;
          delete estimateResolvers[fundCode];
          reject(err);
        },
        15000
      );
    });
  }

  // 历史净值请求串行执行，避免多个 <script> 并发加载时互相覆盖全局变量
  var historyQueue = Promise.resolve();
  function enqueue(task) {
    var result = historyQueue.then(task, task);
    historyQueue = result.then(
      function () {},
      function () {}
    );
    return result;
  }

  function fetchHistoryRaw(fundCode, days) {
    return new Promise(function (resolve, reject) {
      var url = 'https://fund.eastmoney.com/pingzhongdata/' + encodeURIComponent(fundCode) + '.js?v=' + Date.now();
      loadScript(
        url,
        function () {
          try {
            var trend = global.Data_netWorthTrend;
            var name = global.fS_name || '';
            global.Data_netWorthTrend = undefined;
            global.fS_name = undefined;
            if (!trend || !trend.length) {
              reject(new Error('未获取到该基金的净值走势数据，请确认基金代码是否正确'));
              return;
            }
            var points = trend.map(function (p) {
              return { date: formatDate(new Date(p.x)), nav: p.y };
            });
            points.sort(function (a, b) {
              return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
            });
            var history = days > 0 ? points.slice(-days) : points;
            resolve({ name: name, history: history });
          } catch (e) {
            reject(new Error('净值数据解析失败'));
          }
        },
        reject,
        15000
      );
    });
  }

  /**
   * 获取基金历史单位净值走势
   * @param {string} fundCode 6位基金代码
   * @param {number} days 取最近多少个交易日，默认 90
   */
  function fetchHistory(fundCode, days) {
    return enqueue(function () {
      return fetchHistoryRaw(fundCode, days === undefined ? 90 : days);
    });
  }

  function formatDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  global.FundApi = {
    fetchEstimate: fetchEstimate,
    fetchHistory: fetchHistory,
  };
})(window);
