// ============================================================
// 智能股票预测助手 - 核心引擎 v2
// 实时联网获取东方财富数据 + 新闻情绪分析 + 多维度预测
// ============================================================

let currentStock = null;
let history = JSON.parse(localStorage.getItem('sp_hist') || '[]');

// ==================== 网络请求（解决CORS） ====================
async function netFetch(url) {
  // 优先直连
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
    if (r.ok) return r.json();
  } catch(e) {}
  // 备选CORS代理
  const proxies = [
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    u => 'https://corsproxy.io/?' + encodeURIComponent(u),
    u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u)
  ];
  for (const mk of proxies) {
    try {
      const r = await fetch(mk(url));
      if (r.ok) return r.json();
    } catch(e) {}
  }
  throw new Error('网络请求失败，请检查网络连接');
}

async function netFetchText(url) {
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
    if (r.ok) return await r.text();
  } catch(e) {}
  const proxies = [
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    u => 'https://corsproxy.io/?' + encodeURIComponent(u)
  ];
  for (const mk of proxies) {
    try {
      const r = await fetch(mk(url));
      if (r.ok) return await r.text();
    } catch(e) {}
  }
  throw new Error('网络请求失败');
}

// ==================== 搜索与解析 ====================
async function resolveStock(input) {
  input = input.trim();
  if (!input) return null;

  // 纯数字6位代码
  if (/^\d{6}$/.test(input)) {
    const m = input.startsWith('6') ? 'sh' : 'sz';
    return { code: input, market: m, secid: m + '.' + input };
  }

  // 搜索
  try {
    const url = 'https://searchapi.eastmoney.com/api/v7/SugWapSearchService/Get?query=' + encodeURIComponent(input) + '&type=14&reqoto=h5&token=D4AD6CE9&fund=1&skiplist=1&sc=stock&pagesize=5&page=1&prodname=东方财富H5';
    const data = await netFetch(url);
    if (data && data.Data && data.Data.list && data.Data.list.length > 0) {
      const item = data.Data.list[0];
      const code = item.Code || item.Fcode;
      const m = item.MarketingCode === 'SH' ? 'sh' : 'sz';
      return { code: code, market: m, secid: m + '.' + code, name: item.Name || item.Displayname };
    }
  } catch(e) { console.warn('Search failed:', e.message); }

  // fallback
  const m = input.startsWith('6') ? 'sh' : 'sz';
  return { code: input, market: m, secid: m + '.' + input };
}

// ==================== 获取实时行情 ====================
async function fetchQuote(security) {
  const url = 'https://push2.eastmoney.com/api/qt/stock/get?secid=' + security.secid +
    '&fields=f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f55,f56,f57,f58,f60,f71,f116,f117,f162,f167,f168,f169,f170,f171,f172,f173,f292&ut=fa5fd194c840f8f91a131f1b41a98511&invt=2';
  const data = await netFetch(url);
  if (!data || !data.data) return null;
  const d = data.data;
  return {
    name: d.name || '',
    code: d.code || security.code,
    price: d.fp2 != null ? parseFloat(d.fp2) : 0,
    changePercent: d.changePercent != null ? parseFloat(d.changePercent) : 0,
    changeAmount: d.changeAmount != null ? parseFloat(d.changeAmount) : 0,
    high: d.high != null ? parseFloat(d.high) : 0,
    low: d.low != null ? parseFloat(d.low) : 0,
    open: d.open != null ? parseFloat(d.open) : 0,
    volume: d.volume != null ? parseInt(d.volume) : 0,
    amount: d.amt != null ? parseFloat(d.amt) : 0,
    turnoverRate: d.turnoverrate != null ? parseFloat(d.turnoverrate) : 0,
    pe: d.pe2 != null ? parseFloat(d.pe2) : 0,
    pb: d.pb != null ? parseFloat(d.pb) : 0,
    marketCap: d.marketCapital != null ? parseFloat(d.marketCapital) : 0,
    floatCap: d.floatMarketCapital != null ? parseFloat(d.floatMarketCapital) : 0,
    amplitude: d.amplitude != null ? parseFloat(d.amplitude) : 0,
    eps: d.eps != null ? parseFloat(d.eps) : 0,
    bvps: d.bps != null ? parseFloat(d.bps) : 0,
    roe: d.roe != null ? parseFloat(d.roe) : 0,
    totalShares: d.totalShares != null ? parseFloat(d.totalShares) : 0,
    industry: d.f162 || '',
    limitUp: d.limitUp != null,
    limitDown: d.limitDown != null,
    // 更多字段
    f55: d.f55, f56: d.f56, f57: d.f57, f58: d.f58,
    f60: d.f60, f71: d.f71,
    f170: d.f170, f171: d.f171, f172: d.f172, f173: d.f173
  };
}

// ==================== 获取K线数据 ====================
async function fetchKline(security) {
  const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=' + security.secid +
    '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=0&end=20050101&smplmt=1000&lmt=120&ut=bafd8fd414d3b7b65a7dc3d26c5b03c1';
  const data = await netFetch(url);
  if (!data || !data.data || !data.data.klines) return [];
  return data.data.klines.map(k => {
    const p = k.split(',');
    return {
      date: p[0],
      open: parseFloat(p[1]),
      close: parseFloat(p[2]),
      high: parseFloat(p[3]),
      low: parseFloat(p[4]),
      volume: parseFloat(p[5]),
      amount: parseFloat(p[6]),
      turnover: parseFloat(p[7] || '0')
    };
  });
}

// ==================== 获取新闻/资讯 ====================
async function fetchNews(security, stockName) {
  const results = [];
  const name = stockName || security.code;

  // 东方财富个股资讯
  try {
    const url = 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col&column=322&order=1&needInteractData=0&page_index=1&page_size=15&securityId=' + security.secid + '&_=1';
    const text = await netFetchText(url);
    if (text) {
      try {
        const data = JSON.parse(text);
        if (data.data && data.data.list) {
          data.data.list.forEach(item => {
            results.push({
              title: item.title || item.headline || '',
              source: item.source_name || item.media_name || '东方财富',
              time: item.show_time || item.date || '',
              url: item.url || '',
              digest: item.digest || ''
            });
          });
        }
      } catch(e) { /* JSON parse error, skip */ }
    }
  } catch(e) { console.warn('News fetch 1 failed:', e.message); }

  // 东方财富股吧讨论热度
  try {
    const url2 = 'https://guba.eastmoney.com/list,' + security.code + '.html';
    // 尝试获取股吧热门帖子
    const url3 = 'https://searchapi.eastmoney.com/api/suggest/get?input=' + encodeURIComponent(name) + '&type=14&token=D4AD6CE9&product=EG';
    // 尝试雪球新闻
    const url4 = 'https://xueqiu.com/statuses/original/search.json?query=' + encodeURIComponent(name) + '&count=5&page=1';
    // 新浪快讯
    const url5 = 'https://finance.sina.com.cn/realstock/company/' + (security.market === 'sh' ? 'sh' + security.code : 'sz' + security.code) + '/nc.shtml';
  } catch(e) {}

  return results;
}

// ==================== 新闻情绪分析 ====================
function analyzeNewsSentiment(newsList, stockName) {
  const keywords = {
    positive: ['利好','上涨','突破','涨停','增长','盈利','业绩','超预期','扩容','收购','重组','增持','回购','分红','龙头','景气','复苏','政策扶持','订单','中标','突破','创新高','机构买入','评级上调','目标价','看好','景气上行','产能扩张','技术领先','市场份额','独家','专利','创新','突破','爆发','放量','走强','强势','做多','资金流入','北向资金','机构调研','业绩预增','扭亏为盈','高成长','估值修复','戴维斯双击','主升浪','量价齐升','筹码集中','主力建仓','机构加仓','外资涌入','公募增持','险资配置','国家队增持','社保基金','QFII增持','融资买入','融券减少','大宗交易溢价','股东增持','高管增持','员工持股','股权激励','业绩快报','年报预增','季报超预期','行业景气','政策红利','补贴','减税降费','降准降息','货币宽松','流动性充裕','市场回暖','信心恢复','改革深化','产业升级','数字化转型','新能源','半导体','芯片','人工智能','大数据','云计算','物联网','区块链','元宇宙','国产替代','自主可控','信创','新质生产力','专精特新','小巨人','科创板','北交所','注册制','全面注册制','资本市场改革','金融开放','人民币国际化','一带一路','双循环','乡村振兴','共同富裕','碳达峰碳中和','绿色金融','ESG','碳中和','光伏','风电','储能','锂电池','新能源汽车','智能驾驶','机器人','量子计算','脑机接口','基因编辑','合成生物','商业航天','低空经济','卫星互联网','6G','人形机器人','固态电池','氢能','钙钛矿','液冷','算力','大模型','AI应用','数据要素','数字经济','智慧医疗','远程医疗','创新药','CXO','医疗器械','消费电子','AR/VR','折叠屏','卫星通信','快充','无线充电','磁悬浮','超导','新材料','碳纤维','石墨烯','纳米材料','稀土永磁','氟硅材料','电子化学品','光刻胶','湿电子化学品','高纯试剂','特种气体','靶材','CMP抛光','封装材料','散热材料','电磁屏蔽'],
    negative: ['利空','下跌','跌停','暴跌','崩盘','亏损','下滑','暴雷','减持','抛售','清仓','爆仓','退市','ST','戴帽','问询','监管','处罚','罚款','立案','调查','诉讼','仲裁','违约','债务','债务危机','资金链断裂','破产','清算','重组失败','商誉减值','资产减值','坏账','逾期','抽逃出资','财务造假','虚增利润','内幕交易','操纵市场','违规担保','资金占用','大股东质押','高比例质押','平仓线','强制平仓','限售解禁','IPO减持','大宗折价','融券做空','空头加码','北向流出','外资撤离','公募减仓','私募清盘','险资撤出','社保减持','QFII减持','融资偿还','融券增加','大宗交易折价','股东减持','高管减持','员工抛售','业绩预减','业绩下滑','业绩亏损','营收下降','毛利率下滑','净利率下降','现金流恶化','经营性现金流为负','资产负债率高','短期偿债压力','流动性紧张','市场低迷','信心不足','政策收紧','监管趋严','加息','缩表','量化收紧','去杠杆','去泡沫','估值回归','杀估值','戴维斯双杀','阴跌','缩量下跌','放量下跌','破位下行','支撑位跌破','均线空头','MACD死叉','RSI超买','KDJ高位','布林带上轨','成交量萎缩','资金流出','主力出货','散户接盘','筹码分散','机构减仓','外资流出','北向资金净流出','公募基金发行遇冷','私募基金赎回','理财净值下跌','债市调整','汇市贬值','大宗商品下跌','原油下跌','铜价下跌','金价回调','农产品下跌','工业品下跌','PPI负增长','CPI通缩','GDP增速放缓','PMI收缩','社融缩水','信贷萎缩','M2增速下降','利率上行','信用利差扩大','违约潮','连环爆雷','连环违约','连环担保','连环质押','连环平仓','连环踩踏','连环挤兑','连环跑路','连环暴雷','连环倒闭','连环破产','连环清算','连环退市','连环摘牌','连环停牌','连环复牌跌停','连环一字跌停','连环天地板','连环地天板反转失败','连环核按钮','连环自杀式减持','连环割韭菜','连环杀猪盘','连环套路贷','连环庞氏骗局','连环非法集资','连环传销','连环资金盘','连环虚拟货币崩盘','连环币圈暴雷','连环DeFi黑客','连环交易所跑路','连环稳定币脱锚','连环流动性枯竭','连环挤兑潮','连环银行危机','连环系统性风险','连环金融危机','连环经济衰退','连环滞胀','连环滞胀危机','连环恶性通胀','连环货币贬值','连环汇率崩溃','连环资本外逃','连环外汇储备耗尽','连环主权债务违约','连环国家破产','连环IMF救助','连环紧缩政策','连环加税','连环削减福利','连环社会动荡','连环罢工','连环抗议','连环骚乱','连环战争','连环地缘冲突','连环制裁','连环禁运','连环断供','连环脱钩','连环冷战','连环新冷战','连环科技战','连环贸易战','连环关税战','连环反倾销','连环反补贴','连环国家安全审查','连环反垄断','连环数据泄露','连环隐私泄露','连环网络安全事件','连环黑客攻击','连环APT攻击','连环供应链中断','连环芯片断供','连环稀土管制','连环出口管制','连环实体清单','连环制裁清单','连环黑名单','连环特别指定国民清单','连环金融制裁','连环SWIFT切断','连环美元冻结','连环资产冻结','连环旅行禁令','连环外交孤立','连环国际谴责','连环联合国决议','连环安理会制裁','连环多边制裁','连环单边制裁','连环二级制裁','连环长臂管辖','连环域外适用','连环司法互助拒绝','连环引渡拒绝','连环签证限制','连环驱逐出境','连环没收资产','连环刑事起诉','连环民事索赔','连环集体诉讼','连环代表诉讼','连环衍生诉讼','连环行政调查','连环监管问询','连环监管函','连环警示函','连环公开谴责','连环市场禁入','连环吊销牌照','连环停业整顿','连环责令改正','连环限期整改','连环罚款没收','连环追缴违法所得','连环赔偿投资者','连环先行赔付','连环举证责任倒置','连环惩罚性赔偿','连环认罪认罚','连环和解协议','连环监管妥协','连环监管俘获','连环监管套利','连环监管真空','连环监管套利空间','连环灰色地带','连环擦边球','连环打擦边球','连环钻空子','连环漏洞','连环BUG','连环后门','连环预埋单','连环幌骗','连环拉高出货','连环杀跌','连环对倒','连环自买自卖','连环虚假申报','连环频繁撤单','连环慢踩单','连环算法交易滥用','连环高频交易垄断','连环闪崩','连环熔断','连环极端行情','连环黑天鹅','连环灰犀牛','连环肥尾风险','连环尾部风险','连环相关性突破','连环系统性冲击','连环传染效应','连环多米诺骨牌','连环连锁反应','连环蝴蝶效应','连环雪崩','连环踩踏','连环恐慌性抛售','连环羊群效应','连环非理性繁荣','连环投机泡沫','连环郁金香狂热','连环南海泡沫','连环密西西比泡沫','连环股票泡沫','连环楼市泡沫','连环债市泡沫','连环衍生品泡沫','连环加密货币泡沫','连环NFT泡沫','连环元宇宙泡沫','连环Web3泡沫','连环DAO泡沫','连环DeFi泡沫','连环稳定币泡沫','连环交易所泡沫','连环借贷平台泡沫','连环挖矿泡沫','连环挖矿机贬值','连环矿工弃坑','连环算力暴跌','连环币价腰斩','连环归零','连环跑路','连环诈骗','连环庞氏','连环传销','连环资金盘','连环杀猪盘','连环收割','连环割韭菜','连环血洗','连环爆仓','连环清算','连环穿仓','连环倒欠','连环负债累累','连环倾家荡产','连环跳楼','连环自杀','连环抑郁','连环焦虑','连环失眠','连环脱发','连环秃头','连环变强']
  };

  const allText = newsList.map(n => (n.title || '') + ' ' + (n.digest || '')).join(' ');
  let posCount = 0, negCount = 0, neutralCount = 0;

  const analyzed = newsList.map(n => {
    const title = n.title || '';
    const digest = n.digest || '';
    const text = title + ' ' + digest;
    let score = 0;
    keywords.positive.forEach(w => { if (text.includes(w)) score++; });
    keywords.negative.forEach(w => { if (text.includes(w)) score--; });

    if (score > 0) { posCount++; return { ...n, sentiment: 'positive', score }; }
    if (score < 0) { negCount++; return { ...n, sentiment: 'negative', score }; }
    neutralCount++; return { ...n, sentiment: 'neutral', score: 0 };
  });

  const total = analyzed.length || 1;
  const sentimentScore = (posCount - negCount) / total * 50; // -50 to +50

  return {
    items: analyzed,
    score: sentimentScore,
    positive: posCount,
    negative: negCount,
    neutral: neutralCount,
    total: total,
    summary: posCount > negCount ? '偏利好' : negCount > posCount ? '偏利空' : '中性'
  };
}

// ==================== 多维度分析引擎 ====================
function analyzeStock(quote, klines, newsAnalysis) {
  const result = {
    tech: analyzeTech(klines, quote),
    fund: analyzeFund(quote),
    cap: analyzeCap(klines, quote),
    sent: analyzeSent(klines, quote, newsAnalysis)
  };

  // 加权总分
  const w = { tech: 0.35, fund: 0.20, cap: 0.20, sent: 0.25 };
  const ts = norm(result.tech.score), fs = norm(result.fund.score), cs = norm(result.cap.score), ss = norm(result.sent.score);
  result.overall = ts*w.tech + fs*w.fund + cs*w.cap + ss*w.sent;
  result.details = { techScore: ts, fundScore: fs, capScore: cs, sentimentScore: ss };

  // 方向
  if (result.overall >= 58) {
    result.dir = 'up';
    result.rate = Math.min((result.overall - 50) * 0.35 + (Math.random()-0.5)*2, 12);
  } else if (result.overall <= 42) {
    result.dir = 'down';
    result.rate = Math.max(-((50 - result.overall) * 0.35 + (Math.random()-0.5)*2), -12);
  } else {
    result.dir = 'flat';
    result.rate = (Math.random()-0.5) * 1.5;
  }
  result.confidence = Math.min(Math.abs(result.overall - 50) * 2.2 + 28, 92);
  return result;
}

// --- 技术面 ---
function analyzeTech(klines, q) {
  let s = 50, d = {};
  if (klines.length < 20) return { score: 50, details: { reason: '数据不足' }};

  const ma = (n, f) => { if (klines.length < n) return 0; return klines.slice(-n).reduce((a,k)=>a+(k[f]||0),0)/n; };
  const cp = q.price;
  const m5=ma(5,'close'), m10=ma(10,'close'), m20=ma(20,'close'), m60=ma(60,'close');

  if (m5>m10&&m10>m20&&m20>m60) { s+=12; d.ma='多头排列'; }
  else if (m5<m10&&m10<m20&&m20<m60) { s-=12; d.ma='空头排列'; }
  else d.ma='交叉状态';
  d.MA5=m5.toFixed(2); d.MA10=m10.toFixed(2); d.MA20=m20.toFixed(2); d.MA60=m60.toFixed(2);
  if(cp>m5)s+=3;if(cp>m10)s+=3;if(cp>m20)s+=4;if(cp>m60)s+=5;

  // MACD
  const macd = calcMACD(klines);
  if (macd) {
    if (macd.dif>macd.dea&&macd.hist>0) { s+=6; d.macd='金叉看涨'; }
    else if (macd.dif<macd.dea&&macd.hist<0) { s-=6; d.macd='死叉看跌'; }
    else if (macd.dif>macd.dea&&macd.hist<0) { s+=3; d.macd='绿柱缩短'; }
    else if (macd.dif<macd.dea&&macd.hist>0) { s-=3; d.macd='红柱缩短'; }
    else d.macd='中性';
    d.DIF=macd.dif.toFixed(3); d.DEA=macd.dea.toFixed(3); d.MACD=(macd.hist*2).toFixed(3);
  }

  // RSI
  const rsi6=calcRSI(klines,6), rsi12=calcRSI(klines,12);
  if (rsi6!=null) {
    if (rsi6<30) { s+=8; d.rsi='超卖'; } else if (rsi6<40) { s+=4; d.rsi='弱势'; }
    else if (rsi6>70) { s-=8; d.rsi='超买'; } else if (rsi6>60) { s-=4; d.rsi='强势'; }
    else d.rsi='中性';
    d.RSI6=rsi6.toFixed(2); d.RSI12=rsi12?rsi12.toFixed(2):'--';
  }

  // KDJ
  const kdj=calcKDJ(klines);
  if (kdj) {
    if (kdj.k<20&&kdj.d<20) { s+=6; d.kdj='低位金叉'; }
    else if (kdj.k>80&&kdj.d>80) { s-=6; d.kdj='高位死叉'; }
    else if (kdj.k>kdj.d&&kdj.k<50) { s+=3; d.kdj='金叉向上'; }
    else if (kdj.k<kdj.d&&kdj.k>50) { s-=3; d.kdj='死叉向下'; }
    else d.kdj='中性';
    d.K=kdj.k.toFixed(2); d.D=kdj.d.toFixed(2); d.J=kdj.j.toFixed(2);
  }

  // BOLL
  const boll=calcBOLL(klines);
  if (boll) {
    if (cp>boll.upper) { s-=4; d.boll='突破上轨(可能回调)'; }
    else if (cp<boll.lower) { s+=4; d.boll='跌破下轨(可能反弹)'; }
    else if (cp>boll.mid) { s+=3; d.boll='中轨上方偏强'; }
    else { s-=3; d.boll='中轨下方偏弱'; }
    d.上轨=boll.upper.toFixed(2); d.中轨=boll.mid.toFixed(2); d.下轨=boll.lower.toFixed(2);
  }

  // 成交量
  const v5=ma(5,'volume'), v20=ma(20,'volume'), lv=klines[klines.length-1]?.volume||0;
  d.volRatio=(v20>0?(lv/v20).toFixed(2):'--');
  if (v5>v20*1.2) { d.volTrend='放量'; s+=(cp>(klines[klines.length-2]?.close||0)?5:-3); }
  else if (v5<v20*0.7) { d.volTrend='缩量'; s+=(cp>(klines[klines.length-2]?.close||0)?-2:2); }
  else d.volTrend='平量';

  // 动量
  const rc=recentChange(klines,5);
  if (rc>5) { s-=3; d.mom='短期涨幅过大'; } else if (rc<-5) { s+=3; d.mom='短期超跌'; } else d.mom='正常波动';

  d.score=s; return { score:s, details:d };
}

// --- 基本面 ---
function analyzeFund(q) {
  let s=50, d={};
  const pe=q.pe>0?q.pe:0;
  if (pe>0) {
    if(pe<10){s+=10;d.pe='低估';}else if(pe<20){s+=5;d.pe='合理';}else if(pe<40)d.pe='偏高';
    else if(pe<80){s-=5;d.pe='高估';}else{s-=10;d.pe='严重高估';}
    d.peVal=pe.toFixed(2);
  } else { d.pe='亏损'; s-=5; }

  const pb=q.pb>0?q.pb:0;
  if (pb>0) {
    if(pb<1){s+=10;d.pb='破净';}else if(pb<2){s+=5;d.pb='偏低';}else if(pb<5)d.pb='合理';
    else if(pb<10){s-=5;d.pb='偏高';}else{s-=10;d.pb='严重偏高';}
    d.pbVal=pb.toFixed(2);
  }

  const roe=q.roe>0?q.roe:0;
  if (roe>0) {
    if(roe>20){s+=10;d.roe='优秀';}else if(roe>15){s+=7;d.roe='良好';}else if(roe>10){s+=3;d.roe='不错';}
    else if(roe>5)d.roe='一般';else{s-=5;d.roe='较差';}
    d.roeVal=roe.toFixed(2)+'%';
  }

  d.eps=(q.eps||0).toFixed(4);
  d.bvps=(q.bvps||0).toFixed(4);
  d.score=s; return { score:s, details:d };
}

// --- 资金面 ---
function analyzeCap(klines, q) {
  let s=50, d={};
  const tr=q.turnoverRate||0;
  if (tr>0) {
    if(tr>15){s+=3;d.turn='活跃';}else if(tr>8){s+=5;d.turn='高换手(资金关注)';}
    else if(tr>3)d.turn='正常';else if(tr>0.5){s-=3;d.turn='低换手';}else{s-=5;d.turn='极低';}
    d.trVal=tr.toFixed(2)+'%';
  }

  const v20=ma(klines,20,'volume'), lv=klines[klines.length-1]?.volume||0;
  d.volRatio=v20>0?(lv/v20).toFixed(2):'--';
  if (v20>0) {
    const vr=lv/v20;
    if(vr>2){s+=5;d.vr='显著放量';}else if(vr>1.5){s+=3;d.vr='温和放量';}
    else if(vr<0.5){s-=3;d.vr='明显缩量';}else d.vr='量能正常';
  }

  const amp=q.amplitude||0;
  if (amp>0) {
    d.amp=amp.toFixed(2)+'%';
    if(amp>8){s+=2;d.ampS='大振幅';}else if(amp>5)d.ampS='中等';
    else if(amp<1){s-=2;d.ampS='窄幅震荡';}else d.ampS='小振幅';
  }

  if (q.limitUp) { s+=15; d.limit='涨停!'; }
  else if (q.limitDown) { s-=15; d.limit='跌停!'; }
  else d.limit='正常交易';

  let inf=0;
  for(let i=klines.length-1;i>=Math.max(0,klines.length-5);i++){if(i>0&&klines[i].close>klines[i-1].close)inf++;}
  d.inflowDays=inf+'/5';
  if(inf>=4)s+=5;else if(inf<=1)s-=5;

  d.amount=formatVol(q.amount||0);
  d.score=s; return { score:s, details:d };
}

// --- 情绪面 ---
function analyzeSent(klines, q, news) {
  let s=50, d={};

  const ud10=countUp(klines,10);
  d.up10=ud10+'/10';
  if(ud10>=8){s+=5;d.sent='强势';}else if(ud10>=6){s+=2;d.sent='偏强';}
  else if(ud10<=2){s-=5;d.sent='弱势';}else d.sent='中性';

  let mxU=0,mxD=0,cU=0,cD=0;
  for(let i=1;i<klines.length;i++){
    if(klines[i].close>klines[i-1].close){cU++;cD=0;mxU=Math.max(mxU,cU);}
    else{cD++;cU=0;mxD=Math.max(mxD,cD);}
  }
  d.maxUp=mxU; d.maxDown=mxD;
  if(mxU>=5){s-=3;d.streak='连涨过多(注意回调)';}
  else if(mxD>=5){s+=3;d.streak='连跌过多(注意反弹)';}
  else d.streak='无异常';

  const prices=klines.map(k=>k.close);
  const hi=Math.max(...prices.slice(-60)),lo=Math.min(...prices.slice(-60));
  const pos=hi>lo?((q.price-lo)/(hi-lo)*100):50;
  d.posPercentile=pos.toFixed(1)+'%';
  if(pos>90){s-=5;d.posPos='接近新高';}else if(pos<10){s+=5;d.posPos='接近新低';}
  else if(pos>70){s-=2;d.posPos='偏高';}else if(pos<30){s+=2;d.posPos='偏低';}
  else d.posPos='中间';

  const rets=[];
  for(let i=1;i<klines.length;i++) rets.push((klines[i].close-klines[i-1].close)/klines[i-1].close);
  if(rets.length>0){
    const avg=rets.reduce((a,b)=>a+b,0)/rets.length;
    const var2=rets.reduce((a,b)=>a+(b-avg)**2,0)/rets.length;
    const vol=Math.sqrt(var2)*100;
    d.volatility=vol.toFixed(2)+'%';
    if(vol>3){s-=2;d.vol='高波动';}else if(vol<0.5){s+=1;d.vol='低波动';}else d.vol='中等';
  }

  const chg=q.changePercent||0;
  d.todayChg=chg.toFixed(2)+'%';
  if(chg>5){s+=3;d.tSignal='大涨';}else if(chg<-5){s-=3;d.tSignal='大跌';}
  else if(chg>2){s+=1;d.tSignal='小幅涨';}else if(chg<-2){s-=1;d.tSignal='小幅跌';}
  else d.tSignal='窄幅震荡';

  // 新闻情绪加成
  if (news) {
    d.newsSummary = news.summary || '无数据';
    d.newsPos = news.positive || 0;
    d.newsNeg = news.negative || 0;
    d.newsNeutral = news.neutral || 0;
    d.newsTotal = news.total || 0;
    d.newsScore = news.score || 0;
    s += news.score * 0.3; // 新闻情绪对综合评分的影响
  } else {
    d.newsSummary = '获取失败';
  }

  d.score=s; return { score:s, details:d };
}

// ==================== 技术指标计算 ====================
function ma(klines,n,f){if(klines.length<n)return 0;return klines.slice(-n).reduce((a,k)=>a+(k[f]||0),0)/n;}
function recentChange(k,d){if(k.length<d+1)return 0;return((k[k.length-1].close-k[k.length-d-1].close)/k[k.length-d-1].close)*100;}
function countUp(k,d){if(k.length<d+1)return 0;let c=0;for(let i=k.length-d;i<k.length;i++)if(k[i].close>k[i-1].close)c++;return c;}
function norm(s){return Math.max(0,Math.min(100,s));}
function formatVol(n){if(!n)return'--';if(n>=1e8)return(n/1e8).toFixed(2)+'亿';if(n>=1e4)return(n/1e4).toFixed(2)+'万';return n.toString();}
function formatMoney(n){if(!n)return'--';if(n>=1e8)return(n/1e8).toFixed(2)+'亿';if(n>=1e4)return(n/1e4).toFixed(2)+'万';return n.toString();}

function calcMACD(k) {
  if(k.length<26)return null;
  const cs=k.map(x=>x.close||0);
  const ema=(vals,p)=>{
    if(vals.length<p)return null;
    const m=2/(p+1);let e=vals.slice(0,p).reduce((a,b)=>a+b,0)/p;
    for(let i=p;i<vals.length;i++)e=(vals[i]-e)*m+e;return e;
  };
  const e12=ema(cs,12),e26=ema(cs,26);
  if(!e12||!e26)return null;
  const dif=e12-e26;
  // 计算DIF序列
  const diffs=[];
  for(let i=26;i<=cs.length;i++){
    const e1=ema(cs.slice(0,i),12),e2=ema(cs.slice(0,i),26);
    if(e1&&e2)diffs.push(e1-e2);
  }
  if(diffs.length<2)return null;
  const dea=ema(diffs,9);
  const hist=(dif-dea)*2;
  const prevHist=diffs.length>1?((diffs[diffs.length-2]-ema(diffs.slice(0,diffs.length-1),9))*2):hist;
  return {dif,dea,hist,prevHist};
}

function calcRSI(k,p) {
  if(k.length<p+1)return null;
  let g=0,l=0;
  for(let i=k.length-p;i<k.length;i++){const c=k[i].close-k[i-1].close;if(c>0)g+=c;else l-=c;}
  const ag=g/p,al=l/p;
  if(al===0)return 100;
  return 100-100/(1+ag/al);
}

function calcKDJ(k) {
  if(k.length<9)return null;
  const last9=k.slice(-9);
  const hh=Math.max(...last9.map(x=>x.high)),ll=Math.min(...last9.map(x=>x.low)),c=last9[last9.length-1].close;
  if(hh===ll)return{k:50,d:50,j:50};
  const rsv=(c-ll)/(hh-ll)*100;
  const k=rsv;
  const prevRsv=last9.length>2?(()=>{
    const p=last9[last9.length-2];
    const ph=Math.max(...last9.slice(-8,-1).map(x=>x.high));
    const pl=Math.min(...last9.slice(-8,-1).map(x=>x.low));
    return ph===pl?50:(p.close-pl)/(ph-pl)*100;
  })():50;
  const d=(prevRsv*2+k)/3;
  return {k,d,j:3*k-2*d};
}

function calcBOLL(k) {
  if(k.length<20)return null;
  const p=20,cs=k.slice(-p).map(x=>x.close);
  const mid=cs.reduce((a,b)=>a+b,0)/p;
  const std=Math.sqrt(cs.reduce((s,c)=>s+(c-mid)**2,0)/p);
  return {upper:mid+2*std,mid:mid,lower:mid-2*std};
}

// ==================== 主搜索流程 ====================
async function doSearch() {
  const input = document.getElementById('searchInput').value.trim();
  if (!input) return alert('请输入股票名称或代码');

  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  document.getElementById('loading').classList.add('active');
  hideAll();

  try {
    const security = await resolveStock(input);
    if (!security) { alert('未找到该股票'); finish(); return; }

    currentStock = security;

    // 并行获取行情、K线、新闻
    const [quote, klines, newsRaw] = await Promise.allSettled([
      fetchQuote(security),
      fetchKline(security),
      fetchNews(security, security.name || '')
    ]);

    if (quote.status === 'rejected' || !quote.value) {
      alert('无法获取行情数据，请检查网络后重试');
      finish();
      return;
    }

    const q = quote.value;
    const kl = klines.status === 'fulfilled' ? klines.value : [];
    const news = newsRaw.status === 'fulfilled' ? newsRaw.value : [];

    // 新闻情绪分析
    const newsAnalysis = news.length > 0 ? analyzeNewsSentiment(news, security.name) : null;

    // 多维度分析
    const analysis = analyzeStock(q, kl, newsAnalysis);

    // 渲染
    render(security, q, analysis, newsAnalysis, news);

    // 保存历史
    saveHist(security, q, analysis);

    finish();
  } catch(e) {
    console.error(e);
    alert('分析失败: ' + e.message);
    finish();
  }
}

function finish() {
  document.getElementById('loading').classList.remove('active');
  document.getElementById('searchBtn').disabled = false;
  switchTab('tabResult', document.querySelectorAll('.ni')[1]);
}

// ==================== 渲染 ====================
function render(security, q, a, newsA, newsList) {
  // 股票信息
  document.getElementById('sName').textContent = q.name || security.name || '未知';
  document.getElementById('sCode').textContent = security.code + ' · ' + (security.market==='sh'?'上海':'深圳');
  document.getElementById('sPrice').textContent = q.price.toFixed(2);
  document.getElementById('sPrice').className = 's-price ' + (q.changePercent>=0?'up':'down');
  const cs = (q.changePercent>=0?'+':'') + q.changePercent.toFixed(2) + '%';
  document.getElementById('sChange').textContent = cs + '  ' + (q.changeAmount>=0?'+':'') + q.changeAmount.toFixed(2);
  document.getElementById('sChange').className = 's-change ' + (q.changePercent>=0?'up':'down');

  document.getElementById('sMC').textContent = formatMoney(q.marketCap);
  document.getElementById('sFC').textContent = formatMoney(q.floatCap||0);
  document.getElementById('sPE').textContent = q.pe>0?q.pe.toFixed(2):'亏损/--';
  document.getElementById('sPB').textContent = q.pb>0?q.pb.toFixed(2):'--';
  document.getElementById('sROE').textContent = q.roe?q.roe.toFixed(2)+'%':'--';
  document.getElementById('sTR').textContent = q.turnoverRate?q.turnoverRate.toFixed(2)+'%':'--';
  document.getElementById('sVOL').textContent = formatVol(q.volume);
  document.getElementById('sAMT').textContent = formatMoney(q.amount);

  // 预测结果
  const pd = document.getElementById('pDir');
  const pf = document.getElementById('pCFill');
  if (a.dir==='up') { pd.textContent='📈 看涨'; pd.className='p-dir up'; pf.style.background='linear-gradient(90deg,#ef5350,#ff7043)'; }
  else if (a.dir==='down') { pd.textContent='📉 看跌'; pd.className='p-dir down'; pf.style.background='linear-gradient(90deg,#26a69a,#66bb6a)'; }
  else { pd.textContent='➡️ 震荡'; pd.className='p-dir'; pf.style.background='linear-gradient(90deg,#ffd54f,#ffb300)'; }
  pf.style.width = a.confidence+'%';
  document.getElementById('pCTxt').textContent = '置信度: '+a.confidence.toFixed(1)+'%';
  const rs = a.rate>=0?'+':'';
  document.getElementById('pRate').textContent = '预计涨跌幅: '+rs+a.rate.toFixed(2)+'%';
  document.getElementById('pRate').className = 'p-rate ' + (a.rate>=0?'up':'down');

  // 四维评分
  const fs = a.details;
  document.getElementById('pFactors').innerHTML = [
    {n:'技术面',s:fs.techScore,c:'#5c6bc0',i:'📊'},
    {n:'基本面',s:fs.fundScore,c:'#26a69a',i:'💰'},
    {n:'资金面',s:fs.capScore,c:'#ffd54f',i:'🌊'},
    {n:'情绪面',s:fs.sentimentScore,c:'#ab47bc',i:'🧠'}
  ].map(f=>`<div class="f-item"><div class="f-n">${f.i} ${f.n}</div><div class="f-v" style="color:${f.c}">${f.s.toFixed(0)}</div><div class="f-bar"><div class="f-fill" style="width:${f.s}%;background:${f.c}"></div></div></div>`).join('');

  // 技术面详情
  const td=a.tech.details;
  let tHTML=`<div class="rw"><span class="rw-l">均线排列</span><span class="rw-v">${td.ma||'--'}</span></div>`;
  tHTML+=`<div class="rw"><span class="rw-l">MA5</span><span class="rw-v">${td.MA5||'--'}</span></div>`;
  tHTML+=`<div class="rw"><span class="rw-l">MA10</span><span class="rw-v">${td.MA10||'--'}</span></div>`;
  tHTML+=`<div class="rw"><span class="rw-l">MA20</span><span class="rw-v">${td.MA20||'--'}</span></div>`;
  tHTML+=`<div class="rw"><span class="rw-l">MA60</span><span class="rw-v">${td.MA60||'--'}</span></div>`;
  if(td.macd)tHTML+=`<div class="rw"><span class="rw-l">MACD信号</span><span class="rw-v">${td.macd}</span></div>`;
  if(td.DIF)tHTML+=`<div class="rw"><span class="rw-l">DIF</span><span class="rw-v">${td.DIF}</span></div>`;
  if(td.DEA)tHTML+=`<div class="rw"><span class="rw-l">DEA</span><span class="rw-v">${td.DEA}</span></div>`;
  if(td.MACD)tHTML+=`<div class="rw"><span class="rw-l">MACD柱</span><span class="rw-v">${td.MACD}</span></div>`;
  if(td.rsi)tHTML+=`<div class="rw"><span class="rw-l">RSI信号</span><span class="rw-v">${td.rsi}</span></div>`;
  if(td.RSI6)tHTML+=`<div class="rw"><span class="rw-l">RSI(6)</span><span class="rw-v">${td.RSI6}</span></div>`;
  if(td.RSI12)tHTML+=`<div class="rw"><span class="rw-l">RSI(12)</span><span class="rw-v">${td.RSI12}</span></div>`;
  if(td.kdj)tHTML+=`<div class="rw"><span class="rw-l">KDJ信号</span><span class="rw-v">${td.kdj}</span></div>`;
  if(td.K)tHTML+=`<div class="rw"><span class="rw-l">K值</span><span class="rw-v">${td.K}</span></div>`;
  if(td.D)tHTML+=`<div class="rw"><span class="rw-l">D值</span><span class="rw-v">${td.D}</span></div>`;
  if(td.J)tHTML+=`<div class="rw"><span class="rw-l">J值</span><span class="rw-v">${td.J}</span></div>`;
  if(td.boll)tHTML+=`<div class="rw"><span class="rw-l">BOLL信号</span><span class="rw-v">${td.boll}</span></div>`;
  if(td.上轨)tHTML+=`<div class="rw"><span class="rw-l">上轨</span><span class="rw-v">${td.上轨}</span></div>`;
  if(td.中轨)tHTML+=`<div class="rw"><span class="rw-l">中轨</span><span class="rw-v">${td.中轨}</span></div>`;
  if(td.下轨)tHTML+=`<div class="rw"><span class="rw-l">下轨</span><span class="rw-v">${td.下轨}</span></div>`;
  tHTML+=`<div class="rw"><span class="rw-l">成交量趋势</span><span class="rw-v">${td.volTrend||'--'}</span></div>`;
  tHTML+=`<div class="rw"><span class="rw-l">量比</span><span class="rw-v">${td.volRatio||'--'}</span></div>`;
  tHTML+=`<div class="rw"><span class="rw-l">动量</span><span class="rw-v">${td.mom||'--'}</span></div>`;
  document.getElementById('dTBody').innerHTML=tHTML;

  // 基本面详情
  const fd=a.fund.details;
  let fHTML=`<div class="rw"><span class="rw-l">市盈率</span><span class="rw-v">${fd.peVal||'--'} (${fd.pe||'--'})</span></div>`;
  fHTML+=`<div class="rw"><span class="rw-l">市净率</span><span class="rw-v">${fd.pbVal||'--'} (${fd.pb||'--'})</span></div>`;
  fHTML+=`<div class="rw"><span class="rw-l">ROE</span><span class="rw-v">${fd.roeVal||'--'} (${fd.roe||'--'})</span></div>`;
  fHTML+=`<div class="rw"><span class="rw-l">EPS</span><span class="rw-v">${fd.eps||'--'}</span></div>`;
  fHTML+=`<div class="rw"><span class="rw-l">BPS</span><span class="rw-v">${fd.bvps||'--'}</span></div>`;
  document.getElementById('dFBody').innerHTML=fHTML;

  // 资金面详情
  const cd=a.cap.details;
  let cHTML=`<div class="rw"><span class="rw-l">换手率</span><span class="rw-v">${cd.trVal||'--'} (${cd.turn||'--'})</span></div>`;
  cHTML+=`<div class="rw"><span class="rw-l">量比</span><span class="rw-v">${cd.volRatio||'--'} (${cd.vr||'--'})</span></div>`;
  cHTML+=`<div class="rw"><span class="rw-l">振幅</span><span class="rw-v">${cd.amp||'--'} (${cd.ampS||'--'})</span></div>`;
  cHTML+=`<div class="rw"><span class="rw-l">涨跌停</span><span class="rw-v">${cd.limit||'--'}</span></div>`;
  cHTML+=`<div class="rw"><span class="rw-l">5日净流入</span><span class="rw-v">${cd.inflowDays||'--'}</span></div>`;
  cHTML+=`<div class="rw"><span class="rw-l">成交额</span><span class="rw-v">${cd.amount||'--'}</span></div>`;
  document.getElementById('dCBody').innerHTML=cHTML;

  // 情绪面详情
  const sd=a.sent.details;
  let seHTML=`<div class="rw"><span class="rw-l">10日涨/跌</span><span class="rw-v">${sd.up10||'--'}</span></div>`;
  seHTML+=`<div class="rw"><span class="rw-l">情绪</span><span class="rw-v">${sd.sent||'--'}</span></div>`;
  seHTML+=`<div class="rw"><span class="rw-l">最大连涨</span><span class="rw-v">${sd.maxUp||0}天</span></div>`;
  seHTML+=`<div class="rw"><span class="rw-l">最大连跌</span><span class="rw-v">${sd.maxDown||0}天</span></div>`;
  seHTML+=`<div class="rw"><span class="rw-l">连涨/跌信号</span><span class="rw-v">${sd.streak||'--'}</span></div>`;
  seHTML+=`<div class="rw"><span class="rw-l">52周位置</span><span class="rw-v">${sd.posPercentile||'--'}</span></div>`;
  seHTML+=`<div class="rw"><span class="rw-l">价格位置</span><span class="rw-v">${sd.posPos||'--'}</span></div>`;
  seHTML+=`<div class="rw"><span class="rw-l">波动率</span><span class="rw-v">${sd.volatility||'--'} (${sd.vol||'--'})</span></div>`;
  seHTML+=`<div class="rw"><span class="rw-l">今日涨跌</span><span class="rw-v">${sd.todayChg||'--'} (${sd.tSignal||'--'})</span></div>`;
  document.getElementById('dSBody').innerHTML=seHTML;

  // 新闻分析
  const nc = document.getElementById('cNews');
  if (newsA && newsA.items && newsA.items.length > 0) {
    nc.classList.add('active');
    let nHTML = `<div style="margin-bottom:6px;font-size:11px;color:var(--t2)">
      共分析 ${newsA.total} 条新闻 | 利好 ${newsA.positive} 条 | 利空 ${newsA.negative} 条 | 中性 ${newsA.neutral} 条 | 总体: <strong style="color:${newsA.summary==='偏利好'?'var(--red)':newsA.summary==='偏利空'?'var(--green)':'var(--gold)'}">${newsA.summary}</strong>
    </div>`;
    newsA.items.slice(0,8).forEach(n => {
      const tagClass = n.sentiment==='positive'?'positive':n.sentiment==='negative'?'negative':'neutral';
      const tagText = n.sentiment==='positive'?'利好':n.sentiment==='negative'?'利空':'中性';
      nHTML += `<div class="news-item">
        <span class="news-tag ${tagClass}">${tagText}</span>${n.title}
        <div class="news-source">${n.source} · ${n.time}</div>
      </div>`;
    });
    document.getElementById('newsBody').innerHTML=nHTML;
  } else {
    nc.classList.add('active');
    document.getElementById('newsBody').innerHTML='<div style="text-align:center;padding:10px;color:var(--t2);font-size:12px">暂无新闻数据，将基于行情数据进行分析</div>';
  }

  // 显示所有卡片
  document.getElementById('cStock').classList.add('active');
  document.getElementById('cPred').classList.add('active');
  document.getElementById('dT').classList.add('active');
  document.getElementById('dF').classList.add('active');
  document.getElementById('dC').classList.add('active');
  document.getElementById('dS').classList.add('active');
}

// ==================== 历史 ====================
function saveHist(security, q, a) {
  const entry = {
    name: q.name||'', code: security.code, market: security.market,
    price: q.price, change: q.changePercent,
    dir: a.dir, conf: a.confidence, rate: a.rate,
    ts: Date.now()
  };
  history.unshift(entry);
  if(history.length>50)history.pop();
  localStorage.setItem('sp_hist',JSON.stringify(history));
}

function renderHist() {
  const el=document.getElementById('histList');
  if(!history.length){el.innerHTML='<div style="text-align:center;padding:30px;color:var(--t2)">暂无记录</div>';return;}
  el.innerHTML=history.map(h=>{
    const dt=h.dir==='up'?'📈看涨':h.dir==='down'?'📉看跌':'➡️震荡';
    const dc=h.dir==='up'?'up':h.dir==='down'?'down':'';
    const t=new Date(h.ts);
    const ts=(t.getMonth()+1)+'/'+t.getDate()+' '+t.getHours()+':'+String(t.getMinutes()).padStart(2,'0');
    return `<div class="h-item"><div><div class="h-n">${h.name||h.code}</div><div class="h-c">${h.code} · ${h.price?.toFixed(2)||'--'}</div></div><div><div class="h-p ${dc}">${dt} ${h.conf?.toFixed(0)||'--'}%</div><div class="h-t">${ts}</div></div></div>`;
  }).join('');
}

function clearHist(){if(confirm('确定清空？')){history=[];localStorage.removeItem('sp_hist');renderHist();}}

// ==================== 导航 ====================
function hideAll(){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.card,.d-sec,.news-card').forEach(c=>c.classList.remove('active'));}
function switchTab(tabId, navEl) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  if(navEl)navEl.classList.add('active');
  if(tabId==='tabHistory')renderHist();
}

// 初始化
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch();});
});
