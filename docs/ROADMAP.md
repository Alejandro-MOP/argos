# Market Signal Engine — Roadmap, Hitos y Versionamiento

> Documento vivo del proyecto. Codex debe actualizarlo en cada cambio relevante.

**Estado actual:** `v0.9 — Pre-V1 / Evidence Validation`
**Desarrollo siguiente:** `V1.3 — Portfolio Risk & Exposure Manager`
**Experimento activo:** `strategy_version=v1 — Evidence Collection`
**Próximo release planeado:** `v1.0.0 — Detection & Evidence`

---

## 1. Objetivo

Market Signal Engine es un radar cuantitativo de mercado que analiza
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
Portfolio Risk
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

| Versión                         | Objetivo                                            | Estado                                   |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| V0 — Core                       | Núcleo cuantitativo desacoplado                     | ✅ Completado                            |
| V1 — Signal Engine              | Detectar, persistir, notificar y evaluar señales    | ✅ Funcional                             |
| V1.1 — Dynamic Configuration    | Configuración, universo y sesiones desde PostgreSQL | ✅ Completado                            |
| V1.1.1 — Market Data Throughput | Concurrencia controlada y retries seguros           | ✅ Completado                            |
| V1.2 — Evidence                 | Medir estadísticamente la calidad de los setups     | 🧪 Implementado / recolectando evidencia |
| **V1.3 — Portfolio Risk**       | Riesgo agregado, concentración y exposición         | 🔥 Siguiente desarrollo                  |
| V2 — Strategy Calibration       | Mejorar estrategia utilizando Evidence              | 📊 Requiere muestra suficiente           |
| V3 — Trade Companion            | Seguimiento de trades realmente tomados             | 📋 Backlog                               |
| V3.1 — Trading Journal          | Medir decisiones y resultados reales                | 📋 Backlog                               |
| V4 — Product                    | Dashboard y administración visual                   | 🌱 Futuro                                |
| V5 — Platform                   | Usuarios, preferencias y posible comercialización   | 💭 Futuro                                |

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

# 4. V1 — Signal Engine

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

# 5. V1.1 — Dynamic Engine Configuration & Market Universe

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

# 6. Estado actual — v0.9 Pre-V1 / Evidence Validation

El motor ya puede:

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
EXPERIMENT_LOG.md
```

El roadmap y la bitácora experimental tienen responsabilidades diferentes:

```text
ROADMAP.md
    ↓
estado del producto
hitos
versiones
backlog


EXPERIMENT_LOG.md
    ↓
cortes experimentales
métricas observadas
hipótesis
hallazgos
```

Podemos continuar desarrollando capacidades alrededor del motor siempre que
no modifiquemos silenciosamente las reglas de:

```text
strategy_version = v1
```

---

# 7. V1.2 — Evidence 🧪

## Objetivo

Responder con datos:

> ¿Las alertas y setups detectados por el motor realmente identifican oportunidades útiles?

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
```

### Deduplicación

Evidence deduplica por:

```text
ticker
+
timeframe
+
strategy_version
+
duplicate window
```

Esto evita registrar repetidamente el mismo setup durante ejecuciones
consecutivas.

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

# 8. V1.3 — Portfolio Risk & Exposure Manager 🔥

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

# 8.1. V1.3.1 — Exposure Manager

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

# 8.2. V1.3.2 — Correlation Risk

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

# 9. Hito v1.0.0 — Detection & Evidence

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

# 10. V2 — Strategy Calibration

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
   El engine detecta; el humano decide.

4. **Separar calidad técnica de riesgo de portafolio.**

5. **Forward data > impresión visual.**

6. **Una muestra grande no necesariamente implica observaciones independientes.**

7. **Una muestra pequeña no demuestra ventaja.**

8. **Evitar look-ahead bias.**

9. **No vender win rate como probabilidad de éxito de la siguiente operación.**

10. **No cambiar estrategia por intuición después de observar pocos resultados.**

11. **Secrets/API keys nunca pertenecen a configuración funcional.**

12. **La estrategia debe validarse out-of-sample antes de aumentar confianza operativa.**

13. **El motor es un asistente cuantitativo, no una garantía de rentabilidad.**

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
Market Signal Engine
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
    Los cortes, métricas e hipótesis observadas pertenecen a EXPERIMENT_LOG.md.

12. No cambies strategy_version=v1 durante Evidence Collection salvo que
    exista una decisión explícita y documentada de crear una nueva estrategia.

13. Distingue claramente entre:
    - funcionalidad implementada;
    - funcionalidad validada;
    - hipótesis experimental;
    - backlog.

ROADMAP.md es la fuente de verdad del estado, hitos, versiones y backlog
del proyecto.

EXPERIMENT_LOG.md es la fuente de verdad de los cortes experimentales,
observaciones e hipótesis.
```

---

# 19. Próximos pasos

## Desarrollo

### 🔥 V1.3 — Portfolio Risk & Exposure Manager

Construir una capa independiente del scoring que permita medir concentración
y exposición agregada antes de que ARGOS evolucione hacia seguimiento de
trades reales.

Primera evolución:

```text
Opportunity
    ↓
Score
    ↓
Sector / Industry / Asset Type
    ↓
Exposure Manager
    ↓
Risk Recommendation
```

No modificar:

```text
strategy_version = v1
```

como consecuencia de esta etapa.

---

## Experimento en paralelo

Mantener congelada:

```text
strategy_version = v1
```

y continuar recolectando Evidence real.

Cortes orientativos:

```text
~100 Evidence
      ↓
Smoke test estadístico


~250 Evidence
      ↓
Primer análisis segmentado


~500 Evidence
      ↓
Comparaciones más útiles por:
score
timeframe
asset type


~1000+ Evidence
      ↓
Evaluar hipótesis candidatas para V2
```

Estos tamaños son referencias operativas.

No son criterios estadísticos suficientes por sí solos.

También deben considerarse:

- cantidad de outcomes resueltos;
- diversidad de sesiones/días;
- distintos regímenes de mercado;
- distribución por timeframe;
- distribución por asset type;
- correlación entre observaciones;
- concentración sectorial;
- estabilidad out-of-sample.

---

## Secuencia conceptual actual

```text
V1.2 Evidence
     │
     ├──────────────→ Recolección continua de Evidence V1
     │
     ↓
V1.3 Portfolio Risk
     ↓
Muestra suficiente
     ↓
V2 Strategy Calibration
     ↓
Out-of-sample Validation
     ↓
Micro-capital experimental
     ↓
V3 Trade Companion
     ↓
V3.1 Trading Journal
```

---

## Hardening posterior

- Calendario bursátil completo.
- Holidays.
- Early closes.
- Sesiones especiales.
- Cache compartido Forward/Evidence.
- Request deduplication.
- Candle resampling.
- Mejor coordinación de jobs si las métricas muestran colisiones.
- Evaluar Knex únicamente si la complejidad de PostgreSQL lo justifica.

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
   Portfolio Risk             Evidence V1
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

**Última actualización conceptual:** 2026-08-26
**Estado:** `v0.9 — Pre-V1 / Evidence Validation`
**Desarrollo siguiente:** `V1.3 — Portfolio Risk & Exposure Manager`
**Experimento activo:** `strategy_version=v1 — Evidence Collection`
**Próximo release planeado:** `v1.0.0 — Detection & Evidence`
