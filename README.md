# ARGOS

Experimental Market Decision Support System

ARGOS es un sistema experimental de soporte a decisiones de mercado. Observa múltiples instrumentos y temporalidades, evalúa condiciones técnicas, calcula scoring, recolecta Evidence, evalúa resultados forward y puede generar notificaciones operativas para revisión humana.

ARGOS no garantiza ganancias, no es asesor financiero, no ejecuta órdenes, no se conecta a brokers y no toma decisiones autónomas de trading. Su propósito es reducir ruido, estandarizar el análisis técnico y construir evidencia cuantitativa sobre setups observados.

## Estado actual — Research / Evidence Build

El proyecto se encuentra actualmente en etapa de **Research / Evidence Build**. La PoC técnica está prácticamente validada: el pipeline funciona de punta a punta desde datos de mercado hasta Evidence, forward evaluation, MFE/MAE, target ladder experimental, Strategy Profiles y bitácora experimental.

Esto significa que el software funciona técnicamente, pero **no** significa que la estrategia esté validada, que exista evidencia suficiente de rentabilidad ni que deba operarse capital real con base en los resultados actuales. La filosofía vigente es:

```text
Evidence first.
Human decision.
No automatic broker execution.
```

ARGOS es hoy un motor cuantitativo experimental que observa el mercado, detecta configuraciones técnicas, registra lo que observó, mide posteriormente qué ocurrió y construye evidencia para investigación. Sólo después de suficiente validación podrían diseñarse estrategias candidatas, incorporar costos reales y pasar a paper trading.

V1.4-A agrega el primer núcleo puro de costos transaccionales. V1.4-B expone ese cálculo mediante un endpoint HTTP read-only. Ninguna de estas piezas cambia decisiones del motor, scoring, Evidence ni Telegram; sirven para responder, de forma aislada, si un target bruto tendría sentido después de comisiones maker/taker.

V1.5 inicia la evolución de Telegram desde un canal únicamente de salida hacia una interfaz separada en dos responsabilidades: Alerts Bot para notificaciones automáticas y Control Bot para interacción privada usuario ↔ ARGOS. Actualmente el Control Bot puede recibir comandos reales por Long Polling local mediante un worker Node separado de Azure Functions. Ya consulta Research read-only, calcula costos transaccionales, permite Analyze Symbol ad-hoc y puede ejecutar Full Market Scan con confirmación explícita.

## ARGOS Engine

ARGOS Engine es el núcleo analítico de ARGOS: el componente encargado de normalizar datos de mercado, ejecutar analyzers técnicos, calcular el score y decidir si un setup se conserva como Evidence, Opportunity o Signal.

```text
Market Data
  ↓
ARGOS Engine
  ↓
Trend / Volume / Momentum / Structure
  ↓
Technical Score
  ↓
Evidence / Opportunity
  ↓
Forward Evaluation
  ↓
Performance Research
```

```mermaid
flowchart TD
  A[ARGOS] --> B[ARGOS Engine<br/>Implemented]
  A --> C[Evidence<br/>Implemented]
  A --> D[Forward Evaluation<br/>Implemented]
  A --> E[Performance Research<br/>Implemented]
  A --> F[Notifications<br/>Implemented]
  A --> G[Data Protection<br/>Implemented]
  A --> H[Broker / Cost Model<br/>Implemented]
  A --> I[ARGOS Control<br/>Core + Long Polling Implemented]
  A --> J[Product Platform<br/>Future]
```

## Stack

- Node.js 22
- TypeScript
- Azure Functions v4
- PostgreSQL preparado por contrato
- Decimal.js para cálculos financieros deterministas
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
    TelegramControl.ts
    TransactionCost.ts
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
  transactionCosts/
    BrokerProductProfileCatalog.ts
    TransactionCostCalculator.ts
  services/
    MarketDataService.ts
    NotificationService.ts
    TelegramAuthorizationService.ts
    TelegramCommandRouter.ts
    TelegramControlPresenter.ts
    TelegramConversationStateService.ts
    OpportunityFilter.ts
    OpportunityService.ts
    RankingService.ts
    RiskService.ts
    StrategyService.ts
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

Los detalles externos, como Yahoo Finance, Telegram o PostgreSQL, viven detrás de interfaces. ARGOS Engine analiza `Candle[]` normalizadas y no depende del formato crudo del proveedor.

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

1. Carga el universo activo desde `market_symbols` + `symbol_timeframes` en PostgreSQL.
2. Obtiene velas con `MarketDataService`.
3. Ejecuta analyzers independientes.
4. Genera una `Opportunity`.
5. Rankea oportunidades por score descendente.
6. Filtra por score mínimo y duplicados recientes.
7. Convierte oportunidades válidas en un plan de riesgo con `RiskService`.
8. Si la oportunidad supera `TELEGRAM_NOTIFICATION_MIN_SCORE` y su timeframe está dentro de `TELEGRAM_NOTIFICATION_TIMEFRAMES`, la agrega a `notifiedSignals` y puede notificar Telegram. Excepción experimental: `STOCK + 5m + Score100 + strategy_version=v1` puede notificarse para Shadow Paper Trading v0.1 aunque `5m` esté fuera del filtro general.
9. Persiste oportunidad, señal y Evidence en PostgreSQL cuando corresponde.


## V1.4-A — Transaction Cost Core

La primera pieza del modelo de costos vive desacoplada del pipeline principal. No usa PostgreSQL y no modifica Evidence, Strategy Profiles ni las reglas de scoring.

Componentes:

- `TransactionCostCalculator`: calculadora pura basada en `decimal.js`.
- `BrokerProductProfileCatalog`: catálogo versionado de perfiles broker/producto.
- `TransactionCost.ts`: contratos públicos para inputs, schedules y resultados.

Convención de porcentajes:

```text
0.78 = 0.78%
1 = 1%
```

Semántica del capital:

```text
entryNotional = capital asignado a la entrada antes de costos
buyCost = comisión estimada de compra
totalCashRequired = entryNotional + buyCost
```

Ejemplo conceptual:

```text
entryNotional=5000
buyCost=39
totalCashRequired=5039
```

El resultado diferencia:

- `grossExitValue` / `exitNotional`: valor bruto de salida.
- `grossProfit`: ganancia bruta antes de comisiones.
- `buyCost` y `sellCost`: costos por lado de ejecución.
- `roundTripCost`: costo total de entrada + salida.
- `netProfit`: ganancia después de comisiones.
- `netReturnPercent`: retorno neto sobre `entryNotional`.
- `breakEvenGrossTargetPercent`: target bruto mínimo para cubrir comisiones.
- `grossTargetBelowBreakEven`: indica si el target bruto no alcanza a pagar el round trip.

Alcance actual:

- Implementa `PERCENTAGE_NOTIONAL`.
- Soporta maker/taker independiente para compra y venta.
- Soporta comisión mínima y máxima opcional.
- `grossTargetPercent = 0` es válido.
- `grossTargetPercent < 0` es inválido.
- No incluye spread, slippage, funding, retiros ni FX.

Perfiles iniciales:

- `BITSO_CRYPTO_MXN`: tier base maker `0.600%`, taker `0.780%`.
- `BITSO_CRYPTO_USDC`: tier base maker `0.300%`, taker `0.360%`.

Estos valores están encapsulados como schedules versionados y deben re-verificarse antes de usarse para decisiones reales.

Resumen ejecutivo: el movimiento del mercado no es lo mismo que el rendimiento de tu dinero. Un movimiento de mercado de `+2.00%` no necesariamente produce un retorno de inversionista de `+2.00%`.

Ejemplo validado con `BITSO_CRYPTO_MXN`, taker/taker y `5,000 MXN`:

```text
Gross market movement: +2.00%
Gross profit: +100.00 MXN
Transaction costs: -78.78 MXN
Net profit: +21.22 MXN
Net return: +0.4244%
```

El Transaction Cost Model existe para separar comportamiento del mercado de viabilidad económica después de los costos de ejecución modelados.

### Endpoint de evaluación de costos

`POST /api/transaction-costs/evaluate` permite evaluar, bajo demanda, cuánto queda de un movimiento bruto después de costos modelados. Es read-only: no consulta mercado, no escribe PostgreSQL, no envía Telegram y no crea órdenes.

Request mínimo:

```json
{
  "brokerProfileId": "BITSO_CRYPTO_MXN",
  "entryNotional": {
    "amount": 5000,
    "currency": "MXN"
  },
  "grossTargetPercent": 2,
  "buyExecution": "TAKER",
  "sellExecution": "TAKER",
  "asOf": "2026-08-28T12:00:00.000Z"
}
```

Response exitoso:

```json
{
  "ok": true,
  "result": {
    "grossTargetPercent": 2,
    "netReturnPercent": 0.4244,
    "breakEvenGrossTargetPercent": 1.572264,
    "grossTargetBelowBreakEven": false
  },
  "interpretation": {
    "grossMarketMovementPercent": 2,
    "netInvestorReturnPercent": 0.4244,
    "breakEvenPercent": 1.572264,
    "targetCoversModeledCosts": true
  }
}
```

La sección `interpretation` no recalcula fórmulas; sólo traduce campos del resultado para lectura humana. No recomienda comprar, vender ni operar.

## Azure Functions

El proyecto expone entradas independientes para producción, pruebas manuales y backtesting:

```text
marketScan                -> Timer Trigger / cron para escaneo automático
marketScanHttp            -> HTTP Trigger manual o webhook
backtest                  -> HTTP Trigger para simulación histórica
forwardPerformance       -> HTTP Trigger para métricas agregadas de Evidence
strategyProfiles         -> HTTP Trigger para Strategy Profile Research
researchSnapshot         -> HTTP Trigger read-only para corte diario de Research
transactionCostsEvaluate -> HTTP Trigger read-only para evaluar costos transaccionales
telegramTest             -> HTTP Trigger de prueba de Telegram
```

`marketScan` y `marketScanHttp` usan `MarketScanExecutor`, así que el pipeline cuantitativo vivo
vive en un solo lugar. `backtest` usa `BacktestEngine`, pero reutiliza los mismos analyzers,
`OpportunityService` y `RiskService` para evitar reglas paralelas.

#
## Shadow Paper Trading v0.1

Shadow Paper Trading es una capa experimental para registrar operaciones simuladas sin broker y sin dinero real.

Scope actual:

```text
STOCK · 5m · Score 100 · strategy_version=v1 · paper_strategy_version=paper-v0.1
```

Referencias congeladas del experimento:

```text
referenceSnapshotDate=2026-09-05
mfeReferencePct=+0.89
maeReferencePct=-1.05
follow-up levels=+1.50,+2.00,+3.00,+5.00
```

Las referencias MFE/MAE sirven como contexto de investigación; no son TP/SL automáticos ni recomendación de trading.

Tablas nuevas:

```text
paper_trades
paper_trade_levels
```

Monitor:

```text
paperTradeMonitor: timerTrigger cada 1 minuto
```

El monitor consulta trades `OPEN`, obtiene precio reciente del proveedor, actualiza MFE/MAE observado y dispara una alerta Telegram sólo una vez por nivel cruzado. El claim del nivel es atómico para reducir duplicados.

Desde Telegram Control Bot:

- `📝 Paper` muestra el menú paper;
- `Registrar Paper Trade` permite capturar ticker y precio de entrada;
- `Trades abiertos` lista posiciones paper abiertas;
- `Cerrar` cierra manualmente usando precio actual.

Límites:

- no crea órdenes;
- no llama broker;
- no cambia scoring ni Strategy v1;
- no modifica Evidence/Forward/Research;
- el botón directo desde una alerta del Alerts Bot queda pendiente porque el transporte actual de callbacks vive en el Control Bot.

## Telegram Control Bot

Desde V1.5-D, el Control Bot también puede calcular Transaction Costs desde Telegram en modo read-only. El flujo pide perfil Bitso, capital de entrada, target bruto esperado y ejecución Maker/Taker; después llama al `TransactionCostService` real. Telegram no recalcula fees, utilidad neta, round-trip cost ni break-even.

Desde V1.5-E, el Control Bot puede hacer `Analyze Symbol`: pide un ticker, permite elegir `1m`, `5m`, `15m`, `1d` o `1w`, consulta Market Data y reutiliza `OpportunityService`/analyzers para devolver score, componentes, razones, precio más reciente y timestamp de la última vela usada. Este flujo es read-only: no ejecuta `MarketScanExecutor`, no persiste señales/evidence/opportunities y no envía alertas automáticas.

Desde V1.5-F, el Control Bot puede ejecutar `Full Market Scan` con confirmación explícita. A diferencia de Analyze Symbol, este flujo sí invoca `MarketScanExecutor.run({ notify: true })` y por lo tanto puede persistir opportunities/signals/evidence y disparar Alerts por el Alerts Bot si las reglas operacionales actuales lo deciden. Telegram Control muestra un mensaje inicial rápido y luego un resumen final; no duplica scoring, filtros, dedupe ni lógica de notificación.

El capital capturado representa `entryNotional`: valor nominal de la posición antes de costos. El resultado no recomienda operar; solo indica si el target bruto supera los costos modelados. No incluye spread, slippage, funding, withdrawals ni FX.

### Research Snapshot

`GET /api/research-snapshot` entrega un único JSON autocontenido para el corte experimental diario.

Este endpoint es estrictamente read-only:

- no ejecuta Market Scan;
- no ejecuta Forward/Evidence Evaluation;
- no crea Evidence Signals;
- no modifica Strategy Profiles;
- no escribe archivos;
- no crea tablas ni migrations;
- no interpreta si una estrategia es buena o mala.

El flujo recomendado es:

```text
Ejecutar evaluator existente
  ↓
Esperar a que termine
  ↓
GET /api/research-snapshot
  ↓
Guardar un solo JSON para análisis externo
```

Incluye:

- metadata del snapshot con fecha en `America/Mexico_City`;
- data quality (`evidenceCount`, `evaluationCount`, Evidence sin evaluación y Evidence con MFE/MAE);
- resumen de Evidence por score bucket;
- oportunidades operacionales usando `OPPORTUNITY_MIN_SCORE`;
- distribución de estados de evaluación;
- sample sizes por `assetType + timeframe + scoreBucket + strategyVersion`;
- Target Ladder global preservando la semántica actual de win rate;
- MFE/MAE por profile;
- Strategy Profiles reutilizando el mismo provider de `/api/strategy-profiles`;
- watch profiles derivados en memoria;
- Forward Performance reutilizando el provider de `/api/forward-performance`.

Ejemplo local:

```bash
curl http://localhost:7071/api/research-snapshot
```

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

- `tickers`: lista opcional. Si no se manda, usa el universo activo de `market_symbols` + `symbol_timeframes` en PostgreSQL.
- `timeframe`: opcional. Ejecuta un scan manual de una sola temporalidad. Si no viene, ARGOS usa los timeframes activos de `symbol_timeframes` en PostgreSQL.
- `timeframes`: opcional. Lista o string CSV para ejecutar varias temporalidades en el mismo request. Si viene junto con `timeframe`, `timeframes` tiene prioridad.
- `limit`: opcional. Si no viene, ARGOS usa `MARKET_SCAN_CANDLE_LIMIT` desde `engine_config`.
- `notify`: opcional. Por defecto `true`.
- `capital`: opcional. Monto disponible para calcular pérdida estimada y ganancia estimada por oportunidad.
- `opportunityMinScore`: opcional. Override solo para ese request; si no viene, usa `OPPORTUNITY_MIN_SCORE` desde `engine_config`.
- `telegramNotificationMinScore`: opcional. Override solo para ese request; si no viene, usa `TELEGRAM_NOTIFICATION_MIN_SCORE` desde `engine_config`.

También se aceptan los nombres equivalentes `OPPORTUNITY_MIN_SCORE` y
`TELEGRAM_NOTIFICATION_MIN_SCORE` dentro del body o query string, útil si quieres copiar exactamente
el nombre de la configuración funcional.

La respuesta HTTP incluye `opportunityType` en `opportunities` y `notifiedSignals` para interpretar
el horizonte práctico de la señal según el `timeframe` solicitado. También incluye un `tradePlan`
porcentual basado en el `entry` y en los parámetros `TRADE_*` guardados en `engine_config`. Si envías `capital`, el trade plan
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

| Timeframe    | `opportunityType` | Lectura práctica                    |
| ------------ | ----------------- | ----------------------------------- |
| `1m`, `5m`   | `scalping`        | Entrada rápida de minutos.          |
| `15m`, `30m` | `intradia`        | Operación dentro del día.           |
| `1h`         | `swing-corto`     | Movimiento de horas a pocos días.   |
| `1d`         | `swing`           | Movimiento de días a semanas.       |
| `1w`         | `posicion`        | Contexto amplio de semanas o meses. |

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

Si el mensaje no trae tickers, se ejecuta con el universo activo configurado en PostgreSQL.

## ARGOS Engine — Opportunity Detection

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

Cada analyzer devuelve de `0` a `25`. En lenguaje más natural, ARGOS Engine busca cuatro pistas
independientes antes de llamar algo oportunidad:

1. `Trend`: que la tendencia esté alineada, principalmente EMA20 sobre EMA50 y medias ascendentes.
2. `Volume`: que haya participación real; volumen actual por encima del promedio reciente.
3. `Momentum`: que el RSI esté constructivo, evitando zonas demasiado débiles o excesivamente extendidas.
4. `Structure`: que el precio esté rompiendo o respetando una estructura alcista reciente.

El score total máximo es `100`. A partir de V1.2 hay tres thresholds separados:

- `EVIDENCE_MIN_SCORE`: decide si el setup se guarda para investigación forward.
- `OPPORTUNITY_MIN_SCORE`: decide si entra al response `opportunities`.
- `TELEGRAM_NOTIFICATION_MIN_SCORE`: decide si además pasa a `notifiedSignals` y puede enviarse por Telegram.
- `TELEGRAM_NOTIFICATION_TIMEFRAMES`: limita qué temporalidades pueden enviarse al Alerts Bot; default temporal: `15m,1d,1w`.

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

## ARGOS Engine — Ranking

`RankingService` ordena oportunidades de mayor a menor score:

```ts
const ranked = rankingService.rank(opportunities);
```

El objetivo es que ARGOS notifique primero lo mejor, no todo lo que apenas cumple una regla.

## Filtro

`OpportunityFilter` decide si una oportunidad es válida para el flujo.

Reglas actuales:

- `score >= OPPORTUNITY_MIN_SCORE`
- Sin duplicados recientes del mismo `ticker` y `timeframe` durante `OPPORTUNITY_DUPLICATE_WINDOW_MINUTES`
- Sin duplicar una misma señal lógica ya persistida por `ticker + timeframe + signal_candle_timestamp + strategy_version + signal_type`

`NotificationService` usa un threshold independiente para decidir si una oportunidad válida debe
entrar a `notifiedSignals` y enviarse a Telegram:

- `score >= TELEGRAM_NOTIFICATION_MIN_SCORE`
- `timeframe ∈ TELEGRAM_NOTIFICATION_TIMEFRAMES`

En el endpoint manual `POST /api/market-scan`, ambos thresholds pueden sobreescribirse por request
con `opportunityMinScore` y `telegramNotificationMinScore`. Ese override no cambia las variables de
entorno ni afecta ejecuciones posteriores.

Valores funcionales actuales sembrados en `engine_config`:

```text
EVIDENCE_MIN_SCORE=80
OPPORTUNITY_MIN_SCORE=90
TELEGRAM_NOTIFICATION_MIN_SCORE=100
TELEGRAM_NOTIFICATION_TIMEFRAMES=5m,15m
TRADE_STOP_LOSS_PERCENT=1
TRADE_TARGET_MIN_PERCENT=2
TRADE_TARGET_MAX_PERCENT=5
BACKTEST_CONTEXT_ENABLED=true
BACKTEST_CONTEXT_MONTHS=24
PERFORMANCE_MIN_SAMPLE_SIZE=20
OPPORTUNITY_DUPLICATE_WINDOW_MINUTES=60
```

Ejemplo: con `OPPORTUNITY_MIN_SCORE=50` y `TELEGRAM_NOTIFICATION_MIN_SCORE=80`,
una oportunidad con score `55` aparece en `opportunities`, no aparece en `notifiedSignals`
y se reporta en `skipped` con `reason: "below-telegram-threshold"`. Una oportunidad con
score `85` aparece en ambos y, si `notify=true`, se envía por Telegram.

## Evidence / Forward Performance V1.2

Evidence es el dataset de investigación de ARGOS. A diferencia de `opportunities` y `signals`, no
representa necesariamente algo que quieras operar; representa algo que ARGOS Engine observó antes de
conocer el futuro y que vale la pena medir.

La interpretación histórica de estos cortes vive en [`docs/bitacora_experimental.md`](./docs/bitacora_experimental.md). Cuando una tarea futura produzca nueva evidencia experimental, cambie métricas relevantes o genere un nuevo corte de Forward Performance, revisar si corresponde agregar una nueva entrada fechada a esa bitácora. No modificar entradas históricas para hacerlas coincidir con resultados nuevos.

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
TELEGRAM_NOTIFICATION_TIMEFRAMES=15m,1d,1w
```

Un setup con score `85` se guarda en `market_signal_engine.evidence_signals` con
`is_operational_opportunity=false`. Un setup con score `95` se guarda con
`is_operational_opportunity=true` y sigue el flujo operativo normal.

### Tablas Evidence

- `evidence_signals`: snapshot inmutable del análisis observado: score, sub-scores, reasons, entry,
  stop técnico, stop financiero, TP1/TP2, metadata (`asset_type`, `sector`, `industry`, `market`),
  `strategy_version` y `signal_candle_timestamp`, que identifica la vela real que originó la señal.
- `evidence_signal_evaluations`: outcome TP1/TP2, estado, MFE, MAE, candles hasta cada target y
  `evaluated_until`.
- `evidence_target_evaluations`: target ladder experimental normalizado por porcentaje.

La deduplicación fuerte de Evidence usa identidad de señal:
`ticker + timeframe + signal_candle_timestamp + strategy_version + signal_type`.

`signal_candle_timestamp` viene de la última candle usada para calcular la señal, no de `detectedAt`
ni de `createdAt`. Esto evita que una misma vela diaria, intradía o semanal genere múltiples Evidence
aunque ARGOS la escanee varias veces. `OPPORTUNITY_DUPLICATE_WINDOW_MINUTES` se conserva como throttling
operativo adicional para oportunidades recientes, pero no reemplaza la identidad de señal.

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
resume la muestra forward observada por ARGOS Engine.

Profit Factor se calcula únicamente cuando hay pérdidas resueltas suficientes para evitar una métrica
falsa. Si no puede calcularse de forma rigurosa, se devuelve `null`.

### Strategy Profile Research V1.3

`GET /api/strategy-profiles` construye perfiles estadísticos descriptivos desde Evidence. Es una
capa read-only: no modifica `evidence_signals`, no reevalúa señales y no cambia MarketScan, Telegram,
scoring ni los evaluadores forward.

Agrupa la muestra por:

```text
asset_type + timeframe + score_bucket + strategy_version
```

Esto evita mezclar crypto con acciones, temporalidades rápidas con swings, o señales generadas por
versiones distintas del motor.

Ejemplo:

```bash
curl "http://localhost:7071/api/strategy-profiles?assetType=CRYPTO&timeframe=1m&scoreBucket=90-94&strategyVersion=v1"
```

Filtros soportados:

- `assetType`
- `timeframe`
- `scoreBucket`: `80-84`, `85-89`, `90-94`, `95-100`
- `strategyVersion`
- `minimumSampleSize`

Semántica importante:

- `Trade Outcome` mide resolución operativa del target.
- `Market Reachability` mide si el mercado tocó el target, aunque el trade sea ambiguo.
- Para cada target experimental:
  - `WIN` cuenta como target alcanzado.
  - `LOSS` no cuenta como target alcanzado.
  - `EXPIRED` no cuenta como target alcanzado.
  - `AMBIGUOUS` sí cuenta como target alcanzado porque la vela tocó target y stop.
  - `NULL` significa unresolved y queda fuera del denominador.

Fórmulas:

```text
winRate = wins / (wins + losses)
reachRate = (wins + ambiguous) / (wins + losses + expired + ambiguous)
```

V1.3 separa:

- `resolvedSignalSampleSize`: señales con estado terminal a nivel perfil.
- `resolvedTargetSampleSize`: outcomes resueltos por cada target experimental.

`dataMaturity` usa:

```text
INSUFFICIENT: sampleSize < 30 OR resolvedSignalSampleSize < 10
EARLY:        sampleSize >= 30 AND resolvedSignalSampleSize >= 10
DEVELOPING:  sampleSize >= 75 AND resolvedSignalSampleSize >= 30
MATURE:      sampleSize >= 150 AND resolvedSignalSampleSize >= 60
```

`MATURE` no significa validación estadística, rentabilidad ni autorización para operar capital real.
Solo significa que hay suficiente data para hacer análisis más serio.

MFE/MAE incluyen `average`, `median`, `p25`, `p75` y `p90`. MAE conserva su signo negativo real; por
eso sus percentiles pueden sentirse visualmente invertidos frente a MFE.

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

El scan vivo recopila evidencia real de varias temporalidades en paralelo lógico sin mezclar candles ni scores entre ellas.

La lista de timeframes activos ya no vive en variables de entorno. Se administra por símbolo en PostgreSQL:

```text
market_signal_engine.symbol_timeframes
```

Cada combinación `symbol + timeframe` se evalúa de forma independiente:

```text
NVDA 1m
NVDA 5m
NVDA 15m
NVDA 1h
NVDA 1d
NVDA 1w
```

La deduplicación y persistencia siguen separadas por `ticker + timeframe + signal_candle_timestamp + strategy_version`, por lo que `NVDA 5m` y `NVDA 15m` pueden producir oportunidades/señales distintas.

## Watchlists / Universo de mercado

El universo operacional ya no se toma de `MARKET_SCAN_TICKERS` ni de `MARKET_SCAN_WATCHLIST`.

La fuente única de verdad es PostgreSQL:

```text
market_signal_engine.market_symbols
market_signal_engine.symbol_timeframes
```

Para agregar, desactivar o segmentar activos se debe modificar la BD mediante migraciones o SQL controlado. Si un ticker manual no existe activo en `market_symbols`, ARGOS lo rechaza con error explícito en lugar de construir metadata fallback.

## Market Data

El proyecto usa Yahoo Finance como única fuente de datos de mercado mediante `yahoo-finance2`.
No requiere API key y el resto de ARGOS Engine no conoce detalles de Yahoo: solo recibe velas normalizadas
con el modelo interno `Candle`.

El puerto se mantiene simple para que ARGOS Engine siga desacoplado:

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

Timeframes soportados por Yahoo Finance en ARGOS Engine:

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
Desde V1.1.1 ARGOS Engine usa concurrencia controlada: avanza más rápido que un scan 100% secuencial, pero
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

Antes de pedir datos, ARGOS Engine revisa sesión de mercado. Una acción/ETF intradía fuera de horario se
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
requiere PostgreSQL para configuración funcional y universo operacional. Los repositorios en memoria se reservan para pruebas unitarias aisladas y no son fallback runtime.
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

| Timeframe de señal | Seguimiento preferido | Fallbacks         |
| ------------------ | --------------------- | ----------------- |
| `1m`               | `1m`                  | `5m`, `15m`, `1d` |
| `5m`               | `5m`                  | `15m`, `1d`       |
| `15m`              | `15m`                 | `30m`, `1h`, `1d` |
| `30m`              | `15m`                 | `30m`, `1h`, `1d` |
| `1h`               | `15m`                 | `30m`, `1h`, `1d` |
| `1d`               | `15m`                 | `30m`, `1h`, `1d` |
| `1w`               | `1d`                  | `1w`              |

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

Es el setup técnico actual. Resume ticker, timeframe, score total y los cuatro componentes de ARGOS Engine:
`Trend`, `Volume`, `Momentum` y `Structure`. Este score responde:

```text
¿Qué tan bien cumple el setup actual nuestras reglas técnicas?
```

No es una probabilidad de ganar.

### 2. Historical Backtest

Cuando `BACKTEST_CONTEXT_ENABLED=true`, ARGOS intenta adjuntar un resumen histórico comparable a la
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
`PERFORMANCE_MIN_SAMPLE_SIZE` desde `engine_config`, la alerta muestra `⚠️ Muestra pequeña`. Si Yahoo o el backtest no
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

Telegram está separado en dos responsabilidades conceptuales:

- **ARGOS Alerts Bot**: canal operativo actual para notificaciones automáticas. Flujo principalmente ARGOS → usuario.
- **ARGOS Control Bot**: futura interfaz interactiva privada. Flujo usuario ↔ ARGOS.

El Alerts Bot sigue siendo el canal operativo de notificaciones automáticas. `NotificationService` acepta `Signal` y opcionalmente `Opportunity`. Si el Alerts Bot está habilitado y configurado, envía el mensaje real por Telegram. Si falta configuración o Telegram responde con error, el escaneo no falla y el mensaje se escribe en consola.

El Control Bot es un bot independiente para control privado. V1.5-A implementó el core interno: modelos, autorización por `user_id`, command/callback routing, presenter, inline keyboards y estado conversacional en memoria. V1.5-B agrega el transporte real por Telegram Bot API usando Long Polling local en un worker Node dedicado. No corre como loop infinito dentro de Azure Functions.

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
4. Configura el token como `TELEGRAM_ALERTS_BOT_TOKEN` o, por compatibilidad legacy, `TELEGRAM_BOT_TOKEN`.

### Obtener Chat ID

1. Escribe un mensaje a tu bot desde Telegram.
2. Abre en el navegador:

```text
https://api.telegram.org/bot<TELEGRAM_ALERTS_BOT_TOKEN>/getUpdates
```

3. Busca `chat.id` en la respuesta y configúralo como `TELEGRAM_ALERTS_CHAT_ID` o, por compatibilidad legacy, `TELEGRAM_CHAT_ID`.
4. No compartas ni subas el token; `local.settings.json` está ignorado por git.

### Configuración Telegram

```json
{
  "Values": {
    "TELEGRAM_ALERTS_ENABLED": "true",
    "TELEGRAM_ALERTS_BOT_TOKEN": "<alerts-bot-token>",
    "TELEGRAM_ALERTS_CHAT_ID": "<alerts-chat-id>",
    "TELEGRAM_CONTROL_ENABLED": "true",
    "TELEGRAM_CONTROL_BOT_TOKEN": "<control-bot-token>",
    "TELEGRAM_CONTROL_ALLOWED_USER_IDS": "<telegram-user-id>"
  }
}
```

Compatibilidad: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` y `TELEGRAM_ENABLED` siguen funcionando como fallback únicamente de secretos/configuración del Alerts Bot. `TELEGRAM_NOTIFICATION_MIN_SCORE` y `TELEGRAM_NOTIFICATION_TIMEFRAMES` ya no se leen de ENV para el motor; viven en `engine_config`.

El Control Bot autoriza por `user_id` de Telegram: identifica la cuenta del usuario. `chat_id` identifica una conversación/chat y sólo se usa como destino de respuesta. Si `TELEGRAM_CONTROL_ALLOWED_USER_IDS` está vacío, el worker puede arrancar, pero todos los usuarios serán rechazados con `Unauthorized.`. No documentes IDs reales ni tokens.

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
✅ ARGOS conectado a Telegram
```

### Probar ARGOS Control Bot

El Control Bot corre como proceso Node separado. Para levantar Azure Functions usa:

```bash
npm start
```

Para levantar el worker de control en otra terminal usa:

```bash
npm run telegram:control
```

El worker carga `.env` y, para desarrollo local, también `local.settings.json` si existe. `.env` tiene prioridad cuando una variable ya está definida.

Al iniciar, el worker valida `TELEGRAM_CONTROL_ENABLED`, `TELEGRAM_CONTROL_BOT_TOKEN`, `TELEGRAM_CONTROL_ALLOWED_USER_IDS` y consulta `getWebhookInfo`. Si el bot tiene un webhook activo, Long Polling se bloquea con este mensaje para evitar consumir updates por dos transportes a la vez:

```text
Telegram Control Bot has active webhook. Long polling cannot start safely.
```

Comandos soportados por ahora:

- `/start`
- `/menu`
- `/help`
- `/cancel`

Los botones inline funcionan y responden mediante callbacks. Desde V1.5-C, Research Snapshot, Strategy Profiles, Forward Performance y System Status consultan servicios reales en modo read-only. Desde V1.5-D, Costs usa el servicio real de costos. Desde V1.5-E, Analyze Symbol usa el motor técnico real en modo read-only. Desde V1.5-F, Full Market Scan muestra confirmación y ejecuta el pipeline operacional real; puede tener side effects legítimos del scan normal.

Notas operativas:

- El offset de `getUpdates` vive en memoria. Si el worker se reinicia, Telegram puede reenviar updates pendientes.
- Los updates pendientes al arranque se procesan normalmente; no se hace flush silencioso.
- Los logs de descubrimiento muestran `userId`, `chatId` y `type`, pero no imprimen payloads completos ni tokens.

### Notificar Señales

El escaneo HTTP notifica por defecto. También puedes forzarlo:

```bash
curl "http://localhost:7071/api/market-scan?tickers=NVDA,MSFT&timeframe=15m&limit=80&notify=true"
```

## Backtesting V1

El proyecto incluye un endpoint independiente para simular cómo se habría comportado ARGOS Engine en
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
especiales para backtesting y no se modifica el scoring de ARGOS Engine vivo.

### Regla anti look-ahead bias

Para cada vela histórica `i`, ARGOS Engine solo analiza:

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

Para no contar varias veces el mismo movimiento, ARGOS Engine no abre una nueva operación para el mismo
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

| Outcome     | Significado                                                                |
| ----------- | -------------------------------------------------------------------------- |
| `WIN`       | El target se alcanzó antes que el stop.                                    |
| `LOSS`      | El stop se alcanzó antes que el target.                                    |
| `EXPIRED`   | No tocó ni stop ni target dentro de la ventana máxima.                     |
| `AMBIGUOUS` | La misma vela tocó stop y target; con OHLC no sabemos qué ocurrió primero. |

`AMBIGUOUS` no cuenta automáticamente como win ni como loss. El `winRate` principal usa:

```text
wins / (wins + losses) * 100
```

`EXPIRED` y `AMBIGUOUS` quedan fuera del denominador principal, pero sí aparecen en el resumen.

### Ventanas máximas por timeframe

Defaults iniciales:

| Timeframe | Ventana máxima del trade |
| --------- | ------------------------ |
| `1m`      | 1 día                    |
| `5m`      | 2 días                   |
| `15m`     | 3 días                   |
| `30m`     | 5 días                   |
| `1h`      | 10 días                  |
| `1d`      | 45 días                  |
| `1w`      | 180 días                 |

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
ARGOS habría alertado NVDA el 24-Jul; TP1 se alcanzó dos velas después.
```

### Backtesting vs Forward Testing

`Backtesting` simula qué habría ocurrido si ARGOS Engine hubiera existido históricamente.

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

Variables locales principales:

```text
DATABASE_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ENABLED=true
MARKET_SCAN_SCHEDULE=0 */15 14-21 * * 1-5
FORWARD_TEST_CONTEXT_ENABLED=true
FORWARD_SIGNAL_EVALUATION_SCHEDULE=0 0 * * * *
```

La configuración funcional del motor ya no vive en variables de entorno.
Umbrales, timeframes, límites de velas, parámetros de scoring, trade plan,
Evidence y contexto de inteligencia se leen exclusivamente desde PostgreSQL:

```text
market_signal_engine.engine_config
market_signal_engine.market_symbols
market_signal_engine.symbol_timeframes
```

### Variables De Entorno

| Variable                             | Descripción corta                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `AzureWebJobsStorage`                | Storage usado por Azure Functions local/deploy. En local puede ser `UseDevelopmentStorage=true`. |
| `FUNCTIONS_WORKER_RUNTIME`           | Runtime de Azure Functions. Debe ser `node`.                                                 |
| `DATABASE_URL`                       | URL de PostgreSQL. Es obligatoria para leer configuración funcional, universo y persistencia. |
| `DATABASE_BACKUP_ENABLED`            | Activa/desactiva el Timer diario de backup PostgreSQL; default `false`.                      |
| `DATABASE_BACKUP_SCHEDULE`           | Cron NCRONTAB del Timer `dailyDatabaseBackup`; default `0 50 5 * * *`.                      |
| `DATABASE_BACKUP_BASE_PATH`          | Directorio base donde se escriben snapshots locales; default `./backups`.                    |
| `DATABASE_BACKUP_TIMEZONE`           | Timezone usada para carpetas `YYYY/MM/DD`; default `America/Mexico_City`.                  |
| `DATABASE_PG_DUMP_BIN`               | Binario de `pg_dump`; permite apuntar a una versión compatible con el servidor.              |
| `DATABASE_PG_RESTORE_BIN`            | Binario de `pg_restore`; útil para restore-test con la misma versión mayor del servidor.     |
| `DATABASE_PSQL_BIN`                  | Binario de `psql` usado para registrar versión de tooling en el manifest.                    |
| `TELEGRAM_BOT_TOKEN`                 | Token legacy del Alerts Bot. No debe subirse a git.                                           |
| `TELEGRAM_CHAT_ID`                   | Chat destino legacy del Alerts Bot.                                                           |
| `TELEGRAM_ENABLED`                   | Legacy fallback para activar/desactivar Alerts Bot si `TELEGRAM_ALERTS_ENABLED` no existe.   |
| `TELEGRAM_ALERTS_BOT_TOKEN`          | Token explícito del Alerts Bot; tiene precedencia sobre `TELEGRAM_BOT_TOKEN`.                |
| `TELEGRAM_ALERTS_CHAT_ID`            | Chat destino explícito del Alerts Bot; tiene precedencia sobre `TELEGRAM_CHAT_ID`.           |
| `TELEGRAM_ALERTS_ENABLED`            | Activa/desactiva explícitamente el Alerts Bot; tiene precedencia sobre `TELEGRAM_ENABLED`.   |
| `TELEGRAM_CONTROL_BOT_TOKEN`         | Token del Control Bot usado por el worker `npm run telegram:control`. No debe subirse a git. |
| `TELEGRAM_CONTROL_ENABLED`           | Habilita/deshabilita el Control Bot Long Polling Worker; default `false`.                    |
| `TELEGRAM_CONTROL_ALLOWED_USER_IDS`  | Lista CSV de `user_id` autorizados para usar Control Bot.                                   |
| `MARKET_SCAN_SCHEDULE`               | Cron del Timer Trigger `marketScan`.                                                        |
| `FORWARD_SIGNAL_EVALUATION_SCHEDULE` | Cron NCRONTAB del Timer `forwardSignalEvaluation`; default cada hora: `0 0 * * * *`.      |
| `MARKET_SCAN_DEBUG`                  | Habilita logs debug seguros de escaneo y datos de mercado.                                    |

Los valores como `OPPORTUNITY_MIN_SCORE`, `TELEGRAM_NOTIFICATION_MIN_SCORE`,
`TELEGRAM_NOTIFICATION_TIMEFRAMES`, `MARKET_SCAN_CANDLE_LIMIT`,
`EVIDENCE_MIN_SCORE`, parámetros `TRADE_*`, scoring, performance y retry de
market data pertenecen a `engine_config`, no a `local.settings.json`.

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


## Configuración funcional desde PostgreSQL

ARGOS usa PostgreSQL como fuente única de verdad para la configuración funcional del motor. Los valores se consultan desde `market_signal_engine.engine_config` y cada fila incluye descripción, categoría, tipo y estado activo.

Ejemplo para consultar la configuración activa:

```sql
SELECT key, value, value_type, category, description
FROM market_signal_engine.engine_config
WHERE is_active = true
ORDER BY category, key;
```

Ejemplo para ajustar alertas sin tocar `local.settings.json`:

```sql
UPDATE market_signal_engine.engine_config
SET value = '100', updated_at = now()
WHERE key = 'TELEGRAM_NOTIFICATION_MIN_SCORE';

UPDATE market_signal_engine.engine_config
SET value = '5m,15m', updated_at = now()
WHERE key = 'TELEGRAM_NOTIFICATION_TIMEFRAMES';
```

El universo operacional se administra en:

```text
market_signal_engine.market_symbols
market_signal_engine.symbol_timeframes
```

`local.settings.json` queda reservado para secretos, conexión a PostgreSQL, schedules de Azure Functions y parámetros de infraestructura local. Si PostgreSQL no está disponible o falta configuración activa requerida, ARGOS falla explícitamente en lugar de usar ENV como fallback.

## ORB-FVG Scalping Research v0.1

Estado: `IMPLEMENTED — PENDING FIRST PROSPECTIVE SESSION VALIDATION`.

ORB-FVG es un carril paralelo de investigación. No forma parte de `strategy_version=v1`, no usa el score de Trend/Volume/Momentum/Structure y no escribe en Evidence V1.

Hipótesis inicial:

> Un breakout alcista confirmado del Opening Range de 09:30–09:45 ET, acompañado por un bullish FVG 1m matemáticamente definido dentro del boundary temporal de v0.1, puede presentar comportamiento forward medible que justifique investigación posterior.

Universo inicial:

- `STOCK`
- `ETF`
- símbolos activos del Market Universe en PostgreSQL
- excluye `CRYPTO`

Reglas v0.1 prospectivas — LONG-only desde 2026-09-08:

- Opening Range: primera vela regular `15m` de `09:30 → 09:45 America/New_York`.
- LONG breakout: `candle.close > openingRangeHigh AND candle.open <= openingRangeHigh`.
- Bullish FVG: `low(candle3) > high(candle1)`.
- `maxFvgLagCandles = 3`.
- `signalAt = timestamp de candle3`.
- `entryPrice = candle3.close`.
- LONG stop: `low` de breakout candle.
- Target principal: `2R`.
- Expiración: cierre regular US de la misma sesión; no mantiene candidates overnight.

Timers:

```text
orbFvgScanner         -> cada 1 minuto
orbFvgForwardMonitor -> cada 1 minuto
```

Endpoint read-only:

```bash
curl "http://localhost:7071/api/orb-fvg/signals?sessionDate=2026-09-07&status=OPEN"
```

Filtros opcionales:

- `sessionDate` o `date`
- `ticker`
- `assetType`
- `direction` — conserva compatibilidad de lectura para `SHORT` histórico
- `status`
- `experimentVersion`
- `limit`

Tablas:

```text
market_signal_engine.orb_fvg_signals
market_signal_engine.orb_fvg_signal_levels
```

Yahoo Finance se usa únicamente como feed experimental de research. No debe interpretarse como feed profesional de ejecución de scalping. Los resultados son brutos: no incluyen spread, slippage ni comisiones.

Nota metodológica 2026-09-08: `orb-fvg-v0.1` queda restringido a investigación prospectiva LONG-only. Si existen señales SHORT anteriores en PostgreSQL, se preservan como histórico y pueden consultarse, pero no deben mezclarse con el dataset LONG-only posterior al cambio.

Telegram behavior: temporarily muted for ORB-FVG on 2026-09-08. Candidate detection and final outcome notifications are disabled; final outcomes continue to be persisted silently for research.

Previous behavior: candidate detection alerts only. Final outcomes are persisted silently for research: no se envían notificaciones `ORB-FVG RESULT` para WIN, LOSS, AMBIGUOUS o EXPIRED.
