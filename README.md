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
    FinnhubClient.ts
    PolygonClient.ts
    TelegramClient.ts
  config/
    env.ts
  functions/
    marketScan/
    marketScanHttp/
    telegramTest/
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

Los detalles externos, como Polygon, Telegram o PostgreSQL, viven detrás de interfaces. Cambiar proveedor de datos no requiere tocar la lógica de trading.

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
7. Convierte `Opportunity` en `Signal` con `RiskService`.
8. Persiste oportunidad y señal en memoria.
9. Notifica la señal.

## Azure Functions

El proyecto expone dos entradas para el mismo motor:

```text
marketScan      -> Timer Trigger / cron
marketScanHttp  -> HTTP Trigger manual o webhook
```

Ambas usan `MarketScanExecutor`, así que el pipeline cuantitativo vive en un solo lugar.

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

Cada analyzer devuelve de `0` a `25`.

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

Por defecto:

```text
OPPORTUNITY_MIN_SCORE=50
TELEGRAM_NOTIFICATION_MIN_SCORE=80
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
- `stop = low` de la última vela.
- `target = entry + risk * 2`.
- Relación riesgo/beneficio mínima esperada: 1:2.

Las estrategias y analyzers no crean `Signal` directamente.

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

## Market Data Providers

`MarketDataProvider` permite cambiar proveedor de datos sin tocar la lógica de trading:

```ts
interface MarketDataProvider {
  getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]>;
}
```

El motor usa una arquitectura multiproveedor:

```text
MarketScanExecutor
  -> MarketDataService
    -> MarketDataProvider
      -> PolygonClient | FinnhubClient
```

La selección se hace únicamente en `container.ts` mediante inyección de dependencias. El resto
del motor (`TrendAnalyzer`, `VolumeAnalyzer`, `MomentumAnalyzer`, `StructureAnalyzer`,
`RiskService`, `NotificationService`, `MarketScanExecutor`) solo recibe `Candle[]` y no conoce
qué proveedor se está usando.

Proveedores disponibles:

- `polygon`: usa Polygon Aggregates API. Requiere `POLYGON_API_KEY`.
- `finnhub`: usa Finnhub Stock Candles API. Requiere `FINNHUB_API_KEY`.

Para cambiar de proveedor:

```text
MARKET_DATA_PROVIDER=polygon
```

o:

```text
MARKET_DATA_PROVIDER=finnhub
```

Para agregar un tercer proveedor:

1. Crea un cliente que implemente `MarketDataProvider`.
2. Mapea la respuesta externa al modelo interno `Candle`.
3. Devuelve las velas en orden cronológico ascendente.
4. Agrega la rama de construcción en `container.ts`.
5. Mantén las API keys y detalles externos dentro del cliente, nunca en el motor.

Para timeframes intradía, `MarketScanExecutor` valida frescura de datos con
`MARKET_DATA_MAX_AGE_MINUTES`. Si la última vela supera ese límite, el ticker se omite con
`stale-market-data`.

Timeframes soportados por el motor:

- Minutos: `1m`, `5m`, `15m`, `30m`
- Horas: `1h`, `4h`
- Diario/semanal: `1d`, `1w`

Limitación de Finnhub: la API documenta resoluciones `1`, `5`, `15`, `30`, `60`, `D`, `W` y `M`.
Por eso `1m`, `5m`, `15m`, `30m`, `1h`, `1d` y `1w` están soportados directamente; `4h` no se
soporta directamente con Finnhub.

Proveedores alternativos futuros:

- Alpha Vantage
- Twelve Data
- Yahoo Finance

## Rate limits y Massive/Polygon

Polygon/Massive puede responder `429 Too Many Requests` cuando se escanean varios tickers seguidos,
especialmente en planes gratuitos. El motor procesa tickers de forma secuencial por defecto, aplica
un delay antes de cada petición posterior al primer ticker y reintenta errores 429 con backoff
exponencial.

Configuración recomendada para plan gratuito:

```text
MARKET_DATA_SEQUENTIAL=true
MARKET_DATA_REQUEST_DELAY_MS=13000
MARKET_DATA_MAX_RETRIES=3
MARKET_DATA_RETRY_BASE_DELAY_MS=30000
```

Con esa configuración los reintentos esperan aproximadamente `30s`, `60s` y `120s`.
Si usas `MARKET_DATA_SEQUENTIAL=false`, las llamadas al proveedor se ejecutan en paralelo y pueden
provocar 429 con mayor facilidad.

Los errores de Axios se sanitizan antes de llegar a logs: nunca se imprime `apiKey`, query string,
`request._header`, `responseUrl` ni `config.params.apiKey`. Solo se registra status, statusText,
provider, endpoint sin query string, ticker, requestId si existe y mensaje resumido.

## Persistencia

Contratos:

- `OpportunityRepository`
- `SignalRepository`

Implementaciones actuales:

- `OpportunityMemoryRepository`
- `SignalRepository`

Para PostgreSQL, agrega implementaciones como `PostgresOpportunityRepository` y `PostgresSignalRepository` respetando los contratos.

## Telegram

`NotificationService` acepta `Signal` y opcionalmente `Opportunity`. Si `TELEGRAM_ENABLED=true`
y existen `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`, envía el mensaje real por Telegram.
Si falta configuración o Telegram responde con error, el escaneo no falla y el mensaje se escribe en consola.

Cuando recibe ambas entidades, envía un formato enriquecido:

```text
🚨 MARKET SIGNAL

🟢 Ticker: GOOGL
⏰ Timeframe: 1D

⭐ Score: 55/100

📈 Trend: 25/25
📊 Volume: 0/25
⚡ Momentum: 15/25
🏗 Structure: 15/25

────────────────────

✅ EMA20 sobre EMA50 y ambas ascendentes
✅ RSI14 en zona constructiva (51.26)
✅ Higher highs y higher lows

────────────────────

💵 Entry: 359.91
🛑 Stop: 353.42
🎯 Target: 372.89

⚖️ Risk/Reward: 1:2.00
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

## Backtesting

La carpeta `src/backtesting` prepara la arquitectura para simulación histórica.

Incluye:

- `BacktestEngine`
- `BacktestResult`
- `TradeSimulation`

Todavía no ejecuta simulaciones completas. Está preparado para reutilizar el pipeline de analyzers y risk management contra datos históricos.

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
POLYGON_API_KEY=
FINNHUB_API_KEY=
MARKET_DATA_PROVIDER=polygon
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
OPPORTUNITY_DUPLICATE_WINDOW_MINUTES=60
```

### Variables De Entorno

| Variable                               | Descripción corta                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AzureWebJobsStorage`                  | Storage usado por Azure Functions local/deploy. En local puede ser `UseDevelopmentStorage=true`. |
| `FUNCTIONS_WORKER_RUNTIME`             | Runtime de Azure Functions. Debe ser `node`.                                                     |
| `POLYGON_API_KEY`                      | API key de Polygon/Massive para obtener velas reales de mercado.                                 |
| `FINNHUB_API_KEY`                      | API key de Finnhub para obtener velas reales cuando `MARKET_DATA_PROVIDER=finnhub`.              |
| `MARKET_DATA_PROVIDER`                 | Proveedor de datos de mercado: `polygon` o `finnhub`. Default: `polygon`.                        |
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
