/**
 * 技术指标计算与买卖建议生成
 * 全部基于历史单位净值的规则型信号计算，不接入新闻/资讯/AI服务，仅供参考，不构成投资建议。
 */

// 简单移动平均线
function computeMA(navList, period) {
  const result = new Array(navList.length).fill(null);
  for (let i = period - 1; i < navList.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += navList[j];
    result[i] = sum / period;
  }
  return result;
}

// RSI 相对强弱指标
function computeRSI(navList, period = 14) {
  if (navList.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = navList.length - period; i < navList.length; i++) {
    const diff = navList[i] - navList[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// 指数移动平均，从第 period-1 个点开始用简单平均作为种子，此后按标准 EMA 公式递推
function computeEMA(list, period) {
  const result = new Array(list.length).fill(null);
  if (list.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += list[i];
  let prev = sum / period;
  result[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let j = period; j < list.length; j++) {
    prev = list[j] * k + prev * (1 - k);
    result[j] = prev;
  }
  return result;
}

// MACD：DIF = EMA12 - EMA26，DEA = DIF 的 EMA9，柱状值 = (DIF-DEA)*2
function computeMACD(navList) {
  const ema12 = computeEMA(navList, 12);
  const ema26 = computeEMA(navList, 26);
  const dif = navList.map((_, i) => (ema12[i] !== null && ema26[i] !== null ? ema12[i] - ema26[i] : null));

  const difValues = [];
  const difIndexMap = [];
  dif.forEach((v, i) => {
    if (v !== null) {
      difValues.push(v);
      difIndexMap.push(i);
    }
  });
  const deaOnDif = computeEMA(difValues, 9);
  const dea = new Array(navList.length).fill(null);
  deaOnDif.forEach((v, idx) => {
    if (v !== null) dea[difIndexMap[idx]] = v;
  });

  const hist = navList.map((_, i) => (dif[i] !== null && dea[i] !== null ? (dif[i] - dea[i]) * 2 : null));

  return { dif, dea, hist };
}

// 布林带：period 日均线 ± k 倍标准差
function computeBollinger(navList, period = 20, k = 2) {
  const ma = computeMA(navList, Math.min(period, navList.length));
  const upper = new Array(navList.length).fill(null);
  const lower = new Array(navList.length).fill(null);
  for (let i = period - 1; i < navList.length; i++) {
    const mean = ma[i];
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += Math.pow(navList[j] - mean, 2);
    const std = Math.sqrt(variance / period);
    upper[i] = mean + k * std;
    lower[i] = mean - k * std;
  }
  return { upper, lower, mid: ma };
}

// 区间最大回撤（百分比，负数）
function computeMaxDrawdown(navList) {
  let peak = -Infinity;
  let maxDd = 0;
  for (let i = 0; i < navList.length; i++) {
    if (navList[i] > peak) peak = navList[i];
    const dd = (navList[i] - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

const MAX_SCORE = 7; // RSI(±2) + 区间分位(±1) + 乖离率(±1) + 均线金叉死叉(±1) + MACD金叉死叉(±1) + 布林带触轨(±1)

/**
 * 根据历史净值生成买入/观望/卖出建议
 * @param {Array<{date:string, nav:number}>} history 按日期升序的净值历史（含最新一天）
 * @returns {object} 建议详情
 */
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

  const navList = history.map((h) => h.nav);
  const latest = navList[navList.length - 1];

  const ma5Arr = computeMA(navList, Math.min(5, navList.length));
  const ma20Arr = computeMA(navList, Math.min(20, navList.length));
  const ma60Arr = computeMA(navList, Math.min(60, navList.length));
  const ma5 = ma5Arr[ma5Arr.length - 1];
  const ma20 = ma20Arr[ma20Arr.length - 1];
  const ma60 = ma60Arr[ma60Arr.length - 1];

  const rsi = computeRSI(navList, Math.min(14, navList.length - 1));

  const windowLen = Math.min(60, navList.length);
  const windowVals = navList.slice(-windowLen);
  const high = Math.max(...windowVals);
  const low = Math.min(...windowVals);
  const position = high === low ? 0.5 : (latest - low) / (high - low);

  const bias20 = ma20 ? ((latest - ma20) / ma20) * 100 : null;

  const macd = computeMACD(navList);
  const dif = macd.dif[macd.dif.length - 1];
  const dea = macd.dea[macd.dea.length - 1];
  const macdHist = macd.hist[macd.hist.length - 1];

  const boll = computeBollinger(navList, Math.min(20, navList.length));
  const bollUpper = boll.upper[boll.upper.length - 1];
  const bollLower = boll.lower[boll.lower.length - 1];

  const maxDrawdown = computeMaxDrawdown(windowVals);

  let buyScore = 0;
  let sellScore = 0;
  const reasons = [];

  if (rsi !== null) {
    if (rsi <= 30) {
      buyScore += 2;
      reasons.push(`RSI(14) = ${rsi.toFixed(1)}，处于超卖区间，短期存在反弹可能`);
    } else if (rsi >= 70) {
      sellScore += 2;
      reasons.push(`RSI(14) = ${rsi.toFixed(1)}，处于超买区间，注意回调风险`);
    }
  }

  if (position <= 0.2) {
    buyScore += 1;
    reasons.push(`当前净值处于近${windowLen}个交易日区间低位（分位 ${(position * 100).toFixed(0)}%）`);
  } else if (position >= 0.8) {
    sellScore += 1;
    reasons.push(`当前净值处于近${windowLen}个交易日区间高位（分位 ${(position * 100).toFixed(0)}%）`);
  }

  if (bias20 !== null) {
    if (bias20 <= -5) {
      buyScore += 1;
      reasons.push(`乖离率 ${bias20.toFixed(1)}%，明显低于20日均线，短期或超跌`);
    } else if (bias20 >= 5) {
      sellScore += 1;
      reasons.push(`乖离率 ${bias20.toFixed(1)}%，明显高于20日均线，短期涨幅偏大`);
    }
  }

  if (ma5Arr.length >= 2 && ma20Arr.length >= 2) {
    const prevMa5 = ma5Arr[ma5Arr.length - 2];
    const prevMa20 = ma20Arr[ma20Arr.length - 2];
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

  if (macd.dif.length >= 2 && macd.dea.length >= 2) {
    const prevDif = macd.dif[macd.dif.length - 2];
    const prevDea = macd.dea[macd.dea.length - 2];
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

  const score = buyScore - sellScore;
  let verdict = 'watch';
  let verdictLabel = '观望：维持现有节奏，等待更明确信号';
  if (score >= 3) {
    verdict = 'buy';
    verdictLabel = '建议关注买入区间：可考虑逢低分批建仓';
  } else if (score <= -3) {
    verdict = 'sell';
    verdictLabel = '建议关注卖出/止盈：短期涨幅或已透支，注意控制仓位';
  }

  if (reasons.length === 0) {
    reasons.push('各项指标暂无明显超买超卖信号，建议按原定投/持有计划观望');
  }

  return {
    verdict,
    verdictLabel,
    score,
    maxScore: MAX_SCORE,
    reasons,
    stats: {
      latest,
      ma5,
      ma20,
      ma60,
      rsi,
      bias20,
      position,
      windowLen,
      high,
      low,
      macdDif: dif,
      macdDea: dea,
      macdHist,
      bollUpper,
      bollLower,
      maxDrawdown,
    },
  };
}

module.exports = {
  computeMA,
  computeRSI,
  computeEMA,
  computeMACD,
  computeBollinger,
  computeMaxDrawdown,
  generateSignal,
};
