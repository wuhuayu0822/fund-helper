/**
 * 基金数据接口封装
 * 数据来源：天天基金网公开接口（无需 token，社区常用，仅供个人学习/参考使用）
 * - 实时估值：https://fundgz.1234567.com.cn/js/{code}.js
 * - 历史净值：https://fund.eastmoney.com/pingzhongdata/{code}.js
 *
 * 注意：在支付宝小程序开发者工具中调试时，需要在「详情 - 项目配置 - 不校验合法域名」
 * 勾选后才能请求以上非白名单域名；正式发布前需在支付宝开放平台配置服务器域名白名单，
 * 或改为经过自己后端转发的合规数据源。
 */

function requestText(url) {
  return new Promise((resolve, reject) => {
    my.request({
      url,
      method: 'GET',
      dataType: 'text',
      timeout: 10000,
      success: (res) => {
        if (res.status === 200 && res.data) {
          resolve(typeof res.data === 'string' ? res.data : String(res.data));
        } else {
          reject(new Error('请求失败：' + res.status));
        }
      },
      fail: (err) => reject(new Error(err && err.errorMessage ? err.errorMessage : '网络请求失败')),
    });
  });
}

/**
 * 获取基金实时估值
 * @param {string} fundCode 6位基金代码
 * @returns {Promise<{fundcode,name,jzrq,dwjz,gsz,gszzl,gztime}>}
 */
function fetchEstimate(fundCode) {
  const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`;
  return requestText(url).then((text) => {
    const start = text.indexOf('(');
    const end = text.lastIndexOf(')');
    if (start < 0 || end < 0) throw new Error('估值数据格式异常');
    const jsonStr = text.slice(start + 1, end);
    const data = JSON.parse(jsonStr);
    return {
      fundCode: data.fundcode,
      name: data.name,
      lastNav: parseFloat(data.dwjz),
      lastNavDate: data.jzrq,
      estimateNav: parseFloat(data.gsz),
      estimateChangePct: parseFloat(data.gszzl),
      estimateTime: data.gztime,
    };
  });
}

/**
 * 获取基金历史单位净值走势（不依赖 eval，用正则从原始 JS 文本中提取数据点）
 * @param {string} fundCode 6位基金代码
 * @param {number} days 取最近多少个交易日，默认 90
 * @returns {Promise<{name:string, history:Array<{date:string, nav:number}>}>}
 */
function fetchHistory(fundCode, days = 90) {
  const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`;
  return requestText(url).then((text) => {
    const nameMatch = text.match(/fS_name\s*=\s*"([^"]+)"/);
    const trendMatch = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
    if (!trendMatch) throw new Error('未获取到该基金的净值走势数据，请确认基金代码是否正确');

    const trendText = trendMatch[1];
    const pointRe = /\{x:(\d+),y:([\d.]+)/g;
    const points = [];
    let m;
    while ((m = pointRe.exec(trendText)) !== null) {
      points.push({
        date: formatDate(new Date(Number(m[1]))),
        nav: parseFloat(m[2]),
      });
    }
    points.sort((a, b) => (a.date < b.date ? -1 : 1));
    const history = days > 0 ? points.slice(-days) : points;
    return {
      name: nameMatch ? nameMatch[1] : '',
      history,
    };
  });
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  fetchEstimate,
  fetchHistory,
};
