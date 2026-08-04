const { fetchEstimate, fetchHistory } = require('../../utils/fundApi');
const { computeMA, generateSignal } = require('../../utils/indicators');

const CHART_W = 690;
const CHART_H = 340;
const CHART_DAYS = 90;

Page({
  data: {
    loading: true,
    loaded: false,
    errorMsg: '',
    fundCode: '',
    fundName: '',
    chartDays: CHART_DAYS,
    disclaimer: '',
  },

  onLoad(query) {
    const app = getApp();
    this.setData({ fundCode: query.code || '', disclaimer: app.globalData.disclaimer });
    this.loadData(query.code);
  },

  loadData(code) {
    if (!code) {
      this.setData({ loading: false, loaded: false, errorMsg: '缺少基金代码' });
      return;
    }
    this.setData({ loading: true });
    Promise.all([fetchEstimate(code), fetchHistory(code, CHART_DAYS)])
      .then(([est, hist]) => {
        const history = hist.history;
        const historyWithToday = history.concat([{ date: 'today', nav: est.estimateNav }]);
        const signal = generateSignal(historyWithToday);
        const s = signal.stats;

        this.setData({
          loading: false,
          loaded: true,
          fundName: hist.name || est.name,
          estimateNav: est.estimateNav,
          estimateChangePct: est.estimateChangePct,
          estimateTime: est.estimateTime,
          lastNav: est.lastNav,
          lastNavDate: est.lastNavDate,
          verdict: signal.verdict,
          verdictLabel: signal.verdictLabel,
          reasons: signal.reasons,
          ma5: s.ma5 ? s.ma5.toFixed(4) : '--',
          ma20: s.ma20 ? s.ma20.toFixed(4) : '--',
          ma60: s.ma60 ? s.ma60.toFixed(4) : '--',
          rsi: s.rsi !== null && s.rsi !== undefined ? s.rsi.toFixed(1) : '--',
          bias20: s.bias20 !== null && s.bias20 !== undefined ? s.bias20.toFixed(1) : '--',
          position: s.position !== null && s.position !== undefined ? (s.position * 100).toFixed(0) : '--',
        });

        const navList = historyWithToday.map((h) => h.nav);
        const ma20Arr = computeMA(navList, Math.min(20, navList.length));
        this.drawChart(navList, ma20Arr);
      })
      .catch((err) => {
        this.setData({
          loading: false,
          loaded: false,
          errorMsg: (err && err.message) || '加载失败，请检查基金代码或网络',
        });
      });
  },

  drawChart(navList, ma20Arr) {
    const ctx = my.createCanvasContext('chart', this);
    const padding = { left: 60, right: 10, top: 20, bottom: 20 };
    const plotW = CHART_W - padding.left - padding.right;
    const plotH = CHART_H - padding.top - padding.bottom;

    const allVals = navList.concat(ma20Arr.filter((v) => v !== null));
    const max = Math.max(...allVals);
    const min = Math.min(...allVals);
    const range = max - min || 1;
    const xStep = plotW / (navList.length - 1 || 1);

    const toXY = (i, v) => {
      const x = padding.left + i * xStep;
      const y = padding.top + ((max - v) / range) * plotH;
      return [x, y];
    };

    ctx.clearRect(0, 0, CHART_W, CHART_H);

    ctx.setFontSize(20);
    ctx.setFillStyle('#8a8f99');
    ctx.fillText(max.toFixed(4), 2, padding.top + 10);
    ctx.fillText(min.toFixed(4), 2, CHART_H - padding.bottom);

    ctx.beginPath();
    ctx.setStrokeStyle('#eef0f3');
    ctx.setLineWidth(1);
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, CHART_H - padding.bottom);
    ctx.lineTo(CHART_W - padding.right, CHART_H - padding.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.setStrokeStyle('#1677ff');
    ctx.setLineWidth(3);
    navList.forEach((v, i) => {
      const [x, y] = toXY(i, v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.beginPath();
    ctx.setStrokeStyle('#e5a800');
    ctx.setLineWidth(2);
    let started = false;
    ma20Arr.forEach((v, i) => {
      if (v === null) return;
      const [x, y] = toXY(i, v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.draw();
  },
});
