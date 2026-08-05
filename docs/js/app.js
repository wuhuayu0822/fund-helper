(function () {
  'use strict';

  var DISCLAIMER =
    '本工具所有买卖建议均由历史净值技术指标自动计算生成，仅供参考，不构成投资建议，据此操作风险自负。';
  var VERDICT_LABEL = { buy: '建议关注买入', sell: '建议关注卖出', watch: '观望' };
  var VERDICT_CHIP_LABEL = { buy: '建议关注买入', watch: '观望', sell: '建议关注卖出' };

  var CHART_FETCH_DAYS = 320; // 覆盖"1年"周期展示 + 均线/MACD 计算所需的前置数据
  // maPeriod：图表叠加均线的跨度，随显示周期一起变化，避免切换周期时均线看起来"没反应"
  var PERIODS = [
    { key: '10d', label: '10日', points: 10, maPeriod: 5 },
    { key: '30d', label: '30日', points: 30, maPeriod: 10 },
    { key: '3m', label: '3月', points: 66, maPeriod: 20 },
    { key: '6m', label: '6月', points: 132, maPeriod: 30 },
    { key: '1y', label: '1年', points: 245, maPeriod: 60 },
  ];
  var DEFAULT_PERIOD = '3m';

  var INDICATOR_LEGEND = [
    { name: 'MA5/MA20/MA60（均线）', range: '净值在均线上方偏强，下方偏弱', desc: '近5/20/60个交易日净值的平均线。短期均线上穿长期均线称"金叉"（转强信号），下穿称"死叉"（转弱信号）。' },
    { name: '均线排列', range: '多头排列 / 空头排列', desc: 'MA5>MA20>MA60 为多头排列，说明中短期趋势一致向上；MA5<MA20<MA60 为空头排列，趋势一致向下；排列混乱说明趋势不明朗。' },
    { name: 'RSI(14)', range: '0~100，<30超卖 / >70超买', desc: '相对强弱指标。数值越低说明近期跌得越急，可能出现反弹；数值越高说明近期涨得越急，注意回调风险；30~70为中性。' },
    { name: '乖离率(20)', range: '|乖离率| > 5% 视为明显偏离', desc: '净值偏离20日均线的百分比。正值越大越可能短期涨幅透支，负值越大越可能短期超跌。' },
    { name: '区间分位', range: '0%=近60日最低，100%=近60日最高', desc: '当前净值在近60个交易日最高最低区间中的相对位置，≤20%视为低位，≥80%视为高位。' },
    { name: 'MACD柱', range: '转正/放大偏多，转负/缩小偏空', desc: 'DIF与DEA的差值×2，反映中期动能强弱。DIF上穿DEA为金叉，下穿为死叉。' },
    { name: '布林带', range: '净值触及下轨/上轨为极端信号', desc: '20日均线±2倍标准差构成的区间，反映近期正常波动范围，触及边界视为短期超跌/超涨。' },
    { name: '最大回撤', range: '数值越负，历史最坏情况越差', desc: '统计区间内从最高点到之后最低点的最大跌幅，反映持有期间可能经历的最差账面亏损。' },
    { name: '年化波动率', range: '纯债<5%，偏股混合15~30%，主题基金更高', desc: '净值日收益率标准差年化后的结果，反映净值波动剧烈程度，仅作风险参考，不参与买卖打分。数值越高，潜在的涨跌弹性越大。' },
  ];

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    return n.toFixed(digits === undefined ? 2 : digits);
  }
  function signed(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    var v = fmt(n, digits);
    return (n >= 0 ? '+' : '') + v;
  }

  var manageState = { editingCode: '' };

  // ---------------- router ----------------

  function parseHash() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean);
    if (parts[0] === 'detail' && parts[1]) return { view: 'detail', code: parts[1] };
    if (parts[0] === 'manage') return { view: 'manage' };
    return { view: 'overview' };
  }

  function render() {
    var route = parseHash();
    ['overview', 'detail', 'manage'].forEach(function (v) {
      $('view-' + v).classList.toggle('hidden', v !== route.view);
    });
    $('backBtn').classList.toggle('hidden', route.view === 'overview');
    $('refreshBtn').classList.toggle('hidden', route.view !== 'overview');

    if (route.view === 'overview') {
      $('pageTitle').textContent = '基金助手';
      loadOverview();
    } else if (route.view === 'detail') {
      $('pageTitle').textContent = '基金详情';
      loadDetail(route.code);
    } else if (route.view === 'manage') {
      $('pageTitle').textContent = '持仓管理';
      loadManage();
    }
  }

  // 不做定时轮询，只在重新打开/切回页面时刷新一次，够用且省流量电量
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && parseHash().view === 'overview') loadOverview();
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('resize', debounce(function () {
    if (parseHash().view === 'detail' && lastChartData) {
      drawChartForPeriod(currentPeriod);
    }
  }, 200));

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  $('backBtn').addEventListener('click', function () {
    location.hash = '#/';
  });
  $('refreshBtn').addEventListener('click', function () {
    loadOverview();
  });
  $('manageBtn').addEventListener('click', function () {
    location.hash = '#/manage';
  });
  $('m-doneBtn').addEventListener('click', function () {
    location.hash = '#/';
  });

  // ---------------- overview ----------------

  function loadOverview() {
    $('disclaimer1').textContent = DISCLAIMER;
    var holdings = FundStorage.getHoldings();
    var listEl = $('overview-list');

    if (holdings.length === 0) {
      listEl.innerHTML = '<div class="card muted center-text">暂无持仓，点击「管理持仓」添加</div>';
      renderSummary([]);
      return;
    }
    listEl.innerHTML = '<div class="card muted center-text">数据加载中...</div>';

    var tasks = holdings.map(function (h) {
      return FundApi.fetchHistory(h.fundCode, 90)
        .then(function (hist) {
          var latest = FundApi.getLatestFromHistory(hist.history);
          if (!latest) throw new Error('该基金暂无净值数据');
          var marketValue = h.shares * latest.nav;
          var profit = h.shares * (latest.nav - h.costNav);
          var profitPct = ((latest.nav - h.costNav) / h.costNav) * 100;

          var signal = FundIndicators.generateSignal(hist.history);
          var verdict = signal.verdict;
          var signalLabel = VERDICT_LABEL[signal.verdict];

          return {
            fundCode: h.fundCode,
            fundName: hist.name || h.fundName,
            shares: h.shares,
            costNav: h.costNav,
            latestNav: latest.nav,
            latestDate: latest.date,
            changePct: latest.changePct,
            marketValue: marketValue,
            profit: profit,
            profitPct: profitPct,
            verdict: verdict,
            signalLabel: signalLabel,
            latestChange: h.shares * latest.nav * (latest.changePct / 100),
            costTotal: h.shares * h.costNav,
            error: false,
          };
        })
        .catch(function (err) {
          return {
            fundCode: h.fundCode,
            fundName: h.fundName,
            shares: h.shares,
            costNav: h.costNav,
            latestNav: null,
            latestDate: '',
            changePct: 0,
            marketValue: 0,
            profit: 0,
            profitPct: 0,
            verdict: 'watch',
            signalLabel: '获取失败：' + ((err && err.message) || '未知错误'),
            latestChange: 0,
            costTotal: h.shares * h.costNav,
            error: true,
          };
        });
    });

    Promise.all(tasks).then(function (results) {
      if (parseHash().view !== 'overview') return; // 用户已切换到其他页面
      renderOverviewList(results);
      renderSummary(results);
      renderVerdictSummary(results);
      $('lastUpdated').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
    });
  }

  function renderVerdictSummary(items) {
    var el = $('verdictSummary');
    var valid = items.filter(function (h) { return !h.error; });
    if (valid.length === 0) {
      el.classList.add('hidden');
      return;
    }
    var counts = { buy: 0, watch: 0, sell: 0 };
    valid.forEach(function (h) { counts[h.verdict] = (counts[h.verdict] || 0) + 1; });
    el.classList.remove('hidden');
    el.innerHTML = ['buy', 'watch', 'sell']
      .map(function (v) {
        return (
          '<div class="verdict-chip ' + v + '">' + esc(VERDICT_CHIP_LABEL[v]) +
          '<span class="verdict-count">' + counts[v] + '</span></div>'
        );
      })
      .join('');
  }

  function renderOverviewList(items) {
    var listEl = $('overview-list');
    listEl.innerHTML = items
      .map(function (h) {
        var changeClass = h.changePct >= 0 ? 'up' : 'down';
        var profitClass = h.profit >= 0 ? 'up' : 'down';
        var tag = h.signalLabel
          ? '<div class="signal-tag signal-' + h.verdict + '">' + esc(h.signalLabel) + '</div>'
          : '';
        return (
          '<div class="card holding-card" data-code="' + esc(h.fundCode) + '">' +
          '<div class="row"><div class="fund-name">' + esc(h.fundName) + '</div>' +
          '<div class="' + changeClass + '">' + signed(h.changePct, 2) + '%</div></div>' +
          '<div class="row small-row muted"><span>代码 ' + esc(h.fundCode) + '</span>' +
          '<span>净值 ' + (h.latestNav === null ? '--' : fmt(h.latestNav, 4)) + (h.latestDate ? ' (' + esc(h.latestDate) + ')' : '') + '</span></div>' +
          '<div class="row small-row"><span class="muted">市值 ¥' + fmt(h.marketValue, 2) + '</span>' +
          '<span class="' + profitClass + '">盈亏 ' + signed(h.profit, 2) + ' (' + signed(h.profitPct, 2) + '%)</span></div>' +
          tag +
          '</div>'
        );
      })
      .join('');

    Array.prototype.forEach.call(listEl.querySelectorAll('.holding-card'), function (card) {
      card.addEventListener('click', function () {
        location.hash = '#/detail/' + card.dataset.code;
      });
    });
  }

  function renderSummary(items) {
    var totalMarketValue = 0, totalProfit = 0, totalCost = 0, totalLatestChange = 0;
    items.forEach(function (h) {
      totalMarketValue += h.marketValue || 0;
      totalProfit += h.profit || 0;
      totalCost += h.costTotal || 0;
      totalLatestChange += h.latestChange || 0;
    });
    var totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    $('totalMarketValue').textContent = '¥' + fmt(totalMarketValue, 2);
    var profitEl = $('totalProfit');
    profitEl.textContent = '持仓盈亏 ' + signed(totalProfit, 2) + ' (' + signed(totalProfitPct, 2) + '%)';
    profitEl.className = totalProfit >= 0 ? 'up' : 'down';
    var todayEl = $('totalTodayChange');
    todayEl.textContent = '较上一交易日 ' + signed(totalLatestChange, 2);
    todayEl.className = totalLatestChange >= 0 ? 'up' : 'down';
  }

  // ---------------- detail ----------------

  var lastChartData = null;
  var currentPeriod = DEFAULT_PERIOD;

  function loadDetail(code) {
    $('disclaimer2').textContent = DISCLAIMER;
    $('d-fundName').textContent = '加载中...';
    $('d-fundCode').textContent = '代码 ' + code;
    $('d-estimateNav').textContent = '--';
    $('d-estimateChangePct').textContent = '';
    $('d-estimateTime').textContent = '';
    $('d-signalCard').className = 'card signal-card';
    $('d-verdictLabel').textContent = '';
    $('d-scoreBadge').textContent = '';
    $('d-reasons').innerHTML = '';
    $('d-stats').innerHTML = '';
    $('d-newsLinks').innerHTML = '';
    $('d-periodTabs').innerHTML = '';
    lastChartData = null;
    currentPeriod = DEFAULT_PERIOD;

    FundApi.fetchHistory(code, CHART_FETCH_DAYS)
      .then(function (hist) {
        if (parseHash().code !== code) return; // 用户已切换到其他基金
        var history = hist.history;
        var latest = FundApi.getLatestFromHistory(history);
        if (!latest) throw new Error('该基金暂无净值数据');
        var signal = FundIndicators.generateSignal(history);
        var s = signal.stats;

        $('d-fundName').textContent = hist.name || code;
        $('d-fundCode').textContent = '代码 ' + code;
        $('d-estimateNav').textContent = fmt(latest.nav, 4);
        var changeEl = $('d-estimateChangePct');
        changeEl.textContent = signed(latest.changePct, 2) + '%';
        changeEl.className = 'nav-change ' + (latest.changePct >= 0 ? 'up' : 'down');
        $('d-estimateTime').textContent =
          '净值日期 ' + (latest.date || '--') + (latest.prevNav !== null ? '（较上一交易日净值 ' + fmt(latest.prevNav, 4) + '）' : '');

        $('d-signalCard').className = 'card signal-card ' + signal.verdict;
        $('d-verdictLabel').textContent = signal.verdictLabel;
        $('d-scoreBadge').textContent = '参考评分 ' + signed(signal.score, 0) + ' / ±' + signal.maxScore;
        $('d-reasons').innerHTML = signal.reasons
          .map(function (r) { return '<div class="reason-item">· ' + esc(r) + '</div>'; })
          .join('');

        var maAlignText = s.maAlign === 'bull' ? '多头排列' : s.maAlign === 'bear' ? '空头排列' : '不明朗';
        var stats = [
          ['MA5', s.ma5 ? fmt(s.ma5, 4) : '--'],
          ['MA20', s.ma20 ? fmt(s.ma20, 4) : '--'],
          ['MA60', s.ma60 ? fmt(s.ma60, 4) : '--'],
          ['均线排列', maAlignText],
          ['RSI(14)', s.rsi !== null && s.rsi !== undefined ? fmt(s.rsi, 1) : '--'],
          ['乖离率(20)', s.bias20 !== null && s.bias20 !== undefined ? fmt(s.bias20, 1) + '%' : '--'],
          ['区间分位', s.position !== null && s.position !== undefined ? fmt(s.position * 100, 0) + '%' : '--'],
          ['MACD柱', s.macdHist !== null && s.macdHist !== undefined ? fmt(s.macdHist, 4) : '--'],
          ['布林带', s.bollLower !== null && s.bollUpper !== undefined ? fmt(s.bollLower, 3) + '~' + fmt(s.bollUpper, 3) : '--'],
          ['近' + s.windowLen + '日最大回撤', s.maxDrawdown !== null && s.maxDrawdown !== undefined ? fmt(s.maxDrawdown, 1) + '%' : '--'],
          ['年化波动率', s.annualVol !== null && s.annualVol !== undefined ? fmt(s.annualVol, 1) + '%' : '--'],
        ];
        $('d-stats').innerHTML = stats
          .map(function (item) {
            return '<div class="stat-item"><span class="stat-label">' + item[0] + '</span><span class="stat-value">' + item[1] + '</span></div>';
          })
          .join('');

        var newsLinks = [
          { label: '该基金公告与详情（天天基金网）', url: 'https://fund.eastmoney.com/' + code + '.html' },
          { label: '国内外财经要闻（华尔街见闻）', url: 'https://wallstreetcn.com/' },
          { label: 'A股大盘与行业资讯（东方财富财经）', url: 'https://finance.eastmoney.com/' },
        ];
        $('d-newsLinks').innerHTML = newsLinks
          .map(function (n) {
            return '<a class="news-link" href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.label) + ' →</a>';
          })
          .join('');

        lastChartData = { navList: history.map(function (h) { return h.nav; }) };
        renderPeriodTabs();
        drawChartForPeriod(currentPeriod);
      })
      .catch(function (err) {
        if (parseHash().code !== code) return;
        $('d-fundName').textContent = '加载失败';
        $('d-estimateTime').textContent = (err && err.message) || '请检查基金代码或网络';
      });
  }

  function renderPeriodTabs() {
    var el = $('d-periodTabs');
    el.innerHTML = PERIODS.map(function (p) {
      return '<button class="period-tab' + (p.key === currentPeriod ? ' active' : '') + '" data-period="' + p.key + '">' + p.label + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.period-tab'), function (btn) {
      btn.addEventListener('click', function () {
        currentPeriod = btn.dataset.period;
        Array.prototype.forEach.call(el.querySelectorAll('.period-tab'), function (b) {
          b.classList.toggle('active', b === btn);
        });
        drawChartForPeriod(currentPeriod);
      });
    });
  }

  function drawChartForPeriod(periodKey) {
    if (!lastChartData) return;
    var period = PERIODS.filter(function (p) { return p.key === periodKey; })[0] || PERIODS[2];
    var fullNavList = lastChartData.navList;
    // 均线在完整历史上计算，再截取显示窗口，保证窗口起始处也有正常的均线数值（不会因预热不足而缺失）
    var fullMaArr = FundIndicators.computeMA(fullNavList, Math.min(period.maPeriod, fullNavList.length));
    var n = Math.min(period.points, fullNavList.length);
    var navSlice = fullNavList.slice(-n);
    var maSlice = fullMaArr.slice(-n);
    $('d-chartTitle').textContent = '近' + period.label + '净值走势';
    $('d-maLegend').textContent = period.maPeriod + '日均线';
    FundChart.drawNavChart($('chart'), navSlice, maSlice);
  }

  $('d-legendToggle').addEventListener('click', function () {
    var el = $('d-indicatorLegend');
    var hidden = el.classList.toggle('hidden');
    $('d-legendToggle').textContent = '指标参考区间与含义说明 ' + (hidden ? '▾' : '▴');
  });

  $('d-indicatorLegend').innerHTML = INDICATOR_LEGEND.map(function (item) {
    return (
      '<div class="indicator-legend-item">' +
      '<span class="indicator-legend-name">' + esc(item.name) + '</span>' +
      '<span class="indicator-legend-range">' + esc(item.range) + '</span>' +
      '<div class="indicator-legend-desc">' + esc(item.desc) + '</div>' +
      '</div>'
    );
  }).join('');

  // ---------------- manage ----------------

  function loadManage() {
    resetForm();
    renderManageList();
  }

  function resetForm() {
    manageState.editingCode = '';
    $('m-formTitle').textContent = '添加持仓';
    $('m-code').value = '';
    $('m-code').disabled = false;
    $('m-amount').value = '';
    $('m-profit').value = '';
    $('m-error').classList.add('hidden');
    $('m-cancelBtn').classList.add('hidden');
    $('m-submitBtn').textContent = '查询并添加';
    $('m-submitBtn').disabled = false;
  }

  function renderManageList() {
    var holdings = FundStorage.getHoldings();
    var listEl = $('manage-list');
    if (holdings.length === 0) {
      listEl.innerHTML = '<div class="card muted center-text">暂无持仓</div>';
      return;
    }
    listEl.innerHTML = holdings
      .map(function (h) {
        return (
          '<div class="card item-card" data-code="' + esc(h.fundCode) + '">' +
          '<div class="row"><div class="item-name">' + esc(h.fundName) + '</div>' +
          '<div class="row action-icons">' +
          '<button class="link" data-action="edit">编辑</button>' +
          '<button class="link link-danger" data-action="delete">删除</button>' +
          '</div></div>' +
          '<div class="muted small-row">代码 ' + esc(h.fundCode) + ' · 持仓金额 ¥' + esc(h.amount) + ' · 盈亏 ' + (h.profit >= 0 ? '+' : '') + esc(h.profit) + '</div>' +
          '</div>'
        );
      })
      .join('');

    Array.prototype.forEach.call(listEl.querySelectorAll('.item-card'), function (card) {
      var code = card.dataset.code;
      card.querySelector('[data-action="edit"]').addEventListener('click', function () {
        startEdit(code);
      });
      card.querySelector('[data-action="delete"]').addEventListener('click', function () {
        handleDelete(code);
      });
    });
  }

  function startEdit(code) {
    var item = FundStorage.getHoldings().find(function (h) { return h.fundCode === code; });
    if (!item) return;
    manageState.editingCode = code;
    $('m-formTitle').textContent = '编辑持仓';
    $('m-code').value = item.fundCode;
    $('m-code').disabled = true;
    $('m-amount').value = item.amount;
    $('m-profit').value = item.profit;
    $('m-error').classList.add('hidden');
    $('m-cancelBtn').classList.remove('hidden');
    $('m-submitBtn').textContent = '保存修改';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('m-cancelBtn').addEventListener('click', resetForm);

  function showFormError(msg) {
    var el = $('m-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  $('m-submitBtn').addEventListener('click', function () {
    var code = $('m-code').value.trim();
    var amountRaw = $('m-amount').value.trim();
    var profitRaw = $('m-profit').value.trim();

    if (!/^\d{6}$/.test(code)) {
      showFormError('请输入正确的6位基金代码');
      return;
    }
    var amount = parseFloat(amountRaw);
    if (!amountRaw || isNaN(amount) || amount <= 0) {
      showFormError('请输入有效的持仓金额');
      return;
    }
    var profit = parseFloat(profitRaw);
    if (profitRaw === '' || isNaN(profit)) {
      showFormError('请输入有效的持仓盈亏（没有盈亏填 0）');
      return;
    }
    var costTotal = amount - profit;
    if (costTotal <= 0) {
      showFormError('盈亏金额不能大于等于持仓金额（成本不能为负）');
      return;
    }
    $('m-error').classList.add('hidden');

    var editingCode = manageState.editingCode;

    $('m-submitBtn').disabled = true;
    $('m-submitBtn').textContent = '查询中...';
    FundApi.fetchHistory(code, 5)
      .then(function (hist) {
        var latest = FundApi.getLatestFromHistory(hist.history);
        if (!latest) throw new Error('该基金暂无净值数据');
        // 用最新官方净值反推等效份额与成本净值，后续追踪都基于这两个值计算
        var shares = amount / latest.nav;
        var costNav = costTotal / shares;
        FundStorage.addHolding({
          fundCode: code,
          fundName: hist.name || code,
          amount: amount,
          profit: profit,
          shares: shares,
          costNav: costNav,
        });
        resetForm();
        renderManageList();
      })
      .catch(function (err) {
        $('m-submitBtn').disabled = false;
        $('m-submitBtn').textContent = editingCode ? '保存修改' : '查询并添加';
        showFormError('未能获取该基金数据：' + ((err && err.message) || '请确认代码是否正确'));
      });
  });

  function handleDelete(code) {
    if (!confirm('确认删除该持仓？删除后需重新添加。')) return;
    FundStorage.removeHolding(code);
    renderManageList();
  }

  // ---------------- init ----------------
  render();
})();
