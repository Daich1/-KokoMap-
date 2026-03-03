import type { IndicatorData } from "./technical-analysis";

export type SignalType = "STRONG_BUY" | "BUY" | "WEAK_BUY" | "NEUTRAL" | "WEAK_SELL" | "SELL" | "STRONG_SELL";

export interface SignalDetail {
  name: string;
  nameJa: string;
  signal: "BUY" | "SELL" | "NEUTRAL";
  strength: number; // -3 to +3
  description: string;
  value: number | null;
}

export interface SignalResult {
  overall: SignalType;
  overallLabel: string;
  score: number;
  maxScore: number;
  scorePct: number;
  color: string;
  bgColor: string;
  details: SignalDetail[];
}

export interface RiskManagement {
  entryPrice: number;
  stopLoss: number;
  stopLossAtrMultiple: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio1: number;
  riskRewardRatio2: number;
  atr: number;
  suggestedPositionNote: string;
}

export type ActionType = "ENTER" | "WAIT" | "AVOID";

export interface ActionRecommendation {
  action: ActionType;
  label: string;       // 短いラベル
  summary: string;     // 1行サマリー
  color: string;
  borderColor: string;
  reasons: string[];   // 今の状態を支持する根拠
  waitFor: string[];   // エントリーを待つ条件
  avoidBelow: number | null; // この価格を割ったら完全撤退
  confidence: number;  // 0-100
}

function analyzeRSI(current: IndicatorData): SignalDetail {
  const rsi = current.rsi;
  if (rsi === null) {
    return { name: "RSI", nameJa: "RSI", signal: "NEUTRAL", strength: 0, description: "データ不足", value: null };
  }

  if (rsi < 25) return { name: "RSI", nameJa: "RSI", signal: "BUY", strength: 3, description: `${rsi.toFixed(1)} — 極度の売られすぎ（強い買いシグナル）`, value: rsi };
  if (rsi < 30) return { name: "RSI", nameJa: "RSI", signal: "BUY", strength: 2, description: `${rsi.toFixed(1)} — 売られすぎ（買いシグナル）`, value: rsi };
  if (rsi < 40) return { name: "RSI", nameJa: "RSI", signal: "BUY", strength: 1, description: `${rsi.toFixed(1)} — やや弱め（弱い買いシグナル）`, value: rsi };
  if (rsi <= 60) return { name: "RSI", nameJa: "RSI", signal: "NEUTRAL", strength: 0, description: `${rsi.toFixed(1)} — 中立ゾーン`, value: rsi };
  if (rsi <= 70) return { name: "RSI", nameJa: "RSI", signal: "SELL", strength: -1, description: `${rsi.toFixed(1)} — やや強め（弱い売りシグナル）`, value: rsi };
  if (rsi <= 80) return { name: "RSI", nameJa: "RSI", signal: "SELL", strength: -2, description: `${rsi.toFixed(1)} — 買われすぎ（売りシグナル）`, value: rsi };
  return { name: "RSI", nameJa: "RSI", signal: "SELL", strength: -3, description: `${rsi.toFixed(1)} — 極度の買われすぎ（強い売りシグナル）`, value: rsi };
}

function analyzeMACD(current: IndicatorData, prev: IndicatorData | null): SignalDetail {
  const macd = current.macd;
  const macdSignal = current.macdSignal;
  const macdHist = current.macdHist;
  const prevHist = prev?.macdHist ?? null;

  if (macd === null || macdSignal === null || macdHist === null) {
    return { name: "MACD", nameJa: "MACD", signal: "NEUTRAL", strength: 0, description: "データ不足", value: null };
  }

  // Cross detection
  if (prevHist !== null && prevHist <= 0 && macdHist > 0) {
    return { name: "MACD", nameJa: "MACD", signal: "BUY", strength: 3, description: "ゴールデンクロス発生（強い買いシグナル）", value: macd };
  }
  if (prevHist !== null && prevHist >= 0 && macdHist < 0) {
    return { name: "MACD", nameJa: "MACD", signal: "SELL", strength: -3, description: "デッドクロス発生（強い売りシグナル）", value: macd };
  }

  if (macdHist > 0 && (prevHist === null || macdHist > prevHist)) {
    return { name: "MACD", nameJa: "MACD", signal: "BUY", strength: 2, description: `上昇モメンタム拡大（ヒスト: ${macdHist.toFixed(3)}）`, value: macd };
  }
  if (macdHist > 0) {
    return { name: "MACD", nameJa: "MACD", signal: "BUY", strength: 1, description: `上昇トレンド継続（ヒスト: ${macdHist.toFixed(3)}）`, value: macd };
  }
  if (macdHist < 0 && (prevHist === null || macdHist < prevHist)) {
    return { name: "MACD", nameJa: "MACD", signal: "SELL", strength: -2, description: `下降モメンタム拡大（ヒスト: ${macdHist.toFixed(3)}）`, value: macd };
  }
  if (macdHist < 0) {
    return { name: "MACD", nameJa: "MACD", signal: "SELL", strength: -1, description: `下降トレンド継続（ヒスト: ${macdHist.toFixed(3)}）`, value: macd };
  }
  return { name: "MACD", nameJa: "MACD", signal: "NEUTRAL", strength: 0, description: "中立", value: macd };
}

function analyzeMA(current: IndicatorData): SignalDetail {
  const price = current.close;
  const ma50 = current.ma50;
  const ma200 = current.ma200;

  if (ma50 === null) {
    return { name: "MA", nameJa: "移動平均", signal: "NEUTRAL", strength: 0, description: "データ不足（MA50計算中）", value: price };
  }

  const hasMa200 = ma200 !== null;

  if (hasMa200) {
    const goldenCross = ma50 > ma200;
    if (goldenCross && price > ma50) {
      return { name: "MA", nameJa: "移動平均", signal: "BUY", strength: 3, description: `ゴールデンクロス + 価格MA50上（$${ma50.toFixed(2)}）`, value: price };
    }
    if (goldenCross && price < ma50) {
      return { name: "MA", nameJa: "移動平均", signal: "NEUTRAL", strength: 0, description: `ゴールデンクロスだが価格がMA50下（$${ma50.toFixed(2)}）`, value: price };
    }
    if (!goldenCross && price < ma50) {
      return { name: "MA", nameJa: "移動平均", signal: "SELL", strength: -3, description: `デッドクロス + 価格MA50下（$${ma50.toFixed(2)}）`, value: price };
    }
    return { name: "MA", nameJa: "移動平均", signal: "NEUTRAL", strength: 0, description: `デッドクロスだが価格はMA50上（$${ma50.toFixed(2)}）`, value: price };
  }

  if (price > ma50) {
    return { name: "MA", nameJa: "移動平均", signal: "BUY", strength: 2, description: `価格がMA50上（$${ma50.toFixed(2)}）`, value: price };
  }
  return { name: "MA", nameJa: "移動平均", signal: "SELL", strength: -2, description: `価格がMA50下（$${ma50.toFixed(2)}）`, value: price };
}

function analyzeBollinger(current: IndicatorData): SignalDetail {
  const price = current.close;
  const upper = current.bbUpper;
  const lower = current.bbLower;
  const middle = current.bbMiddle;

  if (upper === null || lower === null || middle === null) {
    return { name: "BB", nameJa: "ボリンジャーバンド", signal: "NEUTRAL", strength: 0, description: "データ不足", value: price };
  }

  const width = upper - lower;
  const position = width > 0 ? (price - lower) / width : 0.5;

  if (price >= upper) return { name: "BB", nameJa: "ボリンジャーバンド", signal: "SELL", strength: -2, description: `上限バンド突破（過熱 ≥$${upper.toFixed(2)}）`, value: price };
  if (position > 0.85) return { name: "BB", nameJa: "ボリンジャーバンド", signal: "SELL", strength: -1, description: `上限バンド近傍（${(position * 100).toFixed(0)}%位置）`, value: price };
  if (price <= lower) return { name: "BB", nameJa: "ボリンジャーバンド", signal: "BUY", strength: 2, description: `下限バンド突破（反発期待 ≤$${lower.toFixed(2)}）`, value: price };
  if (position < 0.15) return { name: "BB", nameJa: "ボリンジャーバンド", signal: "BUY", strength: 1, description: `下限バンド近傍（${(position * 100).toFixed(0)}%位置）`, value: price };
  return { name: "BB", nameJa: "ボリンジャーバンド", signal: "NEUTRAL", strength: 0, description: `バンド内 ${(position * 100).toFixed(0)}%位置（中央$${middle.toFixed(2)}）`, value: price };
}

function analyzeStochastic(current: IndicatorData): SignalDetail {
  const k = current.stochK;
  const d = current.stochD;

  if (k === null || d === null) {
    return { name: "Stoch", nameJa: "ストキャスティクス", signal: "NEUTRAL", strength: 0, description: "データ不足", value: null };
  }

  if (k < 20 && d < 20) return { name: "Stoch", nameJa: "ストキャスティクス", signal: "BUY", strength: 2, description: `K=${k.toFixed(1)} D=${d.toFixed(1)} — 売られすぎゾーン`, value: k };
  if (k > 80 && d > 80) return { name: "Stoch", nameJa: "ストキャスティクス", signal: "SELL", strength: -2, description: `K=${k.toFixed(1)} D=${d.toFixed(1)} — 買われすぎゾーン`, value: k };
  if (k > d && k < 50) return { name: "Stoch", nameJa: "ストキャスティクス", signal: "BUY", strength: 1, description: `K=${k.toFixed(1)} — 底値圏から上昇クロス`, value: k };
  if (k < d && k > 50) return { name: "Stoch", nameJa: "ストキャスティクス", signal: "SELL", strength: -1, description: `K=${k.toFixed(1)} — 高値圏から下降クロス`, value: k };
  return { name: "Stoch", nameJa: "ストキャスティクス", signal: "NEUTRAL", strength: 0, description: `K=${k.toFixed(1)} D=${d.toFixed(1)} — 中立`, value: k };
}

export function generateSignals(
  data: IndicatorData[]
): { signals: SignalResult; riskManagement: RiskManagement; action: ActionRecommendation } {
  if (data.length === 0) {
    throw new Error("No data available");
  }

  const current = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : null;

  const details: SignalDetail[] = [
    analyzeRSI(current),
    analyzeMACD(current, prev),
    analyzeMA(current),
    analyzeBollinger(current),
    analyzeStochastic(current),
  ];

  const score = details.reduce((sum, d) => sum + d.strength, 0);
  const maxScore = details.reduce((sum, d) => sum + Math.abs(d.strength), 0);
  const scorePct = maxScore > 0 ? (score / maxScore) * 100 : 0;

  let overall: SignalType;
  let overallLabel: string;
  let color: string;
  let bgColor: string;

  if (score >= 7) { overall = "STRONG_BUY"; overallLabel = "強い買い"; color = "#00C853"; bgColor = "#1B5E20"; }
  else if (score >= 4) { overall = "BUY"; overallLabel = "買い"; color = "#00E676"; bgColor = "#1B5E20"; }
  else if (score >= 1) { overall = "WEAK_BUY"; overallLabel = "弱い買い"; color = "#69F0AE"; bgColor = "#1B5E20"; }
  else if (score >= -1) { overall = "NEUTRAL"; overallLabel = "様子見"; color = "#FFB300"; bgColor = "#E65100"; }
  else if (score >= -4) { overall = "WEAK_SELL"; overallLabel = "弱い売り"; color = "#FF6E40"; bgColor = "#B71C1C"; }
  else if (score >= -7) { overall = "SELL"; overallLabel = "売り"; color = "#FF1744"; bgColor = "#B71C1C"; }
  else { overall = "STRONG_SELL"; overallLabel = "強い売り"; color = "#D50000"; bgColor = "#B71C1C"; }

  const atr = current.atr ?? (current.close * 0.03);
  const entryPrice = current.close;
  const stopLossAtrMultiple = 2.0;
  const tp1Atr = 2.5;
  const tp2Atr = 4.0;

  const stopLoss = entryPrice - atr * stopLossAtrMultiple;
  const takeProfit1 = entryPrice + atr * tp1Atr;
  const takeProfit2 = entryPrice + atr * tp2Atr;
  const riskAmount = entryPrice - stopLoss;

  const riskManagement: RiskManagement = {
    entryPrice,
    stopLoss,
    stopLossAtrMultiple,
    takeProfit1,
    takeProfit2,
    riskRewardRatio1: riskAmount > 0 ? (takeProfit1 - entryPrice) / riskAmount : 0,
    riskRewardRatio2: riskAmount > 0 ? (takeProfit2 - entryPrice) / riskAmount : 0,
    atr,
    suggestedPositionNote:
      "楽天証券での発注前に必ず自己判断でご確認ください。SOXLは3倍レバレッジETFです。",
  };

  const signalResult = { overall, overallLabel, score, maxScore, scorePct, color, bgColor, details };
  const action = generateActionRecommendation(signalResult, current, riskManagement);

  return {
    signals: signalResult,
    riskManagement,
    action,
  };
}

export function generateActionRecommendation(
  signals: SignalResult,
  current: IndicatorData,
  risk: RiskManagement
): ActionRecommendation {
  const { details, score } = signals;
  const price = current.close;
  const rsi = current.rsi;
  const ma50 = current.ma50;
  const ma200 = current.ma200;
  const macdSig = details.find(d => d.name === "MACD");
  const bbSig = details.find(d => d.name === "BB");
  const stochSig = details.find(d => d.name === "Stoch");

  const goldenCross = ma50 !== null && ma200 !== null && ma50 > ma200;
  const aboveMa50 = ma50 !== null && price > ma50;
  const aboveMa200 = ma200 !== null && price > ma200;
  const rsiHealthy = rsi !== null && rsi >= 30 && rsi <= 65;
  const rsiOversold = rsi !== null && rsi < 35;
  const rsiOverbought = rsi !== null && rsi > 72;
  const macdPositive = (macdSig?.strength ?? 0) > 0;
  const macdCrossing = (macdSig?.strength ?? 0) === 3;  // golden cross発生
  const macdBearish = (macdSig?.strength ?? 0) <= -2;
  const bbLow = (bbSig?.strength ?? 0) > 0;
  const stochOversold = (stochSig?.strength ?? 0) >= 2;

  const reasons: string[] = [];
  const waitFor: string[] = [];

  // ─── ENTER ────────────────────────────────────────────────────
  // 条件: スコア高く、MA構造良好、MACD陽転、RSI過熱なし
  const isEnter =
    score >= 5 &&
    aboveMa50 &&
    !rsiOverbought &&
    (macdPositive || macdCrossing);

  // ─── AVOID ────────────────────────────────────────────────────
  // 条件: MA50割れ + MACDベアリッシュ、またはスコア大幅マイナス
  const isAvoid =
    score <= -4 ||
    (!aboveMa50 && macdBearish) ||
    (rsiOverbought && macdBearish);

  let action: ActionType;
  let label: string;
  let summary: string;
  let borderColor: string;
  let actionColor: string;
  let confidence: number;

  if (isEnter) {
    action = "ENTER";
    label = "エントリー推奨";
    actionColor = "#10B981";
    borderColor = "#065F46";
    confidence = Math.min(95, 60 + score * 5);
    summary = "複数の指標が揃っています。全額エントリーを検討できます。";
    if (goldenCross) reasons.push("ゴールデンクロス発生中（MA50 > MA200）");
    if (macdCrossing) reasons.push("MACDゴールデンクロス発生");
    if (macdPositive) reasons.push("MACDがシグナル上でモメンタム上昇中");
    if (aboveMa50) reasons.push(`価格がMA50（$${ma50?.toFixed(2)}）を上回って推移`);
    if (aboveMa200) reasons.push(`価格がMA200（$${ma200?.toFixed(2)}）も上回り強気構造`);
    if (rsiHealthy) reasons.push(`RSI ${rsi?.toFixed(1)} — 健全な中立ゾーン`);
    if (rsiOversold) reasons.push(`RSI ${rsi?.toFixed(1)} — 売られすぎから反転中`);
    if (bbLow) reasons.push("ボリンジャー下限付近で反発の可能性");
    if (stochOversold) reasons.push("ストキャスティクスが底値圏から上昇クロス");

  } else if (isAvoid) {
    action = "AVOID";
    label = "現金待機";
    actionColor = "#EF4444";
    borderColor = "#7F1D1D";
    confidence = Math.min(95, 60 + Math.abs(score) * 5);
    summary = "トレンドが崩れています。無理に入る局面ではありません。";
    if (!aboveMa50 && ma50) reasons.push(`MA50（$${ma50.toFixed(2)}）を下回り下降トレンド入り`);
    if (macdBearish) reasons.push("MACDが強い下降モメンタムを示している");
    if (rsiOverbought) reasons.push(`RSI ${rsi?.toFixed(1)} — 買われすぎ圏で下落リスク`);
    if (score <= -4) reasons.push(`総合スコア ${score} — 複数指標が弱気サイン`);
    if (ma50) waitFor.push(`MA50（$${ma50.toFixed(2)}）を明確に上抜けて維持`);
    waitFor.push("MACDヒストグラムがゼロ以上に転換");
    waitFor.push("RSIが40以上で安定推移");

  } else {
    // WAIT
    action = "WAIT";
    label = "様子見 — 現金待機";
    actionColor = "#F59E0B";
    borderColor = "#78350F";
    confidence = 70;
    summary = "構造は悪くないが、まだ揃っていない。チャンスではない今は現金でいい。";

    // 良い点を reasons に
    if (goldenCross) reasons.push(`ゴールデンクロス維持（MA50 $${ma50?.toFixed(2)} > MA200 $${ma200?.toFixed(2)}）`);
    if (aboveMa50) reasons.push(`価格はMA50（$${ma50?.toFixed(2)}）上で維持 — 強気構造は健在`);
    if (aboveMa200) reasons.push(`MA200（$${ma200?.toFixed(2)}）も上回っており長期トレンドは上向き`);
    if (rsiOversold) reasons.push(`RSI ${rsi?.toFixed(1)} — 売られすぎ圏 → 反発候補`);
    if (bbLow || stochOversold) reasons.push("ボリンジャー/ストキャスが底値圏を示唆");

    // 待つべき条件
    if (macdBearish) {
      waitFor.push("MACDヒストグラムがプラス転換（下落モメンタムの終息サイン）");
    } else if (!macdPositive) {
      waitFor.push("MACDがシグナルラインを上抜けてプラス圏へ");
    }
    if (!rsiOversold && !rsiHealthy && rsi !== null && rsi > 60) {
      waitFor.push(`RSIが60以下に落ち着くのを待つ（現在 ${rsi.toFixed(1)}）`);
    }
    if (!macdPositive && !rsiOversold) {
      waitFor.push(`MA50（$${ma50?.toFixed(2)}）まで引いてきたところでのバウンス確認`);
    }
    if (rsiOversold && !macdPositive) {
      waitFor.push("RSI反転 + MACDヒストグラムがプラス方向に向き始めたらエントリー検討");
    }
  }

  // Avoid below: MA50の3%下、またはMA200
  const avoidBelow = ma50 !== null
    ? parseFloat((ma50 * 0.97).toFixed(2))
    : risk.stopLoss;

  return {
    action,
    label,
    summary,
    color: actionColor,
    borderColor,
    reasons,
    waitFor,
    avoidBelow,
    confidence,
  };
}
