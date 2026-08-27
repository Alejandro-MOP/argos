# market-signal-engine

Motor de análisis cuantitativo para detectar oportunidades de trading en ETFs y acciones estadounidenses.

El sistema no ejecuta órdenes, no se conecta a brokers y no toma decisiones operativas. Analiza datos de mercado, genera `Opportunity`, convierte las mejores en `Signal` mediante gestión de riesgo y notifica.

## Stack

- Node.js 22
- TypeScript
- Azure Functions v4
- PostgreSQL preparado por contrato
- Axios
- dotenv
- Jest
- ESLint
- Prettier

## Arquitectura

```text
src/
  analyzers/
    TrendAnalyzer.ts
    VolumeAnalyzer.ts
    MomentumAnalyzer.ts
    StructureAnalyzer.ts
  backtesting/
    BacktestEngine.ts
    README.md
  clients/
    TelegramClient.ts
    YahooFinanceClient.ts
  config/
    env.ts
  functions/
    marketScan/
    marketScanHttp/
    telegramTest/
    backtest/
  models/
    Candle.ts
    Opportunity.ts
    Signal.ts
    SignalCandidate.ts
  ports/
    Analyzer.ts
    MarketDataProvider.ts
    OpportunityRepository.ts
    SignalRepository.ts
    SignalStore.ts
    TradingStrategy.ts
  repositories/
    OpportunityMemoryRepository.ts
    SignalRepository.ts
  services/
    MarketDataService.ts
    NotificationService.ts
    OpportunityFilter.ts
    OpportunityService.ts
    RankingService.ts
    RiskService.ts
    StrategyService.ts
    WatchlistService.ts
  utils/
    marketMath.ts
    parse.utils.ts
    sanitizeError.ts
    timeframe.utils.ts
    tradeSizing.utils.ts
  watchlists/
    dividends.ts
    etfs.ts
    growth.ts
```

La arquitectura es hexagonal:

```text
Azure Timer
  -> Application Services
  -> Domain Models and Ports
  -> External Adapters
```

Los detalles externos, como Yahoo Finance, Telegram o PostgreSQL, viven detrás de interfaces. El motor analiza `Candle[]` normalizadas y no depende del formato crudo del proveedor.

## Flujo Principal

```text
Watchlist
  -> MarketDataProvider
  -> Analyzers
  -> OpportunityService
  -> RankingService
  -> OpportunityFilter
  -> RiskService
  -> SignalRepository
  -> NotificationService
```

Pasos de `marketScan`:

1. Carga la watchlist configurada.
2. Obtiene velas con `MarketDataService`.
3. Ejecuta analyzers independientes.
4. Genera una `Opportunity`.
5. Rankea oportunidades por score descendente.
6. Filtra por score mínimo y duplicados recientes.
7. Convierte oportunidades válidas en un plan de riesgo con `RiskService`.
8. Si la oportunidad supera `TELEGRAM_NOTIFICATION_MIN_SCORE`, la agrega a `notifiedSignals` y puede notificar Telegram.
9. Persiste oportunidad y señal en memoria cuando corresponde.

## Azure Functions

El proyecto expone entradas independientes para producción, pruebas manuales y backtesting:

```text
marketScan      -> Timer Trigger / cron para escaneo automático
marketScanHttp  -> HTTP Trigger manual o webhook
backtest        -> HTTP Trigger para simulación histórica
telegramTest    -> HTTP Trigger de prueba de Telegram
```

`marketScan` y `marketScanHttp` usan `MarketScanExecutor`, así que el pipeline cuantitativo vivo
vive en un solo lugar. `backtest` usa `BacktestEngine`, pero reutiliza los mismos analyzers,
`OpportunityService` y `RiskService` para evitar reglas paralelas.

### Cron

`marketScan` corre con la expresión configurada en:

```text
MARKET_SCAN_SCHEDULE=0 */15 14-21 * * 1-5
```

### HTTP Manual

Endpoint local:

```bash
curl "http://localhost:7071/api/market-scan?tickers=NVDA,MSFT&timeframe=15m&limit=80&notify=true"
```

POST JSON:

```bash
curl -X POST "http://localhost:7071/api/market-scan" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["NVDA","MSFT"],"timeframe":"15m","limit":80,"notify":true}'
```

Parámetros:

- `tickers`: lista opcional. Si no se manda, usa la watchlist configurada.
- `timeframe`: opcional. Ejecuta un scan manual de una sola temporalidad. Por defecto usa `MARKET_SCAN_TIMEFRAMES` o fallback a `MARKET_SCAN_TIMEFRAME`.
- `timeframes`: opcional. Lista o string CSV para ejecutar varias temporalidades en el mismo request. Si viene junto con `timeframe`, `timeframes` tiene prioridad.
- `limit`: opcional. Por defecto usa `MARKET_SCAN_CANDLE_LIMIT`.
- `notify`: opcional. Por defecto `true`.
- `capital`: opcional. Monto disponible para calcular pérdida estimada y ganancia estimada por oportunidad.
- `opportunityMinScore`: opcional. Override solo para ese request; si no viene, usa `OPPORTUNITY_MIN_SCORE`.
- `telegramNotificationMinScore`: opcional. Override solo para ese request; si no viene, usa `TELEGRAM_NOTIFICATION_MIN_SCORE`.

También se aceptan los nombres equivalentes `OPPORTUNITY_MIN_SCORE` y
`TELEGRAM_NOTIFICATION_MIN_SCORE` dentro del body o query string, útil si quieres copiar exactamente
el nombre de la variable de entorno.

La respuesta HTTP incluye `opportunityType` en `opportunities` y `notifiedSignals` para interpretar
el horizonte práctico de la señal según el `timeframe` solicitado. También incluye un `tradePlan`
porcentual basado en el `entry` y en las variables `TRADE_*`. Si envías `capital`, el trade plan
agrega pérdida/ganancia estimada y capital final esperado. `notifiedSignals` conserva su significado:
solo señales que pasan el threshold de Telegram.

Ejemplo:

```bash
curl -X POST "http://localhost:7071/api/market-scan" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["NVDA","MSFT"],"timeframe":"1d","limit":80,"notify":false,"capital":1000}'
```

Ejemplo con thresholds dinámicos solo para la corrida manual:

```bash
curl -X POST "http://localhost:7071/api/market-scan" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["NVDA","MSFT"],"timeframe":"1d","limit":80,"notify":true,"capital":1000,"opportunityMinScore":90,"telegramNotificationMinScore":90}'
```

Ejemplo multi-timeframe manual:

```bash
curl -X POST "http://localhost:7071/api/market-scan" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["NVDA"],"timeframes":["1m","5m","15m"],"limit":80,"notify":true,"capital":1000}'
```

Interpretación del tipo por temporalidad:

| Timeframe | `opportunityType` | Lectura práctica |
| --- | --- | --- |
| `1m`, `5m` | `scalping` | Entrada rápida de minutos. |
| `15m`, `30m` | `intradia` | Operación dentro del día. |
| `1h` | `swing-corto` | Movimiento de horas a pocos días. |
| `1d` | `swing` | Movimiento de días a semanas. |
| `1w` | `posicion` | Contexto amplio de semanas o meses. |

El trade plan ya no usa el target técnico `entry + risk * 2` como objetivo principal. Ahora muestra
escenarios simples sobre el capital completo:

```json
"tradePlan": {
  "entry": 351.89,
  "financialStop": {
    "percent": 1,
    "price": 348.37,
    "estimatedLoss": 10
  },
  "technicalStop": {
    "price": 340.12,
    "source": "last-candle-low"
  },
  "targets": {
    "min": {
      "percent": 2,
      "price": 358.93,
      "estimatedProfit": 20,
      "endingCapital": 1020
    },
    "max": {
      "percent": 3,
      "price": 362.45,
      "estimatedProfit": 30,
      "endingCapital": 1030
    }
  },
  "capital": 1000,
  "targetFeasibility": {
    "minTargetPercent": 2,
    "maxTargetPercent": 3,
    "assessment": "reasonable"
  }
}
```

Ese cálculo asume que usas ese capital completo en cada oportunidad individual. No reparte el capital
entre todas las oportunidades. Si no envías `capital`, se muestran los precios de entry, stop financiero,
stop técnico y targets, pero no aparecen pérdida estimada, ganancia estimada ni capital final.

Los precios usan redondeo dinámico: acciones caras suelen mostrarse con 2 decimales, mientras que
activos baratos como `DOGE-USD` conservan más decimales para que el plan sea ejecutable. Los montos
de capital, pérdida y ganancia sí se muestran con 2 decimales.

Si `notify=true` y la oportunidad pasa `TELEGRAM_NOTIFICATION_MIN_SCORE`, Telegram también incluye
la sección de trade plan con capital, stop financiero, take profits y contexto de performance cuando
está habilitado.

### WhatsApp

La función HTTP puede actuar como webhook para WhatsApp porque acepta `POST`.

Para Twilio WhatsApp, soporta `application/x-www-form-urlencoded` y lee el campo `Body`.

Ejemplo de mensaje:

```text
scan NVDA MSFT
```

O:

```text
analiza SPY,QQQ
```

Si el mensaje no trae tickers, se ejecuta con la watchlist configurada.

## Opportunity Engine

`Opportunity` representa una oportunidad de mercado, no una orden:

```ts
interface Opportunity {
  ticker: string;
  timeframe: string;
  score: number;
  trendScore: number;
  volumeScore: number;
  momentumScore: number;
  structureScore: number;
  reasons: string[];
  detectedAt: Date;
}
```

`OpportunityService` combina analyzers:

```text
score = trendScore + volumeScore + momentumScore + structureScore
max score = 100
```

Cada analyzer devuelve de `0` a `25`. En lenguaje más natural, el motor busca cuatro pistas
independientes antes de llamar algo oportunidad:

1. `Trend`: que la tendencia esté alineada, principalmente EMA20 sobre EMA50 y medias ascendentes.
2. `Volume`: que haya participación real; volumen actual por encima del promedio reciente.
3. `Momentum`: que el RSI esté constructivo, evitando zonas demasiado débiles o excesivamente extendidas.
4. `Structure`: que el precio esté rompiendo o respetando una estructura alcista reciente.

El score total máximo es `100`. A partir de V1.2 hay tres thresholds separados:

- `EVIDENCE_MIN_SCORE`: decide si el setup se guarda para investigación forward.
- `OPPORTUNITY_MIN_SCORE`: decide si entra al response `opportunities`.
- `TELEGRAM_NOTIFICATION_MIN_SCORE`: decide si además pasa a `notifiedSignals` y puede enviarse por Telegram.

La operación puede mantenerse estricta, por ejemplo `OPPORTUNITY_MIN_SCORE=90` y
`TELEGRAM_NOTIFICATION_MIN_SCORE=90`, mientras Evidence guarda silenciosamente desde `80` para poder
comparar si 80-89, 90-94 y 95-100 se comportan distinto.

## Analyzers

### TrendAnalyzer

Calcula EMA20 y EMA50.

- `25`: EMA20 sobre EMA50 y ambas ascendentes.
- `15`: tendencia moderada.
- `5`: tendencia débil.
- `0`: tendencia bajista o insuficiente.

### VolumeAnalyzer

Compara volumen actual contra promedio de las últimas 20 velas.

- `25`: mayor a 150%.
- `20`: mayor a 130%.
- `10`: mayor a 110%.
- `0`: resto.

### MomentumAnalyzer

Calcula RSI 14.

- `25`: RSI entre 55 y 70.
- `15`: RSI entre 45 y 55.
- `10`: RSI entre 70 y 80.
- `0`: resto.

### StructureAnalyzer

Detecta higher highs, higher lows y breakout de máximo de 20 velas.

- `25`: breakout confirmado.
- `15`: estructura alcista.
- `5`: consolidación.
- `0`: estructura bajista o insuficiente.

## Ranking Engine

`RankingService` ordena oportunidades de mayor a menor score:

```ts
const ranked = rankingService.rank(opportunities);
```

El objetivo es que el motor notifique primero lo mejor, no todo lo que apenas cumple una regla.

## Filtro

`OpportunityFilter` decide si una oportunidad es válida para el flujo.

Reglas actuales:

- `score >= OPPORTUNITY_MIN_SCORE`
- Sin duplicados del mismo `ticker` y `timeframe` durante `OPPORTUNITY_DUPLICATE_WINDOW_MINUTES`

`NotificationService` usa un threshold independiente para decidir si una oportunidad válida debe
entrar a `notifiedSignals` y enviarse a Telegram:

- `score >= TELEGRAM_NOTIFICATION_MIN_SCORE`

En el endpoint manual `POST /api/market-scan`, ambos thresholds pueden sobreescribirse por request
con `opportunityMinScore` y `telegramNotificationMinScore`. Ese override no cambia las variables de
entorno ni afecta ejecuciones posteriores.

Por defecto:

```text
EVIDENCE_MIN_SCORE=80
OPPORTUNITY_MIN_SCORE=50
TELEGRAM_NOTIFICATION_MIN_SCORE=80
TRADE_STOP_LOSS_PERCENT=1
TRADE_TARGET_MIN_PERCENT=2
TRADE_TARGET_MAX_PERCENT=3
BACKTEST_CONTEXT_ENABLED=true
BACKTEST_CONTEXT_MONTHS=24
PERFORMANCE_MIN_SAMPLE_SIZE=20
FORWARD_TEST_CONTEXT_ENABLED=true
FORWARD_SIGNAL_EVALUATION_SCHEDULE=0 0 * * * *
OPPORTUNITY_DUPLICATE_WINDOW_MINUTES=60
```

Ejemplo: con `OPPORTUNITY_MIN_SCORE=50` y `TELEGRAM_NOTIFICATION_MIN_SCORE=80`,
una oportunidad con score `55` aparece en `opportunities`, no aparece en `notifiedSignals`
y se reporta en `skipped` con `reason: "below-telegram-threshold"`. Una oportunidad con
score `85` aparece en ambos y, si `notify=true`, se envía por Telegram.

## Evidence / Forward Performance V1.2

Evidence es el dataset de investigación del motor. A diferencia de `opportunities` y `signals`, no
representa necesariamente algo que quieras operar; representa algo que el engine observó antes de
conocer el futuro y que vale la pena medir.

La interpretación histórica de estos cortes vive en [`EXPERIMENT_LOG.md`](./EXPERIMENT_LOG.md). Cuando una tarea futura produzca nueva evidencia experimental, cambie métricas relevantes o genere un nuevo corte de Forward Performance, revisar si corresponde agregar una nueva entrada fechada a esa bitácora. No modificar entradas históricas para hacerlas coincidir con resultados nuevos.

Flujo conceptual:

```text
score < EVIDENCE_MIN_SCORE
  -> no Evidence
  -> no Opportunity
  -> no Telegram

EVIDENCE_MIN_SCORE <= score < OPPORTUNITY_MIN_SCORE
  -> Evidence-only
  -> no Opportunity
  -> no Telegram

score >= OPPORTUNITY_MIN_SCORE
  -> Evidence
  -> Opportunity
  -> Signal/Telegram si también pasa TELEGRAM_NOTIFICATION_MIN_SCORE y notify=true
```

Con tu intención operativa actual:

```text
EVIDENCE_MIN_SCORE=80
OPPORTUNITY_MIN_SCORE=90
TELEGRAM_NOTIFICATION_MIN_SCORE=90
```

Un setup con score `85` se guarda en `market_signal_engine.evidence_signals` con
`is_operational_opportunity=false`. Un setup con score `95` se guarda con
`is_operational_opportunity=true` y sigue el flujo operativo normal.

### Tablas Evidence

- `evidence_signals`: snapshot inmutable del análisis observado: score, sub-scores, reasons, entry,
  stop técnico, stop financiero, TP1/TP2, metadata (`asset_type`, `sector`, `industry`, `market`) y
  `strategy_version`.
- `evidence_signal_evaluations`: outcome TP1/TP2, estado, MFE, MAE, candles hasta cada target y
  `evaluated_until`.
- `evidence_target_evaluations`: target ladder experimental normalizado por porcentaje.

La deduplicación de Evidence usa la misma ventana conceptual de oportunidades:
`ticker + timeframe + strategy_version` dentro de `OPPORTUNITY_DUPLICATE_WINDOW_MINUTES`. Eso evita
guardar el mismo setup cada vez que corre el Timer, pero permite guardar una observación nueva del mismo
símbolo/timeframe fuera de esa ventana.

### Target Ladder experimental

El ladder no cambia el Trade Plan ni los TP/SL operativos. Solo mide, con el `financial_stop_price`
actual, hasta dónde suelen avanzar las señales antes de tocar stop.

Niveles iniciales:

```text
+0.50%, +0.75%, +1.00%, +1.25%, +1.50%, +2.00%, +3.00%, +5.00%
```

Cada nivel se guarda en `evidence_target_evaluations` con outcome `WIN`, `LOSS`, `EXPIRED` o
`AMBIGUOUS`.

### Endpoint de performance

```bash
curl "http://localhost:7071/api/forward-performance?timeframe=15m&minimumScore=90&strategyVersion=v1"
```

Filtros soportados:

- `ticker`
- `timeframe`
- `minimumScore`
- `maximumScore`
- `scoreBucket`: `80-84`, `85-89`, `90-94`, `95-100`
- `assetType`
- `sector`
- `industry`
- `strategyVersion`
- `from`
- `to`

El response incluye `sampleSize`, `smallSample`, TP1/TP2 win rate, buckets de score, agregaciones por
dimensión, MFE/MAE promedio y mediano, expired/ambiguous rate y ladder experimental.

Expectancy experimental:

```text
historicalForwardExpectancyPercent = (Pwin × targetPercent) - (Ploss × stopLossPercent)
```

`EXPIRED` y `AMBIGUOUS` se excluyen del cálculo principal. No es promesa de rendimiento futuro; solo
resume la muestra forward observada por el engine.

Profit Factor se calcula únicamente cuando hay pérdidas resueltas suficientes para evitar una métrica
falsa. Si no puede calcularse de forma rigurosa, se devuelve `null`.

SQL útil para Evidence:

```sql
SELECT ticker, timeframe, score, is_operational_opportunity, strategy_version, detected_at
FROM market_signal_engine.evidence_signals
ORDER BY detected_at DESC
LIMIT 20;
```

Buckets de score:

```sql
SELECT
  CASE
    WHEN score BETWEEN 80 AND 84 THEN '80-84'
    WHEN score BETWEEN 85 AND 89 THEN '85-89'
    WHEN score BETWEEN 90 AND 94 THEN '90-94'
    WHEN score BETWEEN 95 AND 100 THEN '95-100'
  END AS score_bucket,
  count(*) AS sample_size
FROM market_signal_engine.evidence_signals
GROUP BY score_bucket
ORDER BY score_bucket;
```

Comparar timeframes:

```sql
SELECT timeframe, count(*) AS sample_size
FROM market_signal_engine.evidence_signals
GROUP BY timeframe
ORDER BY sample_size DESC;
```

Comparar sectores:

```sql
SELECT sector, count(*) AS sample_size
FROM market_signal_engine.evidence_signals
GROUP BY sector
ORDER BY sample_size DESC;
```


## Market scan multi-timeframe

El scan vivo puede recopilar evidencia real de varias temporalidades en paralelo lógico sin mezclar
candles ni scores entre ellas. La configuración nueva es:

```text
MARKET_SCAN_TIMEFRAMES=1m,5m,15m,1d,1w
```

Compatibilidad:

- si `MARKET_SCAN_TIMEFRAMES` existe, se usa esa lista;
- si no existe, se usa `MARKET_SCAN_TIMEFRAME` como antes;
- `MARKET_SCAN_TIMEFRAME` no se elimina para no romper configuraciones existentes.

Cada combinación `ticker + timeframe` se evalúa de forma independiente:

```text
NVDA 1m
NVDA 5m
NVDA 15m
NVDA 1d
NVDA 1w
```

La deduplicación y persistencia siguen separadas por `ticker + timeframe`, por lo que `NVDA 1m` y
`NVDA 15m` pueden producir oportunidades/señales distintas. El response HTTP conserva
`scannedTickers` y agrega `scanned`:

```json
{
  "scannedTickers": ["NVDA"],
  "scanned": [
    { "ticker": "NVDA", "timeframe": "1m" },
    { "ticker": "NVDA", "timeframe": "15m" }
  ],
  "timeframes": ["1m", "15m"]
}
```

Para proteger Yahoo Finance sin volver lentísimo el escaneo, el modo recomendado ahora es un pool de
concurrencia controlada:

```text
MARKET_DATA_MAX_CONCURRENCY=5
MARKET_DATA_BATCH_DELAY_MS=250
MARKET_DATA_MAX_RETRIES=3
MARKET_DATA_RETRY_BASE_DELAY_MS=1000
```

Con ese modo, el motor no dispara toda la matriz `ticker × timeframe` al mismo tiempo. Procesa hasta
`MARKET_DATA_MAX_CONCURRENCY` requests de datos de mercado en paralelo, aplica una pausa opcional entre
jobs del pool con `MARKET_DATA_BATCH_DELAY_MS`, y reintenta solo errores recuperables con exponential
backoff. Las combinaciones fuera de sesión se marcan como `market-closed` antes de llamar Yahoo, así que
no consumen requests reales.

`MARKET_DATA_SEQUENTIAL` y `MARKET_DATA_REQUEST_DELAY_MS` quedan deprecadas desde V1.1.1. Se conservan
solo por compatibilidad/fallback, pero el escaneo vivo usa el pool controlado.

## RiskService

`RiskService` convierte una `Opportunity` en `Signal`.

```text
Opportunity
  -> RiskService
  -> Signal
```

Reglas actuales:

- `entry = close` de la última vela.
- `stop = low` de la última vela; este valor se conserva como `technicalStop`.
- `target` técnico todavía se calcula internamente para compatibilidad, pero ya no es el objetivo
  principal mostrado al usuario.
- Los targets principales del `tradePlan` vienen de `TRADE_TARGET_MIN_PERCENT` y
  `TRADE_TARGET_MAX_PERCENT`.

Las estrategias y analyzers no crean `Signal` directamente. El score responde “qué tan bueno se ve
el setup técnico”; el `tradePlan` responde “qué pasa con mi capital si el precio cae/sube ciertos
porcentajes”.


## Configuración dinámica y universo de mercado

El motor ya no depende únicamente de variables de entorno para decidir qué analizar ni con qué
parámetros funcionales operar. Cuando `DATABASE_URL` está configurado y las migraciones fueron
ejecutadas, PostgreSQL se vuelve la fuente primaria para:

- configuración funcional del engine en `market_signal_engine.engine_config`;
- catálogo de símbolos en `market_signal_engine.market_symbols`;
- timeframes activos por símbolo en `market_signal_engine.symbol_timeframes`;
- versión funcional de estrategia mediante `ENGINE_STRATEGY_VERSION` / `engine_config`.

Las variables de entorno siguen existiendo como fallback y bootstrap. La separación queda así:

| Fuente | Responsabilidad |
| --- | --- |
| ENV | Secretos, infraestructura, schedules y fallback local. |
| PostgreSQL | Configuración funcional, universo de mercado, símbolos activos y timeframes por símbolo. |

No se guardan secretos en PostgreSQL. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DATABASE_URL`,
`AzureWebJobsStorage` y `FUNCTIONS_WORKER_RUNTIME` permanecen en variables de entorno.

Al inicio de cada scan el flujo conceptual es:

```text
scan starts
  -> load engine config snapshot
  -> load market universe snapshot
  -> build symbol/timeframe matrix
  -> skip market-closed combinations
  -> call Yahoo only when it makes sense
  -> analyze opportunities
```

El snapshot de configuración se carga una sola vez por ejecución; no se consulta `engine_config` por
ticker. Lo mismo aplica al universo de mercado.

### `engine_config`

Cada fila tiene una descripción humana para poder entenderla desde DBeaver sin abrir el código:

```sql
SELECT key, value, value_type, category, description
FROM market_signal_engine.engine_config
WHERE is_active = true
ORDER BY category, key;
```

Ejemplo para cambiar el score mínimo de oportunidades:

```sql
UPDATE market_signal_engine.engine_config
SET value = '85', updated_at = now()
WHERE key = 'OPPORTUNITY_MIN_SCORE';
```

### Universo de mercado

`market_symbols` guarda el ticker lógico del engine y `provider_symbol` guarda el símbolo que se manda
al proveedor de datos. Por ahora Yahoo es el proveedor principal y normalmente ambos valores son iguales,
pero el diseño ya permite desacoplarlos.

Ejemplo:

```sql
SELECT symbol, provider_symbol, asset_type, sector, industry, market, exchange, session_type
FROM market_signal_engine.market_symbols
WHERE is_active = true
ORDER BY symbol;
```

Para activar o desactivar un símbolo:

```sql
UPDATE market_signal_engine.market_symbols
SET is_active = false, updated_at = now()
WHERE symbol = 'NVDA';
```

Para activar o desactivar un timeframe específico:

```sql
UPDATE market_signal_engine.symbol_timeframes timeframe
SET is_active = false, updated_at = now()
FROM market_signal_engine.market_symbols symbol
WHERE timeframe.symbol_id = symbol.id
  AND symbol.symbol = 'KO'
  AND timeframe.timeframe = '1m';
```

### Market hours awareness

El motor separa `market-closed` de `stale-market-data`:

- `STOCK`/`ETF` con `session_type=US_REGULAR` en `1m`, `5m`, `15m`, `30m` o `1h` solo consultan Yahoo
  durante sesión regular de Estados Unidos: lunes a viernes, 09:30-16:00, `America/New_York`.
- `STOCK`/`ETF` en `1d` o `1w` sí pueden analizarse fuera de sesión usando la última vela cerrada.
- `CRYPTO` con `session_type=TWENTY_FOUR_SEVEN` puede analizarse 24/7; si la última vela intradía está
  vieja, seguirá apareciendo como `stale-market-data`.

Limitación actual: todavía no hay calendario bursátil completo para feriados, early close, pre-market o
after-hours. La arquitectura queda preparada para agregar un `MarketCalendarProvider` más adelante.

### Strategy version

Las señales reales y oportunidades se etiquetan con `strategy_version`. Esto permite distinguir señales
históricas generadas con reglas anteriores de señales futuras cuando cambien scoring, TP/SL u otros
parámetros.

Registros previos a esta migración quedan con `legacy` por compatibilidad. Las nuevas señales usan el
valor activo de `ENGINE_STRATEGY_VERSION`, actualmente `v1`.

Próxima evolución documentada: además de `strategy_version`, guardar un `config_version` o
`config_snapshot` completo por señal para auditoría exacta.

## Watchlists

Watchlists disponibles:

- `etfs`: VOO, XLP, XLV, VGT, SPY, QQQ
- `growth`: NVDA, AMD, META, TSLA, NFLX, MSFT
- `dividends`: KO, PG, PEP, JNJ, MCD
- `custom`: usa `MARKET_SCAN_TICKERS`

Configuración:

```text
MARKET_SCAN_WATCHLIST=etfs
MARKET_SCAN_DEBUG=false
```

Para una lista personalizada:

```text
MARKET_SCAN_WATCHLIST=custom
MARKET_SCAN_TICKERS=SPY,QQQ,AAPL,MSFT,NVDA
```

## Market Data

El proyecto usa Yahoo Finance como única fuente de datos de mercado mediante `yahoo-finance2`.
No requiere API key y el resto del motor no conoce detalles de Yahoo: solo recibe velas normalizadas
con el modelo interno `Candle`.

El puerto se mantiene simple para que el motor siga desacoplado:

```ts
interface MarketDataProvider {
  getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]>;
}
```

Flujo actual:

```text
MarketScanExecutor
  -> MarketDataService
    -> YahooFinanceClient
      -> Candle[]
```

`YahooFinanceClient` se instancia directamente en `container.ts`. La intención es mantener una sola
fuente útil y evitar código muerto o configuraciones que confundan.

Timeframes soportados por Yahoo Finance en este motor:

- Minutos: `1m`, `5m`, `15m`, `30m`
- Hora: `1h`
- Diario/semanal: `1d`, `1w`

Limitación conocida: Yahoo Finance Chart no soporta `4h` directamente en esta implementación.
Los intervalos intradía también pueden tener historia limitada, así que si pides demasiadas velas
en temporalidades pequeñas, el proveedor puede devolver menos datos de los esperados.

Para timeframes intradía, `MarketScanExecutor` valida frescura de datos con
`MARKET_DATA_MAX_AGE_MINUTES`. Si la última vela supera ese límite, el ticker se omite con
`stale-market-data`.

## Rate limits y datos de mercado

Aunque Yahoo no requiere API key, puede limitar o rechazar tráfico si se hacen demasiadas llamadas.
Desde V1.1.1 el motor usa concurrencia controlada: avanza más rápido que un scan 100% secuencial, pero
con un límite explícito para no golpear al proveedor con todos los símbolos a la vez.

Configuración recomendada:

```text
MARKET_DATA_MAX_CONCURRENCY=5
MARKET_DATA_BATCH_DELAY_MS=250
MARKET_DATA_MAX_RETRIES=3
MARKET_DATA_RETRY_BASE_DELAY_MS=1000
```

Los reintentos aplican exponential backoff para errores recuperables: `429`, `408`, `5xx`, timeouts y
fallos temporales de red. Por ejemplo, con base `1000ms`, los intentos esperan aproximadamente `1s`,
`2s` y `4s`. Errores no recuperables como símbolo inválido, delisted, not found o no data no se
reintentan.

Antes de pedir datos, el motor revisa sesión de mercado. Una acción/ETF intradía fuera de horario se
omite con `market-closed` y Yahoo no recibe request. Crypto sigue operando 24/7, y temporalidades `1d` /
`1w` de acciones/ETF se permiten fuera de sesión.

El response manual y los logs incluyen métricas de throughput:

```json
{
  "metrics": {
    "totalCombinations": 305,
    "marketClosed": 180,
    "marketDataRequests": 125,
    "successfulRequests": 122,
    "failedRequests": 3,
    "rateLimitedRequests": 1,
    "retryAttempts": 2,
    "durationMs": 274000
  }
}
```

Además se emite un resumen tipo:

```text
Market scan completed combinations=305 marketClosed=180 requests=125 success=122 failed=3 rateLimited=1 retries=2 durationMs=274000
```

`MARKET_DATA_SEQUENTIAL` y `MARKET_DATA_REQUEST_DELAY_MS` quedaron deprecadas desde V1.1.1. Si existen
en ENV no rompen el arranque, pero ya no controlan el throughput principal del market scan.

Los errores del proveedor se sanitizan antes de llegar a logs. No se imprime información sensible
ni detalles ruidosos de request; solo status, statusText, provider, endpoint, ticker, requestId si
existe, intento y mensaje resumido.


## PostgreSQL local y migraciones

Fase 2 agrega persistencia opcional para construir el dataset de Forward Testing real. El proyecto
sigue funcionando sin PostgreSQL: si `DATABASE_URL` está vacío, usa repositorios en memoria y no bloquea
Telegram.

Para levantar PostgreSQL local con Docker:

```bash
docker compose up -d postgres
```

URL local de ejemplo:

```text
DATABASE_URL=postgres://market_signal_engine:market_signal_engine_dev_password@localhost:15432/market_signal_engine
```

La contraseña anterior es solo de desarrollo local y no debe reutilizarse en producción.

Ejecutar migraciones:

```bash
npm run db:migrate
```

Las migraciones crean:

Las tablas viven en el schema `market_signal_engine`, separado de `public`:

- `market_signal_engine.opportunities`: auditoría y deduplicación persistente por ticker/timeframe.
- `market_signal_engine.signals`: snapshot inmutable de cada señal real emitida para Telegram.
- `market_signal_engine.signal_evaluations`: outcomes de señales reales evaluadas automáticamente.
- `market_signal_engine.schema_migrations`: historial de migraciones aplicadas.

`signal_evaluations.signal_id` es único para que la evaluación sea idempotente: ejecutar el Timer varias
veces actualiza la misma fila en lugar de duplicarla.

El flujo de Telegram es resiliente: si PostgreSQL falla, se registra un error seguro y la alerta se
sigue enviando.


## PostgreSQL Backups y Disaster Recovery

La protección de datos de ARGOS es intencionalmente conservadora: el backup solo lee PostgreSQL y nunca ejecuta restores automáticos. El objetivo es tener snapshots recuperables del dataset de señales/evidence sin convertir el proceso de backup en un riesgo operativo.

Se generan snapshots diarios en formato custom de PostgreSQL (`pg_dump -Fc`) dentro de:

```text
backups/YYYY/MM/DD/
  argos.dump
  manifest.json
  RESTORE.md
```

Cada snapshot incluye:

- `argos.dump`: dump custom de PostgreSQL.
- `manifest.json`: metadata auditable con versión real del servidor, versiones reales de `pg_dump`, `pg_restore` y `psql`, tamaño del archivo, SHA-256 y schema respaldado.
- `RESTORE.md`: guía de recuperación para validar checksum, inspeccionar el dump y restaurarlo primero en una base nueva de prueba.

El backup se escribe de forma atómica: primero crea `argos.dump.tmp`, valida que exista y tenga contenido, ejecuta `pg_restore --list`, calcula SHA-256 y solo entonces lo renombra a `argos.dump`. Si algo falla, no reemplaza un dump previo válido ni escribe un `manifest.json` completado.

Variables principales:

```text
DATABASE_BACKUP_ENABLED=false
DATABASE_BACKUP_SCHEDULE=0 50 5 * * *
DATABASE_BACKUP_BASE_PATH=./backups
DATABASE_BACKUP_TIMEZONE=America/Mexico_City
DATABASE_PG_DUMP_BIN=pg_dump
DATABASE_PG_RESTORE_BIN=pg_restore
DATABASE_PSQL_BIN=psql
```

Notas:

- `DATABASE_BACKUP_ENABLED=false` por default evita crear dumps diarios accidentalmente en local.
- `DATABASE_BACKUP_SCHEDULE` usa NCRONTAB de Azure Functions.
- `DATABASE_BACKUP_TIMEZONE` define el folder calendario `YYYY/MM/DD`; las versiones del servidor y herramientas se detectan en runtime, no están hardcodeadas.
- `backups/` está en `.gitignore`; los dumps no deben subirse a Git.
- En local se validó una combinación común donde PostgreSQL Server era `16.15` y las herramientas cliente `pg_dump`/`pg_restore`/`psql` eran `17.6`. Eso se documenta como referencia operativa, pero cada backup registra sus versiones reales en `manifest.json`.

Backup manual:

```bash
npm run db:backup
```

Endpoint manual:

```bash
curl -X POST http://localhost:7071/api/database-backup
```

Verificación manual sin restaurar:

```bash
npm run db:backup:verify -- backups/YYYY/MM/DD/argos.dump
```

Prueba controlada de Disaster Recovery restaurando en una base temporal y borrándola solo si todo pasa:

```bash
npm run db:backup:restore-test -- backups/YYYY/MM/DD/argos.dump
```

Verificación opcional restaurando a una base explícita de prueba:

```bash
createdb argos_restore_test
npm run db:backup:verify -- backups/YYYY/MM/DD/argos.dump --restore-to argos_restore_test
```

No existe endpoint de restore. Los restores deben ser una acción humana, deliberada y primero contra una base disposable.

Si ves un error similar a `unrecognized configuration parameter "transaction_timeout"`, normalmente significa que estás usando herramientas PostgreSQL 17 contra un servidor PostgreSQL 16. En local apunta `DATABASE_PG_RESTORE_BIN` —y de preferencia también `DATABASE_PG_DUMP_BIN`/`DATABASE_PSQL_BIN`— a los binarios de la misma versión mayor del servidor.

Cuando ARGOS viva en infraestructura cloud, el almacenamiento de dumps debe moverse fuera del filesystem de la aplicación hacia object storage / bucket / remote durable storage. Todavía no se elige proveedor cloud específico. En una etapa posterior conviene agregar política de retención, cifrado at-rest, lifecycle policy y simulacros periódicos de restore.

## Forward Signal Evaluation

Una vez que una alerta real se guarda en `market_signal_engine.signals`, el sistema la evalúa de
forma automática hasta conocer su resultado. El flujo normal no depende de un endpoint manual:

```text
Signal real generada
  -> signals PostgreSQL
  -> Timer forwardSignalEvaluation cada hora
  -> Yahoo Finance candles posteriores a signalAt
  -> TradeOutcomeEvaluator
  -> signal_evaluations UPSERT
```

El Timer usa la variable:

```text
FORWARD_SIGNAL_EVALUATION_SCHEDULE=0 0 * * * *
```

En NCRONTAB de Azure Functions significa: segundo `0`, minuto `0`, cada hora.

Signals pendientes:

- señales sin fila en `signal_evaluations`;
- señales con `status = OPEN`;
- señales con `status = PARTIALLY_RESOLVED`.

No se reevalúan señales terminales con `CLOSED`, `EXPIRED` o `AMBIGUOUS`.

El evaluator usa siempre el snapshot inmutable guardado en `signals`; no recalcula score, entry, stop
ni targets. Para V1 evalúa contra `financial_stop_price`, no contra `technical_stop_price`.

Timeframe de seguimiento preferido:

| Timeframe de señal | Seguimiento preferido | Fallbacks |
| --- | --- | --- |
| `1m` | `1m` | `5m`, `15m`, `1d` |
| `5m` | `5m` | `15m`, `1d` |
| `15m` | `15m` | `30m`, `1h`, `1d` |
| `30m` | `15m` | `30m`, `1h`, `1d` |
| `1h` | `15m` | `30m`, `1h`, `1d` |
| `1d` | `15m` | `30m`, `1h`, `1d` |
| `1w` | `1d` | `1w` |

La intención es mejorar la precisión para saber qué ocurrió primero entre stop, TP1 y TP2. Si Yahoo
no entrega datos suficientes en el timeframe preferido, se intenta el siguiente fallback. Si no hay
datos posteriores reales, no se inventa resultado.

Estados:

- `OPEN`: no se resolvió TP1 ni TP2 y todavía no llegó `expiresAt`.
- `PARTIALLY_RESOLVED`: un target ya tiene outcome y el otro sigue pendiente antes de expirar.
- `CLOSED`: ambos targets resolvieron como `WIN`/`LOSS`.
- `EXPIRED`: se alcanzó `expiresAt` y al menos un target pendiente expiró.
- `AMBIGUOUS`: una candle OHLC tocó stop y target sin poder conocer el orden intravela.

Endpoint manual de desarrollo/debug:

```bash
curl -X POST "http://localhost:7071/api/forward-evaluate" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Filtrar por ticker:

```bash
curl -X POST "http://localhost:7071/api/forward-evaluate" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"UBER"}'
```

Filtrar por señal específica:

```bash
curl -X POST "http://localhost:7071/api/forward-evaluate" \
  -H "Content-Type: application/json" \
  -d '{"signalId":"00000000-0000-0000-0000-000000000000"}'
```

SQL útil:

```sql
SELECT
  s.id,
  s.ticker,
  s.timeframe,
  s.signal_at,
  s.entry,
  s.financial_stop_price,
  s.tp1_price,
  s.tp2_price,
  e.status,
  e.outcome_tp1,
  e.outcome_tp2,
  e.exit_at_tp1,
  e.exit_at_tp2,
  e.max_favorable_excursion_percent,
  e.max_adverse_excursion_percent,
  e.evaluated_until
FROM market_signal_engine.signals s
LEFT JOIN market_signal_engine.signal_evaluations e ON e.signal_id = s.id
ORDER BY s.signal_at DESC
LIMIT 50;
```

## Persistencia

Contratos:

- `OpportunityRepository`
- `SignalRepository`

Implementaciones actuales:

- `OpportunityMemoryRepository`
- `SignalRepository`

Para PostgreSQL, agrega implementaciones como `PostgresOpportunityRepository` y `PostgresSignalRepository` respetando los contratos.

## Signal Intelligence

Las alertas de Telegram ahora se presentan en tres capas separadas para evitar confundir conceptos:

```text
Score actual ≠ win rate histórico ≠ forward-test win rate
```

### 1. Current Setup

Es el setup técnico actual. Resume ticker, timeframe, score total y los cuatro componentes del motor:
`Trend`, `Volume`, `Momentum` y `Structure`. Este score responde:

```text
¿Qué tan bien cumple el setup actual nuestras reglas técnicas?
```

No es una probabilidad de ganar.

### 2. Historical Backtest

Cuando `BACKTEST_CONTEXT_ENABLED=true`, el motor intenta adjuntar un resumen histórico comparable a la
señal actual usando el mismo ticker, timeframe, threshold comparable y ventana configurada por
`BACKTEST_CONTEXT_MONTHS`.

Para V1, el contexto histórico se obtiene mediante `HistoricalPerformanceProvider`, cuya implementación
actual puede usar `BacktestEngine` y cachea resultados en memoria por `ticker/timeframe/threshold/meses`.
Esto mantiene `NotificationService` desacoplado del backtester y deja preparada una futura lectura desde
PostgreSQL o resultados precalculados.

La sección muestra siempre el tamaño de muestra:

```text
📊 BACKTEST
NVDA · 15m · Score ≥80

143 casos históricos

🎯 TP +2%: 71%
🚀 TP +3%: 54%

📈 MFE promedio: +3.40%
📉 MAE promedio: -0.60%
```

Los porcentajes salen del backtesting con:

```text
wins / (wins + losses) * 100
```

No se incluyen `EXPIRED` ni `AMBIGUOUS` como wins/losses. Si hay menos casos que
`PERFORMANCE_MIN_SAMPLE_SIZE`, la alerta muestra `⚠️ Muestra pequeña`. Si Yahoo o el backtest no
tienen datos suficientes, muestra `Datos históricos insuficientes` y no inventa estadísticas.

### 3. Forward Test

Cuando `FORWARD_TEST_CONTEXT_ENABLED=true`, Telegram reserva una tercera capa para resultados de señales
reales emitidas por el bot y evaluadas posteriormente. Esto no es backtesting: son alertas reales que el
sistema habría guardado en operación viva.

Aunque las señales reales ya se guardan y se evalúan automáticamente en PostgreSQL, todavía no existe
un `PostgresForwardPerformanceProvider` para convertir esas evaluaciones en métricas agregadas dentro
del mensaje de Telegram. Por ahora la sección sigue usando `EmptyForwardPerformanceProvider` y muestra:

```text
🧪 FORWARD TEST
Pendiente de recopilar señales reales
```

La interfaz queda lista para que una implementación PostgreSQL lea señales reales sin modificar
`NotificationService`.

Historical performance does not guarantee future results.

## Telegram

`NotificationService` acepta `Signal` y opcionalmente `Opportunity`. Si `TELEGRAM_ENABLED=true`
y existen `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`, envía el mensaje real por Telegram.
Si falta configuración o Telegram responde con error, el escaneo no falla y el mensaje se escribe en consola.

Cuando recibe ambas entidades, envía un formato enriquecido:

```text
🚨 MARKET SIGNAL

🟢 NVDA · 15m
⭐ Score: 87/100

📈 Trend: 25/25
📊 Volume: 22/25
⚡ Momentum: 20/25
🏗 Structure: 20/25

────────────────────

✅ EMA20 sobre EMA50 y ambas ascendentes
✅ RSI14 en zona constructiva (51.26)
✅ Higher highs y higher lows

────────────────────

💰 TRADE PLAN

Capital: $1,000.00
Entry: $359.91

🛑 -1% → $356.31
Pérdida estimada: -$10.00

🎯 +2% → $367.11
Ganancia estimada: +$20.00

🚀 +3% → $370.71
Ganancia estimada: +$30.00

────────────────────

📊 BACKTEST
NVDA · 15m · Score ≥80

143 casos históricos

🎯 TP +2%: 71%
🚀 TP +3%: 54%

📈 MFE promedio: +3.40%
📉 MAE promedio: -0.60%

────────────────────

🧪 FORWARD TEST
Pendiente de recopilar señales reales
```

### Crear Bot

1. Abre Telegram y busca `@BotFather`.
2. Envía `/newbot`.
3. Sigue las instrucciones y copia el token entregado.
4. Configura el token como `TELEGRAM_BOT_TOKEN`.

### Obtener Chat ID

1. Escribe un mensaje a tu bot desde Telegram.
2. Abre en el navegador:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
```

3. Busca `chat.id` en la respuesta y configúralo como `TELEGRAM_CHAT_ID`.
4. No compartas ni subas el token; `local.settings.json` está ignorado por git.

### Configuración Telegram

```json
{
  "Values": {
    "TELEGRAM_ENABLED": "true",
    "TELEGRAM_BOT_TOKEN": "123456:token",
    "TELEGRAM_CHAT_ID": "123456789"
  }
}
```

### Probar Telegram

Con Azure Functions corriendo:

```bash
curl "http://localhost:7071/api/telegram-test"
```

También acepta `POST`:

```bash
curl -X POST "http://localhost:7071/api/telegram-test"
```

Debe enviar:

```text
✅ market-signal-engine conectado a Telegram
```

### Notificar Señales

El escaneo HTTP notifica por defecto. También puedes forzarlo:

```bash
curl "http://localhost:7071/api/market-scan?tickers=NVDA,MSFT&timeframe=15m&limit=80&notify=true"
```

## Backtesting V1

El proyecto incluye un endpoint independiente para simular cómo se habría comportado el motor en
un periodo histórico sin modificar el flujo de producción:

```text
POST /api/backtest
```

Ejemplo:

```bash
curl -X POST "http://localhost:7071/api/backtest" \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": ["NVDA"],
    "timeframe": "1d",
    "from": "2024-01-01",
    "to": "2026-08-01",
    "minimumScore": 80,
    "stopLossPercent": 1,
    "takeProfitMinPercent": 2,
    "takeProfitMaxPercent": 3,
    "includeTrades": true
  }'
```

El backtest responde dos preguntas distintas:

1. Si la estrategia tuvo buen desempeño en todo el periodo solicitado.
2. Si la estrategia ha funcionado recientemente, mediante ventanas comparativas.

El backtest reutiliza exactamente la misma lógica de producción para calcular `Trend`, `Volume`,
`Momentum`, `Structure`, `Score`, `Opportunity` y el `entry` vía `RiskService`. No existen analyzers
especiales para backtesting y no se modifica el scoring del motor vivo.

### Regla anti look-ahead bias

Para cada vela histórica `i`, el motor solo analiza:

```text
candles[0..i]
```

Las velas futuras `candles[i+1..N]` solo se usan después de crear la señal histórica, exclusivamente
para evaluar si se alcanzó stop loss o take profit. Esto evita que el backtest use información que
en la vida real no habría existido al momento de alertar.

### Cuándo nace una operación histórica

Una operación simulada nace cuando:

```text
score >= minimumScore
```

Para no contar varias veces el mismo movimiento, el engine no abre una nueva operación para el mismo
`ticker + timeframe` mientras exista una operación activa. La siguiente señal puede abrirse cuando
la anterior termina como `WIN`, `LOSS`, `EXPIRED` o `AMBIGUOUS`.

### Niveles simulados

Para señales `LONG`, el backtest calcula niveles porcentuales desde el `entry`:

```text
stopLoss = entry * (1 - stopLossPercent / 100)
tp1      = entry * (1 + takeProfitMinPercent / 100)
tp2      = entry * (1 + takeProfitMaxPercent / 100)
```

Ejemplo con `entry=100`, `stopLossPercent=1`, `takeProfitMinPercent=2` y
`takeProfitMaxPercent=3`:

```text
SL  = 99
TP1 = 102
TP2 = 103
```

TP1 y TP2 se evalúan de forma independiente. Por eso puede existir un trade donde TP1 sea `WIN`
y TP2 sea `LOSS` si el precio toca +2% primero y después cae al stop antes de llegar a +3%.

### Outcomes

Cada target puede terminar como:

| Outcome | Significado |
| --- | --- |
| `WIN` | El target se alcanzó antes que el stop. |
| `LOSS` | El stop se alcanzó antes que el target. |
| `EXPIRED` | No tocó ni stop ni target dentro de la ventana máxima. |
| `AMBIGUOUS` | La misma vela tocó stop y target; con OHLC no sabemos qué ocurrió primero. |

`AMBIGUOUS` no cuenta automáticamente como win ni como loss. El `winRate` principal usa:

```text
wins / (wins + losses) * 100
```

`EXPIRED` y `AMBIGUOUS` quedan fuera del denominador principal, pero sí aparecen en el resumen.

### Ventanas máximas por timeframe

Defaults iniciales:

| Timeframe | Ventana máxima del trade |
| --- | --- |
| `1m` | 1 día |
| `5m` | 2 días |
| `15m` | 3 días |
| `30m` | 5 días |
| `1h` | 10 días |
| `1d` | 45 días |
| `1w` | 180 días |

Estas ventanas viven desacopladas en `BacktestEngine`, para poder ajustarlas después sin reescribir
la lógica de evaluación.

### MFE y MAE

Cada trade incluye:

- `maxFavorableExcursionPercent`: máximo movimiento favorable mientras el trade estuvo activo.
- `maxAdverseExcursionPercent`: máximo movimiento adverso mientras el trade estuvo activo.

Esto sirve para revisar si los niveles `SL -1%`, `TP +2%` y `TP +3%` son razonables para cada
temporalidad y activo.

### Respuesta resumida

El response incluye un resumen del periodo completo y ventanas recientes:

```json
{
  "fullPeriod": {
    "totalSignals": 52,
    "tp1": { "wins": 35, "losses": 10, "winRate": 77.78 },
    "tp2": { "wins": 28, "losses": 15, "winRate": 65.12 },
    "averageScore": 86.4,
    "averageMfePercent": 4.15,
    "averageMaePercent": -0.62
  },
  "windows": {
    "fullPeriod": { "signals": 52, "tp1WinRate": 77.78, "tp2WinRate": 65.12 },
    "last12Months": { "signals": 24, "tp1WinRate": 75, "tp2WinRate": 62.5 },
    "last6Months": { "signals": 11, "tp1WinRate": 72.73, "tp2WinRate": 54.55 },
    "last30Days": { "signals": 2, "tp1WinRate": 100, "tp2WinRate": 50 },
    "last7Days": { "signals": 0, "tp1WinRate": 0, "tp2WinRate": 0 }
  }
}
```

Las ventanas pequeñas siempre deben leerse con cuidado. Un `last7Days` con 1 o 2 señales no es
estadísticamente fuerte; por eso el response siempre incluye `signals` junto al win rate.

### Trades individuales

Si `includeTrades=true`, el response incluye operaciones simuladas individuales con `signalAt`,
`entry`, `stopLoss`, `takeProfit1`, `takeProfit2`, outcomes, fechas de salida, velas transcurridas,
MFE y MAE. Esto permite revisar literalmente algo como:

```text
El motor habría alertado NVDA el 24-Jul; TP1 se alcanzó dos velas después.
```

### Backtesting vs Forward Testing

`Backtesting` simula qué habría ocurrido si el motor hubiera existido históricamente.

`Forward Testing` guardará señales realmente generadas en vivo y evaluará después qué pasó. Esa fase
no está implementada todavía; los modelos actuales ya separan `signalAt`, `ticker`, `timeframe`,
`score`, `entry`, `SL`, `TP1` y `TP2` para facilitar persistencia futura.

## Legacy StrategyService

`BreakoutStrategy` se conserva por compatibilidad y está marcada como legacy mediante su nombre:

```text
legacy-breakout-20-volume-confirmation
```

La ruta principal nueva es cuantitativa:

```text
MarketData
  -> Analyzers
  -> Opportunity
  -> Ranking
  -> Filter
  -> Risk
  -> Signal
```

## Configuración Local

```bash
cp local.settings.json.example local.settings.json
npm install
npm run build
npm start
```

`npm start` usa `func start`, por lo que necesitas Azure Functions Core Tools v4 instalado.

Variables principales:

```text
DATABASE_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ENABLED=true
MARKET_SCAN_SCHEDULE=0 */15 14-21 * * 1-5
MARKET_SCAN_WATCHLIST=custom
MARKET_SCAN_TICKERS=SPY,QQQ,AAPL,MSFT,NVDA
MARKET_SCAN_TIMEFRAME=15m
MARKET_SCAN_TIMEFRAMES=1m,5m,15m,1d,1w
MARKET_SCAN_CANDLE_LIMIT=80
MARKET_DATA_MAX_AGE_MINUTES=30
MARKET_DATA_MAX_CONCURRENCY=5
MARKET_DATA_BATCH_DELAY_MS=250
MARKET_DATA_MAX_RETRIES=3
MARKET_DATA_RETRY_BASE_DELAY_MS=1000
MARKET_DATA_REQUEST_DELAY_MS=13000 # deprecated
MARKET_DATA_SEQUENTIAL=true # deprecated
OPPORTUNITY_MIN_SCORE=50
TELEGRAM_NOTIFICATION_MIN_SCORE=80
EVIDENCE_MIN_SCORE=80
TRADE_STOP_LOSS_PERCENT=1
TRADE_TARGET_MIN_PERCENT=2
TRADE_TARGET_MAX_PERCENT=3
BACKTEST_CONTEXT_ENABLED=true
BACKTEST_CONTEXT_MONTHS=24
PERFORMANCE_MIN_SAMPLE_SIZE=20
FORWARD_TEST_CONTEXT_ENABLED=true
FORWARD_SIGNAL_EVALUATION_SCHEDULE=0 0 * * * *
OPPORTUNITY_DUPLICATE_WINDOW_MINUTES=60
```

### Variables De Entorno

| Variable                               | Descripción corta                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AzureWebJobsStorage`                  | Storage usado por Azure Functions local/deploy. En local puede ser `UseDevelopmentStorage=true`. |
| `FUNCTIONS_WORKER_RUNTIME`             | Runtime de Azure Functions. Debe ser `node`.                                                     |
| `DATABASE_URL`                         | URL de PostgreSQL para persistir señales reales y evaluaciones forward.                          |
| `DATABASE_BACKUP_ENABLED`              | Activa/desactiva el Timer diario de backup PostgreSQL; default `false`.                          |
| `DATABASE_BACKUP_SCHEDULE`             | Cron NCRONTAB del Timer `dailyDatabaseBackup`; default `0 50 5 * * *`.                           |
| `DATABASE_BACKUP_BASE_PATH`            | Directorio base donde se escriben snapshots locales; default `./backups`.                        |
| `DATABASE_BACKUP_TIMEZONE`             | Timezone usada para carpetas `YYYY/MM/DD`; default `America/Mexico_City`.                        |
| `DATABASE_PG_DUMP_BIN`                 | Binario de `pg_dump`; permite apuntar a una versión compatible con el servidor.                   |
| `DATABASE_PG_RESTORE_BIN`              | Binario de `pg_restore`; útil para restore-test con la misma versión mayor del servidor.          |
| `DATABASE_PSQL_BIN`                    | Binario de `psql` usado para registrar versión de tooling en el manifest.                        |
| `TELEGRAM_BOT_TOKEN`                   | Token del bot de Telegram creado con BotFather. No debe subirse a git.                           |
| `TELEGRAM_CHAT_ID`                     | Chat o usuario destino para recibir notificaciones de Telegram.                                  |
| `TELEGRAM_ENABLED`                     | Activa/desactiva envío real por Telegram; si está apagado, cae a consola.                        |
| `MARKET_SCAN_SCHEDULE`                 | Cron del Timer Trigger `marketScan`.                                                             |
| `MARKET_SCAN_TIMEFRAMES`               | Lista CSV de temporalidades para el scan vivo; si no existe, se usa `MARKET_SCAN_TIMEFRAME`.     |
| `FORWARD_SIGNAL_EVALUATION_SCHEDULE`   | Cron NCRONTAB del Timer `forwardSignalEvaluation`; default cada hora: `0 0 * * * *`.             |
| `MARKET_SCAN_TICKERS`                  | Tickers usados cuando `MARKET_SCAN_WATCHLIST=custom`.                                            |
| `MARKET_SCAN_TIMEFRAME`                | Temporalidad por defecto para pedir velas, por ejemplo `15m`.                                    |
| `MARKET_SCAN_CANDLE_LIMIT`             | Número de velas útiles que el motor espera analizar por ticker.                                  |
| `MARKET_SCAN_WATCHLIST`                | Watchlist a usar: `custom`, `etfs`, `growth` o `dividends`.                                      |
| `MARKET_SCAN_DEBUG`                    | Habilita logs debug seguros de escaneo y datos de mercado.                                       |
| `MARKET_DATA_MAX_AGE_MINUTES`          | Edad máxima permitida para la última vela en timeframes intradía.                                |
| `MARKET_DATA_MAX_CONCURRENCY`          | Máximo de requests simultáneos al proveedor de datos durante el market scan.                     |
| `MARKET_DATA_BATCH_DELAY_MS`           | Pausa opcional entre jobs del pool; `0` la desactiva.                                            |
| `MARKET_DATA_MAX_RETRIES`              | Número máximo de reintentos para errores recuperables del proveedor.                             |
| `MARKET_DATA_RETRY_BASE_DELAY_MS`      | Delay base para exponential backoff de rate limit, 5xx y timeouts.                               |
| `MARKET_DATA_REQUEST_DELAY_MS`         | Deprecated: delay secuencial antiguo, conservado solo por compatibilidad.                        |
| `MARKET_DATA_SEQUENTIAL`               | Deprecated: modo secuencial antiguo, conservado solo por compatibilidad.                         |
| `ENGINE_STRATEGY_VERSION`               | Versión funcional usada para etiquetar señales nuevas; si PostgreSQL está activo vive en `engine_config`. |
| `OPPORTUNITY_MIN_SCORE`                | Score mínimo para considerar válida una oportunidad.                                             |
| `TELEGRAM_NOTIFICATION_MIN_SCORE`      | Score mínimo para incluir una señal en `notifiedSignals` y enviar Telegram si `notify=true`.     |
| `EVIDENCE_MIN_SCORE`                   | Score mínimo para capturar Evidence de investigación sin cambiar thresholds operativos.          |
| `TRADE_STOP_LOSS_PERCENT`             | Caída porcentual desde entry usada para calcular stop financiero y pérdida estimada.             |
| `TRADE_TARGET_MIN_PERCENT`             | Primer escenario de take profit porcentual sobre entry.                                          |
| `TRADE_TARGET_MAX_PERCENT`             | Segundo escenario de take profit; debe ser mayor que `TRADE_TARGET_MIN_PERCENT`.                 |
| `BACKTEST_CONTEXT_ENABLED`             | Activa/desactiva la sección `📊 BACKTEST` en alertas Telegram.                                   |
| `BACKTEST_CONTEXT_MONTHS`              | Meses de historia usados para buscar setups comparables en el contexto histórico.                 |
| `PERFORMANCE_MIN_SAMPLE_SIZE`          | Muestra mínima esperada antes de advertir `⚠️ Muestra pequeña`.                                  |
| `FORWARD_TEST_CONTEXT_ENABLED`         | Activa/desactiva la sección `🧪 FORWARD TEST` en el mensaje enriquecido.                         |
| `OPPORTUNITY_DUPLICATE_WINDOW_MINUTES` | Ventana para evitar duplicados por ticker/timeframe.                                             |
| `SCORING_MAX_ANALYZER_SCORE`           | Score máximo esperado por analyzer.                                                              |
| `TREND_EMA_FAST_PERIOD`                | Periodo de EMA rápida para `TrendAnalyzer`.                                                      |
| `TREND_EMA_SLOW_PERIOD`                | Periodo de EMA lenta para `TrendAnalyzer`.                                                       |
| `VOLUME_LOOKBACK_PERIOD`               | Velas usadas para calcular volumen promedio.                                                     |
| `VOLUME_STRONG_RATIO`                  | Ratio de volumen para score fuerte.                                                              |
| `VOLUME_MODERATE_RATIO`                | Ratio de volumen para score moderado.                                                            |
| `VOLUME_WEAK_RATIO`                    | Ratio de volumen para score débil.                                                               |
| `MOMENTUM_RSI_PERIOD`                  | Periodo RSI usado por `MomentumAnalyzer`.                                                        |
| `MOMENTUM_RSI_IDEAL_MIN`               | Límite inferior del rango RSI ideal.                                                             |
| `MOMENTUM_RSI_IDEAL_MAX`               | Límite superior del rango RSI ideal.                                                             |
| `MOMENTUM_RSI_NEUTRAL_MIN`             | Límite inferior del rango RSI neutral.                                                           |
| `MOMENTUM_RSI_NEUTRAL_MAX`             | Límite superior del rango RSI neutral.                                                           |
| `MOMENTUM_RSI_EXTENDED_MAX`            | Máximo RSI considerado extendido pero todavía puntuable.                                         |
| `STRUCTURE_LOOKBACK_PERIOD`            | Velas usadas para evaluar estructura/breakout.                                                   |

## Scripts

```bash
npm run build
npm test
npm run lint
npm run format
npm start
```

## Agregar un Analyzer

1. Implementa `Analyzer`.
2. Devuelve un score entre `0` y `25`.
3. Agrega razones en el servicio que lo componga.
4. Inyecta el analyzer en `OpportunityService`.

```ts
class VolatilityAnalyzer implements Analyzer {
  analyze(candles: Candle[]): number {
    return 0;
  }
}
```

## Agregar una Estrategia Futura

Para reglas discretas todavía existe `TradingStrategy`, pero el camino recomendado es crear analyzers independientes y combinarlos en una oportunidad rankeable.

Esto mantiene el sistema extensible: puedes agregar momentum, volatilidad, fuerza relativa, short interest, earnings proximity o breadth sin reescribir el pipeline.
