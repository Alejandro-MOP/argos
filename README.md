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
- `timeframe`: opcional. Por defecto usa `MARKET_SCAN_TIMEFRAME`.
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

El score total máximo es `100`. `OPPORTUNITY_MIN_SCORE` decide si la oportunidad entra al response
`opportunities`; `TELEGRAM_NOTIFICATION_MIN_SCORE` decide si además pasa a `notifiedSignals` y puede
ser enviada por Telegram.

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
OPPORTUNITY_MIN_SCORE=50
TELEGRAM_NOTIFICATION_MIN_SCORE=80
TRADE_STOP_LOSS_PERCENT=1
TRADE_TARGET_MIN_PERCENT=2
TRADE_TARGET_MAX_PERCENT=3
BACKTEST_CONTEXT_ENABLED=true
BACKTEST_CONTEXT_MONTHS=24
PERFORMANCE_MIN_SAMPLE_SIZE=20
FORWARD_TEST_CONTEXT_ENABLED=true
OPPORTUNITY_DUPLICATE_WINDOW_MINUTES=60
```

Ejemplo: con `OPPORTUNITY_MIN_SCORE=50` y `TELEGRAM_NOTIFICATION_MIN_SCORE=80`,
una oportunidad con score `55` aparece en `opportunities`, no aparece en `notifiedSignals`
y se reporta en `skipped` con `reason: "below-telegram-threshold"`. Una oportunidad con
score `85` aparece en ambos y, si `notify=true`, se envía por Telegram.

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
Por eso el motor procesa tickers de forma secuencial por defecto, aplica un delay entre peticiones
y reintenta errores 429 con backoff exponencial.

Configuración recomendada:

```text
MARKET_DATA_SEQUENTIAL=true
MARKET_DATA_REQUEST_DELAY_MS=13000
MARKET_DATA_MAX_RETRIES=3
MARKET_DATA_RETRY_BASE_DELAY_MS=30000
```

Con esa configuración los reintentos esperan aproximadamente `30s`, `60s` y `120s`.
Si usas `MARKET_DATA_SEQUENTIAL=false`, las llamadas al proveedor se ejecutan en paralelo y pueden
provocar 429 con mayor facilidad.

Los errores del proveedor se sanitizan antes de llegar a logs. No se imprime información sensible
ni detalles ruidosos de request; solo status, statusText, provider, endpoint, ticker, requestId si
existe y mensaje resumido.


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
- `market_signal_engine.signal_evaluations`: tabla preparada para outcomes futuros del Forward Evaluator.
- `market_signal_engine.schema_migrations`: historial de migraciones aplicadas.

El flujo de Telegram es resiliente: si PostgreSQL falla, se registra un error seguro y la alerta se
sigue enviando.

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

Como todavía no existe persistencia PostgreSQL para forward testing, V1 usa `ForwardPerformanceProvider`
con una implementación `EmptyForwardPerformanceProvider`. Por eso hoy la sección muestra:

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
MARKET_SCAN_CANDLE_LIMIT=80
MARKET_DATA_MAX_AGE_MINUTES=30
MARKET_DATA_REQUEST_DELAY_MS=13000
MARKET_DATA_MAX_RETRIES=3
MARKET_DATA_RETRY_BASE_DELAY_MS=30000
MARKET_DATA_SEQUENTIAL=true
OPPORTUNITY_MIN_SCORE=50
TELEGRAM_NOTIFICATION_MIN_SCORE=80
TRADE_STOP_LOSS_PERCENT=1
TRADE_TARGET_MIN_PERCENT=2
TRADE_TARGET_MAX_PERCENT=3
BACKTEST_CONTEXT_ENABLED=true
BACKTEST_CONTEXT_MONTHS=24
PERFORMANCE_MIN_SAMPLE_SIZE=20
FORWARD_TEST_CONTEXT_ENABLED=true
OPPORTUNITY_DUPLICATE_WINDOW_MINUTES=60
```

### Variables De Entorno

| Variable                               | Descripción corta                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AzureWebJobsStorage`                  | Storage usado por Azure Functions local/deploy. En local puede ser `UseDevelopmentStorage=true`. |
| `FUNCTIONS_WORKER_RUNTIME`             | Runtime de Azure Functions. Debe ser `node`.                                                     |
| `DATABASE_URL`                         | URL de PostgreSQL reservada para futuras implementaciones persistentes.                          |
| `TELEGRAM_BOT_TOKEN`                   | Token del bot de Telegram creado con BotFather. No debe subirse a git.                           |
| `TELEGRAM_CHAT_ID`                     | Chat o usuario destino para recibir notificaciones de Telegram.                                  |
| `TELEGRAM_ENABLED`                     | Activa/desactiva envío real por Telegram; si está apagado, cae a consola.                        |
| `MARKET_SCAN_SCHEDULE`                 | Cron del Timer Trigger `marketScan`.                                                             |
| `MARKET_SCAN_TICKERS`                  | Tickers usados cuando `MARKET_SCAN_WATCHLIST=custom`.                                            |
| `MARKET_SCAN_TIMEFRAME`                | Temporalidad por defecto para pedir velas, por ejemplo `15m`.                                    |
| `MARKET_SCAN_CANDLE_LIMIT`             | Número de velas útiles que el motor espera analizar por ticker.                                  |
| `MARKET_SCAN_WATCHLIST`                | Watchlist a usar: `custom`, `etfs`, `growth` o `dividends`.                                      |
| `MARKET_SCAN_DEBUG`                    | Habilita logs debug seguros de escaneo y datos de mercado.                                       |
| `MARKET_DATA_MAX_AGE_MINUTES`          | Edad máxima permitida para la última vela en timeframes intradía.                                |
| `MARKET_DATA_REQUEST_DELAY_MS`         | Delay entre requests secuenciales al proveedor de mercado.                                       |
| `MARKET_DATA_MAX_RETRIES`              | Número máximo de reintentos cuando el proveedor responde 429.                                    |
| `MARKET_DATA_RETRY_BASE_DELAY_MS`      | Delay base para backoff exponencial de rate limit.                                               |
| `MARKET_DATA_SEQUENTIAL`               | Si es `true`, escanea tickers uno por uno para reducir 429.                                      |
| `OPPORTUNITY_MIN_SCORE`                | Score mínimo para considerar válida una oportunidad.                                             |
| `TELEGRAM_NOTIFICATION_MIN_SCORE`      | Score mínimo para incluir una señal en `notifiedSignals` y enviar Telegram si `notify=true`.     |
| `TRADE_STOP_LOSS_PERCENT`             | Caída porcentual desde entry usada para calcular stop financiero y pérdida estimada.             |
| `TRADE_TARGET_MIN_PERCENT`             | Primer escenario de take profit porcentual sobre entry.                                          |
| `TRADE_TARGET_MAX_PERCENT`             | Segundo escenario de take profit; debe ser mayor que `TRADE_TARGET_MIN_PERCENT`.                 |
| `BACKTEST_CONTEXT_ENABLED`             | Activa/desactiva la sección `📊 BACKTEST` en alertas Telegram.                                   |
| `BACKTEST_CONTEXT_MONTHS`              | Meses de historia usados para buscar setups comparables en el contexto histórico.                 |
| `PERFORMANCE_MIN_SAMPLE_SIZE`          | Muestra mínima esperada antes de advertir `⚠️ Muestra pequeña`.                                  |
| `FORWARD_TEST_CONTEXT_ENABLED`         | Activa/desactiva la sección `🧪 FORWARD TEST`; hoy queda pendiente hasta tener persistencia real. |
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
