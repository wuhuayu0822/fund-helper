/**
 * 技术指标计算与买卖建议生成
 * 全部基于历史单位净值的规则型信号，仅作参考，不构成投资建议。
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

  const score = buyScore - sellScore;
  let verdict = 'watch';
  let verdictLabel = '观望：维持现有节奏，等待更明确信号';
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
    verdict,
    verdictLabel,
    score,
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
    },
  };
}

module.exports = {
  computeMA,
  computeRSI,
  generateSignal,
};
