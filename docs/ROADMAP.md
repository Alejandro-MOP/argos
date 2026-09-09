# ARGOS — Roadmap, Hitos y Versionamiento

> Documento vivo del proyecto. Codex debe actualizarlo en cada cambio relevante.

**Estado actual:** `Research / Evidence Build`
**Desarrollo siguiente:** `V1.6-B — Sector-Aware Research`
**Experimento activo:** `strategy_version=v1 — Evidence Collection`
**Próximo release planeado:** `v1.0.0 — Detection & Evidence`

---

## Nota de identidad documental

ARGOS fue adoptado como identidad oficial documental del sistema. ARGOS describe la plataforma completa; ARGOS Engine identifica específicamente el núcleo analítico encargado de evaluar mercado, calcular scoring y detectar setups. Este cambio es nominal/documental y no modifica `strategy_version`, endpoints, schemas, tablas ni comportamiento funcional.

---

## 1. Objetivo

ARGOS es un Experimental Market Decision Support System: un sistema experimental de soporte a decisiones de mercado que analiza
automáticamente múltiples símbolos y temporalidades, filtra ruido,
detecta oportunidades y posteriormente mide qué ocurrió con cada señal.

La filosofía es:

```text
Mercado
   ↓
Radar
   ↓
Señales relevantes
   ↓
Evidence
   ↓
Costos reales / ejecución neta
   ↓
Decisión humana
```

Actualmente el universo soporta aproximadamente:

```text
103 símbolos activos
×
5 temporalidades

1m
5m
15m
1d
1w
```

Esto representa hasta:

```text
515 combinaciones potenciales por ciclo
```

antes de aplicar filtros de sesión y configuración.

El sistema no interpreta el `score` como una probabilidad de éxito.

El score representa:

> Qué tan bien cumple un setup las reglas técnicas vigentes de la estrategia.

---

# 2. Estado general

| Versión                                                  | Objetivo                                                                               | Estado                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
| V0 — Core                                                | Núcleo cuantitativo desacoplado                                                        | ✅ Completado                              |
| V1 — ARGOS Engine Signals                                | Detectar, persistir, notificar y evaluar señales                                       | ✅ Funcional                               |
| V1.1 — Dynamic Configuration                             | Configuración, universo y sesiones desde PostgreSQL                                    | ✅ Completado                              |
| V1.1.1 — Market Data Throughput                          | Concurrencia controlada y retries seguros                                              | ✅ Completado                              |
| V1.2 — Evidence                                          | Medir estadísticamente la calidad de los setups                                        | 🧪 Implementado / recolectando evidencia   |
| V1.3 — Strategy Profile Research                         | Perfiles descriptivos por asset/timeframe/score/version                                | ✅ Implementado                            |
| **V1.4-A — Transaction Cost Core**                       | Cálculo puro de costos, maker/taker y break-even                                       | ✅ Implemented & Functionally Validated    |
| **V1.4-B — Cost Application Layer**                      | Servicio de aplicación y endpoint HTTP read-only para evaluar costos                   | ✅ Implemented & Functionally Validated    |
| **V1.5 — ARGOS Control Interface**                       | Interfaz privada de control vía Telegram separada de alertas                           | ✅ COMPLETED                               |
| **V1.5-A — Control Core**                                | Configuración dual, autorización, router, presenter y estado en memoria                | ✅ Completed & Validated                   |
| **V1.5-B — Control Transport**                           | Telegram Bot API, Long Polling local y worker de control                               | ✅ Completed & Validated                   |
| **V1.5-C — Read-only Research Integrations**             | Snapshot, Strategy Profiles, Forward Performance y System Status desde Control Bot     | ✅ Completed & Manually Validated          |
| **V1.5-D — Telegram Transaction Costs Integration**      | Flujo conversacional read-only de costos desde Control Bot                             | ✅ Completed & Manually Validated          |
| **V1.5-E — Telegram Analyze Symbol**                     | Análisis técnico ad-hoc read-only desde Control Bot                                    | ✅ Completed / Manually Validated          |
| **V1.5-E.1 — Telegram Analyze Symbol Guided Navigation** | Navegación guiada por Market Universe real para Analyze Symbol                         | 🚧 Implemented / Pending Manual Validation |
| **V1.5-F — Telegram Full Market Scan**                   | Ejecución confirmada del Market Scan operacional real desde Control Bot                | ✅ Completed / Manually Validated          |
| **V1.6-A — Market Universe Expansion & Segmentation**    | Universo ampliado a 103 símbolos activos segmentados por asset/sector/industry/session | ✅ Completed & Validated                   |
| **V1.6-B — Sector-Aware Research**                       | Investigación read-only por sector/industry usando metadata normalizada                | 📋 NEXT / PLANNED                          |
| **Shadow Paper Trading v0.1**                            | Registro experimental de trades paper STOCK 5m Score100 desde Telegram Control         | 🧪 Implemented / Pending Manual Validation |
| Portfolio Risk & Exposure Manager                        | Riesgo agregado, concentración y exposición                                            | 📋 Backlog                                 |
| V2 — Strategy Calibration                                | Mejorar estrategia utilizando Evidence                                                 | 📊 Requiere muestra suficiente             |
| V3 — Trade Companion                                     | Seguimiento de trades realmente tomados                                                | 📋 Backlog                                 |
| V3.1 — Trading Journal                                   | Medir decisiones y resultados reales                                                   | 📋 Backlog                                 |
| V4 — Product                                             | Dashboard y administración visual                                                      | 🌱 Futuro                                  |
| V5 — Platform                                            | Usuarios, preferencias y posible comercialización                                      | 💭 Futuro                                  |

---

# 3. V0 — Core

## Implementado

- Arquitectura hexagonal / Ports & Adapters.
- Modelo normalizado `Candle`.
- Market Data Provider.
- Yahoo Finance como adaptador.
- Trend Analyzer.
- Volume Analyzer.
- Momentum Analyzer.
- Structure Analyzer.
- Scoring compuesto `/100`.
- EMA rápida/lenta.
- RSI.
- Volumen.
- Higher Highs / Higher Lows.
- Breakouts y consolidaciones.

Arquitectura conceptual:

```text
Azure Timer / HTTP
        ↓
Application Services
        ↓
Domain Models + Ports
        ↓
External Adapters
        ↓
Yahoo / PostgreSQL / Telegram
```

---

# 4. V1 — ARGOS Engine Signals

## Implementado

- Escaneo automático de múltiples símbolos.
- Multi-timeframe:
  - `1m`
  - `5m`
  - `15m`
  - `1d`
  - `1w`
- Opportunities.
- Signals.
- PostgreSQL.
- Trade Plan.
- Entry.
- Stop técnico.
- Stop financiero.
- TP1 / TP2.
- Telegram.
- Backtesting.
- Forward testing.
- `TradeOutcomeEvaluator`.
- `ForwardSignalEvaluator`.
- Timer de evaluación forward.
- Estados:
  - `OPEN`
  - `PARTIALLY_RESOLVED`
  - `CLOSED`
  - `EXPIRED`
  - `AMBIGUOUS`
- Outcomes:
  - `WIN`
  - `LOSS`
  - `EXPIRED`
  - `AMBIGUOUS`
- MFE.
- MAE.

Flujo:

```text
Market
  ↓
Market Scan
  ↓
Opportunity
  ↓
Signal
  ↓
Telegram
  ↓
Forward Signal Evaluation
  ↓
Outcome + MFE / MAE
```

---

# 5. V1.1 — Dynamic ARGOS Engine Configuration & Market Universe

## Implementado

- `engine_config`
  - configuración funcional
  - descripción
  - categoría
  - tipo
  - activación

- `market_symbols`
  - catálogo de instrumentos

- `symbol_timeframes`
  - temporalidades activables por símbolo

Metadata:

```text
asset_type
sector
industry
exchange
market
timezone
session_type
```

También:

- `provider_symbol` para desacoplar el símbolo lógico del proveedor.
- Sesiones:
  - `US_REGULAR`
  - `TWENTY_FOUR_SEVEN`
- Acciones/ETF intradía fuera de sesión:
  - `market-closed`
  - sin llamar Yahoo
- `1d` y `1w` pueden analizarse fuera de sesión.
- Crypto continúa 24/7.
- `strategy_version` para separar Evidence entre versiones del algoritmo.
- PostgreSQL como fuente única de verdad para configuración funcional y universo de mercado.
- Sin fallback runtime a ENV para thresholds, scoring, trade plan, strategy version, candle limit ni universo.
- Overrides HTTP conservados como parámetros explícitos de request, no como segunda fuente de configuración.

---

# 5.1. V1.1.1 — Market Data Throughput

## Implementado

- Pool de concurrencia controlada para requests de datos de mercado.

Configuración:

```text
MARKET_DATA_MAX_CONCURRENCY
MARKET_DATA_BATCH_DELAY_MS
MARKET_DATA_MAX_RETRIES
MARKET_DATA_RETRY_BASE_DELAY_MS
```

Reintentos con exponential backoff para errores recuperables:

```text
429
408
5xx
timeout
errores temporales de red
```

Errores no recuperables como:

```text
símbolo inválido
delisted
not found
no data
```

no se reintentan.

También:

- Filtro de sesión antes de consultar Yahoo.
- Combinaciones `market-closed` no generan request al proveedor.

Métricas disponibles:

```text
totalCombinations
marketClosed
marketDataRequests
successfulRequests
failedRequests
rateLimitedRequests
retryAttempts
durationMs
```

Variables anteriores:

```text
MARKET_DATA_SEQUENTIAL
MARKET_DATA_REQUEST_DELAY_MS
```

quedan deprecadas/inactivas en PostgreSQL y conservadas únicamente por
compatibilidad de fallback.

## Deuda técnica

- Resampling de velas.
- Deduplicación de requests por símbolo/timeframe.
- Evaluar cache compartido de velas entre procesos que consultan el mismo rango.

---

# 6. Estado actual — Research / Evidence Build

ARGOS Engine ya puede:

```text
Analizar
   ↓
Detectar
   ↓
Persistir
   ↓
Notificar
   ↓
Observar
   ↓
Evaluar
   ↓
Agregar Performance
```

V1.2 ya no está en fase de construcción funcional.

Está en fase de:

> **validación empírica con datos reales.**

La estrategia actual debe mantenerse estable mientras se recopila Evidence:

```text
strategy_version = v1
```

La validación empírica se documenta incrementalmente en:

```text
docs/reports/bitacora_experimental.md
```

El roadmap y la bitácora experimental tienen responsabilidades diferentes:

```text
ROADMAP.md
    ↓
estado del producto
hitos
versiones
backlog

docs/reports/bitacora_experimental.md
    ↓
cortes experimentales
métricas observadas
hipótesis
hallazgos
```

Podemos continuar desarrollando capacidades alrededor de ARGOS Engine siempre que
no modifiquemos silenciosamente las reglas de:

```text
strategy_version = v1
```

---

# 7. V1.2 — Evidence 🧪

## Objetivo

Responder con datos:

> ¿Las alertas y setups detectados por ARGOS Engine realmente identifican oportunidades útiles?

## Implementado

### Evidence independiente

```text
EVIDENCE_MIN_SCORE = 80
```

Dataset dedicado:

```text
evidence_signals
```

Separación explícita:

```text
EVIDENCE_MIN_SCORE
OPPORTUNITY_MIN_SCORE
TELEGRAM_NOTIFICATION_MIN_SCORE
```

Configuración actual conceptual:

```text
score < 80
    ↓
No Evidence

score 80-89
    ↓
Evidence-only

score >= 90
    ↓
Evidence
+
Opportunity
+
Signal / Telegram según configuración
```

### Snapshot de Evidence

Cada Evidence conserva:

```text
score
sub-scores
reasons
entry
stop técnico
stop financiero
TP1
TP2
metadata de mercado
strategy_version
detected_at
signal_candle_timestamp
```

### Deduplicación

Evidence deduplica por identidad lógica de señal:

```text
ticker
+
timeframe
+
signal_candle_timestamp
+
strategy_version
+
signal_type
```

`signal_candle_timestamp` viene de la vela real usada por el motor. La ventana
`OPPORTUNITY_DUPLICATE_WINDOW_MINUTES` se conserva como protección operativa adicional,
pero la integridad de Evidence y Forward Signals depende de identidad de señal.

---

## Evaluación de Evidence

Implementado:

```text
EvidenceSignalEvaluator
```

reutilizando:

```text
TradeOutcomeEvaluator
```

Estados:

```text
OPEN
PARTIALLY_RESOLVED
CLOSED
EXPIRED
AMBIGUOUS
```

Outcomes:

```text
WIN
LOSS
EXPIRED
AMBIGUOUS
```

También:

```text
MFE
MAE
```

---

## Target Ladder experimental

Targets:

```text
+0.50%
+0.75%
+1.00%
+1.25%
+1.50%
+2.00%
+3.00%
+5.00%
```

Persistencia:

```text
evidence_target_evaluations
```

Cada target se evalúa independientemente sobre la misma Evidence.

Por lo tanto:

> Un `LOSS` repetido en varios targets no representa varios trades perdedores.

Ejemplo:

```text
Signal
Entry = $100
Stop  = $99

Targets:

+0.50%
+0.75%
+1.00%
+1.25%
+1.50%
+2.00%
+3.00%
+5.00%
```

Si el precio toca primero `$99`:

```text
0.50 → LOSS
0.75 → LOSS
1.00 → LOSS
1.25 → LOSS
1.50 → LOSS
2.00 → LOSS
3.00 → LOSS
5.00 → LOSS
```

Representa:

```text
1 Evidence
+
8 hipótesis de target evaluadas
```

no ocho operaciones distintas.

---

## Forward Performance

Endpoint:

```text
GET /api/forward-performance
```

Filtros:

```text
ticker
timeframe
minimumScore
maximumScore
scoreBucket
assetType
sector
industry
strategyVersion
from
to
```

Buckets:

```text
80-84
85-89
90-94
95-100
```

Performance disponible por:

```text
timeframe
ticker
asset type
sector
industry
strategy version
```

Métricas:

```text
sampleSize
smallSample

TP1 win rate
TP2 win rate

expired
ambiguous

MFE average
MFE median

MAE average
MAE median

historicalForwardExpectancyPercent
profitFactor
```

---

## Fix de evaluación con pocas velas futuras

Forward/Evidence ya no exige 60 velas para evaluar una señal existente.

Semántica:

```text
futureCandles.length === 0
    ↓
pending
reason = no-future-candles-yet

futureCandles.length >= 1
    ↓
evaluar normalmente
```

Separación de métricas:

```text
pendingNoFutureCandles
providerErrors
errors
```

Regla obligatoria anti look-ahead:

```text
candle.timestamp > signalAt / detectedAt
```

---

## Primeras validaciones técnicas

Se verificó que:

- Evidence puede evaluarse incrementalmente con pocas velas futuras.
- Los targets experimentales se evalúan independientemente.
- Un mismo stop puede producir `LOSS` para múltiples targets.
- Esto no representa múltiples operaciones perdedoras.
- Se detectan escenarios `AMBIGUOUS`.
- Los agregados de `/api/forward-performance` pueden reconstruirse desde
  `evidence_target_evaluations`.
- `no-future-candles-yet` se considera pendiente y no error técnico.
- Provider errors reales permanecen diferenciados.

---

## Pendiente antes de `v1.0.0`

- Ejecutar múltiples sesiones reales.
- Acumular una muestra más representativa.
- Aumentar cantidad de outcomes resueltos.
- Validar comportamiento en distintos días.
- Validar distintos regímenes de mercado.
- Comparar score buckets.
- Comparar timeframes.
- Comparar asset types.
- Comparar sector/industry cuando exista muestra suficiente.
- Confirmar que los resultados no dependan de un pequeño conjunto de
  movimientos altamente correlacionados.
- Decidir si Telegram debe consumir estadísticas de
  `PostgresForwardPerformanceProvider`.
- Evaluar cache compartido Forward/Evidence.

---

## Preguntas experimentales actuales

- ¿Score `95-100` funciona mejor que `90-94`?
- ¿Score `90+` aporta ventaja frente a `80-89`?
- ¿Qué timeframe funciona mejor?
- ¿STOCK, ETF y CRYPTO requieren parámetros diferentes?
- ¿Qué sectores/industrias funcionan mejor?
- ¿Cuál es la distribución real de MFE?
- ¿Cuál es la distribución real de MAE?
- ¿Qué targets producen mejor expectancy?
- ¿El stop financiero actual es razonable para todos los contextos?
- ¿Los targets/stops deberían depender de `asset_type + timeframe`?

---

# 8. V1.3 — Strategy Profile Research ✅

## Objetivo

Construir perfiles estadísticos descriptivos sobre Evidence sin modificar el motor operativo.

V1.3 responde preguntas como:

> ¿Cómo se comportan las señales históricas cuando se separan por asset type, timeframe, score bucket y strategy version?

No recomienda operar, no optimiza TP/SL y no declara rentabilidad. Solo resume lo observado en Evidence para alimentar decisiones humanas y futuras hipótesis.

## Agrupación

Los perfiles se agrupan por:

```text
asset_type + timeframe + score_bucket + strategy_version
```

Score buckets iniciales:

- `80-84`
- `85-89`
- `90-94`
- `95-100`

## Métricas

Cada profile incluye:

- `sampleSize`
- `resolvedSignalSampleSize`
- distribución de estados `OPEN`, `PARTIALLY_RESOLVED`, `CLOSED`, `EXPIRED`, `AMBIGUOUS`
- MFE promedio, mediana, p25, p75 y p90
- MAE promedio, mediana, p25, p75 y p90 conservando signo negativo
- target ladder experimental con `resolvedTargetSampleSize`, `winRate` y `reachRate`

## Trade Outcome vs Market Reachability

Para target experimental:

```text
winRate = wins / (wins + losses)
reachRate = (wins + ambiguous) / (wins + losses + expired + ambiguous)
```

`AMBIGUOUS` cuenta como target alcanzado para reachability porque el evaluador actual marca ese estado cuando la misma vela toca target y stop.

`NULL` significa unresolved y queda fuera del denominador. Esto evita penalizar señales recientes.

## Data maturity

`dataMaturity` usa:

```text
INSUFFICIENT: sampleSize < 30 OR resolvedSignalSampleSize < 10
EARLY:        sampleSize >= 30 AND resolvedSignalSampleSize >= 10
DEVELOPING:  sampleSize >= 75 AND resolvedSignalSampleSize >= 30
MATURE:      sampleSize >= 150 AND resolvedSignalSampleSize >= 60
```

`MATURE` no significa estadísticamente validado, rentable ni listo para operar capital real. Solo indica que existe una cantidad de data más seria para análisis.

## Endpoint

```text
GET /api/strategy-profiles
```

Filtros:

- `assetType`
- `timeframe`
- `scoreBucket`
- `strategyVersion`
- `minimumSampleSize`

## Reparación histórica de duplicados de Evidence ✅

Se completó una reparación no destructiva del bug histórico de duplicación de Evidence:

- Raw Evidence se preserva completo.
- 13 registros históricos de alta confianza fueron marcados como `excluded_from_research=true`.
- 2 registros posibles quedaron con `review_required=true` y siguen siendo elegibles para investigación.
- Strategy Profiles, Research Snapshot y Forward Performance operan sobre Research Eligible Evidence.
- No se eliminaron Evidence ni evaluaciones dependientes.
- No se hizo backfill heurístico de `signal_candle_timestamp` en legacy.

La limpieza histórica de `signals` y `opportunities` queda fuera de esta fase; por ahora se conservan como audit trail operacional.

## Protección de Evidence

V1.3 es read-only sobre Evidence:

- no crea migrations;
- no escribe ni reevalúa señales;
- no modifica MarketScan, scoring, Telegram ni Forward/Evidence evaluators;
- no altera métricas históricas de la bitácora.

---

# 8.6 Research Snapshot ✅

## Objetivo

Reducir el corte experimental diario manual a un solo endpoint read-only:

```text
GET /api/research-snapshot
```

## Alcance implementado

El snapshot consolida en un JSON autocontenido:

- metadata del corte en timezone de investigación;
- data quality de Evidence vs Evaluations;
- Evidence summary por score bucket;
- oportunidades operacionales usando `OPPORTUNITY_MIN_SCORE`;
- distribución de estados de evaluación;
- profile sample sizes;
- Global Target Ladder;
- MFE / MAE by profile;
- Strategy Profiles reutilizando `PostgresStrategyProfileProvider`;
- watch profiles derivados desde Strategy Profiles;
- Forward Performance reutilizando `PostgresForwardPerformanceProvider`.

## Principio de seguridad

El endpoint no interpreta resultados y no tiene side effects:

- no ejecuta Market Scan;
- no ejecuta evaluadores;
- no crea Evidence;
- no modifica Strategy Profiles;
- no escribe archivos;
- no crea migrations;
- no busca noticias.

La interpretación experimental se mantiene fuera de ARGOS.

---

# 9. V1.4 — Broker / Transaction Cost Model 🔥

## Objetivo

Evaluar la diferencia entre:

```text
gross market return
vs
net executable return
```

sin modificar Strategy Profiles, Evidence, scoring ni evaluadores.

V1.4 debe diseñarse como una capa independiente para estimar costos de ejecución antes de convertir observaciones de mercado en hipótesis operables.

## V1.4-A — Transaction Cost Core ✅

Status: **IMPLEMENTED & FUNCTIONALLY VALIDATED**.

Estado: implementado como núcleo puro y aislado.

Lo que ya existe:

- contratos de dominio para costos transaccionales;
- `TransactionCostCalculator` basado en `decimal.js`;
- regla `PERCENTAGE_NOTIONAL`;
- soporte de comisión mínima y máxima opcional;
- maker/taker independiente para compra y venta;
- cálculo de buy cost, sell cost, round-trip cost y retorno neto;
- cálculo de break-even directo para fees porcentuales simples;
- cálculo de break-even por búsqueda binaria para reglas con mínimo/máximo;
- catálogo versionado de product profiles iniciales de Bitso.

Perfiles implementados:

1. `BITSO_CRYPTO_MXN`
2. `BITSO_CRYPTO_USDC`

Semántica financiera:

```text
entryNotional = capital asignado al trade antes de costos
exitNotional = entryNotional * (1 + grossTargetPercent / 100)
grossProfit = exitNotional - entryNotional
roundTripCost = buyCost + sellCost
netProfit = grossProfit - roundTripCost
netReturnPercent = netProfit / entryNotional * 100
```

Convención pública:

```text
0.78 = 0.78%
1 = 1%
```

`grossTargetPercent = 0` es válido. Un target menor a cero es inválido.

Supuestos explícitos:

- `spreadIncluded=false`
- `slippageIncluded=false`
- funding/deposit/withdrawal/FX costs no incluidos

## Cómo interpretar un cálculo de costos

Esta sección explica cómo leer económicamente el resultado del `TransactionCostCalculator` sin asumir experiencia previa en trading.

Primero, tres ideas simples:

```text
Gross = qué hizo el mercado antes de costos.
Net = qué pasó con nuestro dinero después de los costos modelados.
Break-even = cuánto debe moverse el mercado para que los costos modelados queden cubiertos.
```

Un `target` es el movimiento que estamos evaluando como objetivo. Por ejemplo, `grossTargetPercent = 2` significa: “¿qué pasaría si el activo sube 2% antes de costos?”.

`TAKER` significa que asumimos una ejecución inmediata contra liquidez existente del mercado. Normalmente tiene una comisión mayor que `MAKER`.

`MAKER` significa que asumimos una orden que agrega liquidez al libro. Normalmente tiene una comisión menor, aunque no siempre se ejecuta.

Ejemplo real validado:

```text
profile: BITSO_CRYPTO_MXN
entryNotional: 5000 MXN
grossTargetPercent: 2%
buyExecution: TAKER
sellExecution: TAKER
```

```text
────────────────────────────────────
OPERACIÓN
────────────────────────────────────

Quiero comprar:                $5,000.00 MXN

El activo sube:                  +2.00%

Mi posición ahora vale:        $5,100.00 MXN

────────────────────────────────────
ANTES DE COSTOS
────────────────────────────────────

Ganancia bruta:                +$100.00 MXN

────────────────────────────────────
COSTOS
────────────────────────────────────

Comisión al comprar:            -$39.00 MXN
Comisión al vender:             -$39.78 MXN

Total comisiones:               -$78.78 MXN

────────────────────────────────────
RESULTADO DESPUÉS DE COSTOS
────────────────────────────────────

Ganancia neta:                  +$21.22 MXN

Rendimiento neto:                +0.4244%

────────────────────────────────────
PUNTO DE EQUILIBRIO
────────────────────────────────────

El activo necesitaba subir:      +1.5723%
para cubrir las comisiones modeladas.

Nuestro objetivo era:            +2.0000%

2.0000% > 1.5723%

Resultado:
El target supera el punto de equilibrio.
────────────────────────────────────
```

Correspondencia con los campos técnicos:

- `grossTargetPercent`: movimiento porcentual del activo que estamos evaluando antes de costos.
- `grossProfit`: ganancia producida por ese movimiento antes de costos.
- `buyCost`: comisión pagada al comprar.
- `sellCost`: comisión pagada al vender.
- `roundTripCost`: costo total de completar el ciclo compra + venta.
- `totalCashRequired`: dinero necesario para abrir la posición, incluyendo la comisión de compra.
- `netProfit`: dinero que queda de la ganancia después de restar las comisiones modeladas.
- `netReturnPercent`: ganancia neta expresada como porcentaje del `entryNotional`.
- `breakEvenGrossTargetPercent`: movimiento mínimo que necesita alcanzar el activo para cubrir las comisiones modeladas y quedar aproximadamente en cero.
- `grossTargetBelowBreakEven`: indica si el target evaluado está por debajo del punto de equilibrio.

Advertencia importante: “target viable” NO significa que sea un buen trade, que sea probable alcanzar el target ni que la estrategia sea rentable. Únicamente significa que, si el precio alcanza ese movimiento, dicho movimiento supera el punto de equilibrio de los costos actualmente modelados.

V1.4-A todavía no modela:

- `spread`: diferencia entre el precio al que alguien quiere comprar y el precio al que alguien quiere vender. En la práctica puede hacer que entres o salgas peor de lo esperado.
- `slippage`: diferencia entre el precio esperado y el precio real de ejecución. Suele aparecer cuando el mercado se mueve rápido o hay poca liquidez.
- `funding`: costos o pagos asociados a mantener ciertas posiciones, especialmente en derivados. V1.4-A sólo modela spot fees simples.
- `withdrawal`: comisiones por retirar dinero o cripto desde el broker/exchange.
- `FX`: costo de conversión entre monedas, por ejemplo MXN a USD o USD a MXN.

## V1.4-B — Application Service + HTTP Evaluation Endpoint ✅

Status: **IMPLEMENTED & FUNCTIONALLY VALIDATED**.

V1.4-B agrega una capa de aplicación read-only para consultar el core de costos desde HTTP sin mezclar comisiones con scoring técnico.

Implementado:

- `TransactionCostService` como capa de aplicación;
- endpoint `POST /api/transaction-costs/evaluate`;
- validación de request y errores controlados;
- interpretación derivada del resultado del core;
- sin escritura en PostgreSQL;
- sin llamadas a Yahoo, Telegram, Bitso ni órdenes reales.

Pendiente para fases futuras:

- integración con Strategy Profiles o Research Snapshot;
- persistencia opcional de escenarios;
- perfiles GBM/IBKR;
- spreads/slippage;
- FX costs cuando aplique.

## Alcance

V1.4 no debe declarar rentabilidad ni cambiar reglas de estrategia. Su función será agregar realismo económico a los resultados de investigación.

## Estado de cierre V1.4

V1.4 queda marcada como **COMPLETED** para el alcance aprobado: core puro de costos + servicio de aplicación + endpoint HTTP read-only. No implica que ARGOS opere automáticamente ni que una estrategia sea rentable; únicamente incorpora una herramienta validada para estimar costos modelados.

---

# 10. V1.5 — ARGOS Control Interface ✅

V1.5 busca separar Telegram en dos responsabilidades:

- **ARGOS Alerts Bot**: notificaciones automáticas generadas por ARGOS; flujo principalmente ARGOS → usuario.
- **ARGOS Control Bot**: futura interfaz privada para consultas y acciones iniciadas por el usuario; flujo usuario ↔ ARGOS.

La separación evita mezclar alertas automáticas con requests interactivos de control o análisis manual.

## V1.5-A — Control Core ✅

Status: **COMPLETED & VALIDATED**.

Implementado:

- configuración dual Alerts/Control con backward compatibility para variables legacy;
- modelos internos `TelegramControlUpdate`, `ControlResponse` e inline keyboards;
- `TelegramAuthorizationService` basado en Telegram `user_id`;
- `TelegramCommandRouter` para comandos y callbacks;
- `TelegramControlPresenter` para textos, menús y placeholders;
- `TelegramConversationStateService` en memoria con TTL de 15 minutos;
- tests de autorización, routing, presenter, estado y regresión del Alerts Bot.

V1.5-A no incluyó transporte real. Esa responsabilidad queda cerrada por V1.5-B.

## V1.5-B — Control Transport ✅

Status: **IMPLEMENTED & VALIDATED**.

Validación manual con Control Bot real de Telegram: **PASS**. El worker conecta, `/start` responde, los menús inline aparecen, los callbacks responden y la navegación funciona. Las opciones profundas permanecen `NOT_IMPLEMENTED`, esperado para V1.5-B.

Implementado:

- `TelegramControlClient` dedicado con `fetch` nativo;
- Telegram Bot API para Control Bot;
- `getUpdates` por Long Polling local con timeout largo;
- `TelegramControlPollingService` con offset en memoria, backoff y shutdown seguro;
- `telegramControlWorker` como proceso Node persistente separado de Azure Functions;
- validación inicial de `getWebhookInfo` para bloquear Long Polling si existe webhook activo;
- mapper raw Telegram Update → `TelegramControlUpdate` para mensajes y callback queries;
- autorización antes del router usando Telegram `user_id`;
- respuesta al `chat_id` entrante;
- envío de `ControlResponse` como mensaje Telegram con inline keyboard;
- `answerCallbackQuery` para limpiar spinner de callbacks;
- manejo explícito de 401 fatal, 429 con `retry_after`, 5xx/network con backoff;
- logs seguros sin tokens ni payload completo.

Arquitectura local planeada:

```text
Azure Functions local
+
Telegram Control Worker local
```

Long Polling no se ejecuta como loop infinito dentro de una Azure Function. En cloud, la alternativa futura natural será:

```text
Telegram Webhook
  ↓
HTTP Function
  ↓
TelegramCommandRouter
```

En el cierre específico de V1.5-B, las integraciones reales con servicios de ARGOS todavía quedaban para etapas posteriores. Ese alcance fue completado después por V1.5-C, V1.5-D, V1.5-E y V1.5-F.

## V1.5-E — Telegram Analyze Symbol ✅

Estado: **Completed / Manually Validated**.

V1.5-E agrega al Control Bot un flujo conversacional para analizar un símbolo bajo demanda sin ejecutar Market Scan.

Alcance implementado:

- menú `🔎 Market` → `🔎 Analyze Symbol`;
- captura de símbolo por texto y normalización `trim + uppercase`;
- selección de timeframe desde Telegram: `1m`, `5m`, `15m`, `1h`, `1d`, `1w`;
- `AnalyzeSymbolService` como servicio de aplicación read-only;
- reutilización de `MarketDataService`, `MarketUniverseService` y `OpportunityService`;
- resolución de `provider_symbol` desde el universo cuando existe;
- los símbolos desconocidos se rechazan de forma explícita si no existen en `market_symbols`;
- uso de `MARKET_SCAN_CANDLE_LIMIT` desde `engine_config` y mínimo técnico de 60 velas;
- respuesta enriquecida con precio, score, componentes, razones y timestamp de la última vela usada.

Límites explícitos:

- no usa `MarketScanExecutor`;
- no persiste `signals`, `evidence_signals`, `forward_signals` ni `opportunities`;
- no envía alertas por el Alerts Bot;
- no usa `NotificationService`;
- no crea órdenes ni operaciones reales;
- no modifica scoring, target ladder, Evidence ni Strategy Research.

Semántica:

```text
Telegram Control Bot
  ↓
TelegramCommandRouter
  ↓
AnalyzeSymbolService
  ↓
MarketUniverseService + MarketDataService
  ↓
OpportunityService / analyzers existentes
  ↓
TelegramControlPresenter
```

El timestamp mostrado en Telegram es `latestCandleTimestamp`: la última vela realmente usada para el análisis, no la hora en la que el usuario pidió el análisis.

Validación manual real: **PASS**.

Se confirmó:

- `/start` → Market → Analyze Symbol;
- `NVDA / 15m` con asset `STOCK`, price, score, component scores, reasons, 80 candles y última vela disponible con mercado cerrado;
- `BTC-USD / 1m` con asset `CRYPTO`, price, score, component scores, reasons, 80 candles y última vela reciente coherente con mercado 24/7;
- threshold operativo mostrado correctamente;
- el flujo es read-only y no tiene rutas de persistencia.

## V1.5-E.1 — Telegram Analyze Symbol Guided Navigation 🚧

Estado: **Implemented / Pending Manual Validation**.

V1.5-E.1 mejora la experiencia del Control Bot para analizar símbolos bajo demanda usando el Market Universe real como fuente de navegación.

Flujo implementado:

```text
🔎 Market
  ↓
🔎 Analyze Symbol
  ↓
Asset Type
  ↓
Sector / Industry cuando aplica
  ↓
Symbol
  ↓
Timeframe
  ↓
AnalyzeSymbolService existente
```

Alcance:

- navegación por `asset_type` real: STOCK, ETF y CRYPTO;
- STOCK navega por sector e industria cuando la metadata lo permite;
- ETF usa la metadata disponible sin categorías hardcodeadas;
- VOO queda incluido como Broad Market ETF con `displayName` human-friendly persistente;
- CRYPTO va directo a símbolos activos;
- paginación para listas grandes;
- navegación contextual hacia atrás;
- botones finales de símbolo con formato `ticker — human-friendly display name` usando `market_symbols.display_name` como fuente persistente cuando está disponible;
- entrada manual de ticker conservada como escape hatch;
- timeframes disponibles para análisis manual: `1m`, `5m`, `15m`, `1h`, `1d`, `1w`.

Principios preservados:

- no se implementa un segundo motor de análisis;
- el resultado final sigue pasando por `AnalyzeSymbolService`;
- no se hardcodean símbolos ni categorías;
- no se crean migrations;
- no se escribe Evidence, Signals, Forward Signals ni Opportunities;
- no se llama `MarketScanExecutor` ni `NotificationService`;
- el filtro temporal de Telegram Alerts para `1m` y `5m` no aplica a Analyze Symbol;
- `strategy_version=v1` permanece sin cambios.

Pendiente de validación manual:

- probar navegación STOCK → sector → industria → símbolo → timeframe;
- probar ETF con metadata real;
- probar CRYPTO directo a símbolos;
- probar entrada manual;
- probar paginación y regreso contextual;
- confirmar desde PostgreSQL que no hubo writes atribuibles a Analyze Symbol.

## V1.5-F — Telegram Full Market Scan ✅

Estado: **Completed / Manually Validated**.

V1.5-F conecta el botón `🚀 Full Market Scan` del Control Bot con el pipeline operacional real de ARGOS.

Flujo implementado:

```text
Telegram Control Bot
  ↓
Full Market Scan confirmation
  ↓
MarketScanExecutor.run({ notify: true })
  ↓
Watchlist / Market Universe
  ↓
Market Data / analyzers / scoring
  ↓
OpportunityFilter / RiskService
  ↓
Persistence / Evidence / Signals / Alerts según reglas actuales
  ↓
Telegram Control summary
```

Principios respetados:

- no existe un segundo Market Scan;
- no se duplica resolución de watchlist/universo;
- no se duplican analyzers, scoring, filtros, risk, dedupe ni notificaciones;
- `MarketScanExecutor` sigue siendo la fuente operacional;
- el Alerts Bot sigue separado del Control Bot;
- Control Bot muestra solo confirmación, estado iniciado y summary final;
- no hay migrations nuevas ni persistencia específica del Control Bot.

UX implementada:

- `🚀 Full Market Scan` muestra advertencia y no ejecuta todavía;
- `✅ Confirm` dispara el scan real;
- `❌ Cancel` vuelve al menú Market sin ejecutar;
- `🚀 Run Again` vuelve a la pantalla de confirmación, no ejecuta directo;
- si ya hay un scan lanzado por Control Bot en curso, responde `Ya hay un Market Scan en ejecución`.

Concurrencia:

El guard de V1.5-F es in-memory y protege únicamente ejecuciones lanzadas desde el Control Bot en el proceso actual. No es un lock distribuido y no impide por sí solo que el Timer normal o un HTTP Market Scan se solapen. Esa coordinación global queda fuera de alcance de V1.5-F.

Polling:

El Control Bot responde rápido `Market Scan iniciado` y ejecuta el scan en background con manejo explícito de errores y liberación del guard en `finally`. Esto evita dejar al usuario sin feedback y reduce el riesgo de congelar el loop de polling durante scans largos.

Side effects esperados:

A diferencia de Analyze Symbol, Full Market Scan sí puede crear oportunidades, signals, Evidence y Alerts si el pipeline operacional actual decide hacerlo. V1.5-F no agrega side effects nuevos; solo expone la ejecución confirmada del pipeline existente desde Telegram.

Validación manual real: **PASS**.

Se confirmó navegación, confirmación explícita, ejecución del pipeline operacional real, summary final, separación entre Control Bot y Alerts Bot, y protección in-memory contra doble ejecución desde el Control Bot.

## Shadow Paper Trading v0.1 🧪

Estado: **Implemented / Pending Manual Validation**.

Objetivo: observar señales operables en modo paper sin broker, sin órdenes reales y sin tocar dinero real.

Scope fijo del experimento:

```text
asset_type = STOCK
timeframe = 5m
score = 100
strategy_version = v1
paper_strategy_version = paper-v0.1
signal_type = LONG
referenceSnapshotDate = 2026-09-05
```

Referencias congeladas para contexto, no como TP/SL automático:

```text
MFE reference = +0.89%
MAE reference = -1.05%
```

Niveles de seguimiento:

```text
Favorable reference: +0.89%
Adverse reference:   -1.05%
Follow-up:           +1.50%, +2.00%, +3.00%, +5.00%
```

Implementado:

- tablas `paper_trades` y `paper_trade_levels`;
- registro manual desde Telegram Control Bot;
- consulta de paper trades abiertos;
- cierre manual desde Telegram Control Bot;
- monitor automático cada minuto;
- actualización de `current_mfe_pct`, `current_mae_pct`, `highest_price_seen` y `lowest_price_seen`;
- alertas Telegram cuando se cruza un nivel no disparado;
- claim atómico por nivel para evitar alertas duplicadas;
- excepción de Alerts Bot para permitir notificar `STOCK + 5m + Score100 + strategy_version=v1` aunque `5m` esté silenciado por el filtro general.

Motivación documental:

`STOCK · 5m · Score100` fue elegido porque, al 2026-09-05, es el subconjunto descriptivamente más interesante dentro de la investigación por score. Esto no implica edge demostrado; sólo justifica observación prospectiva controlada.

Límites explícitos:

- no modifica scoring;
- no modifica Strategy v1;
- no modifica Evidence ni Forward Evaluation;
- no modifica Strategy Profiles ni Research Snapshot;
- no ejecuta órdenes reales;
- no integra broker;
- no interpreta `+0.89%` como target operativo ni `-1.05%` como stop obligatorio;
- el botón directo desde una alerta del Alerts Bot queda como evolución futura porque el long polling actual procesa el Control Bot, no callbacks del Alerts Bot.

Arquitectura conceptual:

```text
Signal STOCK 5m Score100
   ↓
Telegram Alert exception
   ↓
Control Bot registra Paper Trade
   ↓
paper_trades + paper_trade_levels
   ↓
PaperTradeMonitor cada minuto
   ↓
alerta por nivel alcanzado
   ↓
usuario decide continuar o cerrar
```

## 2026-09-05 — Research Documentation Cut

Estado: **Documentation Cut / Research Update**.

Este corte documenta la lectura actual de ARGOS después de integrar:

- investigación descriptiva por score mediante `/api/score-performance`;
- auditorías humanas manuales sobre señales `STOCK 15m` y `ETF 15m`;
- implementación experimental de Shadow Paper Trading v0.1;
- mantenimiento de `strategy_version=v1` congelada.

Decisión metodológica vigente:

```text
Strategy v1 permanece frozen.
No iniciar Trade Plan Research antes del primer corte mensual,
salvo bugs o problemas metodológicos.
```

Shadow Paper Trading v0.1 no reemplaza esa regla. Es un carril paralelo para comenzar a capturar observaciones prospectivas de gestión de posición, sin retroalimentar Strategy v1 todavía.

Lectura actual permitida:

> En la muestra actual, `STOCK · 5m · Score100` luce descriptivamente diferente frente a `STOCK · 5m · Score90-94`: mayor MFE promedio/mediano y mayor reach rate en varios targets, sin incremento material del MAE mediano.

Lectura no permitida:

```text
Score100 tiene edge.
Score100 es rentable.
Score100 predice ganancias.
Strategy v1 está validada.
```

H7 permanece abierta:

> El Score podría estar midiendo intensidad/confluencia del estado técnico actual más que funcionar como predictor ordinal simple de magnitud/calidad futura.

Nueva hipótesis provisional H9:

> `STOCK · 5m · Score100` podría identificar un subconjunto descriptivamente distinto dentro de Strategy v1, útil para observación prospectiva mediante Shadow Paper Trading.

Estado: **EARLY / OPEN**. No validada.

Auditorías humanas:

- `STOCK · 15m`: 6 casos Score100 auditados; human mean `87.0`; mean delta `-13.0`.
- `ETF · 15m`: 6 casos auditados; ARGOS mean `97.5`; human mean `78.7`; mean delta `-18.8`.

Principal discrepancia recurrente:

```text
Structure quality/context
```

Hipótesis de auditoría:

- H-AUDIT-01: ARGOS podría puntuar correctamente la presencia de condiciones técnicas, pero sobrevalorar su calidad contextual al alcanzar puntuaciones máximas, especialmente en Structure.
- H-AUDIT-02: Volume Score intradía podría requerir normalización por hora de sesión; apertura/cierre tienen volumen naturalmente superior.
- Momentum podría requerir gradación contextual más fina en una futura Strategy v2.

Ninguna de estas hipótesis cambia Strategy v1.

## 2026-09-01 — Telegram Alert Timeframe Filter

Estado: **Implemented & Validated / Operational Adjustment**.

Se limita temporalmente el Alerts Bot a `15m,1d,1w` mediante `TELEGRAM_NOTIFICATION_TIMEFRAMES`. `1m` y `5m` siguen analizándose, generando Evidence, participando en Forward Evaluation y Strategy Research. El cambio es de presentación/notificación, no de estrategia; `strategyVersion=v1` permanece igual.

Semántica operativa actual:

| Timeframe | Market Scan | Signal/Evidence | Forward Evaluation | Strategy Research | Automatic Alerts Bot         |
| --------- | ----------- | --------------- | ------------------ | ----------------- | ---------------------------- |
| `1m`      | ACTIVE      | ACTIVE          | ACTIVE             | ACTIVE            | SILENCED                     |
| `5m`      | ACTIVE      | ACTIVE          | ACTIVE             | ACTIVE            | SILENCED                     |
| `15m`     | ACTIVE      | ACTIVE          | ACTIVE             | ACTIVE            | ACTIVE según reglas normales |
| `1d`      | ACTIVE      | ACTIVE          | ACTIVE             | ACTIVE            | ACTIVE según reglas normales |
| `1w`      | ACTIVE      | ACTIVE          | ACTIVE             | ACTIVE            | ACTIVE según reglas normales |

Variable de configuración:

```text
TELEGRAM_NOTIFICATION_TIMEFRAMES=15m,1d,1w
```

Clasificación:

```text
NOTIFICATION / UX CHANGE
```

No es `STRATEGY CHANGE`; `strategy_version` permanece `v1`.

## Current Path / Next Milestones

```text
V1.6-A Market Universe Expansion
        ✅
        ↓
V1.6-B Sector-Aware Research
        NEXT
        ↓
Evidence Collection v1
        ACTIVE
        ↓
Weekly Research Checkpoints
        ↓
First Monthly Research Cut
        ↓
Trade Plan Research
        ↓
V2 Strategy Calibration
        ↓
Out-of-Sample Validation
        ↓
Paper Trading
        ↓
Small Capital Live Pilot
        ↓
Validated Operational System
```

Engineering puede continuar en paralelo mientras Evidence Collection sigue activa, siempre que no modifique silenciosamente `strategy_version=v1` ni cambie scoring, analyzers, thresholds, Target Ladder, stops o reglas de Evidence.

## V1.6-A — Market Universe Expansion & Segmentation ✅

Estado: **Completed & Validated**.

V1.6-A amplía el universo real usado por ARGOS Engine sin cambiar la lógica de scoring ni el pipeline de señales. La expansión conserva los símbolos existentes y agrega cobertura en segmentos que estaban débiles: Broad Market ETFs, sector ETFs, semiconductores, tasas/bonos, metales, utilities, real estate/REITs y líderes adicionales por sector.

Estado final validado:

```text
103 símbolos activos
5 timeframes
515 combinaciones symbol/timeframe
```

Asset types actuales:

```text
STOCK
ETF
CRYPTO
```

Metadata disponible:

```text
asset_type
sector
industry
exchange
market
timezone
session_type
provider_symbol
```

Clasificación metodológica:

```text
DATA / EXPOSURE / SAMPLING CHANGE
```

V1.6-A no fue un cambio de estrategia. `strategy_version` permanece `v1`.

No cambiaron por V1.6-A:

- scoring;
- analyzers;
- thresholds;
- Target Ladder;
- RiskService;
- Evidence rules;
- Forward Evaluation rules.

Principios aplicados:

- migración data-only e idempotente;
- no deletes, no truncate, no schema migration;
- `provider_symbol` validado contra Yahoo Finance antes de insertar;
- metadata conservadora: no inventar datos no confiables;
- `GLD` conserva su registro previo y sólo completa sector `Metals` si estaba vacío;
- no cambia Evidence, Strategy Profiles, Telegram, Transaction Costs, RiskService ni Market Scan;
- la matriz final esperada queda dentro del rango operativo de 90-110 símbolos activos.

Validación manual completada:

- migración aplicada en PostgreSQL local;
- conteo activo final confirmado;
- distribución por `asset_type`, `sector`, `industry`, `market` y `session_type` revisada;
- Full Market Scan ejecutado con concurrencia controlada;
- STOCK/ETF intradía fuera de sesión se omite como `market-closed` sin llamar Yahoo;
- crypto permanece 24/7.

## V1.6-B — Sector-Aware Research 📋

Estado: **NEXT / PLANNED**.

Objetivo:

Aprovechar la metadata incorporada y normalizada por V1.6-A para investigar el comportamiento de Evidence por sector e industry sin modificar el Signal Engine.

Strategy Profiles estudia actualmente principalmente:

```text
asset_type
+
timeframe
+
score_bucket
+
strategy_version
```

V1.6-B debe extender las capacidades de investigación para análisis como:

```text
asset_type
+
sector
+
industry
+
timeframe
+
score_bucket
+
strategy_version
```

Preguntas descriptivas esperadas:

- ¿Technology se comporta diferente de Financial Services?
- ¿Healthcare presenta MFE/MAE distintos?
- ¿Semiconductors tiene comportamiento diferente dentro de Technology?
- ¿Los targets alcanzables cambian por sector?
- ¿Existen sectores con Evidence insuficiente?
- ¿Los resultados observados dependen excesivamente de un sector o industria?

Principio obligatorio:

> V1.6-B debe observar, no optimizar.

V1.6-B será **READ-ONLY RESEARCH**.

No debe:

- modificar scoring;
- modificar weights;
- modificar analyzers;
- modificar thresholds;
- modificar targets;
- modificar stops;
- excluir sectores del Market Scan;
- favorecer sectores;
- crear reglas operativas sectoriales;
- cambiar `strategy_version`.

## V1.5-D — Telegram Transaction Costs Integration ✅

Status: **COMPLETED / MANUALLY VALIDATED**.

Implementado:

- menú `💰 Transaction Costs` conectado a `TransactionCostService`;
- callbacks `argos:v1:costs:bitso_mxn` y `argos:v1:costs:bitso_usdc`;
- flujo conversacional en memoria con TTL de 15 minutos;
- captura de capital como `entryNotional`;
- captura de target bruto esperado en porcentaje humano;
- selección Maker/Taker por inline keyboard;
- Maker aplica entrada/salida Maker y Taker aplica entrada/salida Taker;
- resultado compacto con gross profit, fees, round trip, net profit, net return y break-even;
- manejo seguro de errores sin stack traces ni secretos;
- sin llamadas HTTP localhost, sin PostgreSQL writes, sin migrations y sin órdenes reales.

Validación manual:

- flujo completo probado desde el Control Bot real;
- Bitso MXN validado manualmente;
- captura de capital y target validada;
- Maker/Taker validado;
- navegación y cancelación validadas.

## V1.5-C — Read-only Research Integrations ✅

Status: **COMPLETED / MANUALLY VALIDATED**.

Alcance implementado:

- Research Snapshot real desde `ResearchSnapshotService`;
- Strategy Profiles real desde `PostgresStrategyProfileProvider`;
- Forward Performance real desde `PostgresForwardPerformanceProvider`;
- System Status read-only con health check mínimo `SELECT 1`;
- botones `Refresh` para volver a consultar servicios reales;
- navegación contextual de regreso a Research/System menus;
- manejo seguro de errores sin stack traces ni secretos al usuario;
- sin llamadas HTTP localhost desde Telegram;
- sin writes en PostgreSQL;
- sin cambios de Evidence, scoring, targets, Market Scan, costos o alertas.

Validación manual real: **PASS**.

El Control Bot consulta servicios reales read-only y mantiene navegación/refresh sin escrituras en PostgreSQL ni cambios en el pipeline operativo.

---

# 11. Backlog futuro — Portfolio Risk & Exposure Manager

## Objetivo

Responder una pregunta diferente al scoring técnico:

> ¿Cuánto riesgo representa tomar una nueva oportunidad considerando las demás posiciones y exposiciones existentes?

El score responde:

> ¿Qué tan bueno es técnicamente este setup según nuestras reglas?

Portfolio Risk responde:

> ¿Qué exposición agrega esta oportunidad al portafolio?

Ambos conceptos deben permanecer desacoplados.

```text
Market Scan
    ↓
Opportunity
    ↓
Technical Score
    ↓
Portfolio Risk
    ↓
Exposure Analysis
    ↓
Decisión humana
```

---

## Principio fundamental

Una oportunidad técnicamente excelente no necesariamente debe recibir
la exposición máxima permitida.

Ejemplo:

```text
NVDA  → 95
AMD   → 95
MU    → 90
ARM   → 95
AVGO  → 95
```

Individualmente:

```text
5 oportunidades válidas
```

Colectivamente:

```text
Alta concentración
en Semiconductors
```

Las cinco pueden ser trades distintos y conservar su score.

Pero desde riesgo pueden compartir una misma fuente de exposición.

---

# 11.1. Exposure Manager

## Backlog

- Definir riesgo máximo por trade.
- Definir riesgo máximo total abierto.
- Definir exposición máxima por `asset_type`.
- Definir exposición máxima por `sector`.
- Definir exposición máxima por `industry`.
- Calcular riesgo agregado.
- Detectar concentración excesiva.
- Recomendar reducción de position sizing cuando corresponda.
- No modificar el score técnico por concentración.
- Mantener parámetros funcionales en `engine_config`.
- Diseñar la capa para integrarse posteriormente con Trade Companion.
- Mantener inicialmente el resultado como recomendación/información.
- No bloquear automáticamente operaciones durante esta etapa.

Configuraciones conceptuales:

```text
MAX_RISK_PER_TRADE
MAX_TOTAL_OPEN_RISK
MAX_ASSET_TYPE_RISK
MAX_SECTOR_RISK
MAX_INDUSTRY_RISK
```

Los valores concretos deberán definirse antes de implementar comportamiento
operativo.

---

## Ejemplo conceptual

Capital:

```text
$10,000
```

Riesgo individual permitido:

```text
0.50%
```

ARGOS encuentra:

```text
NVDA → 95
AMD  → 95
MU   → 95
ARM  → 95
AVGO → 95
```

Individualmente:

```text
$50 riesgo por trade
```

Colectivamente:

```text
$250
=
2.50% de riesgo
```

concentrado en una industria.

Portfolio Risk podría detectar:

```text
⚠️ CONCENTRACIÓN DETECTADA

Industry:
Semiconductors

Oportunidades:
5

Riesgo potencial:
2.50%

Límite configurado:
1.00%
```

La solución no necesariamente implica eliminar oportunidades.

Podría recomendar:

```text
NVDA → 0.20%
AMD  → 0.20%
MU   → 0.20%
ARM  → 0.20%
AVGO → 0.20%

Total:
1.00%
```

---

# 10.2. Correlation Risk

Sector e industria son aproximaciones útiles, pero no capturan toda la
dependencia entre instrumentos.

Dos instrumentos pueden estar altamente correlacionados aunque sus
clasificaciones no sean idénticas.

## Backlog futuro

- Matriz de correlación entre símbolos.
- Correlación histórica rolling.
- Detección de clusters altamente correlacionados.
- Riesgo efectivo considerando correlación.
- Volatilidad por instrumento.
- Concentración por factores comunes.
- Evaluar cómo tratar Evidence altamente correlacionada al interpretar
  tamaños de muestra.

Evolución:

```text
Portfolio Risk V1
        ↓
Asset Type
Sector
Industry
        ↓
Portfolio Risk V2
        ↓
Correlación histórica
        +
Volatilidad
        +
Posiciones abiertas
```

---

## Implicación para Evidence

Ejemplo:

```text
NVDA → WIN
AMD  → WIN
MU   → WIN
ARM  → WIN
AVGO → WIN
```

Son cinco señales reales.

Pero no necesariamente representan:

```text
5 fenómenos completamente independientes
```

Podrían representar:

```text
1 movimiento sectorial fuerte
manifestado en
5 instrumentos correlacionados
```

Esto no invalida las señales.

Sí debe considerarse posteriormente al interpretar la robustez estadística
de Evidence.

---

## Relación futura con Trade Companion

```text
Nueva Opportunity
       ↓
Portfolio actual
       ↓
Exposure Manager
       ↓
¿Cabe el riesgo completo?
       │
       ├── Sí
       │     ↓
       │ riesgo normal
       │
       └── No
             ↓
       reducir exposición
       o advertir
```

Mientras la ejecución siga siendo discrecional:

> Portfolio Risk debe asistir la decisión humana y no sustituirla.

---

# 11. Hito v1.0.0 — Detection & Evidence

Crear el primer release/tag formal cuando Detection & Evidence haya sido
validado suficientemente con datos reales.

```text
Market
  ↓
Análisis masivo
  ↓
Signal
  ↓
Telegram
  ↓
Forward Evaluation
  ↓
Evidence
  ↓
Performance estadístico
```

La implementación técnica de Evidence por sí sola no obliga a crear el tag.

---

# 12. V2 — Strategy Calibration

## Condición de entrada

V2 no comienza simplemente porque V1.2 esté implementado.

Debe existir Evidence suficiente para formular y validar hipótesis sin
modificar prematuramente:

```text
strategy_version = v1
```

---

## Backlog

- Validar si mayor Score implica mejores resultados.

Comparar buckets:

```text
80-84
85-89
90-94
95-100
```

Comparar comportamiento por:

```text
timeframe
asset_type
sector
industry
```

Comparar:

```text
STOCK
vs
ETF
vs
CRYPTO
```

Backtestear targets:

```text
+0.50%
+0.75%
+1.00%
+1.25%
+1.50%
+2.00%
+3.00%
+5.00%
```

También:

- Backtestear distintos Stop Loss.
- Calibrar TP/SL por timeframe cuando Evidence lo justifique.
- Evaluar calibración por `asset_type + timeframe`.
- Analizar expectancy.
- Analizar Profit Factor.
- Incorporar Maximum Drawdown.
- Incorporar Losing Streak.
- Evaluar Average Win / Average Loss.
- Evaluar costos.
- Evaluar spread.
- Evaluar slippage.
- Market Data Candle Resampling.
- Request Deduplication.
- Comparar V1 contra cualquier estrategia candidata V2.
- Realizar validación out-of-sample.
- Crear nueva `strategy_version` ante cambios materiales del algoritmo.

---

## Hipótesis de calibración

No asumir que:

```text
STOCK 1m
STOCK 15m
CRYPTO 1m
CRYPTO 15m
```

deben utilizar necesariamente los mismos:

```text
TP
SL
horizonte de evaluación
```

Posible evolución:

```text
Asset Type
│
├── STOCK
│   ├── 1m
│   ├── 5m
│   ├── 15m
│   ├── 1d
│   └── 1w
│
├── ETF
│   ├── 1m
│   ├── 5m
│   ├── 15m
│   ├── 1d
│   └── 1w
│
└── CRYPTO
    ├── 1m
    ├── 5m
    ├── 15m
    ├── 1d
    └── 1w
```

Cada combinación podría eventualmente tener parámetros calibrados a partir
de Evidence.

Esto representa una hipótesis de evolución.

No es una decisión actual de estrategia.

---

## Principio de V2

> **Evidence genera hipótesis.
> Backtest ayuda a investigarlas.
> Forward out-of-sample decide si merecen confianza.**

No cambiar el algoritmo por intuición.

---

# 11. V3 — Trade Companion

## Objetivo

Conectar las oportunidades detectadas por ARGOS con las operaciones que el
usuario realmente decide tomar.

## Backlog

- Telegram bidireccional.
- Identificador legible de señal.
- Comando conceptual:

```text
/enter SIGNAL_ID
```

- Tabla separada de trades reales.
- Trade Monitor automático.
- Seguimiento de trades `OPEN`.
- Alertas de 50%/75% hacia SL.
- Alerta de SL alcanzado.
- Alertas de proximidad a TP1/TP2.
- Alertas de TP1/TP2 alcanzados.
- Deduplicación de notificaciones.
- Cierre/cancelación desde Telegram.
- Integración con Portfolio Risk antes de registrar nuevas posiciones.
- Registrar entry real separado del entry teórico cuando corresponda.

Separación fundamental:

```text
SIGNAL
=
el algoritmo detectó una oportunidad

TRADE
=
el usuario decidió operar esa señal
```

---

# 12. V3.1 — Trading Journal

## Objetivo

Medir la diferencia entre el comportamiento teórico de ARGOS y la ejecución
real del usuario.

## Backlog

- Entry real.
- Exit real.
- Capital.
- Position size.
- PnL realizado.
- Duración.
- Win rate personal.
- Average win/loss.
- Expectancy.
- Profit Factor.
- Drawdown.
- Losing streak.
- Performance por:
  - score
  - timeframe
  - sector
  - industry
  - asset type
- Comparación resultado teórico vs resultado real.
- Medición futura de execution gap.

Considerar:

```text
slippage
spread
comisiones
retraso de entrada
decisiones discrecionales
```

Flujo:

```text
SIGNAL
¿Qué detectó el algoritmo?

        ↓

FORWARD EVALUATION
¿Qué hizo el mercado?

        ↓

TRADE
¿Qué decidió operar el usuario?

        ↓

TRADE RESULT
¿Qué resultado obtuvo?

        ↓

EXECUTION GAP
¿Qué diferencia hubo entre
modelo y ejecución?
```

---

# 13. V4 — Product

## Backlog futuro

- Dashboard web.
- Signals / Opportunities.
- Trades activos.
- Trading Journal.
- Forward Performance.
- Backtest Performance.
- Portfolio Risk.
- Administración de `engine_config`.
- Administración de símbolos.
- Administración de timeframes.
- Visualización por sector/industry.
- Strategy versions.
- Reportes.
- Historial de señales.

---

## Market Calendar / Hardening

Pendiente:

- Calendario bursátil completo.
- Holidays.
- Early closes.
- Sesiones especiales.
- Evaluar pre-market.
- Evaluar after-hours.

Actualmente la lógica de sesión evita requests intradía fuera de mercado en
condiciones normales.

Durante la fase local/experimental, excepciones como feriados pueden manejarse
operativamente sin convertir todavía el calendario externo en prioridad sobre
Portfolio Risk.

Por lo tanto:

```text
Portfolio Risk
    ↓
prioridad funcional

Market Calendar
    ↓
hardening posterior
```

---

# 14. V5 — Platform

Solo considerar si existe necesidad real de convertir ARGOS en producto
multiusuario.

## Backlog futuro

- Usuarios.
- Autenticación.
- Suscripciones.
- Planes.
- Preferencias.
- Watchlists por usuario.
- Distribución Telegram.
- Billing.
- Límites por plan.
- Historial por usuario.
- Configuración individual de alertas.

---

## Principio de producto

No posicionar ARGOS como:

> “Bot que garantiza ganancias”.

Posicionamiento conceptual:

> **Radar cuantitativo / asistente de detección y evaluación de oportunidades para traders discrecionales.**

El valor está en reducir el universo que el usuario necesita revisar y aportar
contexto cuantitativo.

No en garantizar el resultado de una operación.

---

# 15. Backlog técnico transversal

## Market Data

- Candle resampling.
- Request deduplication.
- Cache compartido entre evaluadores cuando sea justificable.
- Seguir monitoreando rate limits.
- Seguir monitoreando latencia del proveedor.

---

## Scheduling

- Coordinar timers para evitar ráfagas innecesarias de requests.
- Mantener `marketScan` y evaluaciones Forward/Evidence suficientemente
  desacoplados en tiempo.
- Evitar que varios procesos consulten simultáneamente el mismo rango cuando
  pueda reutilizarse información.
- Medir primero las colisiones reales antes de introducir orquestación más
  compleja.

---

## Data Protection & Disaster Recovery

- Daily PostgreSQL Custom Dump usando `pg_dump -Fc` como snapshot recuperable del dataset operativo.
- SHA-256 verification por snapshot mediante `manifest.json` y script manual de verificación.
- Restore verification mediante `pg_restore --list` y, cuando se decida manualmente, restore hacia una base disposable.
- Disaster recovery documentation generada junto a cada snapshot en `RESTORE.md`.
- Restore drills periódicos para comprobar que los dumps realmente sirven antes de necesitarlos.
- Offsite/remote backup como evolución necesaria antes de operar en serio fuera de entorno local.
- Cuando ARGOS viva en cloud, migrar almacenamiento de dumps fuera del filesystem de la aplicación hacia object storage / bucket / remote durable storage.
- Considerar posteriormente retention policy, encryption at rest y lifecycle policy.
- No elegir todavía proveedor cloud específico; mantenerlo conceptual hasta decidir infraestructura.

## PostgreSQL

- Mantener repositorios y SQL explícitos mientras sean mantenibles.
- Evaluar un query builder como Knex únicamente si la complejidad real de
  filtros y queries dinámicos empieza a justificarlo.
- No introducir abstracciones únicamente por anticipación.

---

## Market Sessions

- Calendario bursátil completo.
- Holidays.
- Early closes.
- Sesiones especiales.
- DST y timezone deben seguir tratándose explícitamente.

---

# 16. Principios del roadmap

1. **Medir antes de optimizar.**

2. **No mover la portería.**
   Conservar las reglas de una `strategy_version` mientras se mide.

3. **Separar detección de ejecución.**
   ARGOS Engine detecta; el humano decide.

4. **Separar calidad técnica de riesgo de portafolio.**

5. **Forward data > impresión visual.**

6. **Una muestra grande no necesariamente implica observaciones independientes.**

7. **Una muestra pequeña no demuestra ventaja.**

8. **Evitar look-ahead bias.**

9. **No vender win rate como probabilidad de éxito de la siguiente operación.**

10. **No cambiar estrategia por intuición después de observar pocos resultados.**

11. **Secrets/API keys nunca pertenecen a configuración funcional.**

12. **La estrategia debe validarse out-of-sample antes de aumentar confianza operativa.**

13. **ARGOS es un asistente cuantitativo experimental, no una garantía de rentabilidad.**

---

# 17. Definición del producto

> **Radar cuantitativo de mercado que analiza automáticamente múltiples activos y temporalidades, filtra condiciones técnicas relevantes, notifica oportunidades y mide posteriormente su eficacia mediante evidencia histórica y forward.**

Conceptualmente:

```text
103 símbolos activos
    ×
5 temporalidades
    ↓
hasta 515 análisis potenciales
    ↓
ARGOS
ARGOS
    ↓
pocas oportunidades relevantes
    ↓
Portfolio Risk
    ↓
contexto para decisión humana
```

---

## Score vs Portfolio Risk

```text
SCORE

¿Qué tan bueno es el setup
según nuestras reglas?

        ↓

PORTFOLIO RISK

¿Cuánto riesgo agrega tomarlo
junto con las demás posiciones?

        ↓

DECISIÓN HUMANA

¿Quiero ejecutar el trade?
```

---

# 18. Política obligatoria de actualización

Este archivo es un **documento vivo** y debe formar parte del proceso de
desarrollo.

## Bloque para agregar a futuros prompts de Codex

```text
DOCUMENTATION REQUIREMENT

Antes de finalizar el commit:

1. Revisa ROADMAP.md.

2. Actualiza el estado de las funcionalidades implementadas.

3. Marca como completados únicamente elementos realmente implementados
   y validados.

4. Agrega nueva deuda técnica o backlog descubierto durante el desarrollo.

5. Actualiza "Estado actual" si cambió el hito.

6. No marques una versión como completada si sus criterios todavía
   no se cumplen.

7. Si el cambio modifica materialmente la estrategia, documenta el nuevo
   strategy_version.

8. Conserva el historial conceptual de hitos; no borres etapas anteriores.

9. Incluye la actualización de ROADMAP.md dentro del mismo commit.

10. En el resumen final indica explícitamente qué se modificó en ROADMAP.md.

11. No mezcles resultados experimentales puntuales dentro del roadmap.
    Los cortes, métricas e hipótesis observadas pertenecen a docs/reports/bitacora_experimental.md.

12. No cambies strategy_version=v1 durante Evidence Collection salvo que
    exista una decisión explícita y documentada de crear una nueva estrategia.

13. Distingue claramente entre:
    - funcionalidad implementada;
    - funcionalidad validada;
    - hipótesis experimental;
    - backlog.

ROADMAP.md es la fuente de verdad del estado, hitos, versiones y backlog
del proyecto.

docs/reports/bitacora_experimental.md es la fuente de verdad de los cortes experimentales,
observaciones e hipótesis.
```

---

# 19. Fases actuales de investigación

## Definiciones del camino metodológico

- **Evidence / Research:** observa qué ocurrió después de las señales.
- **Strategy Calibration:** formula reglas candidatas usando Evidence suficiente.
- **Out-of-Sample Validation:** prueba reglas congeladas con datos nuevos que no fueron utilizados para formularlas.
- **Paper Trading:** simula operaciones completas bajo condiciones reales sin usar capital real.
- **Small Capital Live Pilot:** opera con capital real pequeño únicamente después de cumplir criterios metodológicos y de riesgo.

## 1. Technical PoC

**Estado:** prácticamente validada.

El pipeline técnico funciona de punta a punta:

```text
Market Data
    ↓
Market Scan
    ↓
Technical Analysis / Scoring
    ↓
Signal / Evidence Capture
    ↓
Forward Evaluation
    ↓
MFE / MAE
    ↓
Experimental Target Ladder
    ↓
Strategy Profiles
    ↓
Experimental Research Log
```

Esto valida la mecánica del software, no la rentabilidad de la estrategia.

## 2. Evidence / Research

**Estado:** fase actual.

Periodo orientativo: agosto-octubre 2026. Las fechas no son compromisos; dependen de data maturity, cantidad de outcomes resueltos y diversidad de mercado.

Durante Evidence Build v1 se mantiene congelado:

```text
strategy_version = v1
```

## 3. V1.4 Broker / Transaction Cost Model

**Estado:** completado para el alcance aprobado: core puro, servicio de aplicación y endpoint HTTP read-only.

Se construyó en paralelo a Evidence Collection porque no modifica Strategy Profiles ni Evidence.

## 4. Trade Plan Research

**Estado:** futuro.

Trade Plan Research combinará:

- Strategy Profiles;
- Sector-Aware Research;
- MFE;
- MAE;
- Target Reachability;
- Transaction Costs;
- Risk / Reward.

No define todavía Take Profit definitivo, Stop Loss definitivo, parámetros específicos por sector ni parámetros específicos por asset/timeframe. Esas decisiones deben derivarse posteriormente de Evidence suficiente.

## 5. Out-of-Sample / Forward Validation

**Estado:** futuro.

Congelar reglas candidatas y probarlas con datos nuevos no utilizados para formularlas.

## 6. Paper Trading

**Estado:** futuro.

Sólo después de contar con reglas candidatas, costos considerados y validación forward/out-of-sample.

## 7. Small Capital Live Pilot

**Estado:** futuro y condicionado.

No está desbloqueado por la implementación técnica actual ni por un único corte experimental.

## 8. Validated Operational System

**Estado:** objetivo eventual, no garantizado.

---

# 20. Criterio para comenzar experimentación con capital real

No forma parte del alcance actual.

Tampoco se considera desbloqueado únicamente por alcanzar cierto número de
Evidence.

Antes de considerar micro-capital deberían existir, como mínimo:

- Evidence suficiente y diversificada.
- Outcomes resueltos suficientes.
- Expectancy históricamente positiva en el segmento candidato.
- Profit Factor consistente.
- Maximum Drawdown conocido.
- Losing Streak conocido.
- Costos/spread/slippage considerados.
- Estrategia candidata congelada.
- Validación Forward out-of-sample con datos no utilizados para calibrarla.
- Reglas de Portfolio Risk definidas.
- Position sizing basado en riesgo.
- Ausencia de bugs conocidos que comprometan evaluación o ejecución.

La transición conceptual debe ser:

```text
Research
   ↓
Evidence
   ↓
Calibration
   ↓
Out-of-sample
   ↓
Micro-capital
   ↓
Comparación modelo vs ejecución real
   ↓
Escalamiento gradual únicamente
si la evidencia continúa siendo favorable
```

---

# 21. Arquitectura conceptual objetivo

ARGOS evoluciona hacia dos líneas paralelas:

```text
                    ARGOS
                      │
          ┌───────────┴───────────┐
          │                       │
          ↓                       ↓
     ENGINEERING               RESEARCH
          │                       │
          ↓                       ↓
   Cost Model                 Evidence V1
   Trade Companion            Forward Performance
   Hardening                  Hipótesis
          │                       │
          └───────────┬───────────┘
                      ↓
              Strategy Calibration
                      ↓
              Out-of-sample
                      ↓
              Decisión humana
```

Esto permite seguir desarrollando el sistema sin modificar continuamente
el objeto que estamos intentando medir.

---

**Última actualización conceptual:** 2026-09-05
**Estado:** `v0.9 — Pre-V1 / Evidence Validation`
**Desarrollo siguiente:** `V1.6-B — Sector-Aware Research`
**Experimento activo:** `strategy_version=v1 — Evidence Collection`
**Próximo release planeado:** `v1.0.0 — Detection & Evidence`

## 2026-09-06 — PostgreSQL authoritative configuration

Estado: **Implemented / Pending Manual Validation**.

ARGOS deja de mantener dos fuentes funcionales de configuración. Thresholds, scoring, trade plan, strategy version, candle limit, throughput de market data y timeframes notificables viven en `engine_config`; el universo operacional vive en `market_symbols` y `symbol_timeframes`.

`local.settings.json` queda reservado para secretos, bootstrap e infraestructura. Si PostgreSQL no tiene configuración activa suficiente o el universo está vacío, ARGOS falla explícitamente en lugar de usar `env-fallback`.

## ORB-FVG Scalping Research — Parallel Research Experiment

Estado: **v0.2 IMPLEMENTED — PENDING PROSPECTIVE VALIDATION**.

ORB-FVG agrega un carril de investigación prospectiva separado de Strategy v1. No modifica scoring, analyzers, OpportunityService, Evidence v1, Forward Evaluation v1, Shadow Paper Trading ni Telegram alert filtering existente.

Hipótesis v0.2: usar Opening Range 15m y confirmar breakout/FVG en 5m puede reducir micro-noise frente a v0.1. Una vez confirmado el candidate en 5m, 1m queda reservado para refinamiento discrecional de entrada fuera del detector automático.

Implementado:

- universo `STOCK`/`ETF` desde Market Universe PostgreSQL;
- exclusión inicial de `CRYPTO`;
- Opening Range 15m en `America/New_York` sin offsets UTC hardcodeados;
- `orb-fvg-v0.1` histórico preservado: 15m OR + detector automático 1m;
- `orb-fvg-v0.2` activo: 15m OR + detector automático 5m;
- detección prospectiva LONG-only reproducible desde 2026-09-08;
- bullish FVG matemático de tres velas 5m en v0.2;
- `maxFvgLagCandles=3`;
- entry reproducible en `candle3.close`;
- stop detrás de breakout candle;
- target principal `2R`;
- R ladder descriptiva `0.5R, 1R, 1.5R, 2R, 3R`;
- monitor prospectivo propio con MFE/MAE y outcomes;
- persistencia propia en `orb_fvg_signals` y `orb_fvg_signal_levels`;
- Telegram ORB-FVG silenciado durante validación técnica v0.2;
- endpoint read-only `GET /api/orb-fvg/signals`.

Nota metodológica 2026-09-08:

`orb-fvg-v0.1` se conserva como histórico del experimento 15m OR + detector 1m. Su primera sesión prospectiva produjo 192 candidates, 65 tickers únicos, repeated crossings, detección retrospectiva, tiny 1m FVGs y discrepancia Yahoo/TradingView en PLD. Señales SHORT previas, si existen, se preservan intactas y pueden terminar su forward evaluation; no deben mezclarse con el dataset LONG-only posterior.

Boundary v0.2:

`orb-fvg-v0.2` cambia exclusivamente el timeframe de setup detection de 1m a 5m: Opening Range sigue siendo la primera vela 15m 09:30–09:45 ET con ORHigh/ORLow reales; breakout y FVG usan velas 5m nativas del provider; 1m queda fuera del detector automático y sólo se usa manualmente para refinamiento discrecional.

Telegram behavior: ORB-FVG permanece silenciado durante validación técnica de v0.2. Candidate detection y final outcome notifications están deshabilitadas; final outcomes continúan persistiendo silenciosamente para research.

Limitaciones conocidas:

- Yahoo Finance es suficiente para research experimental, no feed profesional de ejecución de scalping.
- No hay calendario bursátil completo para holidays/early closes.
- Resultados brutos no incluyen spread, slippage ni comisiones.
- v0.2 todavía no está validado prospectivamente.

## ORB-FVG v0.3 — Retest Structure Confirmation

ORB-FVG se documenta como **Parallel Research Experiment**. Puede evolucionar por versiones experimentales propias (`orb-fvg-v0.1`, `orb-fvg-v0.2`, `orb-fvg-v0.3`) sin cambiar `strategy_version=v1` ni reemplazar el roadmap formal de Strategy v1. V1.6-B sigue siendo el desarrollo principal de investigación sector-aware para Evidence.


Estado: **v0.3 IMPLEMENTED — PENDING PROSPECTIVE VALIDATION**.

Hipótesis v0.3: breakout + bullish FVG no deben tratarse como entrada automática. Deben crear una zona de interés. El setup sólo queda listo si después existe retest del FVG, recuperación estructural sobre el high previo al retroceso y confirmación de continuación.

Boundary v0.3:

```text
Breakout + FVG = setup de interés
SETUP_PREVIEW = estructura avanzada para revisión
TRADE_READY = estructura completa confirmada
WIN/LOSS = no aplica sin entry manual/paper definida
```

Implementado:

- `orb-fvg-v0.3` activo: 15m OR + 5m breakout/FVG + retest + structure confirmation;
- detección prospectiva LONG-only;
- bullish FVG matemático de tres velas 5m;
- small FVG permitido si es matemáticamente válido;
- `preRetraceHigh` calculado prospectivamente como máximo high observado desde FVG creation hasta antes del primer retest;
- multiple retests permitidos sin reiniciar `preRetraceHigh`;
- estado `SETUP_PREVIEW` cuando el precio recupera `preRetraceHigh`;
- estado terminal `TRADE_READY` para setup completo;
- estado terminal `EXPIRED_SETUP` si termina la sesión antes de confirmar;
- v0.3 no inventa `entry`, `stop`, `risk` ni `target2R`;
- el forward monitor de outcomes no evalúa setups v0.3 que no tengan modelo de trade;
- Telegram ORB-FVG queda controlado por `ORB_FVG_TRADE_READY_ALERTS_ENABLED`;
  default `false` durante validación técnica.
- Si se habilita, alerta únicamente `SETUP_PREVIEW` y `TRADE_READY`; breakout, FVG y retest no generan Telegram.

Ejemplos exploratorios que motivaron la hipótesis: TSLA, BA, PLD, GOOGL, SO y BAC. Estas observaciones no afirman rentabilidad.

Limitación consciente: invalidation estructural distinta de `EXPIRED_SETUP` queda para investigación posterior.


## Objetivos de la próxima sesión ORB-FVG

La próxima sesión de ORB-FVG no busca demostrar profitability. Busca observar prospectivamente si el esquema `SETUP_PREVIEW` / `TRADE_READY` reduce ruido y mejora la calidad de revisión manual.

Objetivos:

1. verificar que `SETUP_PREVIEW` reduzca spam;
2. verificar visualmente que las alertas correspondan con la estructura esperada;
3. observar cuántos previews terminan en `TRADE_READY`;
4. comparar `setupPreviewPrice` vs `tradeReadyPrice`;
5. observar setups que fallan entre preview y ready;
6. estudiar posibles referencias estructurales de SL;
7. estudiar potencial R:R 2:1 sin convertirlo todavía en regla;
8. preparar análisis posterior de MFE/MAE desde preview y ready;
9. detectar patrones antes de congelar Entry/SL/TP.

No se agregan filtros de FVG mínimo, ATR, volumen, EMA, RSI, displacement, candle body threshold, cooldown ni one-trade-per-day por esta hipótesis.
