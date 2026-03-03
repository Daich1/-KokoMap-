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
  adx: number | null;       // Trend strength
  plusDI: number | null;    // Bullish directional strength
  minusDI: number | null;   // Bearish directional strength
  ma200Slope: number | null; // MA200 direction (positive=up, negative=down)
  volRatio: number | null;  // Volume / 20-day average volume
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

function calcADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): { adx: (number | null)[]; plusDI: (number | null)[]; minusDI: (number | null)[] } {
  const n = closes.length;
  const adx: (number | null)[] = new Array(n).fill(null);
  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);

  if (n < period * 2) return { adx, plusDI, minusDI };

  const trArr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 0; i < n; i++) {
    if (i === 0) { trArr.push(highs[i] - lows[i]); plusDM.push(0); minusDM.push(0); continue; }
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trArr.push(tr);
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder smoothing initialisation (sum first `period` values)
  let smoothTR = trArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxArr: number[] = [];

  for (let i = period; i < n; i++) {
    smoothTR = smoothTR - smoothTR / period + trArr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    const pdi = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const mdi = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    plusDI[i] = pdi;
    minusDI[i] = mdi;

    const dxVal = (pdi + mdi) > 0 ? (Math.abs(pdi - mdi) / (pdi + mdi)) * 100 : 0;
    dxArr.push(dxVal);

    // ADX = Wilder smooth of DX, needs `period` DX values first
    if (dxArr.length === period) {
      adx[i] = dxArr.reduce((a, b) => a + b, 0) / period;
    } else if (dxArr.length > period) {
      adx[i] = (adx[i - 1]! * (period - 1) + dxVal) / period;
    }
  }

  return { adx, plusDI, minusDI };
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
  const adxResult = calcADX(highs, lows, closes);

  // MA200 slope: % change of MA200 over last 5 bars (positive = trending up)
  const ma200Slope = ma200.map((v, i) => {
    if (v === null || i < 5 || ma200[i - 5] === null) return null;
    return ((v - ma200[i - 5]!) / ma200[i - 5]!) * 100;
  });

  // Volume ratio: current volume / 20-day SMA of volume
  const volSMA20 = calcSMA(volumes, 20);
  const volRatio = volumes.map((v, i) => (volSMA20[i] !== null && volSMA20[i]! > 0 ? v / volSMA20[i]! : null));

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
    adx: adxResult.adx[i],
    plusDI: adxResult.plusDI[i],
    minusDI: adxResult.minusDI[i],
    ma200Slope: ma200Slope[i],
    volRatio: volRatio[i],
  }));
}
