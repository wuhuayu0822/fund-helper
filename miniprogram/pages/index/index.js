const { fetchEstimate, fetchHistory } = require('../../utils/fundApi');
const { generateSignal } = require('../../utils/indicators');
const { getHoldings } = require('../../utils/storage');

const VERDICT_LABEL = {
  buy: '建议关注买入',
  sell: '建议关注卖出',
  watch: '观望',
};

Page({
  data: {
    loading: true,
    holdings: [],
    totalMarketValue: '0.00',
    totalProfit: '0.00',
    totalProfitPct: '0.00',
    totalTodayChange: '0.00',
    disclaimer: '',
  },

  onLoad() {
    const app = getApp();
    this.setData({ disclaimer: app.globalData.disclaimer });
  },

  onShow() {
    this.loadHoldings();
  },

  onPullDownRefresh() {
    this.loadHoldings().then(() => {
      my.stopPullDownRefresh();
    });
  },

  loadHoldings() {
    const base = getHoldings();
    if (base.length === 0) {
      this.setData({ loading: false, holdings: [] });
      return Promise.resolve();
    }
    this.setData({ loading: true });

    const tasks = base.map((h) =>
      Promise.all([fetchEstimate(h.fundCode), fetchHistory(h.fundCode, 30).catch(() => null)])
        .then(([est, hist]) => {
          const marketValue = h.shares * est.estimateNav;
          const profit = h.shares * (est.estimateNav - h.costNav);
          const profitPct = ((est.estimateNav - h.costNav) / h.costNav) * 100;
          let verdict = 'watch';
          let signalLabel = '';
          if (hist && hist.history && hist.history.length > 0) {
            const historyWithToday = hist.history.concat([{ date: 'today', nav: est.estimateNav }]);
            const signal = generateSignal(historyWithToday);
            verdict = signal.verdict;
            signalLabel = VERDICT_LABEL[signal.verdict];
          }
          return {
            fundCode: h.fundCode,
            fundName: est.name || h.fundName,
            shares: h.shares,
            costNav: h.costNav,
            estimateNav: est.estimateNav,
            estimateChangePct: est.estimateChangePct,
            estimateTime: est.estimateTime,
            marketValue: marketValue.toFixed(2),
            profit: profit.toFixed(2),
            profitPct: profitPct.toFixed(2),
            verdict,
            signalLabel,
            _marketValue: marketValue,
            _profit: profit,
            _costTotal: h.shares * h.costNav,
            _todayChange: h.shares * est.estimateNav * (est.estimateChangePct / 100),
          };
        })
        .catch(() => ({
          fundCode: h.fundCode,
          fundName: h.fundName,
          shares: h.shares,
          costNav: h.costNav,
          estimateNav: '获取失败',
          estimateChangePct: 0,
          estimateTime: '',
          marketValue: '0.00',
          profit: '0.00',
          profitPct: '0.00',
          verdict: 'watch',
          signalLabel: '数据获取失败',
          _marketValue: 0,
          _profit: 0,
          _costTotal: h.shares * h.costNav,
          _todayChange: 0,
        }))
    );

    return Promise.all(tasks).then((holdings) => {
      const totalMarketValue = holdings.reduce((s, h) => s + h._marketValue, 0);
      const totalProfit = holdings.reduce((s, h) => s + h._profit, 0);
      const totalCost = holdings.reduce((s, h) => s + h._costTotal, 0);
      const totalTodayChange = holdings.reduce((s, h) => s + h._todayChange, 0);
      const totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

      this.setData({
        loading: false,
        holdings,
        totalMarketValue: totalMarketValue.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        totalProfitPct: totalProfitPct.toFixed(2),
        totalTodayChange: totalTodayChange.toFixed(2),
      });
    });
  },

  goDetail(e) {
    const code = e.currentTarget.dataset.code;
    my.navigateTo({ url: `/pages/detail/detail?code=${code}` });
  },

  goManage() {
    my.navigateTo({ url: '/pages/holdings/holdings' });
  },
});
