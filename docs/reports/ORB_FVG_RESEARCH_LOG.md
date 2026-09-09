# ORB-FVG Research Log — ARGOS

Bitácora cronológica y acumulativa del experimento paralelo `ORB-FVG Scalping Research`.

ORB-FVG no reemplaza `Strategy v1`, no modifica Evidence v1 y no forma parte del roadmap principal de calibración hasta que exista evidencia prospectiva suficiente. Este documento registra evolución metodológica, auditorías manuales, límites y preguntas abiertas.

---

## Estado del experimento

Status: **ACTIVE PARALLEL RESEARCH EXPERIMENT**.

Purpose:

Investigar una estrategia discrecional/asistida basada en:

```text
Opening Range
+
Fair Value Gap
+
Retest
+
Structure Confirmation
```

ARGOS actúa inicialmente como:

- setup scanner;
- research collector;
- trade monitor descriptivo cuando existe modelo de trade definido.

ARGOS no actúa como:

- automatic trading system;
- broker executor;
- financial recommendation engine.

La decisión humana sigue siendo obligatoria.

---

## 2026-09-08 — Origen operativo: `orb-fvg-v0.1`

Arquitectura inicial:

```text
15m Opening Range
+
1m Breakout
+
1m FVG
+
automatic candidate
+
forward evaluation
```

Opening Range:

```text
09:30–09:45 ET
ORHigh = first15m.high
ORLow  = first15m.low
```

FVG bullish baseline:

```text
candle3.low > candle1.high
```

Original breakout LONG:

```text
candle.close > ORHigh
AND
candle.open <= ORHigh
```

Inicialmente existieron candidates LONG y SHORT. Posteriormente el experimento quedó restringido a **LONG-only** porque el trader no busca operar setups SHORT dentro de esta línea experimental.

Historical SHORT evidence remains preserved. No debe mezclarse con el dataset LONG-only posterior.

---

## 2026-09-08 — First prospective session

Population observada:

```text
192 candidates
65 unique tickers
```

Outcomes registrados al momento de auditoría:

```text
43 WIN
148 LOSS
1 EXPIRED
```

Estos resultados **no representan performance válida** de la hipótesis actualmente propuesta.

El forensic audit encontró:

- repeated OR crossings;
- multiple candidates per ticker/session;
- retrospective/backfill candidate discovery;
- detection lag in some candidates;
- microscopic FVGs;
- Yahoo vs TradingView candle/provider discrepancy;
- insufficient deduplication at setup level.

Hallazgo crítico:

```text
7 de los 43 WIN auditados tenían targetReachedAt < createdAt
```

Esto es evidencia del retrospective/backfill problem. Por lo tanto, esos 43 WIN no deben reinterpretarse como 43 trades que un trader hubiera podido tomar en vivo.

---

## 2026-09-08 — PLD forensic case

PLD fue un caso importante porque permitió separar un posible bug de lógica de un problema de proveedor/agregación de datos.

La investigación descartó la hipótesis de que ARGOS estuviera usando Open/Close para definir Opening Range.

El código usaba correctamente:

```text
ORHigh = high
ORLow  = low
```

Yahoo/ARGOS aproximadamente:

```text
ORHigh = 137.8899
ORLow  = 136.4000
```

TradingView observado manualmente:

```text
Opening Range materialmente diferente
```

Conclusión:

```text
provider/data aggregation discrepancy
not Open/Close boundary bug
```

Este caso queda registrado como provider limitation / research consideration.

---

## 2026-09-08 — Cambio conceptual: 1m → 5m

La revisión manual mostró que 1m generaba demasiado micro-noise para la estructura que el trader quiere observar.

Nueva separación conceptual:

```text
15m = Opening Range context
5m  = setup / structure detection
1m  = discretionary entry refinement
```

Importante:

Esto no significa “run 1m scanner every 5 minutes”. Significa que el detector automático usa velas 5m. El trader sólo baja posteriormente a 1m después de recibir un setup suficientemente confirmado.

---

## 2026-09-08 — Auditoría manual de WINs

Se realizó una revisión manual en TradingView sobre varios candidates que ARGOS había clasificado como WIN.

Objetivo:

```text
Separar OUTCOME CORRECTNESS de SETUP QUALITY
```

Hasta ahora se revisaron LONG examples:

- TSLA
- BA
- PLD
- GOOGL
- SO
- BAC

SHORT candidates fueron excluidos intencionalmente porque el trader no busca operar setups SHORT.

### Resultados de revisión manual

TSLA:

- ARGOS outcome: WIN
- manual structure assessment: TRADE candidate
- breakout 1m appeared weak/marginal
- 5m showed clearer structure
- FVG identified
- retest observed
- recovery above pre-retrace high
- continuation confirmation observed

BA:

- ARGOS outcome: WIN
- manual assessment: NO TRADE
- breakout observed
- no sufficiently clear FVG structure identified
- no complete desired setup

PLD:

- ARGOS outcome: WIN
- manual assessment: NO TRADE
- breakout observed
- clear/wide FVG observed
- midpoint/50% used descriptively
- retest occurred
- price failed to break the relevant pre-retrace high
- no continuation confirmation

GOOGL:

- ARGOS outcome: WIN
- manual assessment: TRADE candidate
- breakout
- very small but visually/mathematically identifiable FVG
- retest
- pre-retrace high broken
- subsequent candle continued and closed higher
- manual 2:1 visualization was drawn after confirmation

SO:

- ARGOS outcome: WIN
- manual assessment: NO TRADE
- breakout
- FVG
- multiple retests
- failed to recover/break pre-retrace high
- no continuation confirmation

BAC:

- ARGOS outcome: WIN
- manual assessment: NO TRADE
- breakout existed
- no convincing complete FVG/structure
- rejected before considering future outcome

Summary:

```text
6 LONG WIN candidates manually inspected

TRADE candidates: 2
- TSLA
- GOOGL

NO TRADE: 4
- BA
- PLD
- SO
- BAC
```

Esto no es performance analysis. Los seis casos vienen de una población ya clasificada como WIN por el detector anterior. El objetivo fue entender qué estructuras el trader sí consideraría accionables.

---

## Principio metodológico clave

```text
ARGOS WIN ≠ valid discretionary setup
```

El detector anterior podía evaluar correctamente que una entrada mecánica hipotética alcanzó su target, mientras el trader nunca habría considerado válido el setup subyacente.

Por eso ORB-FVG separa:

```text
SETUP DETECTION
from
TRADE FORWARD EVALUATION
```

Un candidate no debe entrar a evaluación WIN/LOSS de trade sólo porque existió breakout/FVG.

---

## H-ORB-RETEST-01 — Retest + Structure Confirmation

Status: **OPEN / UNTESTED**.

Concepto:

Un bullish ORB-FVG setup puede requerir:

```text
Opening Range breakout
→ bullish FVG
→ FVG retest
→ recovery above the relevant pre-retrace high
→ continuation confirmation
```

antes de considerarse:

```text
TRADE_READY
```

Esta hipótesis emergió de revisión manual exploratoria. No ha demostrado edge ni profitability.

---

## Máquina de estados experimental actual

```text
WAITING_FOR_OR
      ↓
OR_READY
      ↓
WAITING_FOR_BREAKOUT
      ↓
BREAKOUT_CONFIRMED
      ↓
WAITING_FOR_FVG
      ↓
FVG_CREATED
      ↓
WAITING_FOR_RETEST
      ↓
FVG_RETESTED
      ↓
WAITING_FOR_STRUCTURE_BREAK
      ↓
PRE_RETRACE_HIGH_BROKEN
      ↓
SETUP_PREVIEW
      ↓
WAITING_FOR_CONTINUATION
      ↓
CONTINUATION_CONFIRMED
      ↓
TRADE_READY
```

Interpretación obligatoria:

- `BREAKOUT_CONFIRMED` no significa trade.
- `FVG_CREATED` no significa trade.
- `FVG_RETESTED` no significa trade.
- `PRE_RETRACE_HIGH_BROKEN` produce `SETUP_PREVIEW`, no trade.
- `SETUP_PREVIEW` significa “revisar gráfico si se desea”.
- `TRADE_READY` requiere la secuencia experimental completa.

---

## FVG midpoint

Durante la revisión manual, el midpoint de un FVG amplio se usó como referencia visual de profundidad del retest.

Fórmula:

```text
fvgMidpoint = (fvgLow + fvgHigh) / 2
```

Status actual:

```text
DESCRIPTIVE / RESEARCH ONLY
```

Midpoint touch no es una regla requerida.

Pregunta futura:

> ¿La profundidad del retest dentro del FVG aporta información útil?

---

## FVG size

GOOGL mostró una observación importante: un FVG muy pequeño puede estar seguido de una estructura que el trader sí considera accionable.

Por ahora:

```text
NO minimum FVG size
```

Pregunta abierta:

> ¿El tamaño del FVG importa de forma independiente o depende del retest + structure confirmation posterior?

Status: **OPEN**.

---

## H-ORB-BREAKOUT-01 — Breakout quality

Status: **OPEN / UNTESTED**.

Algunos breakouts mecánicamente válidos se observaron visualmente marginales.

Ejemplos:

- TSLA initial 1m breakout
- BAC

Hipótesis potencial:

> La magnitud/calidad del desplazamiento del breakout puede contener información que `close > ORHigh` no captura.

No se promueve todavía a regla de estrategia. No hay threshold ATR/volume/displacement justificado actualmente.

---

## Continuation confirmation

La revisión manual refinó la hipótesis: el trader no espera simplemente un número fijo de velas.

Después del FVG retest:

1. espera recuperación sobre el `preRetraceHigh` relevante;
2. observa si el precio mantiene el breakout;
3. confirma continuación con una vela posterior cerrando arriba.

GOOGL fue un ejemplo representativo:

```text
structure break
+
subsequent candle closing higher
→ discretionary confirmation
```

No existe regla “always wait exactly 3 candles”. La estructura es la condición; el número de velas es incidental.

---

## Telegram philosophy

Filosofía anterior:

```text
breakout/FVG
→ Telegram candidate
→ trader receives large amount of noise
```

Filosofía actual:

```text
preliminary states remain silent
SETUP_PREVIEW → Telegram alert
TRADE_READY → Telegram alert
```

Estados silenciosos:

- `OR_READY`
- `BREAKOUT_CONFIRMED`
- `FVG_CREATED`
- `FVG_RETESTED`

Telegram debe actuar como capa selectiva de setups, no como stream de cada evento técnico.

Después de `TRADE_READY`:

```text
trader opens TradingView
→ optionally moves to 1m
→ refines discretionary entry
→ decides whether to register trade
```

---

## Trade management vision

Futuro flujo deseado después de registrar manualmente un trade:

ARGOS podría monitorear milestones R configurables:

```text
+0.5R
+1R
+1.5R
+2R
+3R
...
```

Estas alertas serían informativas.

Llegar a `+2R` no significa cerrar automáticamente. El trader puede decidir:

- take profit;
- partial;
- break-even;
- protect position;
- trail;
- continue accompanying trend.

No hay broker execution automático.

---

## Multi-timeframe observation

El trader ha observado manualmente estructuras visualmente similares de FVG / breakout / retest / continuation en otros símbolos y timeframes.

Esto es:

```text
EXPLORATORY OBSERVATION ONLY
```

No implica fractal profitability. No mezclar Evidence entre timeframes.

El experimento formal ORB-FVG actual permanece limitado a su configuración explícitamente implementada. Experimentos futuros pueden evaluar otros timeframes de forma independiente.

---

## Límites metodológicos actuales

- Las observaciones actuales no demuestran profitability.
- La muestra es pequeña.
- La revisión manual introduce discreción.
- Los ejemplos revisados fueron seleccionados desde candidates ya clasificados WIN.
- No existe out-of-sample validation.
- No existe transaction-cost-adjusted expectancy.
- No existe Profit Factor evidence.
- No existe drawdown analysis.
- No existe broker execution.
- ARGOS no despliega capital real.

Wording preferido:

```text
promising exploratory structure under active prospective validation
```

Evitar describir ORB-FVG como profitable, validated, proven o con demonstrated edge.


---

## 2026-09-09 — Telegram SETUP_PREVIEW / TRADE_READY

Se ajusta la filosofía de alertas para reducir spam sin esperar hasta que todo el movimiento haya ocurrido.

Telegram ORB-FVG queda en dos niveles informativos:

```text
FVG_RETESTED
→ PRE_RETRACE_HIGH_BROKEN
→ SETUP_PREVIEW

SETUP_PREVIEW
→ continuation confirmation
→ TRADE_READY
```

`SETUP_PREVIEW` significa:

> Este gráfico ya merece revisión si el trader quiere abrir TradingView.

`TRADE_READY` significa:

> La estructura experimental completa quedó confirmada. Revisar 1m para posible entrada discrecional.

Ambos mensajes son informativos. Ninguno calcula Entry, Stop Loss, Take Profit, Risk %, position sizing ni ejecución broker.

Los estados `OR_READY`, `BREAKOUT_CONFIRMED`, `FVG_CREATED` y `FVG_RETESTED` permanecen silenciosos en Telegram, pero siguen observables en logs/DB.

Campos nuevos de investigación preparados:

- previous breakout candle OHLC;
- first retest candle OHLC;
- `setupPreviewAt`;
- `setupPreviewPrice` = close de la vela que rompe `preRetraceHigh`;
- `setupPreviewAlertSent`;
- `setupPreviewAlertedAt`;
- `tradeReadyAt`;
- `tradeReadyPrice` = close de la vela de confirmation;
- `tradeReadyAlertSent`;
- `tradeReadyAlertedAt`.

Estos precios son referencias para research. No son Entry automática.

Objetivo de la próxima sesión:

- medir si preview reduce ruido;
- observar cuántos previews llegan a ready;
- comparar precio preview vs ready;
- estudiar setups que fallan entre preview y ready;
- preparar análisis futuro de MFE/MAE desde ambos puntos.
