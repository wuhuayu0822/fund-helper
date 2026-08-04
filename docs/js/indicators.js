/**
 * 技术指标计算与买卖建议生成（与小程序版本算法一致）
 * 全部基于历史单位净值的规则型信号，仅作参考，不构成投资建议。
 */
(function (global) {
  'use strict';

  function computeMA(navList, period) {
    var result = new Array(navList.length).fill(null);
    for (var i = period - 1; i < navList.length; i++) {
      var sum = 0;
      for (var j = i - period + 1; j <= i; j++) sum += navList[j];
      result[i] = sum / period;
    }
    return result;
  }

  function computeRSI(navList, period) {
    period = period || 14;
    if (navList.length < period + 1) return null;
    var gains = 0;
    var losses = 0;
    for (var i = navList.length - period; i < navList.length; i++) {
      var diff = navList[i] - navList[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    var avgGain = gains / period;
    var avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    var rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  function generateSignal(history) {
    if (!history || history.length < 10) {
      return {
        verdict: 'watch',
        verdictLabel: '数据不足，暂不建议',
        score: 0,
        reasons: ['历史净值数据不足（少于10个交易日），暂无法生成可靠信号'],
        stats: {},
      };
    }

    var navList = history.map(function (h) {
      return h.nav;
    });
    var latest = navList[navList.length - 1];

    var ma5Arr = computeMA(navList, Math.min(5, navList.length));
    var ma20Arr = computeMA(navList, Math.min(20, navList.length));
    var ma60Arr = computeMA(navList, Math.min(60, navList.length));
    var ma5 = ma5Arr[ma5Arr.length - 1];
    var ma20 = ma20Arr[ma20Arr.length - 1];
    var ma60 = ma60Arr[ma60Arr.length - 1];

    var rsi = computeRSI(navList, Math.min(14, navList.length - 1));

    var windowLen = Math.min(60, navList.length);
    var windowVals = navList.slice(-windowLen);
    var high = Math.max.apply(null, windowVals);
    var low = Math.min.apply(null, windowVals);
    var position = high === low ? 0.5 : (latest - low) / (high - low);

    var bias20 = ma20 ? ((latest - ma20) / ma20) * 100 : null;

    var buyScore = 0;
    var sellScore = 0;
    var reasons = [];

    if (rsi !== null) {
      if (rsi <= 30) {
        buyScore += 2;
        reasons.push('RSI(14) = ' + rsi.toFixed(1) + '，处于超卖区间，短期存在反弹可能');
      } else if (rsi >= 70) {
        sellScore += 2;
        reasons.push('RSI(14) = ' + rsi.toFixed(1) + '，处于超买区间，注意回调风险');
      }
    }

    if (position <= 0.2) {
      buyScore += 1;
      reasons.push('当前净值处于近' + windowLen + '个交易日区间低位（分位 ' + (position * 100).toFixed(0) + '%）');
    } else if (position >= 0.8) {
      sellScore += 1;
      reasons.push('当前净值处于近' + windowLen + '个交易日区间高位（分位 ' + (position * 100).toFixed(0) + '%）');
    }

    if (bias20 !== null) {
      if (bias20 <= -5) {
        buyScore += 1;
        reasons.push('乖离率 ' + bias20.toFixed(1) + '%，明显低于20日均线，短期或超跌');
      } else if (bias20 >= 5) {
        sellScore += 1;
        reasons.push('乖离率 ' + bias20.toFixed(1) + '%，明显高于20日均线，短期涨幅偏大');
      }
    }

    if (ma5Arr.length >= 2 && ma20Arr.length >= 2) {
      var prevMa5 = ma5Arr[ma5Arr.length - 2];
      var prevMa20 = ma20Arr[ma20Arr.length - 2];
      if (prevMa5 !== null && prevMa20 !== null && ma5 !== null && ma20 !== null) {
        if (prevMa5 <= prevMa20 && ma5 > ma20) {
          buyScore += 1;
          reasons.push('5日均线上穿20日均线（金叉），短期趋势转强');
        } else if (prevMa5 >= prevMa20 && ma5 < ma20) {
          sellScore += 1;
          reasons.push('5日均线下穿20日均线（死叉），短期趋势转弱');
        }
      }
    }

    var score = buyScore - sellScore;
    var verdict = 'watch';
    var verdictLabel = '观望：维持现有节奏，等待更明确信号';
    if (score >= 2) {
      verdict = 'buy';
      verdictLabel = '建议关注买入区间：可考虑逢低分批建仓';
    } else if (score <= -2) {
      verdict = 'sell';
      verdictLabel = '建议关注卖出/止盈：短期涨幅或已透支，注意控制仓位';
    }

    if (reasons.length === 0) {
      reasons.push('各项指标暂无明显超买超卖信号，建议按原定投/持有计划观望');
    }

    return {
      verdict: verdict,
      verdictLabel: verdictLabel,
      score: score,
      reasons: reasons,
      stats: {
        latest: latest,
        ma5: ma5,
        ma20: ma20,
        ma60: ma60,
        rsi: rsi,
        bias20: bias20,
        position: position,
        windowLen: windowLen,
        high: high,
        low: low,
      },
    };
  }

  global.FundIndicators = {
    computeMA: computeMA,
    computeRSI: computeRSI,
    generateSignal: generateSignal,
  };
})(window);
