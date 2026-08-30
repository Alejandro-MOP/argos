# ARGOS — Roadmap, Hitos y Versionamiento

> Documento vivo del proyecto. Codex debe actualizarlo en cada cambio relevante.

**Estado actual:** `Research / Evidence Build`
**Desarrollo siguiente:** `V1.5-C — Control Application Integrations`
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
61 símbolos
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
305 combinaciones potenciales por ciclo
```

antes de aplicar filtros de sesión y configuración.

El sistema no interpreta el `score` como una probabilidad de éxito.

El score representa:

> Qué tan bien cumple un setup las reglas técnicas vigentes de la estrategia.

---

# 2. Estado general

| Versión                                    | Objetivo                                                | Estado                                   |
| ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------- |
| V0 — Core                                  | Núcleo cuantitativo desacoplado                         | ✅ Completado                            |
| V1 — ARGOS Engine Signals                  | Detectar, persistir, notificar y evaluar señales        | ✅ Funcional                             |
| V1.1 — Dynamic Configuration               | Configuración, universo y sesiones desde PostgreSQL     | ✅ Completado                            |
| V1.1.1 — Market Data Throughput            | Concurrencia controlada y retries seguros               | ✅ Completado                            |
| V1.2 — Evidence                            | Medir estadísticamente la calidad de los setups         | 🧪 Implementado / recolectando evidencia |
| V1.3 — Strategy Profile Research           | Perfiles descriptivos por asset/timeframe/score/version | ✅ Implementado                          |
| **V1.4-A — Transaction Cost Core** | Cálculo puro de costos, maker/taker y break-even | ✅ Implemented & Functionally Validated |
| **V1.4-B — Cost Application Layer** | Servicio de aplicación y endpoint HTTP read-only para evaluar costos | ✅ Implemented & Functionally Validated |
| **V1.5 — ARGOS Control Interface** | Interfaz privada de control vía Telegram separada de alertas | 🚧 In Progress |
| **V1.5-A — Control Core** | Configuración dual, autorización, router, presenter y estado en memoria | ✅ Completed & Validated |
| **V1.5-B — Control Transport** | Telegram Bot API, Long Polling local y worker de control | ✅ Implemented & Validated |
| **V1.5-C — Read-only Research Integrations** | Snapshot, Strategy Profiles, Forward Performance y System Status desde Control Bot | 🚧 Implemented / Pending Manual Validation |
| Portfolio Risk & Exposure Manager          | Riesgo agregado, concentración y exposición             | 📋 Backlog                               |
| V2 — Strategy Calibration                  | Mejorar estrategia utilizando Evidence                  | 📊 Requiere muestra suficiente           |
| V3 — Trade Companion                       | Seguimiento de trades realmente tomados                 | 📋 Backlog                               |
| V3.1 — Trading Journal                     | Medir decisiones y resultados reales                    | 📋 Backlog                               |
| V4 — Product                               | Dashboard y administración visual                       | 🌱 Futuro                                |
| V5 — Platform                              | Usuarios, preferencias y posible comercialización       | 💭 Futuro                                |

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
- Fallback a ENV/configuración anterior cuando corresponde.
- Overrides HTTP conservados para pruebas manuales cuando corresponde.

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
docs/bitacora_experimental.md
```

El roadmap y la bitácora experimental tienen responsabilidades diferentes:

```text
ROADMAP.md
    ↓
estado del producto
hitos
versiones
backlog


docs/bitacora_experimental.md
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

# 10. V1.5 — ARGOS Control Interface 🚧

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

Las integraciones reales con servicios de ARGOS quedan para etapas posteriores a V1.5-B. Hoy los botones profundos responden `NOT_IMPLEMENTED` y no ejecutan Market Scan ni consultas reales de Research desde Telegram.


## V1.5-C — Read-only Research Integrations 🚧

Status: **IMPLEMENTED / PENDING MANUAL VALIDATION**.

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

Pendiente antes de marcar Completed:

- validación manual desde Telegram real;
- comparación funcional con `GET /api/research-snapshot`, `GET /api/strategy-profiles` y `GET /api/forward-performance`.

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
61 símbolos
    ×
5 temporalidades
    ↓
hasta 305 análisis potenciales
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
    Los cortes, métricas e hipótesis observadas pertenecen a docs/bitacora_experimental.md.

12. No cambies strategy_version=v1 durante Evidence Collection salvo que
    exista una decisión explícita y documentada de crear una nueva estrategia.

13. Distingue claramente entre:
    - funcionalidad implementada;
    - funcionalidad validada;
    - hipótesis experimental;
    - backlog.

ROADMAP.md es la fuente de verdad del estado, hitos, versiones y backlog
del proyecto.

docs/bitacora_experimental.md es la fuente de verdad de los cortes experimentales,
observaciones e hipótesis.
```

---

# 19. Fases actuales de investigación

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

**Estado:** siguiente desarrollo.

Puede construirse en paralelo a Evidence Collection porque no modifica Strategy Profiles ni Evidence.

## 4. Trade Plan Research

**Estado:** futuro.

Combinará:

- Strategy Profiles;
- MFE/MAE;
- Target Reachability;
- Transaction Costs;
- Risk/Reward.

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

**Última actualización conceptual:** 2026-08-28
**Estado:** `v0.9 — Pre-V1 / Evidence Validation`
**Desarrollo siguiente:** `V1.5-C — Control Application Integrations`
**Experimento activo:** `strategy_version=v1 — Evidence Collection`
**Próximo release planeado:** `v1.0.0 — Detection & Evidence`
