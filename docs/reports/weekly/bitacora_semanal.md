# ARGOS — Weekly Research Report

## Semana: 24–28 Agosto 2026

### Estado general

🟡 Fase: Research / Evidence Build
🧪 Strategy: v1
💰 Capital real: NO
⚙️ Motor: estable
📊 Evidence acumulada: ~200 señales

ARGOS continúa recolectando evidencia real para determinar qué ocurre
después de detectar una oportunidad técnica.

Durante esta semana no se modificó la estrategia.

---

## Resumen ejecutivo

Esta semana ARGOS pasó de demostrar que técnicamente puede detectar y
evaluar señales a comenzar a identificar patrones en su comportamiento.

El principal hallazgo es que un score técnico más alto no está produciendo,
por ahora, movimientos futuros proporcionalmente mejores.

También comienzan a observarse diferencias importantes entre acciones,
criptomonedas y temporalidades.

La evidencia todavía es insuficiente para modificar la estrategia.

---

## Qué aprendimos esta semana

### 1. Score alto ≠ necesariamente mejor movimiento

Inicialmente se esperaba:

95-100 > 90-94 > 85-89 > 80-84

La evidencia acumulada todavía no muestra ese comportamiento.

Esto abre una nueva hipótesis:

El score podría medir mejor la confluencia técnica actual que la magnitud
del movimiento futuro.

Estado: 🟡 INVESTIGANDO

---

### 2. Crypto se comporta diferente a Stocks

Las señales de Crypto están mostrando generalmente movimientos favorables
más amplios que muchas señales de acciones intradía.

También pueden experimentar movimientos adversos mayores.

Conclusión:

No parece apropiado asumir que Stocks y Crypto deban utilizar exactamente
el mismo Trade Plan.

Estado: 🟡 INVESTIGANDO

---

### 3. Targets grandes parecen difíciles en intraday

Los targets de +2%, +3% y +5% presentan una frecuencia de alcance
considerablemente menor que targets pequeños.

Esto NO significa que ARGOS deba utilizar +0.50%.

Todavía falta incorporar costos, riesgo y reglas de ejecución.

Estado: 🟡 INVESTIGANDO

---

## Hallazgo bajo vigilancia

STOCK / 5m / score 95-100

N = 6

Hasta el momento ninguna de las seis señales alcanzó siquiera el
target experimental de +0.50% antes de resolver negativamente.

La muestra es demasiado pequeña para modificar ARGOS.

Estado: 🔎 WATCH

---

## Contexto de mercado

La semana incluyó elevada volatilidad asociada a:

- resultados de NVIDIA;
- movimientos importantes en semiconductores;
- inflación;
- tasas de interés;
- Reserva Federal;
- volatilidad en Crypto.

Por ello algunos resultados pueden estar ocurriendo dentro de un régimen
de mercado particularmente volátil.

No se atribuye causalidad.

---

## Hipótesis principales

| Hipótesis                                          | Estado          |
| -------------------------------------------------- | --------------- |
| Score alto no garantiza mayor movimiento futuro    | 🟡 Investigando |
| Crypto y Stocks requieren calibraciones diferentes | 🟡 Investigando |
| Targets deben depender del timeframe               | 🟡 Investigando |
| Score puede depender del régimen de mercado        | 🟡 Investigando |
| STOCK 5m / 95-100 presenta comportamiento anómalo  | 🔎 Watch        |

---

## Decisiones tomadas

Esta semana:

❌ No se modificó scoring
❌ No se modificaron targets
❌ No se modificó stop
❌ No se declaró ningún profile rentable
❌ No se autorizó trading con capital real

La decisión continúa siendo:

> Acumular Evidence con Strategy v1 sin optimizar prematuramente.

---

## Próximo objetivo

La siguiente etapa técnica será incorporar un modelo de costos de
transacción.

Esto permitirá pasar de preguntar:

"¿hasta dónde se movió el mercado?"

a comenzar a estudiar:

"¿ese movimiento habría sido económicamente aprovechable después de costos?"

---

## Estado de ARGOS

Research Pipeline ██████████ Operativo
Evidence Collection ███████░░░ En progreso
Strategy Research ██████░░░░ En progreso
Transaction Costs ░░░░░░░░░░ Próximo
Trade Plan Research ░░░░░░░░░░ Futuro
Paper Trading ░░░░░░░░░░ Futuro
Live Capital ░░░░░░░░░░ Futuro

---

# ARGOS — Weekly Research Report

## Semana: 31 Agosto 2026

### Estado del experimento

🟡 Fase: Research / Evidence Build  
🧪 Strategy: v1  
💰 Capital real: NO  
⚙️ Motor: operativo  
📊 Evidence total / elegible: 473  
✅ Evidence evaluada: 356  
⏳ Evidence sin evaluación: 117

Este reporte resume el corte experimental oficial del **31-AGO-2026**. Los números provienen de una ejecución externa de `POST /api/forward-evaluate` seguida de `GET /api/research-snapshot`; no fueron recalculados por Codex desde PostgreSQL.

---

## Resumen ejecutivo

ARGOS continúa recolectando Evidence bajo `strategyVersion=v1` sin cambiar scoring, analyzers, thresholds, Target Ladder ni metodología de evaluación.

El sistema se observó saludable: el Forward Evaluator procesó 100 de 100 Evidence pendientes sin errores de provider ni errores de evaluación.

El hallazgo descriptivo principal se mantiene: los targets pequeños muestran mayor frecuencia de éxito que los targets grandes, pero esto todavía no autoriza cambiar el Take Profit operativo.

El cambio más importante de ingeniería fue la expansión del Market Universe: el radar pasa de 61 a 103 símbolos activos. Esto no cambia la estrategia, pero sí cambia la población observada; por lo tanto, los siguientes cortes deberán interpretar cualquier cambio de distribución con esa frontera en mente.

---

## Evidence

| Métrica | Valor |
| ------- | ----: |
| Evidence total / elegible | 473 |
| Evidence evaluada | 356 |
| Evidence sin evaluación | 117 |
| Operational threshold >= 90 | 191 |

### Score buckets

| Score bucket | Evidence |
| ------------ | -------: |
| 80-84 | 163 |
| 85-89 | 119 |
| 90-94 | 124 |
| 95-100 | 67 |

### Estados de evaluación

| Estado | Total |
| ------ | ----: |
| OPEN | 87 |
| PARTIALLY_RESOLVED | 9 |
| CLOSED | 214 |
| EXPIRED | 42 |
| AMBIGUOUS | 4 |

---

## Forward Evaluation

| Métrica | Total |
| ------- | ----: |
| Evidence pendientes | 100 |
| Evaluadas | 100 |
| PARTIALLY_RESOLVED | 9 |
| OPEN | 91 |
| Provider errors | 0 |
| Evaluation errors | 0 |
| Sin future candles | 0 |

Lectura ejecutiva:

> El pipeline de evaluación funcionó correctamente durante el corte. Esto habla de salud operacional, no de rentabilidad.

---

## Target Ladder

| Target | Wins | Losses | Win Rate |
| ------ | ---: | -----: | -------: |
| +0.50% | 181 | 105 | 63.29% |
| +0.75% | 152 | 118 | 56.30% |
| +1.00% | 123 | 131 | 48.43% |
| +1.25% | 105 | 143 | 42.34% |
| +1.50% | 93 | 145 | 39.08% |
| +2.00% | 67 | 165 | 28.88% |
| +3.00% | 41 | 174 | 19.07% |
| +5.00% | 10 | 176 | 5.38% |

Observación:

Los targets pequeños siguen resolviendo mejor que los targets grandes. Esto es descriptivo y todavía no equivale a una regla de trading.

---

## Cambios de ingeniería

### ARGOS Control Interface V1.5

Durante el periodo se implementaron componentes de control por Telegram:

- V1.5-A Control Core.
- V1.5-B Telegram Control Transport / Long Polling.
- V1.5-C Read-Only Research Integrations.
- V1.5-D Telegram Transaction Costs.
- V1.5-E Analyze Symbol.
- V1.5-F Full Market Scan from Telegram.

La mayoría de estos cambios son de observabilidad/control y no modifican la estrategia.

`Analyze Symbol` y `Transaction Costs` son read-only respecto al pipeline de señales.

`Full Market Scan from Telegram` sí puede generar nuevas observaciones porque ejecuta el pipeline operacional real de Market Scan, pero no cambia scoring, analyzers, thresholds, Target Ladder ni `strategyVersion`.

### Market Universe Expansion V1.6-A

| Concepto | Antes | Después |
| -------- | ----: | ------: |
| Símbolos activos | 61 | 103 |
| Timeframes | 5 | 5 |
| Combinaciones símbolo-timeframe | ~305 | 515 |
| Símbolos nuevos | — | 42 |

Composición después de la expansión:

| Asset type | Total |
| ---------- | ----: |
| STOCK | 72 |
| ETF | 22 |
| CRYPTO | 9 |

Mercados:

| Market | Total |
| ------ | ----: |
| US | 94 |
| Crypto | 9 |

Sesiones:

| Session type | Total |
| ------------ | ----: |
| US_REGULAR | 94 |
| TWENTY_FOUR_SEVEN | 9 |

---

## Market Universe Expansion Boundary

Fecha de frontera experimental:

```text
31-AGO-2026
```

Antes de esta fecha, ARGOS observaba 61 símbolos activos. Desde esta fecha, observa 103 símbolos activos.

Clasificación:

```text
EXPOSURE / SAMPLING CHANGE
```

No clasificar como cambio de estrategia.

La Evidence histórica no se elimina, no se reinicia y no se reclasifica por este cambio.

---

## Observaciones

- El sistema continúa acumulando Evidence.
- Forward Evaluation se ejecutó sin errores en el corte.
- El Target Ladder mantiene una caída progresiva de Win Rate al aumentar el target.
- La muestra creció de forma importante frente a cortes iniciales.
- El universo ampliado puede modificar la composición futura de Evidence.

---

## Hipótesis abiertas

| Hipótesis | Estado |
| --------- | ------ |
| Score alto no garantiza mayor movimiento futuro | OBSERVANDO |
| Targets pequeños pueden adaptarse mejor a ciertas señales | OBSERVANDO |
| Crypto, Stocks y ETFs podrían requerir calibración distinta | OBSERVANDO |
| Timeframes podrían requerir targets/horizontes distintos | OBSERVANDO |
| La expansión del universo puede cambiar la distribución de Evidence | OBSERVANDO |
| Cambios futuros pueden deberse a composición de muestra y no a mejora de estrategia | OBSERVANDO |

---

## Riesgos metodológicos

- Confundir salud operacional con calidad predictiva.
- Interpretar Win Rate como rentabilidad sin costos ni riesgo.
- Cambiar estrategia prematuramente con data maturity insuficiente.
- Comparar MFE/MAE de poblaciones distintas.
- Atribuir causalidad inmediata a la expansión del universo.
- Ignorar cambios de market regime durante septiembre.

---

## Decisiones diferidas

No se decide todavía:

- Take Profit definitivo;
- Stop Loss definitivo;
- nuevo score threshold;
- nuevos pesos de scoring;
- reglas por sector;
- reglas por assetType;
- reglas por timeframe;
- Trade Plan definitivo;
- uso de capital real.

La decisión sigue siendo acumular Evidence bajo `strategyVersion=v1`.

---

## Próximo corte

Próxima revisión semanal propuesta:

```text
07-SEP-2026
```

Baseline a comparar:

| Métrica | 31-AGO-2026 |
| ------- | ----------: |
| Evidence | 473 |
| Evaluadas | 356 |
| Operacionales >= 90 | 191 |

Observar especialmente:

1. crecimiento de Evidence;
2. evaluaciones resueltas;
3. distribución por assetType;
4. aparición de ETF dentro de Evidence;
5. distribución sectorial;
6. scoreBuckets;
7. Target Ladder;
8. MFE/MAE;
9. Strategy Profiles;
10. errores de provider/evaluator;
11. impacto del Full Market Scan manual si fue usado.

No intentar demostrar causalidad con una sola semana.

