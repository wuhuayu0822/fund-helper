(function () {
  'use strict';

  var DISCLAIMER =
    '本工具所有买卖建议均由历史净值技术指标自动计算生成，仅供参考，不构成投资建议，据此操作风险自负。';
  var VERDICT_LABEL = { buy: '建议关注买入', sell: '建议关注卖出', watch: '观望' };

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
      FundChart.drawNavChart($('chart'), lastChartData.navList, lastChartData.ma20Arr);
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
      return Promise.all([
        FundApi.fetchEstimate(h.fundCode),
        FundApi.fetchHistory(h.fundCode, 90).catch(function () { return null; }),
      ])
        .then(function (res) {
          var est = res[0];
          var hist = res[1];
          var marketValue = h.shares * est.estimateNav;
          var profit = h.shares * (est.estimateNav - h.costNav);
          var profitPct = ((est.estimateNav - h.costNav) / h.costNav) * 100;
          var verdict = 'watch';
          var signalLabel = '';
          if (hist && hist.history && hist.history.length > 0) {
            var withToday = hist.history.concat([{ date: 'today', nav: est.estimateNav }]);
            var signal = FundIndicators.generateSignal(withToday);
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
            marketValue: marketValue,
            profit: profit,
            profitPct: profitPct,
            verdict: verdict,
            signalLabel: signalLabel,
            todayChange: h.shares * est.estimateNav * (est.estimateChangePct / 100),
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
            estimateNav: null,
            estimateChangePct: 0,
            estimateTime: '',
            marketValue: 0,
            profit: 0,
            profitPct: 0,
            verdict: 'watch',
            signalLabel: '获取失败：' + ((err && err.message) || '未知错误'),
            todayChange: 0,
            costTotal: h.shares * h.costNav,
            error: true,
          };
        });
    });

    Promise.all(tasks).then(function (results) {
      if (parseHash().view !== 'overview') return; // 用户已切换到其他页面
      renderOverviewList(results);
      renderSummary(results);
      $('lastUpdated').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
    });
  }

  function renderOverviewList(items) {
    var listEl = $('overview-list');
    listEl.innerHTML = items
      .map(function (h) {
        var changeClass = h.estimateChangePct >= 0 ? 'up' : 'down';
        var profitClass = h.profit >= 0 ? 'up' : 'down';
        var tag = h.signalLabel
          ? '<div class="signal-tag signal-' + h.verdict + '">' + esc(h.signalLabel) + '</div>'
          : '';
        return (
          '<div class="card holding-card" data-code="' + esc(h.fundCode) + '">' +
          '<div class="row"><div class="fund-name">' + esc(h.fundName) + '</div>' +
          '<div class="' + changeClass + '">' + signed(h.estimateChangePct, 2) + '%</div></div>' +
          '<div class="row small-row muted"><span>代码 ' + esc(h.fundCode) + '</span>' +
          '<span>估值 ' + (h.estimateNav === null ? '--' : fmt(h.estimateNav, 4)) + (h.estimateTime ? ' (' + esc(h.estimateTime) + ')' : '') + '</span></div>' +
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
    var totalMarketValue = 0, totalProfit = 0, totalCost = 0, totalTodayChange = 0;
    items.forEach(function (h) {
      totalMarketValue += h.marketValue || 0;
      totalProfit += h.profit || 0;
      totalCost += h.costTotal || 0;
      totalTodayChange += h.todayChange || 0;
    });
    var totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    $('totalMarketValue').textContent = '¥' + fmt(totalMarketValue, 2);
    var profitEl = $('totalProfit');
    profitEl.textContent = '持仓盈亏 ' + signed(totalProfit, 2) + ' (' + signed(totalProfitPct, 2) + '%)';
    profitEl.className = totalProfit >= 0 ? 'up' : 'down';
    var todayEl = $('totalTodayChange');
    todayEl.textContent = '今日估算 ' + signed(totalTodayChange, 2);
    todayEl.className = totalTodayChange >= 0 ? 'up' : 'down';
  }

  // ---------------- detail ----------------

  var lastChartData = null;

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
    lastChartData = null;

    Promise.all([FundApi.fetchEstimate(code), FundApi.fetchHistory(code, 90)])
      .then(function (res) {
        if (parseHash().code !== code) return; // 用户已切换到其他基金
        var est = res[0];
        var hist = res[1];
        var history = hist.history;
        var withToday = history.concat([{ date: 'today', nav: est.estimateNav }]);
        var signal = FundIndicators.generateSignal(withToday);
        var s = signal.stats;

        $('d-fundName').textContent = hist.name || est.name || code;
        $('d-fundCode').textContent = '代码 ' + code;
        $('d-estimateNav').textContent = fmt(est.estimateNav, 4);
        var changeEl = $('d-estimateChangePct');
        changeEl.textContent = signed(est.estimateChangePct, 2) + '%';
        changeEl.className = 'nav-change ' + (est.estimateChangePct >= 0 ? 'up' : 'down');
        $('d-estimateTime').textContent =
          '估值时间 ' + (est.estimateTime || '--') + '（昨日净值 ' + fmt(est.lastNav, 4) + '，' + (est.lastNavDate || '--') + '）';

        $('d-signalCard').className = 'card signal-card ' + signal.verdict;
        $('d-verdictLabel').textContent = signal.verdictLabel;
        $('d-scoreBadge').textContent = '参考评分 ' + signed(signal.score, 0) + ' / ±' + signal.maxScore;
        $('d-reasons').innerHTML = signal.reasons
          .map(function (r) { return '<div class="reason-item">· ' + esc(r) + '</div>'; })
          .join('');

        var stats = [
          ['MA5', s.ma5 ? fmt(s.ma5, 4) : '--'],
          ['MA20', s.ma20 ? fmt(s.ma20, 4) : '--'],
          ['MA60', s.ma60 ? fmt(s.ma60, 4) : '--'],
          ['RSI(14)', s.rsi !== null && s.rsi !== undefined ? fmt(s.rsi, 1) : '--'],
          ['乖离率(20)', s.bias20 !== null && s.bias20 !== undefined ? fmt(s.bias20, 1) + '%' : '--'],
          ['区间分位', s.position !== null && s.position !== undefined ? fmt(s.position * 100, 0) + '%' : '--'],
          ['MACD柱', s.macdHist !== null && s.macdHist !== undefined ? fmt(s.macdHist, 4) : '--'],
          ['布林带', s.bollLower !== null && s.bollUpper !== undefined ? fmt(s.bollLower, 3) + '~' + fmt(s.bollUpper, 3) : '--'],
          ['近' + s.windowLen + '日最大回撤', s.maxDrawdown !== null && s.maxDrawdown !== undefined ? fmt(s.maxDrawdown, 1) + '%' : '--'],
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

        var navList = withToday.map(function (h) { return h.nav; });
        var ma20Arr = FundIndicators.computeMA(navList, Math.min(20, navList.length));
        lastChartData = { navList: navList, ma20Arr: ma20Arr };
        FundChart.drawNavChart($('chart'), navList, ma20Arr);
      })
      .catch(function (err) {
        if (parseHash().code !== code) return;
        $('d-fundName').textContent = '加载失败';
        $('d-estimateTime').textContent = (err && err.message) || '请检查基金代码或网络';
      });
  }

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
    FundApi.fetchEstimate(code)
      .then(function (est) {
        // 用当前估值反推等效份额与成本净值，后续实时追踪都基于这两个值计算
        var shares = amount / est.estimateNav;
        var costNav = costTotal / shares;
        FundStorage.addHolding({
          fundCode: code,
          fundName: est.name || code,
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
