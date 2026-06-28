// ============================================================
// 智能股票预测助手 - 核心引擎
// ============================================================
// 多维度分析模型: 技术面(40%) + 基本面(25%) + 资金面(20%) + 情绪面(15%)
// ============================================================

// ==================== 全局状态 ====================
let currentStock = null;
let predictionHistory = JSON.parse(localStorage.getItem('stockPredictions') || '[]');

// ==================== API配置 ====================
// 使用东方财富免费API (A股)
const API_BASE = 'https://push2.eastmoney.com/api';
const QUOTE_API = 'https://push2his.eastmoney.com/api';
const SEARCH_API = 'https://searchapi.eastmoney.com/api';

// CORS代理备选方案 (当直接请求被拦截时使用)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?'
];

// ==================== 搜索股票 ====================
async function searchStock() {
  const input = document.getElementById('searchInput').value.trim();
  if (!input) return alert('请输入股票名称或代码');

  showLoading(true);
  hideAllTabs();

  try {
    // 尝试识别股票代码
    const stockData = await resolveStockCode(input);
    if (!stockData) {
      alert('未找到该股票，请检查代码或名称');
      showLoading(false);
      switchTab('welcome');
      return;
    }

    currentStock = stockData;
    await fetchAndAnalyze(stockData);
  } catch (e) {
    console.error(e);
    alert('获取数据失败: ' + e.message);
    showLoading(false);
    switchTab('welcome');
  }
}

// 解析股票代码和市场
async function resolveStockCode(input) {
  // 如果是纯数字，尝试直接匹配
  if (/^\d{6}$/.test(input)) {
    const market = input.startsWith('6') ? 'sh' : 'sz';
    return {
      code: input,
      market: market,
      name: '',
      secid: `${market}.${input}`
    };
  }

  // 搜索股票
  try {
    const searchUrl = `${SEARCH_API}/v7/SugWapSearchService/Get?query=${encodeURIComponent(input)}&type=14&reqoto=h5&token=D4AD6CE9&fund=1&skiplist=1&sc=stock&os_ver=10&appver=3.2.1&plat=Android&devver=33&nettype=WiFi&pagesize=5&page=1&dcame=1&prodname=东方财富H5&city=utc&lat=&lon=&flag=zhi&clienttype=android`;
    const resp = await fetchWithFallback(searchUrl);
    const data = await resp.json();

    if (data.Data && data.Data.list && data.Data.list.length > 0) {
      const item = data.Data.list[0];
      const market = item.MarketingCode === 'SH' ? 'sh' : 'sz';
      return {
        code: item.Code || item.Fcode,
        market: market,
        name: item.Name || item.Displayname,
        secid: `${market}.${item.Code || item.Fcode}`
      };
    }
  } catch (e) {
    console.warn('Search failed, trying direct quote:', e);
  }

  // 如果搜索失败，尝试直接获取行情
  try {
    const market = input.startsWith('6') ? 'sh' : 'sz';
    return {
      code: input,
      market: market,
      name: '',
      secid: `${market}.${input}`
    };
  } catch (e) {
    return null;
  }
}

// ==================== 获取行情数据 ====================
async function fetchAndAnalyze(stock) {
  try {
    // 获取实时行情
    const quoteData = await fetchQuote(stock.secid);
    if (!quoteData) {
      alert('无法获取行情数据');
      return;
    }

    // 获取K线数据用于技术分析
    const klineData = await fetchKline(stock.secid, stock.code);

    // 执行多维度分析
    const analysis = analyzeStock(quoteData, klineData, stock);

    // 渲染结果
    renderResults(stock, quoteData, analysis);

    // 保存历史
    savePrediction(stock, quoteData, analysis);

    showLoading(false);
    switchTab('result');
  } catch (e) {
    console.error(e);
    showLoading(false);
    alert('分析失败: ' + e.message);
  }
}

// ==================== 获取实时行情 ====================
async function fetchQuote(secid) {
  try {
    const fields = 'f4,f12,f13,f14,f2,f3,f6,f7,f8,f9,f10,f11,f17,f18,f22,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f43,f44,f47,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171';
    const url = `${API_BASE}/UniApiFS/Query?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19,f20,f21,f22,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65&ut=fa5fd194c840f8f91a131f1b41a98511&dopost=minKline&pagesize=120&devicetype=&agenttype=122&is_48h=true`;

    const resp = await fetchWithFallback(url);
    const data = await resp.json();

    if (data.Data && data.Data.diff && data.Data.diff.length > 0) {
      const item = data.Data.diff[0];
      return {
        name: item.f14 || '',
        code: item.f12 || '',
        price: item.f2 || 0,
        changePercent: item.f3 || 0,
        changeAmount: item.f4 || 0,
        high: item.f15 || 0,
        low: item.f16 || 0,
        open: item.f17 || 0,
        volume: item.f8 || 0,
        amount: item.f6 || 0,
        turnoverRate: item.f43 || 0,
        pe: item.f9 || 0,
        pb: item.f10 || 0,
        marketCap: item.f11 || 0,
        floatCap: item.f141 || 0,
        totalShares: item.f18 || 0,
        floatShares: item.f19 || 0,
        amplitude: item.f171 || 0,
        riseFall: item.f170 || 0,
        upperLimit: item.f63 || 0,
        lowerLimit: item.f64 || 0,
        limitUp: item.f62 || 0,
        limitDown: item.f65 || 0,
        industry: item.f162 || '未知',
        eps: item.f57 || 0,
        bvps: item.f58 || 0,
        roe: item.f169 || 0,
        grossMargin: item.f105 || 0,
        revenueGrowth: item.f106 || 0,
        profitGrowth: item.f107 || 0,
        macdRed: item.f55 || 0,
        macdGreen: item.f56 || 0,
      };
    }
    return null;
  } catch (e) {
    console.error('Quote fetch error:', e);
    return null;
  }
}

// 获取K线数据
async function fetchKline(secid, code) {
  try {
    const url = `${QUOTE_API}/kline/clist?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&ndays=120&pageSize=120&page=1`;
    const resp = await fetchWithFallback(url);
    const data = await resp.json();

    if (data.Data && data.Data.diff) {
      return data.Data.diff.map(item => ({
        date: item.f14 || '',
        open: parseFloat(item.f55) || 0,
        close: parseFloat(item.f56) || 0,
        high: parseFloat(item.f57) || 0,
        low: parseFloat(item.f58) || 0,
        volume: parseFloat(item.f59) || 0,
        amount: parseFloat(item.f60) || 0,
        turnover: parseFloat(item.f61) || 0,
      })).reverse();
    }
    return [];
  } catch (e) {
    console.error('Kline fetch error:', e);
    return [];
  }
}

// ==================== 多维度分析引擎 ====================
function analyzeStock(quote, klines, stock) {
  const result = {
    techAnalysis: {},
    fundamentalAnalysis: {},
    capitalAnalysis: {},
    sentimentAnalysis: {},
    overallScore: 0,
    direction: '',
    confidence: 0,
    predictedChange: 0,
    details: {}
  };

  // --- 1. 技术面分析 (权重40%) ---
  result.techAnalysis = analyzeTechnical(klines, quote);

  // --- 2. 基本面分析 (权重25%) ---
  result.fundamentalAnalysis = analyzeFundamental(quote);

  // --- 3. 资金面分析 (权重20%) ---
  result.capitalAnalysis = analyzeCapital(klines, quote);

  // --- 4. 情绪面分析 (权重15%) ---
  result.sentimentAnalysis = analyzeSentiment(klines, quote);

  // --- 综合评分 ---
  const weights = { tech: 0.40, fundamental: 0.25, capital: 0.20, sentiment: 0.15 };

  const techScore = normalizeScore(result.techAnalysis.score);
  const fundScore = normalizeScore(result.fundamentalAnalysis.score);
  const capitalScore = normalizeScore(result.capitalAnalysis.score);
  const sentimentScore = normalizeScore(result.sentimentAnalysis.score);

  result.overallScore = techScore * weights.tech
    + fundScore * weights.fundamental
    + capitalScore * weights.capital
    + sentimentScore * weights.sentiment;

  // 方向判断
  if (result.overallScore >= 60) {
    result.direction = 'up';
    result.predictedChange = Math.min((result.overallScore - 50) * 0.3 + randomNoise(), 15);
  } else if (result.overallScore <= 40) {
    result.direction = 'down';
    result.predictedChange = Math.max(-((50 - result.overallScore) * 0.3 + randomNoise()), -15);
  } else {
    result.direction = 'flat';
    result.predictedChange = randomNoise() * 0.5;
  }

  // 置信度
  result.confidence = Math.min(Math.abs(result.overallScore - 50) * 2 + 30, 95);

  // 短期(1-3日)和中期(5-10日)预测
  result.shortTerm = result.direction === 'up' ?
    Math.min(result.predictedChange * 0.6, 8) :
    result.direction === 'down' ?
    Math.max(result.predictedChange * 0.6, -8) :
    randomNoise() * 0.3;

  result.midTerm = result.direction === 'up' ?
    Math.min(result.predictedChange * 1.2, 20) :
    result.direction === 'down' ?
    Math.max(result.predictedChange * 1.2, -20) :
    randomNoise() * 0.8;

  result.details = { techScore, fundScore, capitalScore, sentimentScore };

  return result;
}

// ==================== 技术面分析 ====================
function analyzeTechnical(klines, quote) {
  let score = 50; // 基准分50
  const details = {};

  if (klines.length < 20) {
    return { score: 50, details: { reason: '数据不足' } };
  }

  // --- 1. 均线系统 (MA5/MA10/MA20/MA60) ---
  const ma5 = calcMA(klines, 5, 'close');
  const ma10 = calcMA(klines, 10, 'close');
  const ma20 = calcMA(klines, 20, 'close');
  const ma60 = calcMA(klines, 60, 'close');
  const currentPrice = quote.close || quote.price;

  // 多头排列加分
  if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) {
    score += 12;
    details.maArrangement = '多头排列';
  } else if (ma5 < ma10 && ma10 < ma20 && ma20 < ma60) {
    score -= 12;
    details.maArrangement = '空头排列';
  } else {
    details.maArrangement = '交叉状态';
  }

  // 价格在均线上方加分
  if (currentPrice > ma5) score += 3;
  if (currentPrice > ma10) score += 3;
  if (currentPrice > ma20) score += 4;
  if (currentPrice > ma60) score += 5;

  // 均线位置
  details.maValues = {
    MA5: ma5.toFixed(2),
    MA10: ma10.toFixed(2),
    MA20: ma20.toFixed(2),
    MA60: ma60.toFixed(2)
  };

  // --- 2. MACD ---
  const macd = calcMACD(klines);
  if (macd) {
    if (macd.dif > macd.dea && macd.hist > 0) {
      score += 6;
      details.macdSignal = '金叉看涨';
    } else if (macd.dif < macd.dea && macd.hist < 0) {
      score -= 6;
      details.macdSignal = '死叉看跌';
    } else if (macd.dif > macd.dea && macd.hist < 0 && macd.hist > (macd.prevHist || 0)) {
      score += 3;
      details.macdSignal = '绿柱缩短';
    } else if (macd.dif < macd.dea && macd.hist > 0 && macd.hist < (macd.prevHist || 0)) {
      score -= 3;
      details.macdSignal = '红柱缩短';
    } else {
      details.macdSignal = '中性';
    }
    details.macd = { DIF: macd.dif.toFixed(3), DEA: macd.dea.toFixed(3), MACD: (macd.hist * 2).toFixed(3) };
  }

  // --- 3. RSI ---
  const rsi = calcRSI(klines, 6);
  const rsi12 = calcRSI(klines, 12);
  if (rsi !== null) {
    if (rsi < 30) { score += 8; details.rsiSignal = '超卖区(买入信号)'; }
    else if (rsi < 40) { score += 4; details.rsiSignal = '弱势区'; }
    else if (rsi > 70) { score -= 8; details.rsiSignal = '超买区(卖出信号)'; }
    else if (rsi > 60) { score -= 4; details.rsiSignal = '强势区'; }
    else { details.rsiSignal = '中性区'; }
    details.rsi6 = rsi.toFixed(2);
    details.rsi12 = rsi12 ? rsi12.toFixed(2) : '--';
  }

  // --- 4. KDJ ---
  const kdj = calcKDJ(klines);
  if (kdj) {
    if (kdj.k < 20 && kdj.d < 20) { score += 6; details.kdjSignal = '低位金叉'; }
    else if (kdj.k > 80 && kdj.d > 80) { score -= 6; details.kdjSignal = '高位死叉'; }
    else if (kdj.k > kdj.d && kdj.k < 50) { score += 3; details.kdjSignal = '金叉向上'; }
    else if (kdj.k < kdj.d && kdj.k > 50) { score -= 3; details.kdjSignal = '死叉向下'; }
    else { details.kdjSignal = '中性'; }
    details.kdj = { K: kdj.k.toFixed(2), D: kdj.d.toFixed(2), J: kdj.j.toFixed(2) };
  }

  // --- 5. 布林带 (BOLL) ---
  const boll = calcBOLL(klines);
  if (boll) {
    if (currentPrice > boll.upper) { score -= 4; details.bollSignal = '突破上轨(可能回调)'; }
    else if (currentPrice < boll.lower) { score += 4; details.bollSignal = '跌破下轨(可能反弹)'; }
    else if (currentPrice > boll.mid) { score += 3; details.bollSignal = '中轨上方偏强'; }
    else { score -= 3; details.bollSignal = '中轨下方偏弱'; }
    details.boll = { 上轨: boll.upper.toFixed(2), 中轨: boll.mid.toFixed(2), 下轨: boll.lower.toFixed(2) };
  }

  // --- 6. 成交量趋势 ---
  const volAvg5 = calcMA(klines, 5, 'volume');
  const volAvg20 = calcMA(klines, 20, 'volume');
  const latestVol = klines[klines.length - 1]?.volume || 0;
  if (volAvg5 > volAvg20 * 1.2) {
    details.volTrend = '放量';
    if (currentPrice > (klines[klines.length - 2]?.close || 0)) {
      score += 5; // 放量上涨
    } else {
      score -= 3; // 放量下跌
    }
  } else if (volAvg5 < volAvg20 * 0.7) {
    details.volTrend = '缩量';
    if (currentPrice > (klines[klines.length - 2]?.close || 0)) {
      score -= 2; // 缩量上涨不可持续
    } else {
      score += 2; // 缩量下跌可能企稳
    }
  } else {
    details.volTrend = '平量';
  }
  details.volumeRatio = (latestVol / volAvg20).toFixed(2);

  // --- 7. 近期走势动量 ---
  const recentChange = calcRecentChange(klines, 5);
  if (recentChange > 5) { score -= 3; details.momentum = '短期涨幅过大'; }
  else if (recentChange < -5) { score += 3; details.momentum = '短期超跌'; }
  else { details.momentum = '正常波动'; }

  // --- 8. 涨跌天数统计 ---
  const upDays = countUpDays(klines, 5);
  if (upDays >= 4) { score += 2; }
  else if (upDays <= 1) { score -= 2; }

  details.score = score;
  return { score, details };
}

// ==================== 基本面分析 ====================
function analyzeFundamental(quote) {
  let score = 50;
  const details = {};

  // --- PE估值 ---
  const pe = quote.pe > 0 ? quote.pe : 0;
  if (pe > 0) {
    if (pe < 10) { score += 10; details.peEval = '低估(<10)'; }
    else if (pe < 20) { score += 5; details.peEval = '合理(10-20)'; }
    else if (pe < 40) { details.peEval = '偏高(20-40)'; }
    else if (pe < 80) { score -= 5; details.peEval = '高估(40-80)'; }
    else { score -= 10; details.peEval = '严重高估(>80)'; }
    details.pe = pe.toFixed(2);
  } else {
    details.pe = '亏损/--';
    score -= 5;
  }

  // --- PB估值 ---
  const pb = quote.pb > 0 ? quote.pb : 0;
  if (pb > 0) {
    if (pb < 1) { score += 10; details.pbEval = '破净(<1)'; }
    else if (pb < 2) { score += 5; details.pbEval = '偏低(1-2)'; }
    else if (pb < 5) { details.pbEval = '合理(2-5)'; }
    else if (pb < 10) { score -= 5; details.pbEval = '偏高(5-10)'; }
    else { score -= 10; details.pbEval = '严重偏高(>10)'; }
    details.pb = pb.toFixed(2);
  }

  // --- ROE ---
  const roe = quote.roe > 0 ? quote.roe : 0;
  if (roe > 0) {
    if (roe > 20) { score += 10; details.roeEval = '优秀(>20%)'; }
    else if (roe > 15) { score += 7; details.roeEval = '良好(15-20%)'; }
    else if (roe > 10) { score += 3; details.roeEval = '不错(10-15%)'; }
    else if (roe > 5) { details.roeEval = '一般(5-10%)'; }
    else { score -= 5; details.roeEval = '较差(<5%)'; }
    details.roe = roe.toFixed(2) + '%';
  }

  // --- 营收增长 ---
  const revGrowth = quote.revenueGrowth || 0;
  if (revGrowth > 0) {
    if (revGrowth > 30) { score += 8; details.revGrowth = '高速增长(>30%)'; }
    else if (revGrowth > 15) { score += 5; details.revGrowth = '快速增长(15-30%)'; }
    else if (revGrowth > 5) { score += 2; details.revGrowth = '稳定增长(5-15%)'; }
    else { details.revGrowth = '低速增长(<5%)'; }
  } else if (revGrowth < -20) {
    score -= 8; details.revGrowth = '大幅下滑';
  } else {
    details.revGrowth = (revGrowth || 0).toFixed(2) + '%';
  }

  // --- 净利润增长 ---
  const profitGrowth = quote.profitGrowth || 0;
  if (profitGrowth > 0) {
    if (profitGrowth > 30) { score += 8; details.profitGrowth = '利润大增'; }
    else if (profitGrowth > 15) { score += 5; details.profitGrowth = '利润增长'; }
    else { details.profitGrowth = '利润微增'; }
  } else if (profitGrowth < -20) {
    score -= 8; details.profitGrowth = '利润下滑';
  } else {
    details.profitGrowth = (profitGrowth || 0).toFixed(2) + '%';
  }

  // --- 毛利率 ---
  const grossMargin = quote.grossMargin || 0;
  if (grossMargin > 0) {
    if (grossMargin > 50) { score += 5; details.grossMargin = '高毛利'; }
    else if (grossMargin > 30) { score += 3; details.grossMargin = '中高毛利'; }
    else if (grossMargin > 15) { details.grossMargin = '中等毛利'; }
    else { score -= 3; details.grossMargin = '低毛利'; }
    details.grossMarginVal = grossMargin.toFixed(2) + '%';
  }

  // --- EPS ---
  details.eps = (quote.eps || 0).toFixed(4);

  details.score = score;
  return { score, details };
}

// ==================== 资金面分析 ====================
function analyzeCapital(klines, quote) {
  let score = 50;
  const details = {};

  // --- 换手率 ---
  const turnover = quote.turnoverRate || 0;
  if (turnover > 0) {
    if (turnover > 15) { score += 3; details.turnover = '活跃换手'; }
    else if (turnover > 8) { score += 5; details.turnover = '高换手(资金关注)'; }
    else if (turnover > 3) { details.turnover = '正常换手'; }
    else if (turnover > 0.5) { score -= 3; details.turnover = '低换手(关注度低)'; }
    else { score -= 5; details.turnover = '极低换手'; }
    details.turnoverRate = turnover.toFixed(2) + '%';
  }

  // --- 量比 ---
  const volAvg20 = calcMA(klines, 20, 'volume');
  const latestVol = klines[klines.length - 1]?.volume || 0;
  const latestAmount = quote.amount || 0;
  if (volAvg20 > 0) {
    const volRatio = latestVol / volAvg20;
    details.volumeRatio = volRatio.toFixed(2);
    if (volRatio > 2) { score += 5; details.volRatioSignal = '显著放量'; }
    else if (volRatio > 1.5) { score += 3; details.volRatioSignal = '温和放量'; }
    else if (volRatio < 0.5) { score -= 3; details.volRatioSignal = '明显缩量'; }
    else { details.volRatioSignal = '量能正常'; }
  }

  // --- 振幅 ---
  const amplitude = quote.amplitude || 0;
  if (amplitude > 0) {
    details.amplitude = amplitude.toFixed(2) + '%';
    if (amplitude > 8) { score += 2; details.amplitudeSignal = '大振幅(波动机会)'; }
    else if (amplitude > 5) { details.amplitudeSignal = '中等振幅'; }
    else if (amplitude < 1) { score -= 2; details.amplitudeSignal = '窄幅震荡'; }
    else { details.amplitudeSignal = '小振幅'; }
  }

  // --- 涨跌停状态 ---
  if (quote.limitUp === 1) { score += 15; details.limitStatus = '涨停!'; }
  else if (quote.limitDown === 1) { score -= 15; details.limitStatus = '跌停!'; }
  else { details.limitStatus = '正常交易'; }

  // --- 近5日资金流向模拟 ---
  let inflowDays = 0;
  for (let i = klines.length - 1; i >= Math.max(0, klines.length - 5); i--) {
    if (i > 0 && klines[i].close > klines[i - 1].close) inflowDays++;
  }
  details.netInflowDays = inflowDays + '/5';
  if (inflowDays >= 4) score += 5;
  else if (inflowDays <= 1) score -= 5;

  // --- 成交额 ---
  details.amount = formatVolume(latestAmount);

  details.score = score;
  return { score, details };
}

// ==================== 情绪面分析 ====================
function analyzeSentiment(klines, quote) {
  let score = 50;
  const details = {};

  // --- 近10日涨幅天数 ---
  const upDays10 = countUpDays(klines, 10);
  details.upDays10 = upDays10 + '/10';
  if (upDays10 >= 8) { score += 5; details.sentiment = '强势情绪'; }
  else if (upDays10 >= 6) { score += 2; details.sentiment = '偏强情绪'; }
  else if (upDays10 <= 2) { score -= 5; details.sentiment = '弱势情绪'; }
  else { details.sentiment = '中性情绪'; }

  // --- 连涨/连跌 ---
  let maxConsecutiveUp = 0, maxConsecutiveDown = 0;
  let curUp = 0, curDown = 0;
  for (let i = 1; i < klines.length; i++) {
    if (klines[i].close > klines[i - 1].close) {
      curUp++; curDown = 0;
      maxConsecutiveUp = Math.max(maxConsecutiveUp, curUp);
    } else {
      curDown++; curUp = 0;
      maxConsecutiveDown = Math.max(maxConsecutiveDown, curDown);
    }
  }
  details.maxUpStreak = maxConsecutiveUp;
  details.maxDownStreak = maxConsecutiveDown;
  if (maxConsecutiveUp >= 5) { score -= 3; details.streakSignal = '连涨过多(注意回调)'; }
  else if (maxConsecutiveDown >= 5) { score += 3; details.streakSignal = '连跌过多(注意反弹)'; }
  else { details.streakSignal = '无异常连涨/连跌'; }

  // --- 价格相对位置 ---
  const prices = klines.map(k => k.close);
  const highest52w = Math.max(...prices.slice(-60));
  const lowest52w = Math.min(...prices.slice(-60));
  const currentPos = highest52w > lowest52w
    ? ((quote.price - lowest52w) / (highest52w - lowest52w) * 100)
    : 50;
  details.positionPercentile = currentPos.toFixed(1) + '%';

  if (currentPos > 90) { score -= 5; details.pricePosition = '接近52周新高'; }
  else if (currentPos < 10) { score += 5; details.pricePosition = '接近52周新低'; }
  else if (currentPos > 70) { score -= 2; details.pricePosition = '偏高位置'; }
  else if (currentPos < 30) { score += 2; details.pricePosition = '偏低位置'; }
  else { details.pricePosition = '中间位置'; }

  // --- 波动率 ---
  const returns = [];
  for (let i = 1; i < klines.length; i++) {
    returns.push((klines[i].close - klines[i - 1].close) / klines[i - 1].close);
  }
  if (returns.length > 0) {
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - avg) ** 2, 0) / returns.length;
    const volatility = Math.sqrt(variance) * 100;
    details.volatility = volatility.toFixed(2) + '%';
    if (volatility > 3) { score -= 2; details.volSignal = '高波动(风险大)'; }
    else if (volatility < 0.5) { score += 1; details.volSignal = '低波动(稳定)'; }
    else { details.volSignal = '中等波动'; }
  }

  // --- 当日涨跌幅 ---
  const chg = quote.changePercent || 0;
  details.todayChange = chg.toFixed(2) + '%';
  if (chg > 5) { score += 3; details.todaySignal = '大涨(惯性可能继续)'; }
  else if (chg < -5) { score -= 3; details.todaySignal = '大跌(惯性可能继续)'; }
  else if (chg > 2) { score += 1; details.todaySignal = '小幅上涨'; }
  else if (chg < -2) { score -= 1; details.todaySignal = '小幅下跌'; }
  else { details.todaySignal = '窄幅震荡'; }

  details.score = score;
  return { score, details };
}

// ==================== 技术指标计算 ====================
function calcMA(klines, period, field) {
  if (klines.length < period) return 0;
  const slice = klines.slice(-period);
  return slice.reduce((sum, k) => sum + (k[field] || 0), 0) / period;
}

function calcMACD(klines) {
  if (klines.length < 26) return null;
  const closes = klines.map(k => k.close || 0);

  // EMA12
  const ema12 = calcEMA(closes, 12);
  // EMA26
  const ema26 = calcEMA(closes, 26);
  if (!ema12 || !ema26) return null;

  const dif = ema12 - ema26;

  // 用最近26根计算近似DEA
  const difs = [];
  for (let i = 26; i <= closes.length; i++) {
    const e12 = calcEMASlice(closes.slice(0, i), 12);
    const e26 = calcEMASlice(closes.slice(0, i), 26);
    if (e12 && e26) difs.push(e12 - e26);
  }

  if (difs.length < 2) return null;

  const dea = calcEMAArray(difs, 9);
  const hist = (dif - dea) * 2;
  const prevHist = difs.length > 1 ? (difs[difs.length - 1] - calcEMAArray(difs.slice(0, -1), 9)) * 2 : hist;

  return { dif, dea, hist, prevHist };
}

function calcEMA(values, period) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calcEMASlice(values, period) {
  if (values.length < period * 2) return null;
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calcEMAArray(arr, period) {
  if (arr.length < period) return arr[arr.length - 1] || 0;
  const multiplier = 2 / (period + 1);
  let ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < arr.length; i++) {
    ema = (arr[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calcRSI(klines, period) {
  if (klines.length < period + 1) return null;
  const changes = [];
  for (let i = klines.length - period; i < klines.length; i++) {
    changes.push(klines[i].close - klines[i - 1].close);
  }
  let gains = 0, losses = 0;
  changes.forEach(c => {
    if (c > 0) gains += c;
    else losses -= c;
  });
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcKDJ(klines) {
  if (klines.length < 9) return null;
  const last9 = klines.slice(-9);
  const highs = last9.map(k => k.high);
  const lows = last9.map(k => k.low);
  const closes = last9.map(k => k.close);

  const hh = Math.max(...highs);
  const ll = Math.min(...lows);
  const c = closes[closes.length - 1];

  if (hh === ll) return { k: 50, d: 50, j: 50 };

  const rsv = (c - ll) / (hh - ll) * 100;

  // 简化KDJ计算
  const k = rsv;
  const prevK = last9.length > 1 ? (last9[last9.length - 2].close - Math.min(...last9.slice(-9, -1).map(x => x.low))) /
    (Math.max(...last9.slice(-9, -1).map(x => x.high)) - Math.min(...last9.slice(-9, -1).map(x => x.low))) * 100 : 50;
  const d = (prevK * 2 + k) / 3;
  const j = 3 * k - 2 * d;

  return { k, d, j };
}

function calcBOLL(klines) {
  if (klines.length < 20) return null;
  const period = 20;
  const slice = klines.slice(-period);
  const closes = slice.map(k => k.close);
  const mid = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, c) => sum + (c - mid) ** 2, 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: mid + 2 * std,
    mid: mid,
    lower: mid - 2 * std
  };
}

function calcRecentChange(klines, days) {
  if (klines.length < days + 1) return 0;
  const old = klines[klines.length - days - 1].close;
  const now = klines[klines.length - 1].close;
  return ((now - old) / old) * 100;
}

function countUpDays(klines, days) {
  if (klines.length < days + 1) return 0;
  let count = 0;
  for (let i = klines.length - days; i < klines.length; i++) {
    if (klines[i].close > klines[i - 1].close) count++;
  }
  return count;
}

// ==================== 工具函数 ====================
function normalizeScore(score) {
  return Math.max(0, Math.min(100, score));
}

function randomNoise() {
  return (Math.random() - 0.5) * 2;
}

function formatVolume(num) {
  if (!num) return '--';
  if (num >= 1e8) return (num / 1e8).toFixed(2) + '亿';
  if (num >= 1e4) return (num / 1e4).toFixed(2) + '万';
  return num.toString();
}

function formatMoney(num) {
  if (!num) return '--';
  if (num >= 1e8) return (num / 1e8).toFixed(2) + '亿';
  if (num >= 1e4) return (num / 1e4).toFixed(2) + '万';
  return num.toString();
}

// ==================== UI渲染 ====================
function renderResults(stock, quote, analysis) {
  // 股票信息
  document.getElementById('stockName').textContent = stock.name || quote.name || '未知';
  document.getElementById('stockCode').textContent = `${stock.code || quote.code} · ${stock.market === 'sh' ? '上海' : '深圳'}`;

  const price = quote.price || quote.close || 0;
  const chg = quote.changePercent || 0;
  document.getElementById('currentPrice').textContent = price.toFixed(2);
  document.getElementById('currentPrice').className = `current-price ${chg >= 0 ? 'up' : 'down'}`;

  const chgStr = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%  ${quote.changeAmount ? (quote.changeAmount >= 0 ? '+' : '') + quote.changeAmount.toFixed(2) : ''}`;
  document.getElementById('priceChange').textContent = chgStr;
  document.getElementById('priceChange').className = `price-change ${chg >= 0 ? 'up' : 'down'}`;

  // 基本信息
  document.getElementById('marketCap').textContent = formatMoney(quote.marketCap) + '元';
  document.getElementById('floatCap').textContent = formatMoney(quote.floatCap) + '元';
  document.getElementById('peRatio').textContent = quote.pe > 0 ? quote.pe.toFixed(2) : '亏损/--';
  document.getElementById('peRatio').className = `detail-value ${quote.pe > 0 && quote.pe < 20 ? 'up' : quote.pe > 60 ? 'down' : ''}`;
  document.getElementById('pbRatio').textContent = quote.pb > 0 ? quote.pb.toFixed(2) : '--';
  document.getElementById('roe').textContent = quote.roe ? quote.roe.toFixed(2) + '%' : '--';
  document.getElementById('turnoverRate').textContent = quote.turnoverRate ? quote.turnoverRate.toFixed(2) + '%' : '--';
  document.getElementById('volume').textContent = formatVolume(quote.volume);
  document.getElementById('amount').textContent = formatMoney(quote.amount);

  // 预测结果
  const predCard = document.getElementById('predictionCard');
  predCard.classList.add('active');

  const dirEl = document.getElementById('predDirection');
  const confFill = document.getElementById('confidenceFill');
  const confLabel = document.getElementById('confidenceLabel');
  const rateEl = document.getElementById('predRate');

  if (analysis.direction === 'up') {
    dirEl.textContent = '📈 看涨';
    dirEl.className = 'pred-direction upward';
    confFill.style.background = 'linear-gradient(90deg, #ef5350, #ff7043)';
  } else if (analysis.direction === 'down') {
    dirEl.textContent = '📉 看跌';
    dirEl.className = 'pred-direction downward';
    confFill.style.background = 'linear-gradient(90deg, #26a69a, #66bb6a)';
  } else {
    dirEl.textContent = '➡️ 震荡';
    dirEl.className = 'pred-direction flat';
    confFill.style.background = 'linear-gradient(90deg, #ffd54f, #ffb300)';
  }

  confFill.style.width = analysis.confidence + '%';
  confLabel.textContent = `置信度: ${analysis.confidence.toFixed(1)}%`;

  const rateSign = analysis.predictedChange >= 0 ? '+' : '';
  rateEl.textContent = `预计涨跌幅: ${rateSign}${analysis.predictedChange.toFixed(2)}%`;
  rateEl.className = `pred-rate ${analysis.predictedChange >= 0 ? 'up' : 'down'}`;

  // 四大维度分数卡片
  const factorGrid = document.getElementById('factorGrid');
  const factors = [
    { name: '技术面', score: analysis.details.techScore, color: '#5c6bc0', icon: '📊' },
    { name: '基本面', score: analysis.details.fundScore, color: '#26a69a', icon: '💰' },
    { name: '资金面', score: analysis.details.capitalScore, color: '#ffd54f', icon: '🌊' },
    { name: '情绪面', score: analysis.details.sentimentScore, color: '#ab47bc', icon: '🧠' },
  ];

  factorGrid.innerHTML = factors.map(f => `
    <div class="factor-item">
      <div class="factor-name">${f.icon} ${f.name}</div>
      <div class="factor-score">
        <span class="factor-value" style="color: ${f.color}">${f.score.toFixed(0)}</span>
        <span style="font-size:12px;color:var(--text-secondary)">/100</span>
      </div>
      <div class="factor-bar">
        <div class="factor-bar-fill" style="width:${f.score}%;background:${f.color}"></div>
      </div>
    </div>
  `).join('');

  // 技术面详情
  const techSec = document.getElementById('techSection');
  techSec.classList.add('active');
  const techD = analysis.techAnalysis.details;
  document.getElementById('techDetails').innerHTML = `
    ${techD.maValues ? `<div class="detail-row"><span class="detail-label">均线排列</span><span class="detail-value">${techD.maArrangement || ''}</span></div>
    <div class="detail-row"><span class="detail-label">MA5</span><span class="detail-value">${techD.maValues.MA5}</span></div>
    <div class="detail-row"><span class="detail-label">MA10</span><span class="detail-value">${techD.maValues.MA10}</span></div>
    <div class="detail-row"><span class="detail-label">MA20</span><span class="detail-value">${techD.maValues.MA20}</span></div>
    <div class="detail-row"><span class="detail-label">MA60</span><span class="detail-value">${techD.maValues.MA60}</span></div>` : ''}
    ${techD.macd ? `<div class="detail-row"><span class="detail-label">MACD信号</span><span class="detail-value">${techD.macdSignal || ''}</span></div>
    <div class="detail-row"><span class="detail-label">DIF</span><span class="detail-value">${techD.macd.DIF}</span></div>
    <div class="detail-row"><span class="detail-label">DEA</span><span class="detail-value">${techD.macd.DEA}</span></div>
    <div class="detail-row"><span class="detail-label">MACD柱</span><span class="detail-value">${techD.macd.MACD}</span></div>` : ''}
    ${techD.rsi6 ? `<div class="detail-row"><span class="detail-label">RSI信号</span><span class="detail-value">${techD.rsiSignal || ''}</span></div>
    <div class="detail-row"><span class="detail-label">RSI(6)</span><span class="detail-value">${techD.rsi6}</span></div>
    <div class="detail-row"><span class="detail-label">RSI(12)</span><span class="detail-value">${techD.rsi12}</span></div>` : ''}
    ${techD.kdj ? `<div class="detail-row"><span class="detail-label">KDJ信号</span><span class="detail-value">${techD.kdjSignal || ''}</span></div>
    <div class="detail-row"><span class="detail-label">K值</span><span class="detail-value">${techD.kdj.K}</span></div>
    <div class="detail-row"><span class="detail-label">D值</span><span class="detail-value">${techD.kdj.D}</span></div>
    <div class="detail-row"><span class="detail-label">J值</span><span class="detail-value">${techD.kdj.J}</span></div>` : ''}
    ${techD.boll ? `<div class="detail-row"><span class="detail-label">BOLL信号</span><span class="detail-value">${techD.bollSignal || ''}</span></div>
    <div class="detail-row"><span class="detail-label">上轨</span><span class="detail-value">${techD.boll.上轨}</span></div>
    <div class="detail-row"><span class="detail-label">中轨</span><span class="detail-value">${techD.boll.中轨}</span></div>
    <div class="detail-row"><span class="detail-label">下轨</span><span class="detail-value">${techD.boll.下轨}</span></div>` : ''}
    <div class="detail-row"><span class="detail-label">成交量趋势</span><span class="detail-value">${techD.volTrend || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">量比</span><span class="detail-value">${techD.volumeRatio || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">动量</span><span class="detail-value">${techD.momentum || '--'}</span></div>
  `;

  // 基本面详情
  const fundSec = document.getElementById('fundSection');
  fundSec.classList.add('active');
  const fundD = analysis.fundamentalAnalysis.details;
  document.getElementById('fundDetails').innerHTML = `
    <div class="detail-row"><span class="detail-label">市盈率(PE)</span><span class="detail-value">${fundD.pe || '--'} (${fundD.peEval || ''})</span></div>
    <div class="detail-row"><span class="detail-label">市净率(PB)</span><span class="detail-value">${fundD.pb || '--'} (${fundD.pbEval || ''})</span></div>
    <div class="detail-row"><span class="detail-label">ROE</span><span class="detail-value">${fundD.roe || '--'} (${fundD.roeEval || ''})</span></div>
    <div class="detail-row"><span class="detail-label">营收增长率</span><span class="detail-value">${fundD.revGrowth || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">净利润增长率</span><span class="detail-value">${fundD.profitGrowth || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">毛利率</span><span class="detail-value">${fundD.grossMarginVal || '--'} (${fundD.grossMargin || ''})</span></div>
    <div class="detail-row"><span class="detail-label">EPS</span><span class="detail-value">${fundD.eps || '--'}</span></div>
  `;

  // 资金面详情
  const capSec = document.getElementById('capitalSection');
  capSec.classList.add('active');
  const capD = analysis.capitalAnalysis.details;
  document.getElementById('capitalDetails').innerHTML = `
    <div class="detail-row"><span class="detail-label">换手率</span><span class="detail-value">${capD.turnoverRate || '--'} (${capD.turnover || ''})</span></div>
    <div class="detail-row"><span class="detail-label">量比</span><span class="detail-value">${capD.volumeRatio || '--'} (${capD.volRatioSignal || ''})</span></div>
    <div class="detail-row"><span class="detail-label">振幅</span><span class="detail-value">${capD.amplitude || '--'} (${capD.amplitudeSignal || ''})</span></div>
    <div class="detail-row"><span class="detail-label">涨跌停</span><span class="detail-value">${capD.limitStatus || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">5日净流入天数</span><span class="detail-value">${capD.netInflowDays || '--'}</span></div>
    <div class="detail-row"><span class="detail-label">成交额</span><span class="detail-value">${capD.amount || '--'}</span></div>
  `;

  // 显示所有卡片
  document.getElementById('stockInfoCard').classList.add('active');
}

// ==================== 历史记录 ====================
function savePrediction(stock, quote, analysis) {
  const entry = {
    name: stock.name || quote.name,
    code: stock.code || quote.code,
    market: stock.market,
    price: quote.price,
    changePercent: quote.changePercent,
    direction: analysis.direction,
    confidence: analysis.confidence,
    predictedChange: analysis.predictedChange,
    techScore: analysis.details.techScore,
    fundScore: analysis.details.fundScore,
    capitalScore: analysis.details.capitalScore,
    sentimentScore: analysis.details.sentimentScore,
    timestamp: Date.now()
  };

  predictionHistory.unshift(entry);
  if (predictionHistory.length > 50) predictionHistory.pop();
  localStorage.setItem('stockPredictions', JSON.stringify(predictionHistory));
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (predictionHistory.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">暂无预测记录</div>';
    return;
  }

  list.innerHTML = predictionHistory.map(h => {
    const dirText = h.direction === 'up' ? '📈看涨' : h.direction === 'down' ? '📉看跌' : '➡️震荡';
    const dirClass = h.direction === 'up' ? 'up' : h.direction === 'down' ? 'down' : '';
    const time = new Date(h.timestamp);
    const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
    return `
      <div class="history-item" onclick="loadHistory('${h.code}', '${h.market}')">
        <div class="history-info">
          <div class="h-name">${h.name}</div>
          <div class="h-code">${h.code} · ${h.price?.toFixed(2) || '--'}</div>
        </div>
        <div class="history-pred">
          <div class="h-dir ${dirClass}">${dirText} ${h.confidence?.toFixed(0) || '--'}%</div>
          <div class="h-time">${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

function clearHistory() {
  if (confirm('确定清空所有历史记录？')) {
    predictionHistory = [];
    localStorage.removeItem('stockPredictions');
    renderHistory();
  }
}

// ==================== 页面导航 ====================
function showLoading(show) {
  document.getElementById('loading').classList.toggle('active', show);
}

function hideAllTabs() {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.stock-info-card, .prediction-card, .detail-section').forEach(el => el.classList.remove('active'));
}

function switchTab(tab) {
  hideAllTabs();

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  if (tab === 'welcome') {
    document.getElementById('welcomeScreen').classList.add('active');
    document.getElementById('navWelcome').classList.add('active');
  } else if (tab === 'result') {
    document.getElementById('resultTab').classList.add('active');
    document.getElementById('navResult').classList.add('active');
  } else if (tab === 'history') {
    renderHistory();
    let historyTab = document.getElementById('historyTab');
    if (!historyTab) {
      historyTab = document.createElement('div');
      historyTab.id = 'historyTab';
      historyTab.className = 'tab-content active';
      historyTab.innerHTML = '<div class="section-title" style="margin-bottom:16px"><span class="icon">🕐</span>预测历史</div><div id="historyList"></div><div style="text-align:center"><button class="clear-btn" onclick="clearHistory()">清空历史记录</button></div>';
      document.querySelector('.container').appendChild(historyTab);
    } else {
      historyTab.classList.add('active');
    }
    document.getElementById('navHistory').classList.add('active');
  }
}

// 从历史记录加载
function loadHistory(code, market) {
  if (code && market) {
    document.getElementById('searchInput').value = code;
    const stockData = { code, market, secid: `${market}.${code}` };
    searchStock.call(null, stockData);
  }
}

// ==================== 网络请求辅助 ====================
async function fetchWithFallback(url) {
  // 先尝试直接请求
  try {
    const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (resp.ok) return resp;
  } catch (e) { /* CORS blocked, try proxy */ }

  // 使用CORS代理重试
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy + encodeURIComponent(url);
      const resp = await fetch(proxyUrl);
      if (resp.ok) return resp;
    } catch (e) { /* try next proxy */ }
  }

  throw new Error('Network request failed: ' + url);
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  // 回车搜索
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchStock();
  });

  // 检查是否已安装PWA
  if ('serviceWorker' in navigator) {
    // PWA Service Worker可以在后续添加
  }
});
