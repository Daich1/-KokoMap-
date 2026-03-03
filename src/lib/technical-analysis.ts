export interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorData extends OHLCVData {
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  atr: number | null;
  stochK: number | null;
  stochD: number | null;
  obv: number | null;
}

function calcSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result[i] = null;
    } else if (i === period - 1) {
      result[i] = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      const prev = result[i - 1]!;
      result[i] = (values[i] - prev) * k + prev;
    }
  }
  return result;
}

function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map(c => Math.max(0, c));
  const losses = changes.map(c => Math.max(0, -c));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function calcMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);

  const macdLine = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  // Extract non-null MACD values and calculate signal EMA
  const macdNonNull: number[] = [];
  const macdNonNullIndices: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      macdNonNull.push(macdLine[i]!);
      macdNonNullIndices.push(i);
    }
  }

  const signalEMA = calcEMA(macdNonNull, signalPeriod);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  for (let j = 0; j < macdNonNullIndices.length; j++) {
    signalLine[macdNonNullIndices[j]] = signalEMA[j];
  }

  const hist = closes.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return m !== null && s !== null ? m - s : null;
  });

  return { macd: macdLine, signal: signalLine, hist };
}

function calcBollingerBands(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calcSMA(closes, period);

  const upper = closes.map((_, i) => {
    if (i < period - 1 || middle[i] === null) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    const avg = middle[i]!;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / period;
    return avg + stdDev * Math.sqrt(variance);
  });

  const lower = closes.map((_, i) => {
    if (i < period - 1 || middle[i] === null) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    const avg = middle[i]!;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / period;
    return avg - stdDev * Math.sqrt(variance);
  });

  return { upper, middle, lower };
}

function calcATR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  const trValues: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      trValues.push(highs[i] - lows[i]);
    } else {
      trValues.push(
        Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        )
      );
    }
  }

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result[i] = null;
    } else if (i === period - 1) {
      result[i] = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      result[i] = (result[i - 1]! * (period - 1) + trValues[i]) / period;
    }
  }
  return result;
}

function calcStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const kValues: (number | null)[] = closes.map((c, i) => {
    if (i < kPeriod - 1) return null;
    const h = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    const l = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    return h === l ? 50 : ((c - l) / (h - l)) * 100;
  });

  const kNonNull: number[] = [];
  const kIndices: number[] = [];
  for (let i = 0; i < kValues.length; i++) {
    if (kValues[i] !== null) {
      kNonNull.push(kValues[i]!);
      kIndices.push(i);
    }
  }

  const dRaw = calcSMA(kNonNull, dPeriod);
  const dValues: (number | null)[] = new Array(closes.length).fill(null);
  for (let j = 0; j < kIndices.length; j++) {
    dValues[kIndices[j]] = dRaw[j];
  }

  return { k: kValues, d: dValues };
}

function calcOBV(closes: number[], volumes: number[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      result.push(result[i - 1] + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      result.push(result[i - 1] - volumes[i]);
    } else {
      result.push(result[i - 1]);
    }
  }
  return result;
}

export function calculateAllIndicators(data: OHLCVData[]): IndicatorData[] {
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  const ma20 = calcSMA(closes, 20);
  const ma50 = calcSMA(closes, 50);
  const ma200 = calcSMA(closes, 200);
  const rsiValues = calcRSI(closes, 14);
  const macdResult = calcMACD(closes);
  const bbResult = calcBollingerBands(closes);
  const atrValues = calcATR(highs, lows, closes);
  const stochResult = calcStochastic(highs, lows, closes);
  const obvValues = calcOBV(closes, volumes);

  return data.map((d, i) => ({
    ...d,
    ma20: ma20[i],
    ma50: ma50[i],
    ma200: ma200[i],
    rsi: rsiValues[i],
    macd: macdResult.macd[i],
    macdSignal: macdResult.signal[i],
    macdHist: macdResult.hist[i],
    bbUpper: bbResult.upper[i],
    bbMiddle: bbResult.middle[i],
    bbLower: bbResult.lower[i],
    atr: atrValues[i],
    stochK: stochResult.k[i],
    stochD: stochResult.d[i],
    obv: obvValues[i],
  }));
}
