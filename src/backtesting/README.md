# Backtesting V1

`BacktestEngine` ejecuta simulaciones históricas usando la misma lógica de producción del motor.
La intención no es crear una estrategia distinta para investigación, sino contestar una pregunta
concreta: si el motor hubiera estado corriendo en una fecha pasada, qué señales habría generado y
qué habría pasado después.

## Flujo técnico

```text
POST /api/backtest
  -> BacktestEngine
    -> MarketDataService.getHistoricalCandles
      -> YahooFinanceClient.getHistoricalCandles
    -> OpportunityService.analyze
      -> TrendAnalyzer
      -> VolumeAnalyzer
      -> MomentumAnalyzer
      -> StructureAnalyzer
    -> RiskService.calculateRisk
    -> TradeOutcomeEvaluator
       -> Evaluación futura de SL / TP1 / TP2
       -> MFE / MAE
       -> candlesUntil / exitAt
    -> Summary + ventanas recientes
```

El flujo vivo (`marketScan`, `marketScanHttp`, Telegram) no depende del backtester. El backtester sí
reutiliza piezas del flujo vivo para que el score histórico sea comparable con el score real.

## No look-ahead bias

Para cada vela histórica `i`, el engine construye una ventana cerrada:

```ts
const historicalWindow = candles.slice(0, i + 1);
```

Esa ventana es lo único que se entrega a `OpportunityService` y `RiskService`. Las velas posteriores
se usan únicamente después de crear el trade para evaluar outcomes.

## Señal histórica

Una señal histórica nace cuando el `Opportunity.score` calculado con `candles[0..i]` cumple:

```text
score >= minimumScore
```

El `entry` sale del mismo criterio vigente de producción: `RiskService` usa el `close` de la última
vela de la ventana histórica. El stop técnico interno sigue siendo el `low` de esa vela, pero el
backtest evalúa el stop financiero porcentual solicitado en el request.

## Evaluación de outcomes

La evaluación objetiva de qué ocurrió después de una señal vive en
`src/services/TradeOutcomeEvaluator.ts`. Este servicio no genera señales, no calcula score, no consulta
Yahoo, no persiste PostgreSQL y no envía Telegram. Su única responsabilidad es recibir un trade ya
definido (`entry`, `stopLoss`, `TP1`, `TP2`, `signalAt`, `expiresAt`) junto con velas de mercado y
determinar el resultado.

El evaluator ordena las velas por timestamp y usa únicamente candles con:

```text
timestamp > signalAt
timestamp <= expiresAt
```

La candle exactamente igual a `signalAt` no se usa como candle futura. Las candles posteriores a
`expiresAt` también se ignoran.

## Evaluación de targets

El engine evalúa dos targets independientes:

```text
TP1 = takeProfitMinPercent
TP2 = takeProfitMaxPercent
```

Cada target puede terminar como `WIN`, `LOSS`, `EXPIRED` o `AMBIGUOUS`.

Una vela es `AMBIGUOUS` cuando cumple simultáneamente:

```text
low <= stopLoss
high >= target
```

Con datos OHLC no sabemos si primero tocó el stop o el target dentro de esa vela, así que el motor
no lo cuenta automáticamente como acierto ni como fallo. Para `AMBIGUOUS`, `exitAt` apunta al timestamp
de la candle ambigua. Para `EXPIRED`, `exitAt` queda vacío.

`candlesUntil` usa una convención 1-based: la primera candle posterior a `signalAt` cuenta como `1`.
TP1 y TP2 se evalúan de forma independiente, por lo que un mismo trade puede terminar, por ejemplo,
con `TP1 = WIN` y `TP2 = LOSS` o `TP1 = WIN` y `TP2 = EXPIRED`.

## MFE / MAE

`maxFavorableExcursionPercent` mide el mayor avance porcentual por encima del `entry` mientras el
trade estuvo en su vida relevante. Para LONG:

```text
MFE = ((maxHigh - entry) / entry) * 100
```

`maxAdverseExcursionPercent` mide la mayor caída porcentual debajo del `entry` y conserva signo
negativo cuando el precio cae. Para LONG:

```text
MAE = ((minLow - entry) / entry) * 100
```

La vida relevante mantiene la semántica histórica del `BacktestEngine`: se mide desde la primera
candle posterior a la señal hasta la candle terminal más tardía entre TP1 y TP2. Si ambos targets
expiran, se usan todas las candles futuras hasta `expiresAt`.

## No overlapping trades

Para el mismo `ticker + timeframe`, el engine no abre una nueva operación mientras la anterior siga
activa. Esto evita inflar resultados contando varias señales dentro del mismo movimiento.

## Ventanas recientes

Además del periodo completo, el engine calcula:

- `last12Months`
- `last6Months`
- `last30Days`
- `last7Days`

Cada ventana incluye `signals`, `tp1WinRate` y `tp2WinRate`. Las ventanas pequeñas no se interpretan
como estadísticamente significativas por sí solas.

## Datos insuficientes

Si Yahoo no entrega suficiente histórico útil, se reporta:

```text
insufficient-historical-data
```

con `ticker`, `timeframe`, `from`, `to` y `candlesReturned`.

## Forward testing futuro

Forward testing no está implementado en esta fase. La idea futura es guardar señales reales generadas
en vivo con:

```text
signalAt, ticker, timeframe, score, entry, stopLoss, tp1, tp2
```

y evaluarlas posteriormente contra mercado real. Backtesting mira al pasado; forward testing audita
lo que el bot realmente alertó en vivo.
