/**
 * 技术指标计算与买卖建议生成（与小程序版本算法一致）
 * 全部基于历史单位净值的规则型信号计算，不接入新闻/资讯/AI服务，仅供参考，不构成投资建议。
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

  // 指数移动平均，从第 period-1 个点开始用简单平均作为种子，此后按标准 EMA 公式递推
  function computeEMA(list, period) {
    var result = new Array(list.length).fill(null);
    if (list.length < period) return result;
    var sum = 0;
    for (var i = 0; i < period; i++) sum += list[i];
    var prev = sum / period;
    result[period - 1] = prev;
    var k = 2 / (period + 1);
    for (var j = period; j < list.length; j++) {
      prev = list[j] * k + prev * (1 - k);
      result[j] = prev;
    }
    return result;
  }

  // MACD：DIF = EMA12 - EMA26，DEA = DIF 的 EMA9，柱状值 = (DIF-DEA)*2
  function computeMACD(navList) {
    var ema12 = computeEMA(navList, 12);
    var ema26 = computeEMA(navList, 26);
    var dif = navList.map(function (_, i) {
      return ema12[i] !== null && ema26[i] !== null ? ema12[i] - ema26[i] : null;
    });

    var difValues = [];
    var difIndexMap = [];
    dif.forEach(function (v, i) {
      if (v !== null) {
        difValues.push(v);
        difIndexMap.push(i);
      }
    });
    var deaOnDif = computeEMA(difValues, 9);
    var dea = new Array(navList.length).fill(null);
    deaOnDif.forEach(function (v, idx) {
      if (v !== null) dea[difIndexMap[idx]] = v;
    });

    var hist = navList.map(function (_, i) {
      return dif[i] !== null && dea[i] !== null ? (dif[i] - dea[i]) * 2 : null;
    });

    return { dif: dif, dea: dea, hist: hist };
  }

  // 布林带：period 日均线 ± k 倍标准差
  function computeBollinger(navList, period, k) {
    period = period || 20;
    k = k || 2;
    var ma = computeMA(navList, Math.min(period, navList.length));
    var upper = new Array(navList.length).fill(null);
    var lower = new Array(navList.length).fill(null);
    for (var i = period - 1; i < navList.length; i++) {
      var mean = ma[i];
      var variance = 0;
      for (var j = i - period + 1; j <= i; j++) variance += Math.pow(navList[j] - mean, 2);
      var std = Math.sqrt(variance / period);
      upper[i] = mean + k * std;
      lower[i] = mean - k * std;
    }
    return { upper: upper, lower: lower, mid: ma };
  }

  // 区间最大回撤（百分比，负数）
  function computeMaxDrawdown(navList) {
    var peak = -Infinity;
    var maxDd = 0;
    for (var i = 0; i < navList.length; i++) {
      if (navList[i] > peak) peak = navList[i];
      var dd = (navList[i] - peak) / peak;
      if (dd < maxDd) maxDd = dd;
    }
    return maxDd * 100;
  }

  // 年化波动率（百分比）：区间内日收益率标准差 × sqrt(245)，仅作风险参考，不参与打分
  function computeAnnualizedVolatility(navList, windowLen) {
    var vals = navList.slice(-(windowLen || 60));
    if (vals.length < 2) return null;
    var returns = [];
    for (var i = 1; i < vals.length; i++) returns.push((vals[i] - vals[i - 1]) / vals[i - 1]);
    var mean = returns.reduce(function (a, b) { return a + b; }, 0) / returns.length;
    var variance = returns.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(245) * 100;
  }

  var MAX_SCORE = 8; // RSI(±2) + 区间分位(±1) + 乖离率(±1) + 均线金叉死叉(±1) + 均线多空排列(±1) + MACD金叉死叉(±1) + 布林带触轨(±1)

  function generateSignal(history) {
    if (!history || history.length < 10) {
      return {
        verdict: 'watch',
        verdictLabel: '数据不足，暂不建议',
        score: 0,
        maxScore: MAX_SCORE,
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

    var macd = computeMACD(navList);
    var dif = macd.dif[macd.dif.length - 1];
    var dea = macd.dea[macd.dea.length - 1];
    var macdHist = macd.hist[macd.hist.length - 1];

    var boll = computeBollinger(navList, Math.min(20, navList.length));
    var bollUpper = boll.upper[boll.upper.length - 1];
    var bollLower = boll.lower[boll.lower.length - 1];

    var maxDrawdown = computeMaxDrawdown(windowVals);
    var annualVol = computeAnnualizedVolatility(navList, windowLen);

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

    var maAlign = null;
    if (ma5 !== null && ma20 !== null && ma60 !== null) {
      if (ma5 > ma20 && ma20 > ma60) {
        maAlign = 'bull';
        buyScore += 1;
        reasons.push('均线呈多头排列（MA5>MA20>MA60），中短期趋势一致向上');
      } else if (ma5 < ma20 && ma20 < ma60) {
        maAlign = 'bear';
        sellScore += 1;
        reasons.push('均线呈空头排列（MA5<MA20<MA60），中短期趋势一致向下');
      }
    }

    if (macd.dif.length >= 2 && macd.dea.length >= 2) {
      var prevDif = macd.dif[macd.dif.length - 2];
      var prevDea = macd.dea[macd.dea.length - 2];
      if (prevDif !== null && prevDea !== null && dif !== null && dea !== null) {
        if (prevDif <= prevDea && dif > dea) {
          buyScore += 1;
          reasons.push('MACD：DIF上穿DEA（金叉），中期动能转强');
        } else if (prevDif >= prevDea && dif < dea) {
          sellScore += 1;
          reasons.push('MACD：DIF下穿DEA（死叉），中期动能转弱');
        }
      }
    }

    if (bollLower !== null && bollUpper !== null) {
      if (latest <= bollLower) {
        buyScore += 1;
        reasons.push('净值触及布林带下轨，短期超跌，存在均值回归可能');
      } else if (latest >= bollUpper) {
        sellScore += 1;
        reasons.push('净值触及布林带上轨，短期涨幅过快，注意均值回归风险');
      }
    }

    var score = buyScore - sellScore;
    var verdict = 'watch';
    var verdictLabel = '观望：维持现有节奏，等待更明确信号';
    if (score >= 4) {
      verdict = 'buy';
      verdictLabel = '建议关注买入区间：可考虑逢低分批建仓';
    } else if (score <= -4) {
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
      maxScore: MAX_SCORE,
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
        macdDif: dif,
        macdDea: dea,
        macdHist: macdHist,
        bollUpper: bollUpper,
        bollLower: bollLower,
        maxDrawdown: maxDrawdown,
        maAlign: maAlign,
        annualVol: annualVol,
      },
    };
  }

  global.FundIndicators = {
    computeMA: computeMA,
    computeRSI: computeRSI,
    computeEMA: computeEMA,
    computeMACD: computeMACD,
    computeBollinger: computeBollinger,
    computeMaxDrawdown: computeMaxDrawdown,
    computeAnnualizedVolatility: computeAnnualizedVolatility,
    generateSignal: generateSignal,
  };
})(window);
