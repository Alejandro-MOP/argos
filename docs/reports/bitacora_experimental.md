# Bitácora experimental de ARGOS

Esta bitácora documenta la evolución empírica de ARGOS y ARGOS Engine con datos observados en ejecución real.
No reemplaza a `ROADMAP.md`: el roadmap describe qué se construyó, versiones, hitos y backlog técnico;
esta bitácora registra qué estamos observando, qué hipótesis aparecen y qué decisiones todavía no deben tomarse.

## Principios de lectura

Separar siempre tres niveles:

| Nivel       | Significado                                          |
| ----------- | ---------------------------------------------------- |
| Observación | Dato objetivo obtenido del sistema.                  |
| Hipótesis   | Interpretación que vale la pena seguir investigando. |
| Decisión    | Cambio aprobado explícitamente para la estrategia.   |

Reglas importantes:

- Correlación observada no equivale a evidencia suficiente.
- Evidencia preliminar no equivale a estrategia validada.
- Una hipótesis no debe convertirse automáticamente en decisión por una sola corrida.
- Cada nuevo corte debe agregarse como una nueva entrada fechada; no se deben sobrescribir entradas históricas para que coincidan con resultados posteriores.

## Principio anti data leakage

Las Evidence Signals son snapshots inmutables de lo que ARGOS Engine sabía en T0.
Los resultados futuros solo pueden utilizarse para evaluar la señal, no para reescribirla.

Nunca modificar retrospectivamente estos campos con base en lo que ocurrió después:

- score
- pillars / sub-scores
- entry
- stop
- targets
- strategyVersion

Esto protege el experimento contra look-ahead bias y data leakage.

## Nota metodológica — reparación no destructiva de duplicados históricos

Durante la fase de auditoría se detectó un bug histórico que podía registrar Evidence duplicada antes de que existiera la identidad por candle. La reparación aprobada no borra ni reescribe observaciones pasadas: conserva Raw Evidence y excluye de métricas solo los registros duplicados de alta confianza.

Estado de la reparación:

- 13 Evidence históricas de alta confianza quedaron excluidas de investigación.
- 2 posibles duplicados quedaron marcados para revisión humana y siguen participando en métricas.
- Las evaluaciones dependientes se conservan como audit trail.
- No se hizo backfill de `signal_candle_timestamp` para registros legacy.

A partir de esta nota, Strategy Profiles, Research Snapshot y Forward Performance deben leerse como métricas sobre Research Eligible Evidence, no sobre Raw Evidence completa.

## Estados conceptuales para hipótesis

| Estado       | Uso                                                             |
| ------------ | --------------------------------------------------------------- |
| OBSERVANDO   | Hay señales iniciales, pero falta muestra o confirmación.       |
| SUPPORTED    | La evidencia acumulada empieza a apoyar la hipótesis.           |
| REJECTED     | La evidencia acumulada contradice la hipótesis.                 |
| INCONCLUSIVE | La muestra o los resultados no permiten una conclusión clara.   |
| IMPLEMENTED  | La hipótesis ya fue convertida en decisión e implementada.      |
| FUTURA       | Hipótesis razonable, pero aún no se está evaluando activamente. |

---

# 2026-09-06 — ORB-FVG Scalping Research v0.1

## Contexto

Se implementó un carril paralelo de investigación prospectiva llamado `ORB-FVG Scalping Research v0.1`.

Estado experimental:

```text
IMPLEMENTED — PENDING FIRST PROSPECTIVE SESSION VALIDATION
```

Identidad:

```text
experiment_version = orb-fvg-v0.1
```

Hipótesis inicial:

> Un breakout confirmado del Opening Range de 09:30–09:45 ET, acompañado por un FVG 1m matemáticamente definido dentro del boundary temporal de v0.1, puede presentar comportamiento forward medible que justifique investigación posterior.

## Límites

- No forma parte de `strategy_version=v1`.
- No usa el score de Trend/Volume/Momentum/Structure.
- No modifica Evidence V1 ni Forward Evaluation V1.
- No representa recomendación de trading.
- No incluye broker, spread, slippage ni comisiones.
- Yahoo Finance se usa como fuente experimental, no como feed profesional de ejecución.

## Estado de la hipótesis

```text
OPEN / UNTESTED
```

La primera sesión prospectiva será necesaria para validar timestamps, frecuencia de detección, calidad de datos y comportamiento operativo real del experimento.

---

# 2026-08-26 — Primer corte real de Evidence V1

## Contexto

| Campo           | Valor |
| --------------- | ----: |
| strategyVersion |    v1 |
| minimumScore    |    80 |
| sampleSize      |    77 |

Thresholds actuales:

| Configuración                   | Valor |
| ------------------------------- | ----: |
| EVIDENCE_MIN_SCORE              |    80 |
| OPPORTUNITY_MIN_SCORE           |    90 |
| TELEGRAM_NOTIFICATION_MIN_SCORE |    90 |

Trade Plan operativo actual:

| Elemento       | Valor |
| -------------- | ----: |
| financial stop |   -1% |
| TP1            |   +2% |
| TP2            |   +5% |

Target Ladder experimental:

| Target |
| -----: |
| +0.50% |
| +0.75% |
| +1.00% |
| +1.25% |
| +1.50% |
| +2.00% |
| +3.00% |
| +5.00% |

## Resultados del primer corte

| Target | Wins | Losses | Ambiguous | Win Rate | Historical Forward Expectancy | Profit Factor |
| ------ | ---- | ------ | --------- | -------- | ----------------------------- | ------------- |
| +0.50% | 23   | 9      | 1         | 71.88%   | +0.08%                        | 1.28          |
| +0.75% | 11   | 10     | 0         | 52.38%   | -0.08%                        | 0.83          |
| +1.00% | 9    | 10     | 0         | 47.37%   | -0.05%                        | 0.90          |
| +1.25% | 6    | 10     | 0         | 37.50%   | -0.16%                        | 0.75          |
| +1.50% | 4    | 10     | 0         | 28.57%   | -0.29%                        | 0.60          |
| +2.00% | 3    | 10     | 0         | 23.08%   | -0.31%                        | 0.60          |
| +3.00% | 0    | 10     | 0         | 0%       | -1.00%                        | 0             |
| +5.00% | 0    | 10     | 0         | 0%       | -1.00%                        | 0             |

Nota importante: `sampleSize=77` no significa 77 trades completamente resueltos.
Muchos Evidence todavía permanecen `OPEN`. Los win rates de targets se calculan solamente sobre outcomes resueltos/computables según la implementación actual.

## MFE / MAE

| Métrica | Promedio | Mediana |
| ------- | -------: | ------: |
| MFE     |   +0.45% |  +0.26% |
| MAE     |   -0.48% |  -0.31% |

Observación preliminar:

La magnitud típica favorable observada hasta este corte parece estar mucho más cerca de +0.25% / +0.50% que de +2% / +5%.

No concluir todavía que el TP debe cambiar.

## Score buckets

| Score  | Sample | Avg MFE | Median MFE | Avg MAE | Median MAE |
| ------ | ------ | ------- | ---------- | ------- | ---------- |
| 80-84  | 20     | +0.53%  | +0.35%     | -0.42%  | -0.19%     |
| 85-89  | 28     | +0.37%  | +0.21%     | -0.52%  | -0.40%     |
| 90-94  | 19     | +0.44%  | +0.32%     | -0.56%  | -0.37%     |
| 95-100 | 10     | +0.57%  | +0.25%     | -0.34%  | -0.20%     |

Hipótesis a investigar:

¿El score realmente ordena la calidad de las oportunidades?

Esperaríamos eventualmente algo similar a:

```text
95-100 > 90-94 > 85-89 > 80-84
```

pero este primer corte todavía no demuestra esa relación.

Observación interesante: `95-100` presenta inicialmente mayor Avg MFE (+0.57%) y menor Avg MAE (-0.34%), pero `sampleSize=10` es pequeño.

## Timeframes

Distribución observada:

| Timeframe | Sample size |
| --------- | ----------: |
| 1m        |          38 |
| 5m        |          29 |
| 15m       |          10 |

Hipótesis:

Un target fijo de +2% probablemente no sea equivalente para `1m`, `5m`, `15m`, `1d` y `1w`.

Investigar en el futuro si los targets deberían calibrarse por timeframe. No implementar todavía.

## Asset types

Distribución observada:

| Asset type | Sample size |
| ---------- | ----------: |
| STOCK      |          60 |
| CRYPTO     |          16 |
| ETF        |           1 |

Hipótesis:

Stocks y Crypto podrían necesitar calibraciones diferentes de:

- stop
- targets
- expiration / horizon
- volatility expectations

No modificar todavía la estrategia.

## Interpretación preliminar

El primer corte de Evidence V1 muestra evidencia preliminar de que las señales frecuentemente producen movimientos favorables menores al TP1 operativo actual de +2%.

Dentro de los outcomes computables disponibles, el target experimental de +0.50% presenta actualmente la mejor combinación observada de win rate, historical forward expectancy y profit factor.

Esto no constituye evidencia suficiente para modificar el Trade Plan.

La prioridad es continuar recolectando Evidence bajo `strategyVersion=v1` sin cambiar scoring, stop ni targets operativos.

## Hipótesis activas

| ID   | Hipótesis                                                          | Estado     |
| ---- | ------------------------------------------------------------------ | ---------- |
| H001 | TP1 +2% puede ser demasiado ambicioso para señales intraday        | OBSERVANDO |
| H002 | Targets 0.50%-1.00% pueden ajustarse mejor al movimiento observado | OBSERVANDO |
| H003 | Score 95-100 puede presentar mejor relación MFE/MAE                | OBSERVANDO |
| H004 | El score debería ordenar progresivamente la calidad de señales     | OBSERVANDO |
| H005 | Targets deberían depender del timeframe                            | FUTURA     |
| H006 | Crypto y Stocks podrían necesitar calibraciones distintas          | FUTURA     |

## Decisiones explícitas

No se aprueba ningún cambio de estrategia en este corte.

No modificar todavía:

- scoring
- analyzers
- thresholds
- stop
- TP1 / TP2
- Target Ladder
- expiration windows
- strategyVersion

## Hipótesis de calibración por contexto

### H005 — Targets dependientes del timeframe

**Estado:** OBSERVANDO

Actualmente V1 utiliza los mismos targets operativos:

- TP1: +2%
- TP2: +5%
- Financial Stop: -1%

para señales generadas en diferentes temporalidades.

Sin embargo, la magnitud esperada del movimiento puede ser diferente entre:

- 1m
- 5m
- 15m
- 1d
- 1w

Hipótesis:

Los targets y posiblemente el horizonte de evaluación deberían
calibrarse de acuerdo con el timeframe de origen de la señal.

Ejemplo conceptual, NO implementado:

1m → movimientos esperados menores
5m → movimientos intermedios
15m → movimientos potencialmente mayores
1d → movimientos mayores y horizonte más largo
1w → movimientos mayores y horizonte mucho más largo

No modificar V1 hasta contar con suficiente Evidence separado por timeframe.

### H006 — Calibración por tipo de activo

**Estado:** OBSERVANDO

Actualmente STOCK, ETF y CRYPTO comparten las mismas reglas generales
de Trade Plan.

La volatilidad y comportamiento de estos activos pueden ser
sustancialmente diferentes.

El primer corte contiene:

- STOCK: 60
- CRYPTO: 16
- ETF: 1

En el primer corte se observaron movimientos adversos relevantes
en algunas señales crypto, pero la muestra todavía es demasiado
pequeña para establecer una regla.

Hipótesis:

En futuras versiones podría ser necesario calibrar por asset type:

- Financial Stop
- TP1
- TP2
- Target Ladder
- Expiration / evaluation horizon
- Reglas de volatilidad

No modificar strategyVersion=v1 con base en este primer corte.

### Posible evolución futura

La estrategia podría evolucionar conceptualmente desde:

V1:
mismos parámetros para todos

hacia:

```text
Asset Type
    ├── STOCK
    │     ├── 1m
    │     ├── 5m
    │     ├── 15m
    │     ├── 1d
    │     └── 1w
    │
    ├── ETF
    │     └── ...
    │
    └── CRYPTO
          ├── 1m
          ├── 5m
          ├── 15m
          ├── 1d
          └── 1w
```

Cada combinación podría eventualmente tener parámetros calibrados a partir de Evidence.

Por ejemplo:

```text
CRYPTO + 15m
    ├── Financial Stop
    ├── TP1
    ├── TP2
    ├── Evaluation Horizon
    └── Target Ladder

STOCK + 1m
    ├── Financial Stop
    ├── TP1
    ├── TP2
    ├── Evaluation Horizon
    └── Target Ladder
```

Cada combinación podría eventualmente tener parámetros calibrados
a partir de Evidence.

Esto es solamente una dirección experimental y NO una decisión
de arquitectura ni de estrategia.

La decisión actual es seguir observando.

---

# 2026-08-27 — V1.3 Strategy Profile Research

Se agrega una capa de investigación descriptiva sobre Evidence para agrupar señales por:

```text
asset_type + timeframe + score_bucket + strategy_version
```

La intención es observar comportamiento histórico sin cambiar el motor que genera las señales.

Notas metodológicas:

- `Trade Outcome` y `Market Reachability` se reportan por separado.
- `AMBIGUOUS` cuenta como target alcanzado para reachability porque la vela tocó target y stop.
- Outcomes `NULL` permanecen como unresolved y no penalizan señales recientes.
- `dataMaturity=MATURE` no significa validación estadística, rentabilidad ni autorización para operar capital real.
- MAE conserva signo negativo en promedios y percentiles.

Esta entrada no reemplaza ni recalcula cortes históricos previos de Evidence.

---

## Segundo corte experimental — 27 Ago 2026

### Contexto

Segundo corte formal de Evidence bajo `strategy_version = v1`.

El objetivo de este corte no es seleccionar todavía una estrategia,
TP o SL definitivo, sino observar cómo evoluciona la evidencia acumulada
y comenzar a caracterizar el comportamiento por:

- asset type;
- timeframe;
- score bucket;
- target experimental;
- MFE;
- MAE.

Durante este corte ya se encuentra implementada la capa
`Strategy Profile Research`.

---

### Validación real Forward/Evidence Evaluator

Última validación real registrada:

#### Forward

| Métrica                | Total |
| ---------------------- | ----: |
| pendingSignals         |    22 |
| evaluated              |    22 |
| closed                 |     0 |
| partial                |     3 |
| open                   |    19 |
| expired                |     0 |
| ambiguous              |     0 |
| pendingNoFutureCandles |     0 |
| providerErrors         |     0 |
| errors                 |     0 |

#### Evidence

| Métrica                | Total |
| ---------------------- | ----: |
| pendingSignals         |    47 |
| evaluated              |    47 |
| closed                 |     0 |
| partial                |     8 |
| open                   |    39 |
| expired                |     0 |
| ambiguous              |     0 |
| pendingNoFutureCandles |     0 |
| providerErrors         |     0 |
| errors                 |     0 |

Conclusión técnica:

- El evaluador procesó correctamente todas las señales pendientes.
- No hubo errores de provider.
- No hubo errores de evaluación.
- No hubo señales pendientes por ausencia de future candles.
- Una señal no debe convertirse en `CLOSED` simplemente porque termine la sesión bursátil.
- `OPEN` y `PARTIALLY_RESOLVED` son estados válidos mientras el horizonte de evaluación siga vigente.
- Se validó en condiciones reales el arreglo relacionado con historical-data / future-candle evaluation.

Detalle técnico observado:

```text
original timeframe: 1d
evaluation timeframe: 15m
```

Ejemplo: NVDA.

Esto no se considera actualmente un bug. `signal timeframe` describe la temporalidad con la que nació la señal; `evaluation timeframe` o `evaluation granularity` describe la granularidad usada para observar qué ocurrió después.

---

### 1. Estado general de Evidence

| Métrica                   | Total |
| ------------------------- | ----: |
| Evidence                  |   167 |
| Score 80-84               |    46 |
| Score 85-89               |    46 |
| Score 90-94               |    53 |
| Score 95-100              |    22 |
| Operational opportunities |    74 |

Distribución actual de evaluaciones:

| Estado             | Total |
| ------------------ | ----: |
| CLOSED             |   106 |
| OPEN               |    39 |
| PARTIALLY_RESOLVED |     8 |
| EXPIRED            |    10 |
| AMBIGUOUS          |     2 |

Las evaluaciones listadas suman 165 frente a 167 Evidence.
No se asume que esto represente un error: pueden existir Evidence todavía
sin registro de evaluación. Se conserva como observación para seguimiento.

---

### 2. Target Ladder global

| Target | Wins | Losses | Expired | Ambiguous | Unresolved | Resolved N | Win Rate |
| ------ | ---: | -----: | ------: | --------: | ---------: | ---------: | -------: |
| +0.50% |   67 |     59 |       1 |        14 |         24 |        141 |   53.17% |
| +0.75% |   59 |     66 |       2 |        10 |         28 |        137 |   47.20% |
| +1.00% |   50 |     72 |       4 |         8 |         31 |        134 |   40.98% |
| +1.25% |   39 |     78 |       5 |         6 |         37 |        128 |   33.33% |
| +1.50% |   37 |     79 |       6 |         6 |         37 |        128 |   31.90% |
| +2.00% |   29 |     86 |       9 |         2 |         39 |        126 |   25.22% |
| +3.00% |   20 |     87 |      10 |         1 |         47 |        118 |   18.69% |
| +5.00% |    9 |     89 |      10 |         0 |         57 |        108 |    9.18% |

### Lectura preliminar

El ladder continúa mostrando una reducción progresiva del `winRate`
conforme aumenta el target.

La muestra resuelta también disminuye conforme aumenta el target,
por lo que no deben compararse porcentajes sin considerar su `Resolved N`.

En particular:

- +0.50% dispone de N=141 outcomes resueltos.
- +1.00% dispone de N=134.
- +2.00% dispone de N=126.
- +5.00% dispone de N=108.

Esto refuerza la necesidad de conservar métricas de madurez independientes
por target.

---

### 3. Strategy Profile Research

Todos los perfiles continúan con muestras pequeñas y deben considerarse
exploratorios.

No se utilizarán todavía para modificar scoring ni para seleccionar TP/SL.

#### CRYPTO

| Timeframe | Score  |   N | Median MFE | Median MAE |
| --------- | ------ | --: | ---------: | ---------: |
| 15m       | 80-84  |   6 |     +0.55% |     -1.48% |
| 15m       | 85-89  |   4 |     +0.54% |     -2.97% |
| 15m       | 90-94  |   8 |     +1.24% |     -1.08% |
| 1m        | 80-84  | 5\* |     +1.05% |     -0.97% |
| 1m        | 85-89  |   5 |     +0.21% |     -1.04% |
| 1m        | 90-94  |   5 |     +1.39% |     -1.07% |
| 1m        | 95-100 |   2 |     +1.60% |     -1.06% |
| 5m        | 80-84  |   9 |     +0.53% |     -1.21% |
| 5m        | 90-94  |  10 |     +1.30% |     -1.35% |
| 5m        | 95-100 |   4 |     +1.12% |     -2.76% |

\* El perfil posee 6 Evidence en el conteo general, pero 5 observaciones
con MFE/MAE disponibles para esta consulta.

#### STOCK

| Timeframe | Score  |   N | Median MFE | Median MAE |
| --------- | ------ | --: | ---------: | ---------: |
| 15m       | 80-84  |   4 |     +1.89% |     -1.07% |
| 15m       | 85-89  |   1 |      0.00% |     -1.33% |
| 15m       | 90-94  |   4 |     +1.06% |     -1.25% |
| 1d        | 80-84  |   1 |     +1.07% |     -0.41% |
| 1d        | 85-89  |   1 |     +0.84% |     -1.08% |
| 1d        | 90-94  | 2\* |     +0.48% |     -2.26% |
| 1m        | 80-84  |  11 |     +0.44% |     -0.59% |
| 1m        | 85-89  |  18 |     +0.67% |     -0.83% |
| 1m        | 90-94  |  19 |     +0.32% |     -0.76% |
| 1m        | 95-100 |  10 |     +0.21% |     -0.72% |
| 5m        | 80-84  |   7 |     +0.78% |     -0.54% |
| 5m        | 85-89  |  17 |     +0.20% |     -1.12% |
| 5m        | 90-94  |   4 |     +1.13% |     -1.10% |
| 5m        | 95-100 |   6 |     +0.09% |     -1.14% |

\* Existen 3 Evidence en el perfil STOCK/1d/90-94, pero sólo 2 registros
con MFE/MAE disponibles en esta consulta.

---

### 4. Hipótesis emergentes

Las siguientes observaciones son hipótesis de investigación y NO
conclusiones de estrategia.

#### H1 — Score alto no implica todavía mejor resultado observado

No existe por ahora una relación monotónica evidente entre score y MFE.

Ejemplo STOCK / 1m:

| Score  |   N | Median MFE |
| ------ | --: | ---------: |
| 80-84  |  11 |     +0.44% |
| 85-89  |  18 |     +0.67% |
| 90-94  |  19 |     +0.32% |
| 95-100 |  10 |     +0.21% |

Esto debe seguirse conforme crezca N.

No implica todavía que el scoring sea incorrecto.

#### H2 — STOCK 5m / 95-100 requiere seguimiento

Actualmente:

N = 6
Median MFE = +0.09%
Median MAE = -1.14%

Es una relación preliminar desfavorable y contradictoria con la intuición
de que un score alto debería representar una oportunidad de mayor calidad.

La muestra es demasiado pequeña para modificar el algoritmo.

#### H3 — CRYPTO presenta mayor amplitud

Los perfiles CRYPTO muestran en varios casos MFE medianos mayores que
los perfiles STOCK intradía.

Ejemplos:

CRYPTO 5m / 90-94:
Median MFE = +1.30%
Median MAE = -1.35%

CRYPTO 15m / 90-94:
Median MFE = +1.24%
Median MAE = -1.08%

Esto apoya mantener separados asset type y timeframe.

#### H4 — Mayor MFE no significa automáticamente mejor trade

Algunos perfiles con MFE atractivo presentan también MAE considerable.

Por tanto, la investigación futura deberá estudiar no solamente:

"¿hasta dónde llegó?"

sino también:

"¿qué excursión adversa ocurrió durante el camino?"

#### H5 — Targets grandes requieren más evidencia

Los targets grandes (+2%, +3%, +5%) parecen alcanzarse con menor frecuencia, pero todavía no existe evidencia suficiente para convertir esto en reglas de estrategia o elegir un Take Profit definitivo.

#### H6 — No modificar V1 con perfiles inmaduros

Mientras los perfiles relevantes sigan siendo inmaduros, no se debe modificar `strategy_version=v1` ni optimizar parámetros contra la muestra actual.

### Tamaño de muestra y lectura de N

`N` significa sample size / tamaño de muestra. Como guía interna de investigación, no como regla estadística universal:

|     N | Lectura interna            |
| ----: | -------------------------- |
|  < 20 | Exploratorio               |
| 20-49 | Patrón preliminar          |
| 50-99 | Patrón interesante         |
|  100+ | Permite análisis más serio |

`N=100` no demuestra rentabilidad ni significancia estadística. Además, el N depende de la pregunta.

Ejemplos de este corte:

- Evidence global = 167.
- STOCK / 1m / 90-94 = 19.
- CRYPTO / 5m / 90-94 = 10.
- Target +0.50 resolved N = 141.
- Target +5.00 resolved N = 108.

---

### 5. Estado de las conclusiones

No existe todavía evidencia suficiente para:

- modificar el scoring;
- seleccionar un TP definitivo;
- seleccionar un SL definitivo;
- considerar un perfil rentable;
- operar capital real basándose únicamente en estos resultados.

Los perfiles continúan siendo experimentales.

El objetivo inmediato continúa siendo aumentar N y observar si los
patrones actuales persisten o desaparecen conforme aumenta la muestra.

### Decisión explícita durante Evidence Build v1

Durante Evidence Build v1 no se debe:

- modificar scoring basándose en estos primeros resultados;
- eliminar score buckets;
- elegir todavía un TP definitivo;
- elegir todavía un SL definitivo;
- optimizar parámetros contra la muestra actual;
- declarar perfiles rentables;
- utilizar resultados actuales como justificación suficiente para operar dinero real.

La razón es evitar premature optimization y overfitting. La decisión actual es continuar acumulando Evidence con `strategyVersion=v1`.

---

### 6. Próximos pasos

1. Continuar Evidence Collection bajo `strategy_version = v1`.
2. No modificar scoring durante esta fase.
3. Continuar Forward/Evidence Evaluation.
4. Mantener Strategy Profile Research como capa descriptiva read-only.
5. Implementar Broker / Transaction Cost Model como capa independiente.
6. Posteriormente estudiar Trade Plan Research usando:
   - Strategy Profiles;
   - MFE/MAE;
   - target reachability;
   - transaction costs;
   - risk/reward.

## Tercer Corte Experimental — 2026-08-28

### Objetivo del corte

Realizar el tercer cierre diario de la fase **Research / Evidence Build**, manteniendo sin cambios:

- `strategyVersion = v1`
- scoring actual;
- reglas de generación de señales;
- reglas de Forward Evaluation;
- horizontes de evaluación;
- Target Ladder experimental;
- semántica de `WIN`, `LOSS`, `EXPIRED` y `AMBIGUOUS`.

El objetivo continúa siendo observar el comportamiento de las señales y acumular evidencia antes de modificar la estrategia.

---

### 1. Estado del Forward Evaluator

El cierre diario fue ejecutado correctamente.

Para Evidence:

- pendingSignals: 23
- evaluated: 20
- PARTIALLY_RESOLVED: 5
- OPEN: 15
- pendingNoFutureCandles: 3
- providerErrors: 0
- errors: 0

Las 3 señales sin futuras velas corresponden a señales `NVDA / 1d`.

Esto no se considera por sí mismo un error del evaluator. Una señal puede permanecer pendiente cuando todavía no existen suficientes velas posteriores para continuar su evaluación.

La ausencia de `providerErrors` y `errors` continúa respaldando el correcto funcionamiento operativo del pipeline de Forward Evaluation.

---

### 2. Crecimiento de la muestra

El conjunto analizado por Forward Performance alcanzó:

- N global evaluable: 198

Distribución por score:

| Score Bucket |   N |
| ------------ | --: |
| 80-84        |  57 |
| 85-89        |  52 |
| 90-94        |  64 |
| 95-100       |  25 |

Por primera vez varios buckets globales superan N=50.

Esto permite comenzar a observar patrones preliminares con mayor interés, aunque continúa siendo insuficiente para declarar una estrategia estadísticamente validada o rentable.

---

### 3. Score vs comportamiento futuro

Resultados globales:

| Score Bucket |   N | Median MFE | Median MAE | TP1 Win Rate |
| ------------ | --: | ---------: | ---------: | -----------: |
| 80-84        |  57 |     +0.88% |     -1.03% |       31.82% |
| 85-89        |  52 |     +0.52% |     -1.09% |       25.53% |
| 90-94        |  64 |     +0.73% |     -1.15% |       20.37% |
| 95-100       |  25 |     +0.31% |     -1.03% |       15.79% |

No aparece por ahora una relación monotónica positiva entre score y comportamiento favorable posterior.

En particular, el bucket `95-100` presenta actualmente:

- menor median MFE global;
- menor TP1 Win Rate global;

que los buckets inferiores.

Esto NO demuestra que el scoring sea incorrecto.

El score actual puede estar representando principalmente **confluencia técnica en el instante de la señal**, lo cual no necesariamente equivale a mayor magnitud de movimiento favorable futuro.

No se realizará ningún ajuste al scoring durante Evidence Build v1 basándose en estos resultados.

---

### 4. Perfil centinela — STOCK / 1m / 90-94

Estado actual:

- sampleSize: 20
- resolvedSignalSampleSize: 19
- dataMaturity: `INSUFFICIENT`
- median MFE: +0.46%
- median MAE: -1.02%

Target Ladder:

| Target | Win Rate | Reach Rate |
| ------ | -------: | ---------: |
| +0.50% |   52.94% |     45.00% |
| +0.75% |   47.06% |     40.00% |
| +1.00% |   33.33% |     26.32% |
| +1.25% |   28.57% |     21.05% |
| +1.50% |   28.57% |     21.05% |
| +2.00% |    7.69% |      5.26% |
| +3.00% |    0.00% |      0.00% |
| +5.00% |    0.00% |      0.00% |

Este perfil alcanzó N=20 y entra en una zona donde los patrones pueden comenzar a considerarse preliminares.

Por ahora, los movimientos de +2% o superiores presentan baja frecuencia dentro del horizonte evaluado.

Esto NO implica seleccionar +0.50% como Take Profit.

La viabilidad económica de targets pequeños deberá evaluarse posteriormente incorporando costos de transacción y un Trade Plan definido.

---

### 5. Perfil centinela — STOCK / 5m / 95-100

Estado actual:

- sampleSize: 6
- resolvedSignalSampleSize: 6
- CLOSED: 6
- median MFE: +0.20%
- median MAE: -1.13%
- p90 MFE: +0.35%

Resultados:

- +0.50%: 0 WIN / 6 LOSS
- +0.75%: 0 WIN / 6 LOSS
- +1.00%: 0 WIN / 6 LOSS
- +1.25%: 0 WIN / 6 LOSS
- +1.50%: 0 WIN / 6 LOSS
- +2.00%: 0 WIN / 6 LOSS
- +3.00%: 0 WIN / 6 LOSS
- +5.00%: 0 WIN / 6 LOSS

El comportamiento continúa siendo desfavorable.

Sin embargo:

> N=6 continúa siendo demasiado pequeño para justificar cualquier modificación del motor.

El perfil permanece marcado únicamente como **perfil de observación experimental**.

---

### 6. Perfiles centinela CRYPTO

#### CRYPTO / 5m / 90-94

- N: 11
- median MFE: +1.09%
- median MAE: -1.32%

| Target | Reach Rate |
| ------ | ---------: |
| +0.50% |     63.64% |
| +0.75% |     54.55% |
| +1.00% |     54.55% |
| +1.25% |     45.45% |
| +1.50% |     45.45% |
| +2.00% |     27.27% |
| +3.00% |     18.18% |
| +5.00% |     10.00% |

#### CRYPTO / 15m / 90-94

- N: 8
- median MFE: +1.24%
- median MAE: -1.18%

| Target | Reach Rate |
| ------ | ---------: |
| +0.50% |     62.50% |
| +0.75% |     62.50% |
| +1.00% |     50.00% |
| +1.25% |     50.00% |
| +1.50% |     50.00% |
| +2.00% |     37.50% |
| +3.00% |     25.00% |
| +5.00% |      0.00% |

Los perfiles CRYPTO continúan mostrando una excursión favorable mayor que varios perfiles STOCK intradía.

Las muestras siguen siendo pequeñas, por lo que esto permanece como hipótesis experimental y no como conclusión.

---

### 7. Global Target Ladder

Forward Performance muestra:

| Target | Wins | Losses | Win Rate |
| ------ | ---: | -----: | -------: |
| +0.50% |   97 |     75 |   56.40% |
| +0.75% |   82 |     91 |   47.40% |
| +1.00% |   66 |    103 |   39.05% |
| +1.25% |   54 |    113 |   32.34% |
| +1.50% |   50 |    114 |   30.49% |
| +2.00% |   40 |    124 |   24.39% |
| +3.00% |   30 |    127 |   19.11% |
| +5.00% |    9 |    129 |    6.52% |

Se mantiene una caída progresiva en la frecuencia de resolución favorable conforme aumenta el target.

Este resultado es descriptivo del universo completo y NO debe utilizarse para seleccionar un Take Profit universal.

El agregado mezcla:

- distintos asset types;
- distintos timeframes;
- distintos score buckets;
- comportamientos de mercado diferentes.

La selección futura de targets debe continuar realizándose a nivel de profile.

---

### 8. Expectancy histórica observada

Forward Performance reporta actualmente:

| Target | Historical Forward Expectancy |
| ------ | ----------------------------: |
| +0.50% |                        -0.15% |
| +0.75% |                        -0.17% |
| +1.00% |                        -0.22% |
| +1.25% |                        -0.27% |
| +1.50% |                        -0.24% |
| +2.00% |                        -0.27% |
| +3.00% |                        -0.24% |
| +5.00% |                        -0.61% |

Todos los targets presentan actualmente expectancy histórica global negativa.

Esto refuerza una distinción fundamental del proyecto:

> ARGOS todavía no representa una estrategia de trading validada.

Actualmente es un sistema de detección de condiciones técnicas y una plataforma de investigación que permite estudiar qué sucede después de una señal.

No se utilizará la expectancy global para optimizar la estrategia durante Evidence Build v1.

---

### 9. Observación sobre STOCK / 1d

El profile:

`STOCK / 1d / 90-94`

presenta:

- N: 9
- median MFE: +0.56%
- +0.50%: 7 WIN
- +0.75%: 0 WIN
- +1.00% o superior: 0 WIN

Adicionalmente, durante el cierre existían señales `NVDA / 1d` pendientes por ausencia de futuras velas.

No existe evidencia suficiente para clasificar esto como bug.

Sin embargo, antes de utilizar los perfiles `1d` para conclusiones de estrategia deberá revisarse el comportamiento de generación y evaluación de estas señales para confirmar que el horizonte y `evaluationTimeframe` representan correctamente la intención experimental.

---

## Evolución de hipótesis

### H1 — Score vs magnitud favorable

**Estado: se fortalece como hipótesis.**

Mayor score todavía no presenta una relación monotónica positiva con MFE, reach rate o TP1 Win Rate.

No implica todavía que el scoring sea incorrecto.

---

### H2 — STOCK / 5m / 95-100

**Estado: se mantiene.**

Continúa mostrando comportamiento desfavorable:

- N=6
- median MFE +0.20%
- median MAE -1.13%
- ningún target desde +0.50% alcanzó WIN.

La muestra continúa siendo insuficiente.

---

### H3 — Mayor amplitud en CRYPTO

**Estado: se mantiene.**

Los perfiles CRYPTO observados continúan mostrando mayor excursión favorable que varios perfiles STOCK intradía, aunque también pueden presentar mayor MAE.

---

### H4 — MFE no equivale a rentabilidad

**Estado: se mantiene y gana relevancia.**

Una señal puede presentar excursión favorable significativa y aun así no constituir un trade rentable.

Será necesario incorporar posteriormente:

- MAE;
- stop survival;
- secuencia temporal;
- target;
- costos de transacción;
- reglas de ejecución.

---

### H5 — Segmentación por profile

**Estado: reforzada.**

Los resultados continúan justificando analizar independientemente:

`assetType + timeframe + scoreBucket + strategyVersion`

No utilizar resultados globales como sustituto del análisis por profile.

---

### H6 — No modificar estrategia durante Evidence Build v1

**Estado: vigente.**

No modificar:

- scoring;
- thresholds;
- targets;
- reglas de señal;
- horizontes;

basándose en muestras todavía inmaduras.

Los resultados actuales deben generar hipótesis, no optimizaciones.

---

### H7 — Nueva hipótesis: significado predictivo del score

El score podría estar funcionando mejor como una medida de:

> intensidad/confluencia del estado técnico presente

que como una escala ordinal de:

> magnitud o calidad futura esperada del movimiento.

Por lo tanto:

`score 98`

no necesariamente significa:

`mejor expectativa futura que score 82`.

Esta hipótesis deberá evaluarse cuando exista mayor N por bucket y profile.

No modificar el significado ni cálculo del score durante Evidence Build v1.

---

## Conclusión del tercer corte

El tercer corte no justifica cambios en la estrategia.

Sí aporta señales preliminares cada vez más interesantes:

1. el crecimiento de N empieza a hacer visibles patrones por score;
2. mayor score no está produciendo por ahora mayor excursión favorable;
3. `STOCK / 5m / 95-100` continúa siendo un profile de vigilancia;
4. CRYPTO mantiene un comportamiento diferente a STOCK intradía;
5. targets grandes pierden rápidamente frecuencia de alcance;
6. la expectancy histórica global continúa negativa;
7. sigue siendo necesario separar comportamiento de mercado de rentabilidad económica.

La prioridad continúa siendo:

> **acumular evidencia sin modificar Strategy v1.**

Los siguientes cortes deberán evaluar principalmente la persistencia o desaparición de estos patrones conforme aumente N.

## Contexto de Mercado — 2026-08-28

> Esta sección incorpora información externa al dataset de ARGOS con el
> objetivo de contextualizar el régimen de mercado durante el corte.
>
> Las coincidencias entre noticias, eventos macroeconómicos y comportamiento
> de las señales NO implican causalidad.

### 1. Régimen general del mercado

El mercado estadounidense cerró la semana bajo una combinación de fuerzas
contrapuestas:

- preocupación por inflación persistente;
- aumento de rendimientos de Treasury;
- comentarios restrictivos de la Reserva Federal;
- elevada volatilidad en semiconductores;
- digestión de resultados de NVIDIA;
- debilidad posterior en parte del sector tecnológico;
- volatilidad significativa en Bitcoin y otros criptoactivos.

El mercado venía además de una sesión del jueves fuertemente impulsada por
Technology.

El 27-Aug:

- Nasdaq: +1.6%
- S&P 500: +0.7%
- XLK / Technology: +3.2%
- NVIDIA: +8.7%

Technology fue el único sector positivo del S&P 500 durante esa sesión.

Esto representa un contexto importante para las señales generadas/evaluadas
durante el periodo, ya que parte de la evidencia puede estar capturando la
continuación o reversión posterior de un movimiento sectorial excepcional.

---

### 2. Technology / Semiconductors

El principal catalizador tecnológico del periodo fueron los resultados y
guidance de NVIDIA.

NVIDIA reportó resultados superiores a expectativas y presentó una fuerte
perspectiva de crecimiento, provocando inicialmente una expansión importante
del sector semiconductor.

Durante la sesión siguiente, 28-Aug, ocurrió una reversión parcial.

El Philadelphia Semiconductor Index llegó a caer más de 3%.

Entre los movimientos reportados:

- NVIDIA: aproximadamente -4%
- Marvell: aproximadamente -10% después de resultados

Esto produjo un escenario particular:

    fuerte impulso tecnológico
            ↓
    expansión de señales / momentum
            ↓
    cambio de sentimiento
            ↓
    reversión parcial en semiconductores

Este régimen podría ser relevante al interpretar por qué una condición de
alta confluencia técnica no necesariamente produjo posteriormente una mayor
MFE.

No se establece causalidad.

---

### 3. Contexto para H1 — Score vs movimiento futuro

ARGOS está observando actualmente que los score buckets superiores no
presentan una mejora monotónica en MFE:

| Score  | Median MFE |
| ------ | ---------: |
| 80-84  |     +0.88% |
| 85-89  |     +0.52% |
| 90-94  |     +0.73% |
| 95-100 |     +0.31% |

El contexto de mercado del periodo introduce una posible explicación que
deberá investigarse en muestras futuras:

> un score elevado puede detectar una condición técnica muy fuerte después
> de que una parte importante del movimiento ya ocurrió.

Un evento como el rally tecnológico posterior a earnings de NVIDIA seguido
por una reversión parcial constituye un ejemplo del tipo de régimen donde
esta hipótesis podría ser relevante.

Esto NO demuestra que sea la explicación del comportamiento observado.

Se registra únicamente como hipótesis contextual para investigación futura.

---

### 4. Inflación, Treasury y Reserva Federal

El contexto macroeconómico también fue relevante.

La inflación PCE de julio continuó elevada:

- headline PCE: aproximadamente 3.7% YoY
- core PCE: aproximadamente 3.3% YoY

Al mismo tiempo, el Treasury a 10 años se encontraba aproximadamente alrededor
de 4.67%-4.69%.

El mercado permaneció especialmente atento al discurso del presidente de la
Reserva Federal, Kevin Warsh, en Jackson Hole.

Sus comentarios fueron interpretados como restrictivos respecto a inflación y
política monetaria, aumentando la sensibilidad del mercado a tasas de interés.

Este contexto puede afectar particularmente:

- Technology / Growth;
- Financial Services;
- Crypto;
- activos de mayor duración.

Por lo tanto, el corte debe considerarse realizado dentro de un régimen con
riesgo macroeconómico elevado y no como una sesión completamente neutral.

---

### 5. Financial Services

Forward Performance muestra actualmente:

- sector: Financial Services
- N: 24
- TP1 Win Rate: 7.14%

El sector financiero presentó uno de los resultados más débiles dentro de la
muestra actual de ARGOS.

Durante el mismo periodo existió elevada sensibilidad alrededor de:

- expectativas de tasas;
- rendimientos de Treasury;
- política futura de la Reserva Federal.

Sin embargo, no existe evidencia suficiente para atribuir el bajo rendimiento
de las señales Financial Services directamente a estos eventos.

Se registra como contexto para comparación con futuros cortes.

Pregunta experimental futura:

> ¿El comportamiento de las señales Financial Services cambia
> significativamente entre regímenes de tasas crecientes, decrecientes y
> estables?

---

### 6. Crypto

Crypto también operó bajo elevada volatilidad macroeconómica.

Bitcoin abrió el 28-Aug aproximadamente en:

    $80,262

llegó a superar aproximadamente:

    $81,000

y posteriormente retrocedió.

Después de los comentarios de la Reserva Federal se reportaron precios de
Bitcoin alrededor de:

    $78,000-$79,000

Ethereum se encontraba aproximadamente alrededor de $2,500.

El periodo coincidió además con varios catalizadores:

- discurso de la Fed;
- datos económicos;
- vencimiento importante de opciones de Bitcoin;
- resultados de NVIDIA;
- expectativas sobre futuras decisiones de tasas.

Por lo tanto, la mayor amplitud observada por ARGOS en CRYPTO puede estar
ocurriendo dentro de un régimen de volatilidad elevada.

Esto resulta relevante para H3:

> mayor MFE en CRYPTO puede venir acompañada de mayor MAE y no necesariamente
> representar una mejor oportunidad ajustada por riesgo.

---

### 7. Nueva hipótesis contextual — H8

**H8 — La efectividad del score puede depender del régimen de mercado.**

El mismo nivel de score podría tener diferente significado dependiendo de si
el mercado se encuentra en:

- tendencia;
- expansión posterior a noticias;
- reversión;
- alta volatilidad;
- baja volatilidad;
- risk-on;
- risk-off;
- evento macroeconómico.

Por ejemplo:

    score 95
    + tendencia estable

podría comportarse de forma diferente a:

    score 95
    + movimiento explosivo post-earnings
    + reversión posterior

Actualmente ARGOS no clasifica explícitamente estos regímenes dentro del
análisis experimental.

No modificar Strategy v1.

Primero acumular evidencia y contexto.

---

### 8. Interpretación del corte dentro del contexto de mercado

El Corte Experimental #3 ocurrió durante una sesión que NO debe considerarse
un entorno de mercado neutral.

Existieron simultáneamente:

1. resultados corporativos de alto impacto;
2. movimientos extraordinarios en semiconductores;
3. preocupación por inflación;
4. rendimientos elevados de Treasury;
5. discurso de política monetaria;
6. volatilidad importante en crypto.

Esto incrementa el valor del corte experimental porque permite comenzar a
observar ARGOS bajo diferentes condiciones de mercado.

Sin embargo, también obliga a evitar conclusiones causales prematuras.

El objetivo futuro será comparar múltiples cortes y determinar si los patrones
observados permanecen cuando cambia el régimen de mercado.

---

# 2026-08-31 — Corte experimental semanal oficial

## CORTE EXPERIMENTAL OFICIAL — 31-AGO-2026

Este corte fue realizado externamente el **31-AGO-2026** mediante:

1. `POST /api/forward-evaluate`
2. `GET /api/research-snapshot`

Los valores registrados en esta entrada provienen de esas respuestas del sistema durante el corte experimental. No fueron recalculados por Codex directamente desde PostgreSQL para esta actualización documental.

Objetivo del corte:

- registrar qué observamos;
- registrar con cuántos datos;
- separar salud operacional de calidad estratégica;
- documentar cambios recientes de ingeniería;
- marcar una frontera experimental por expansión del Market Universe;
- definir qué comparar contra el siguiente corte semanal.

## Estado general de Evidence

| Métrica                                               | Valor |
| ----------------------------------------------------- | ----: |
| strategyVersion                                       |    v1 |
| Evidence total / elegible                             |   473 |
| Evidence evaluada                                     |   356 |
| Evidence sin evaluación                               |   117 |
| Señales/oportunidades con operational threshold >= 90 |   191 |

### Distribución por scoreBucket

| Score bucket | Evidence |
| ------------ | -------: |
| 80-84        |      163 |
| 85-89        |      119 |
| 90-94        |      124 |
| 95-100       |       67 |

### Estados de evaluación

| Estado             | Total |
| ------------------ | ----: |
| OPEN               |    87 |
| PARTIALLY_RESOLVED |     9 |
| CLOSED             |   214 |
| EXPIRED            |    42 |
| AMBIGUOUS          |     4 |

## Forward Evaluation del corte

La ejecución manual de `POST /api/forward-evaluate` realizada inmediatamente antes del Research Snapshot produjo:

| Métrica                  | Total |
| ------------------------ | ----: |
| Evidence pendientes      |   100 |
| Evaluadas                |   100 |
| PARTIALLY_RESOLVED       |     9 |
| OPEN                     |    91 |
| Provider errors          |     0 |
| Evaluation errors        |     0 |
| Casos sin future candles |     0 |

### Lectura permitida

La ejecución 100/100 y la ausencia de errores indican que el pipeline de Forward Evaluation se encontraba operativamente saludable durante este corte.

### Lectura NO permitida

Esto no demuestra rentabilidad, no demuestra calidad predictiva de la estrategia y no demuestra que el score funcione como predictor.

Separación metodológica:

```text
Salud del sistema
  !=
Calidad de la estrategia
```

## Target Ladder — observación global

Definición breve:

- **Target**: movimiento porcentual favorable desde el entry que el evaluador observa después de una señal.
- **Win Rate**: entre resultados resueltos como WIN o LOSS para ese target, porcentaje donde el target fue alcanzado antes que el stop.

Win Rate no significa automáticamente rentabilidad.

| Target | Wins | Losses | Win Rate |
| ------ | ---: | -----: | -------: |
| +0.50% |  181 |    105 |   63.29% |
| +0.75% |  152 |    118 |   56.30% |
| +1.00% |  123 |    131 |   48.43% |
| +1.25% |  105 |    143 |   42.34% |
| +1.50% |   93 |    145 |   39.08% |
| +2.00% |   67 |    165 |   28.88% |
| +3.00% |   41 |    174 |   19.07% |
| +5.00% |   10 |    176 |    5.38% |

Observación descriptiva:

En la muestra global actual, los targets pequeños presentan una frecuencia de éxito considerablemente mayor que los targets grandes.

Esto es una observación, no una decisión de estrategia.

No concluir todavía:

- que `+0.50%` debe ser el Take Profit;
- que la estrategia ya es rentable;
- que debe modificarse el Stop Loss;
- que debe modificarse el scoring;
- que debe modificarse el Target Ladder.

Para evaluar posteriormente un Trade Plan será necesario analizar conjuntamente:

- Target;
- Stop;
- MFE;
- MAE;
- transaction costs;
- assetType;
- timeframe;
- scoreBucket;
- sector;
- industry;
- market regime;
- tamaño de muestra.

## MFE y MAE

Definiciones:

- **MFE — Maximum Favorable Excursion**: mayor movimiento favorable observado después de la señal.
- **MAE — Maximum Adverse Excursion**: mayor movimiento adverso observado después de la señal.

En este corte no se mezclan valores de MFE/MAE provenientes de poblaciones distintas. Research Snapshot y Forward Performance pueden representar agregaciones diferentes; por eso no deben compararse como si fueran necesariamente la misma métrica poblacional.

## Cambios de ingeniería recientes

### ARGOS Control Interface — V1.5

Durante el periodo se desarrolló la interfaz privada de control bidireccional mediante Telegram.

Estado real observado en repositorio y commits recientes:

| Hito                                               | Estado                        | Impacto experimental               |
| -------------------------------------------------- | ----------------------------- | ---------------------------------- |
| V1.5-A — Control Core                              | Implementado y validado       | Ingeniería / observabilidad        |
| V1.5-B — Telegram Control Transport / Long Polling | Implementado y validado       | Ingeniería / observabilidad        |
| V1.5-C — Read-Only Research Integrations           | Implementado y validado       | Observabilidad read-only           |
| V1.5-D — Telegram Transaction Costs                | Implementado y validado       | Simulación/costos read-only        |
| V1.5-E — Analyze Symbol                            | Implementado y validado       | Análisis ad-hoc read-only          |
| V1.5-F — Full Market Scan from Telegram            | Implementado; commit presente | Mecanismo de ejecución/recolección |

`Analyze Symbol` es read-only: no persiste signals, no crea Evidence, no crea Forward Signals, no envía Alerts y no modifica scoring.

`Telegram Transaction Costs` tampoco modifica la generación de señales.

`Full Market Scan from Telegram` es distinto: utiliza el pipeline operacional real de `MarketScanExecutor`. Por lo tanto, un scan manual confirmado desde Telegram puede generar nuevas oportunidades, signals, Evidence y Alerts mediante las reglas normales del sistema. Esto puede afectar la cantidad de Evidence recolectada, pero no cambia la estrategia.

Clasificación:

```text
Cambio en mecanismo de ejecución / recolección
  !=
Cambio de estrategia
```

No cambiaron por V1.5-F:

- scoring;
- analyzers;
- thresholds;
- Target Ladder;
- strategyVersion.

### V1.6-A — Market Universe Expansion

Este es el cambio experimental más importante del periodo.

Antes:

| Concepto                                    | Valor |
| ------------------------------------------- | ----: |
| Símbolos activos                            |    61 |
| Timeframes                                  |     5 |
| Combinaciones símbolo-timeframe aproximadas |   305 |

Después:

| Concepto                        | Valor |
| ------------------------------- | ----: |
| Símbolos activos                |   103 |
| Timeframes                      |     5 |
| Combinaciones símbolo-timeframe |   515 |
| Símbolos nuevos                 |    42 |

Composición final:

| Asset type | Total |
| ---------- | ----: |
| STOCK      |    72 |
| ETF        |    22 |
| CRYPTO     |     9 |

Mercados:

| Market | Total |
| ------ | ----: |
| US     |    94 |
| Crypto |     9 |

Sesiones:

| Session type      | Total |
| ----------------- | ----: |
| US_REGULAR        |    94 |
| TWENTY_FOUR_SEVEN |     9 |

Cobertura actual incluye exposición a:

- Technology;
- Financial Services;
- Consumer Cyclical;
- Crypto;
- Communication Services;
- Consumer Defensive;
- Healthcare;
- Industrials;
- Energy;
- Broad Market;
- Real Estate;
- Utilities;
- Metals;
- Rates;
- Semiconductors.

Los nuevos `provider_symbol` fueron validados contra Yahoo Finance antes de su incorporación.

## 31-AGO-2026 — MARKET UNIVERSE EXPANSION BOUNDARY

```text
ANTES DE ESTA FECHA
61 símbolos activos
≈ 305 combinaciones símbolo-timeframe

DESDE ESTA FECHA
103 símbolos activos
515 combinaciones símbolo-timeframe
```

La Evidence histórica no se elimina, no se reinicia y no se reclasifica solamente por este cambio.

La estrategia continúa siendo:

```text
strategyVersion = v1
```

No cambiaron:

- scoring;
- analyzers;
- operational threshold;
- Target Ladder;
- Forward Evaluation;
- Evidence methodology.

Lo que cambió fue la amplitud y diversidad del universo observado.

Clasificación metodológica:

```text
EXPOSURE / SAMPLING CHANGE
```

No clasificar como:

```text
STRATEGY CHANGE
```

## Posible impacto del Market Universe expandido

Hipótesis, no conclusión:

A partir de esta frontera podría cambiar la distribución de Evidence porque ARGOS observa una muestra más amplia del mercado.

Posibles efectos:

- mayor cantidad de Evidence por unidad de tiempo;
- mayor presencia de ETF;
- mayor diversidad sectorial;
- incorporación significativa de Rates;
- incorporación significativa de Metals;
- mayor representación de Real Estate;
- mayor representación de Utilities;
- mejor cobertura de Semiconductors;
- menor concentración relativa en un pequeño conjunto de acciones;
- cambios en distribución de scoreBucket;
- cambios en MFE/MAE globales simplemente por composición de muestra.

Si estas métricas cambian durante septiembre, no asumir automáticamente que la estrategia mejoró o empeoró. Primero distinguir si cambió la estrategia o si cambió la población observada.

En este caso:

```text
Cambió la estrategia: NO
Cambió la población observada: SÍ
```

## Observación sobre score

Hipótesis vigente:

Un score mayor todavía no ha demostrado una relación monotónica con mejor comportamiento futuro.

Relación monotónica esperada conceptualmente:

```text
score 95-100
  mejor que
score 90-94
  mejor que
score 85-89
  mejor que
score 80-84
```

Hasta ahora no existe evidencia suficiente para afirmar esa relación.

El score podría estar midiendo principalmente intensidad/confluencia de condiciones técnicas presentes, no necesariamente magnitud futura del movimiento.

No modificar scoring durante este periodo.

## Data maturity

Data maturity significa que existe suficiente cantidad y diversidad de datos para realizar análisis estadísticos más serios.

No significa:

- que la estrategia ya funciona;
- que ARGOS está listo para operar dinero real;
- que la estrategia es rentable.

Estado del corte:

473 Evidence totales y 356 evaluadas representan un avance considerable respecto a los primeros cortes.

Sin embargo, mantener Strategy Research como **INSUFFICIENT** cuando los perfiles individuales todavía no cumplan los criterios existentes de madurez.

No modificar criterios de data maturity para hacer que la muestra parezca madura.

## Comparación con cortes anteriores

La documentación previa muestra que Evidence y evaluaciones continúan aumentando. No se recalculan valores faltantes y no se comparan métricas incompatibles.

El corte previo verificable del 27/28-AGO-2026 incluye métricas de poblaciones y agregaciones que no deben mezclarse automáticamente con este corte. Por lo tanto, no se calcula porcentaje de crecimiento aquí.

Lectura segura:

> La Evidence y las evaluaciones continúan aumentando bajo `strategyVersion=v1`.

## Interpretación del corte

ARGOS Evidence Build V1 continúa operativamente saludable.

El Forward Evaluator procesó correctamente las 100 Evidence pendientes del corte sin errores del provider ni errores de evaluación.

La muestra experimental continúa creciendo.

El Target Ladder muestra una reducción progresiva de frecuencia de éxito conforme aumenta la magnitud del target.

Esto es descriptivo y todavía no constituye una política de Take Profit.

La expansión del Market Universe introduce una nueva frontera experimental: la estrategia permanece sin cambios, pero la población observada aumenta de 61 a 103 símbolos.

Por lo tanto, cambios futuros en distribución de Evidence, MFE, MAE, assetType o scoreBucket deberán analizarse considerando esta expansión.

## Decisiones diferidas

No seleccionar todavía:

- Take Profit definitivo;
- Stop Loss definitivo;
- nuevo score threshold;
- nuevos score weights;
- reglas específicas por sector;
- reglas específicas por assetType;
- reglas específicas por timeframe;
- Trade Plan definitivo.

Regla metodológica:

No realizar cambios de estrategia basados en Evidence antes de contar con una muestra suficientemente madura, salvo:

- corrección de bugs;
- contaminación de datos;
- problemas metodológicos demostrables.

## Siguiente corte semanal propuesto

Próxima revisión semanal propuesta:

```text
07-SEP-2026
```

Baseline para comparar:

| Métrica             | 31-AGO-2026 |
| ------------------- | ----------: |
| Evidence            |         473 |
| Evaluadas           |         356 |
| Operacionales >= 90 |         191 |

En el siguiente corte observar especialmente:

1. crecimiento de Evidence;
2. crecimiento de evaluaciones resueltas;
3. distribución por assetType;
4. aparición de ETF dentro de Evidence;
5. distribución sectorial si la infraestructura ya permite consultarla;
6. scoreBuckets;
7. Target Ladder;
8. MFE;
9. MAE;
10. Strategy Profiles;
11. errores de provider/evaluator;
12. posible impacto de Full Market Scan manual.

No intentar demostrar causalidad en una sola semana. El objetivo es observar si aparecen cambios de distribución compatibles con la expansión del Market Universe.

## Consideración metodológica — correlación no es causalidad

Si después del 31-AGO se observa MFE mayor, Win Rate mayor o cualquier mejora/desmejora agregada, no se podrá afirmar inmediatamente que fue causada por la expansión del Market Universe.

La expansión puede coincidir con:

- diferente market regime;
- diferente volatilidad;
- distinta composición de señales;
- diferente cantidad de sesiones observadas;
- comportamiento específico de ciertos sectores.

## Por ahora únicamente se registra el antes/después y se buscarán patrones repetidos con más Evidence.

# 2026-09-01 — Telegram Alert Timeframe Filter

## Cambio temporal de presentación/notificación

El 01-SEP-2026 se deshabilitaron temporalmente las notificaciones Telegram para `1m` y `5m`.

Timeframes observados por ARGOS:

```text
1m, 5m, 15m, 1d, 1w
```

Timeframes notificados por Alerts Bot:

```text
15m, 1d, 1w
```

La configuración operativa queda expresada mediante:

```text
TELEGRAM_NOTIFICATION_TIMEFRAMES=15m,1d,1w
```

## Impacto experimental esperado

Ninguno esperado.

`1m` y `5m` continúan:

- analizándose;
- generando oportunidades/señales según las reglas existentes;
- persistiendo Evidence cuando cumplen `EVIDENCE_MIN_SCORE`;
- participando en Forward Evaluation;
- participando en Strategy Research.

El cambio afecta exclusivamente la capa de presentación/notificación.

Motivo:

Actualmente no se realizan decisiones operativas de scalping/trading sobre `1m` y `5m`.

`strategyVersion` permanece sin cambios.

Clasificación metodológica:

```text
PRESENTATION / NOTIFICATION CHANGE
```

No clasificar como cambio de estrategia.

---

# 2026-09-01 — Corte experimental de investigación

## Estado experimental

ARGOS permanece en fase:

```text
Research / Evidence Build
```

Strategy version:

```text
v1
```

El objetivo actual no es demostrar rentabilidad. El objetivo sigue siendo acumular Evidence, evaluar qué ocurre después de las señales, aumentar el tamaño de las muestras y estudiar resultados segmentados sin modificar prematuramente la estrategia.

Regla metodológica vigente:

> No iniciar decisiones de Trade Plan basadas en Evidence antes del primer corte mensual, salvo correcciones de bugs o problemas metodológicos.

Los datos de este corte no deben interpretarse como prueba de rentabilidad.

## Intervenciones recientes y frontera experimental

### 31-AGO-2026 — Market Universe Expansion

Frontera experimental:

```text
MARKET UNIVERSE EXPANSION
```

| Concepto                       | Antes | Después |
| ------------------------------ | ----: | ------: |
| Símbolos                       |    61 |     103 |
| Combinaciones symbol/timeframe |   305 |     515 |

Clasificación metodológica:

```text
EXPOSURE / SAMPLING CHANGE
```

No fue un cambio de estrategia. No cambiaron `strategyVersion`, scoring, thresholds, Target Ladder, analyzers, reglas de Evidence ni Forward Evaluation.

Por lo tanto, los datos posteriores al 31-AGO-2026 pueden contener una composición distinta de activos y no deben compararse ingenuamente con el periodo anterior como si la población experimental fuera idéntica.

### 01-SEP-2026 — Telegram Alert Timeframe Filter

Los timeframes `1m` y `5m` dejaron de producir notificaciones automáticas en ARGOS Alerts Bot.

Clasificación metodológica:

```text
NOTIFICATION / UX CHANGE
```

Esto no es un cambio de estrategia. `1m` y `5m` continúan activos en:

- Market Scan;
- Opportunity / Signal;
- Evidence;
- Forward Evaluation;
- Research.

Estado operativo:

```text
1m / 5m research = ACTIVE
1m / 5m Telegram automatic alerts = SILENCED
```

## Research Snapshot — 01-SEP-2026

| Métrica                               |  Valor |
| ------------------------------------- | -----: |
| Total Evidence                        |    639 |
| Evaluated                             |    594 |
| Without evaluation                    |     45 |
| Operational opportunities score >= 90 |    265 |
| Evidence evaluada                     | 92.96% |

El pipeline de evaluación está procesando correctamente la nueva Evidence. La cola pendiente disminuyó respecto al corte anterior a pesar del crecimiento de la muestra.

## Comparación contra baseline 31-AGO-2026

| Métrica                         | 31-AGO | 01-SEP |    Delta | Delta % |
| ------------------------------- | -----: | -----: | -------: | ------: |
| Evidence total                  |    473 |    639 |     +166 |  +35.1% |
| Evaluated                       |    356 |    594 |     +238 |  +66.9% |
| Without evaluation              |    117 |     45 |      -72 |       — |
| Operational opportunities >= 90 |    191 |    265 |      +74 |  +38.7% |
| Evidence evaluada               |  75.3% |  93.0% | +17.7 pp |       — |

Interpretación permitida:

El pipeline de investigación está absorbiendo correctamente el incremento de Evidence generado alrededor de la expansión del Market Universe.

No interpretar esto como mejora de la estrategia. Es una observación sobre throughput, cobertura y madurez operacional del pipeline de investigación.

## Estados de Forward Evaluation

| Estado             | Total |
| ------------------ | ----: |
| OPEN               |    89 |
| PARTIALLY_RESOLVED |    11 |
| CLOSED             |   405 |
| EXPIRED            |    85 |
| AMBIGUOUS          |     4 |

Lectura breve:

- `OPEN`: la observación todavía está siendo evaluada.
- `PARTIALLY_RESOLVED`: al menos parte del Target Ladder ya pudo resolverse, pero la evaluación completa todavía no terminó.
- `CLOSED`: evaluación terminada.
- `EXPIRED`: finalizó la ventana de evaluación sin resolver todos los targets según las reglas del experimento.
- `AMBIGUOUS`: el candle permitió comprobar eventos relevantes, pero no determinar de forma segura el orden intrabar.

No interpretar `OPEN` como `LOSS`.

## Target Ladder

| Target | Wins | Losses | Win Rate |
| ------ | ---: | -----: | -------: |
| +0.50% |  289 |    224 |   56.34% |
| +0.75% |    — |      — |   46.86% |
| +1.00% |    — |      — |   39.08% |
| +1.25% |    — |      — |   33.41% |

No inventar valores no disponibles en el snapshot documentado.

Comparación descriptiva 31-AGO → 01-SEP:

| Target | 31-AGO | 01-SEP |
| ------ | -----: | -----: |
| +0.50% | 63.29% | 56.34% |
| +0.75% | 56.30% | 46.86% |
| +1.00% | 48.43% | 39.08% |
| +1.25% | 42.34% | 33.41% |

La caída observada en winRate no debe describirse automáticamente como deterioro de la estrategia. Entre ambos cortes existe una expansión importante de la población experimental de 61 a 103 símbolos. Parte del cambio puede provenir de mayor tamaño de muestra, nueva composición de activos, nuevas exposiciones sectoriales, incorporación de ETF o comportamiento distinto de los nuevos símbolos.

## Definición vigente de Win Rate

```text
winRate = wins / (wins + losses)
```

`EXPIRED` y `AMBIGUOUS` no forman parte del denominador de winRate.

Un winRate mayor a 50% no demuestra rentabilidad. La rentabilidad dependerá posteriormente de tamaño promedio de ganancia, tamaño promedio de pérdida, Stop Loss, Take Profit, MAE, MFE, transaction costs, payoff y comportamiento por perfil.

No seleccionar todavía un Take Profit basándose solamente en el Target Ladder.

## MFE / MAE y score

Hipótesis abierta:

Los datos continúan sin demostrar una relación monotónica donde un score más alto implique mejor comportamiento futuro.

Ejemplo descriptivo disponible en `CRYPTO / 1m`:

| Score bucket | MFE avg | MAE avg |   N |
| ------------ | ------: | ------: | --: |
| 80-84        |  +1.57% |  -1.04% |  28 |
| 90-94        |  +1.70% |  -0.92% |  18 |
| 95-100       |  +1.05% |  -0.93% |   7 |

No convertir esto en conclusión. Especialmente `95-100` tiene una muestra demasiado pequeña.

Hipótesis reforzada:

> El score podría estar representando intensidad/confluencia del estado técnico actual y no necesariamente una escala ordinal de magnitud o calidad futura.

Debe seguir estudiándose con muestras mayores.

## Market Universe expandido

El nuevo Research Snapshot ya contiene Evidence proveniente del universo expandido. Se observan perfiles ETF y nuevos activos incorporándose al pipeline.

Esto proporciona evidencia operacional de que el flujo está funcionando:

```text
Market Universe
→ Market Scan
→ Signal
→ Evidence
→ Forward Evaluation
→ Research
```

No inferir todavía rendimiento superior o inferior por ETF, sector o industria. Sector-Aware Research sigue siendo una fase posterior.

## ARGOS — Experimental State — 01-SEP-2026

| Área                              | Estado                    |
| --------------------------------- | ------------------------- |
| Strategy                          | v1                        |
| Phase                             | Research / Evidence Build |
| Evidence                          | 639                       |
| Evaluated                         | 594 / 639 ≈ 93%           |
| Pending                           | 45                        |
| Operational score >= 90           | 265                       |
| Forward Evaluation                | HEALTHY                   |
| Expanded Market Universe          | ACTIVE                    |
| ETF Evidence                      | ARRIVING                  |
| 1m / 5m Research                  | ACTIVE                    |
| 1m / 5m Automatic Telegram Alerts | SILENCED                  |
| Strategy profitability            | UNKNOWN                   |
| Trade Plan                        | NOT READY                 |
| Strategy tuning                   | FROZEN                    |
| Research accumulation             | CONTINUE                  |

## Conclusión del corte

El corte del 01-SEP-2026 muestra un crecimiento importante de la base de Evidence y una mejora operacional en la proporción de observaciones evaluadas.

ARGOS pasó de 473 a 639 Evidence mientras las observaciones pendientes de evaluación disminuyeron de 117 a 45. Esto sugiere que el pipeline de investigación está absorbiendo adecuadamente el incremento de exposición producido por la expansión del Market Universe.

Los cambios observados en el Target Ladder, incluyendo la reducción de winRate en targets tempranos, deben mantenerse como observaciones descriptivas y no como evidencia de mejora o deterioro de la estrategia debido al cambio reciente en la composición de la población experimental.

Los datos continúan siendo insuficientes para seleccionar un Take Profit, Stop Loss o modificar scoring.

ARGOS permanece en Research / Evidence Build.

---

# 2026-09-03 — Corte experimental de investigación

## Estado experimental

ARGOS permanece en fase:

```text
Research / Evidence Build
```

Strategy version:

```text
v1
```

Este corte documenta el estado más reciente observado en Forward Evaluation y Research Snapshot. No modifica la estrategia, scoring, thresholds, stops, Target Ladder, Evidence, Forward Evaluation ni `strategy_version`.

Los datos de este corte no deben interpretarse como prueba de rentabilidad.

## Research Snapshot — 03-SEP-2026

| Métrica                               |               Valor |
| ------------------------------------- | ------------------: |
| Total Evidence                        |               1,162 |
| Evaluated Evidence                    |                 935 |
| Evidence without evaluation           |                 227 |
| Operational opportunities score >= 90 |                 470 |
| Evaluation coverage                   | 935 / 1,162 ≈ 80.5% |

Backlog de Evidence sin evaluar:

| Corte       | Evidence sin evaluar |
| ----------- | -------------------: |
| 01-SEP-2026 |                   45 |
| 03-SEP-2026 |                  227 |

El backlog aumentó respecto al corte anterior. Esto no debe interpretarse automáticamente como un problema del evaluador. El Forward Evaluation ejecutado antes del snapshot procesó los lotes actuales sin errores ni fallos de proveedor.

## Forward Evaluation ejecutado antes del snapshot

### Forward branch

| Métrica           | Valor |
| ----------------- | ----: |
| Pending           |    97 |
| Evaluated         |    97 |
| Errors            |     0 |
| Provider errors   |     0 |
| No future candles |     0 |

### Evidence branch

| Métrica            | Valor |
| ------------------ | ----: |
| Pending            |   100 |
| Evaluated          |   100 |
| CLOSED             |     2 |
| PARTIALLY_RESOLVED |     9 |
| OPEN               |    89 |
| Errors             |     0 |
| Provider errors    |     0 |
| No future candles  |     0 |

Conclusión técnica:

El pipeline/evaluador se observa sano en este corte, pero la generación y acumulación de Evidence está superando temporalmente el drenaje del backlog mediante las ejecuciones realizadas.

## Estados de Forward Evaluation

| Estado             | Total |
| ------------------ | ----: |
| OPEN               |    89 |
| PARTIALLY_RESOLVED |     9 |
| CLOSED             |   629 |
| EXPIRED            |   204 |
| AMBIGUOUS          |     4 |

No interpretar `OPEN` como `LOSS`.

## Target Ladder

| Target | Wins | Losses | Win Rate |
| ------ | ---: | -----: | -------: |
| +0.50% |  534 |    314 |   62.97% |
| +0.75% |  442 |    377 |   53.97% |
| +1.00% |  375 |    417 |   47.35% |
| +1.25% |  314 |    446 |   41.32% |
| +1.50% |  266 |    460 |   36.64% |
| +2.00% |  187 |    497 |   27.34% |
| +3.00% |  116 |    514 |   18.41% |
| +5.00% |   34 |    516 |    6.18% |

La definición vigente se mantiene:

```text
winRate = wins / (wins + losses)
```

`EXPIRED` y `AMBIGUOUS` no forman parte del denominador de winRate.

No seleccionar todavía un Take Profit basándose solamente en el Target Ladder.

## Forward Performance — MFE / MAE

MFE significa `Maximum Favorable Excursion`: máximo movimiento favorable observado después de la señal.

MAE significa `Maximum Adverse Excursion`: máximo movimiento adverso observado después de la señal.

| Métrica     | 01-SEP | 03-SEP |
| ----------- | -----: | -----: |
| MFE average | +1.01% | +1.21% |
| MFE median  | +0.52% | +0.70% |
| MAE average | -1.17% | -1.04% |
| MAE median  | -1.03% | -1.01% |

Observación descriptiva:

- el movimiento favorable promedio/mediano aumentó;
- el movimiento adverso promedio disminuyó ligeramente.

Esto no constituye evidencia suficiente de edge.

## Expectancy y Profit Factor

Historical Forward Expectancy: resultado promedio modelado por señal bajo las reglas actuales de evaluación histórica/forward.

Profit Factor: ganancias modeladas acumuladas / pérdidas modeladas acumuladas.

`PF > 1` sería deseable. `PF < 1` significa que las pérdidas modeladas siguen superando las ganancias modeladas.

### Comparación 01-SEP vs 03-SEP

| Target | 01-SEP Expectancy | 01-SEP PF | 03-SEP Expectancy | 03-SEP PF |
| ------ | ----------------: | --------: | ----------------: | --------: |
| +0.50% |            -0.15% |      0.65 |            -0.06% |      0.85 |
| +0.75% |            -0.18% |      0.66 |            -0.06% |      0.88 |
| +1.00% |            -0.22% |      0.64 |            -0.05% |      0.90 |
| +1.25% |                 — |         — |            -0.07% |      0.88 |
| +1.50% |            -0.26% |      0.63 |            -0.08% |      0.87 |
| +2.00% |            -0.39% |      0.51 |            -0.18% |      0.75 |
| +3.00% |            -0.56% |      0.37 |            -0.26% |      0.68 |
| +5.00% |            -0.84% |      0.14 |            -0.63% |      0.33 |

Las métricas agregadas continúan siendo negativas:

- ninguna expectancy global es positiva;
- ningún Profit Factor global supera 1.

Sin embargo, el agregado del 03-SEP se encuentra considerablemente más cerca del equilibrio que el observado el 01-SEP.

Caso destacado:

| Target               | 01-SEP | 03-SEP |
| -------------------- | ------ | ------ |
| +1.00% Expectancy    | -0.22% | -0.05% |
| +1.00% Profit Factor | 0.64   | 0.90   |

No interpretar esto como evidencia de rentabilidad.

Esta variación, ocurrida sin modificar Strategy v1, refuerza metodológicamente la decisión de no realizar tuning prematuro con muestras todavía en formación.

## Score buckets

| Score bucket | TP +2% | TP +3% |
| ------------ | -----: | -----: |
| 80-84        | 28.17% | 17.44% |
| 85-89        | 25.57% | 17.79% |
| 90-94        | 25.42% | 18.45% |
| 95-100       | 31.36% | 21.15% |

El bucket `95-100` presenta además:

```text
MFE promedio ≈ +1.21%
```

Comparado conceptualmente con el corte anterior, donde los buckets de score alto parecían comportarse peor, la evidencia actual ya no sostiene claramente que scores altos tengan peor comportamiento forward.

### H7 — Relación score / outcome

La evidencia actual ya no sostiene claramente que scores altos tengan peor comportamiento forward.

En el corte del 03-SEP, el bucket `95-100` presenta el mayor winRate para el target `+2%` entre los buckets observados.

Sin embargo, la relación score/outcome ha cambiado de manera importante conforme aumenta la muestra.

Status:

```text
OPEN / INCONCLUSIVE
```

No afirmar:

```text
score alto = mejor señal
```

Interpretación actual:

La relación entre score y resultado forward permanece inestable y requiere una muestra más madura y segmentación adicional.

## Timeframes

| Timeframe |   N | TP +2% | TP +3% |
| --------- | --: | -----: | -----: |
| 1m        | 456 | 27.06% | 17.69% |
| 5m        | 300 | 30.13% | 20.19% |
| 15m       | 161 | 24.63% | 18.11% |
| 1d        |  17 | 17.65% | 11.76% |
| 1w        |   1 |  0.00% |  0.00% |

Observación descriptiva:

`5m` presenta actualmente el mayor winRate para `+2%` entre los timeframes con muestra relevante.

No convertirlo en regla operativa.

`1m` y `5m` continúan generando Evidence y siendo evaluados aunque sus notificaciones automáticas estén silenciadas en Telegram Alerts. Esto confirma que el filtro de notificaciones no interrumpió la investigación.

## Asset types

| Asset type |   N | TP +2% | TP +3% |
| ---------- | --: | -----: | -----: |
| STOCK      | 597 | 28.37% | 17.49% |
| CRYPTO     | 210 | 26.40% | 19.79% |
| ETF        | 128 | 22.81% | 20.00% |

ETF ya no presenta `0% / 0%` como en el corte anterior.

Esto es otro ejemplo de por qué no deben obtenerse conclusiones operativas con muestras iniciales pequeñas o inmaduras.

## Contexto externo de mercado — 03-SEP-2026

Esta sección registra contexto de mercado alrededor del corte. No explica causalmente los resultados de ARGOS.

### Crypto

Bitcoin y el mercado crypto amplio operaron en un contexto de recuperación de activos de riesgo. Investopedia reportó que Bitcoin subió hasta cerca de `$81,400` el 03-SEP, después de moverse desde una zona cercana a `$77,000`, coincidiendo con comentarios de Christopher Waller que redujeron parte de la presión por tasas. También se observaron avances en acciones relacionadas con crypto como Coinbase, Robinhood y MicroStrategy.

En flujos de ETFs crypto, Cointelegraph reportó que los ETFs spot de Ether registraron salidas netas después de una racha de entradas, mientras que los fondos de Bitcoin rebotaron con entradas. Esto sugiere un contexto mixto dentro de crypto: mejora de precio en BTC y activos relacionados, pero rotación o pausa en algunos vehículos de Ether/XRP.

Fuentes:

- Investopedia — Bitcoin Climbs to Highest Intraday Level Since May as Risk Assets Get Boost From Waller's Comments: https://www.investopedia.com/bitcoin-sets-fresh-intraday-high-since-august-breakout-hood-mstr-coin-12102940
- Cointelegraph — Ether, XRP ETF Inflows End as Bitcoin Funds Rebound: https://cointelegraph.com/markets/eth-xrp-etf-inflow-streaks-end-bitcoin-funds-rebound

### Acciones

El mercado estadounidense mostró una sesión positiva. AP reportó que el S&P 500 subió `1.1%`, el Dow Jones `1.2%` y el Nasdaq `1.4%`, con tecnología liderando el avance mientras los rendimientos de bonos cedían. El mismo contexto incluyó atención a datos laborales próximos y a la decisión de tasas de la Fed.

Yahoo Finance también describió la sesión como un rally asociado a menores apuestas de alza de tasas y retroceso de rendimientos del Treasury a 10 años. La nota destacó fortaleza en Nasdaq y megacaps/tecnología, mientras el mercado seguía pendiente de tensiones geopolíticas, petróleo y datos macro.

Fuentes:

- AP — Tech stocks lead a rally on Wall Street as bond yields ease some more: https://apnews.com/article/7e1bffd68c53b54806be950f01181994
- Yahoo Finance — Stock market today: Dow, S&P 500, Nasdaq surge as traders pare rate-hike bets, bond yields ease: https://au.finance.yahoo.com/news/stock-market-today-thursday-september-3-dow-sp-500-nasdaq-futures-081525933.html/

### ETFs

ETF no se trata como un mercado independiente. La lectura contextual se deriva de las exposiciones que ARGOS monitorea:

- Broad Market ETFs como SPY/QQQ/VOO estaban expuestos al avance general de S&P 500/Nasdaq.
- Technology ETFs como XLK y semiconductores como SMH/SOXX estuvieron en un entorno favorable por liderazgo tecnológico.
- Rates/Treasury ETFs como TLT/IEF/SHY operaron en un contexto de rendimientos a la baja durante la sesión.
- Sector ETFs reflejaron una sesión más favorable para risk assets, aunque no todos los sectores avanzaron con la misma fuerza.
- Metals/energy siguieron condicionados por tensiones geopolíticas, petróleo y tasas.

Fuentes:

- AP — Tech stocks lead a rally on Wall Street as bond yields ease some more: https://apnews.com/article/7e1bffd68c53b54806be950f01181994
- Yahoo Finance — Update: US Equity Indexes Rise After Treasury Yields Slump: https://finance.yahoo.com/markets/stocks/articles/us-equity-indexes-rise-treasury-164019757.html

## Market regime observado

| Área            | Régimen descriptivo                                                                 |
| --------------- | ----------------------------------------------------------------------------------- |
| Equities        | Risk-on / tech-led rebound                                                          |
| Crypto          | Risk-on con señales mixtas en flujos ETF                                            |
| Rates           | Yields easing                                                                       |
| Volatility      | Moderada / sin evidencia suficiente para clasificar como high volatility            |
| Sector behavior | Liderazgo tecnológico y broad market positivo; comportamiento sectorial no uniforme |

Confidence:

```text
MEDIUM
```

La clasificación se apoya en coincidencia de índices al alza, caída de yields y mejora de activos de riesgo. La confianza no es alta porque el contexto externo incluía tensiones geopolíticas, petróleo elevado, datos macro pendientes y flujos crypto mixtos.

## Interpretación del corte

1. ARGOS continúa acumulando Evidence correctamente.

2. El Forward Evaluator procesó los lotes actuales sin errores ni fallos de proveedor.

3. Existe un backlog de `227` Evidence sin evaluación; conviene reducirlo antes del próximo corte formal para mejorar comparabilidad.

4. Las métricas agregadas continúan sin demostrar edge rentable:
   - expectancy global `< 0`;
   - Profit Factor global `< 1`.

5. Sin embargo, las métricas se acercaron considerablemente al equilibrio respecto al 01-SEP.

6. La relación entre score y outcome cambió notablemente con el crecimiento de la muestra.

7. ETF también cambió significativamente respecto al corte anterior.

8. Esto refuerza la política experimental actual:

```text
NO realizar tuning de Strategy v1 antes del primer corte mensual,
salvo bugs o problemas metodológicos.
```

9. El contexto externo de mercado debe tratarse como información descriptiva para futuras comparaciones, no como explicación causal automática de los resultados de ARGOS.

Próximo corte formal:

```text
aproximadamente 07-SEP-2026
```

---

# 2026-09-04 — Corte experimental de investigación y cierre semanal

## Estado experimental

ARGOS permanece en fase:

```text
Research / Evidence Build
```

Strategy version:

```text
v1
```

Snapshot utilizado:

| Campo           | Valor                    |
| --------------- | ------------------------ |
| snapshotDate    | 2026-09-04               |
| generatedAt     | 2026-09-04T23:58:43.480Z |
| timeZone        | America/Mexico_City      |
| strategyVersion | v1                       |

Este corte es documental / research log. No modifica estrategia, scoring, thresholds, stops, Target Ladder, Evidence, Forward Evaluation, Market Scan ni `strategyVersion`.

## Research Snapshot — 04-SEP-2026

| Métrica                               |   Valor |
| ------------------------------------- | ------: |
| Evidence total                        |   1,372 |
| Evaluated Evidence                    |   1,271 |
| Evidence sin evaluación               |     101 |
| Evidence con MFE/MAE                  |   1,271 |
| Evaluation coverage                   | ≈ 92.6% |
| Operational Opportunities score >= 90 |     557 |

Comparación contra el corte de referencia 01-SEP:

| Métrica                 |  01-SEP |  04-SEP |
| ----------------------- | ------: | ------: |
| Evidence total          |     639 |   1,372 |
| Evaluated Evidence      |     594 |   1,271 |
| Evidence sin evaluación |      45 |     101 |
| Evaluation coverage     | ≈ 93.0% | ≈ 92.6% |

Observación descriptiva:

La muestra continúa creciendo rápidamente y la cobertura de evaluación permanece alta. El crecimiento debe leerse considerando la expansión del Market Universe del 31-AGO-2026:

```text
61 → 103 símbolos
305 → 515 combinaciones symbol/timeframe
```

Por lo tanto, no interpretar automáticamente cambios agregados como mejora o deterioro de Strategy v1.

## Score buckets

| Score bucket | Evidence |
| ------------ | -------: |
| 80-84        |      436 |
| 85-89        |      379 |
| 90-94        |      330 |
| 95-100       |      227 |

## Evaluation statuses

| Estado             | Total |
| ------------------ | ----: |
| OPEN               |    94 |
| PARTIALLY_RESOLVED |     6 |
| CLOSED             |   909 |
| EXPIRED            |   258 |
| AMBIGUOUS          |     4 |

No interpretar `OPEN` como `LOSS`. La gran cantidad de señales recientes en estado `OPEN` es esperable cuando todavía están dentro de su ventana de evaluación.

## Global Target Ladder

| Target | Wins | Losses | Expired | Ambiguous | Unresolved | Resolved Sample Size | Win Rate |
| ------ | ---: | -----: | ------: | --------: | ---------: | -------------------: | -------: |
| +0.50% |  682 |    465 |      48 |        24 |        153 |                1,219 |   59.46% |
| +0.75% |  555 |    561 |      76 |        14 |        166 |                1,206 |   49.73% |
| +1.00% |  466 |    613 |     105 |        13 |        175 |                1,197 |   43.19% |
| +1.25% |    — |      — |       — |         — |          — |                    — |   37.27% |
| +1.50% |    — |      — |       — |         — |          — |                    — |   32.21% |
| +2.00% |  232 |    732 |     209 |         4 |        195 |                1,177 |   24.07% |
| +3.00% |    — |      — |       — |         — |          — |                    — |   16.04% |
| +5.00% |    — |      — |       — |         — |          — |                    — |    5.19% |

`winRate` no equivale a profitability. Estos resultados son métricas experimentales del Forward Evaluation bajo las reglas actuales.

La caída del hit rate conforme aumenta el target sigue siendo marcada:

```text
0.5% = 59.46%
1.0% = 43.19%
2.0% = 24.07%
3.0% = 16.04%
5.0% = 5.19%
```

Esto continúa debilitando la idea de un target universal para todos los activos/timeframes. No modificar targets todavía.

## Observaciones del corte

### 1. La muestra continúa creciendo rápidamente

El corte anterior de referencia del 01-SEP tenía:

```text
639 Evidence
594 evaluated
```

El corte actual tiene:

```text
1,372 Evidence
1,271 evaluated
```

La cobertura de evaluación permanece alta, aproximadamente `92.6%`.

### 2. Score sigue sin mostrar una relación monotónica simple

Ejemplos del snapshot:

CRYPTO / 1m:

| Score bucket | Avg MFE | Median MFE |
| ------------ | ------: | ---------: |
| 90-94        |  +1.56% |     +1.35% |
| 95-100       |  +1.27% |     +1.15% |

STOCK / 15m:

| Score bucket | Avg MFE |
| ------------ | ------: |
| 90-94        |  +1.50% |
| 95-100       |  +0.92% |

Esto continúa siendo consistente con H1/H7:

H1: un score mayor no implica necesariamente mayor MFE/reach.

H7: el score podría estar midiendo intensidad/confluencia del estado técnico presente y no necesariamente ser una escala ordinal de calidad futura.

No convertir esto en regla operacional todavía.

### 3. Diferencias por asset type y timeframe

Los perfiles continúan mostrando diferencias importantes entre:

```text
CRYPTO
STOCK
ETF
```

y entre:

```text
1m
5m
15m
1d
1w
```

Esto continúa apoyando la metodología de analizar:

```text
assetType + timeframe + scoreBucket + strategyVersion
```

Posteriormente se podrá incorporar formalmente sector/industry mediante V1.6-B.

## Forward Evaluate del corte

### Forward

| Métrica        | Valor |
| -------------- | ----: |
| pendingSignals |    77 |
| evaluated      |    77 |
| partial        |     3 |
| open           |    74 |
| expired        |     0 |
| ambiguous      |     0 |
| providerErrors |     0 |
| errors         |     0 |

### Evidence

| Métrica        | Valor |
| -------------- | ----: |
| pendingSignals |   100 |
| evaluated      |   100 |
| partial        |     6 |
| open           |    94 |
| expired        |     0 |
| ambiguous      |     0 |
| providerErrors |     0 |
| errors         |     0 |

Interpretación:

El pipeline de Forward Evaluation continúa funcionando correctamente. La gran cantidad de `OPEN` recientes es esperable porque las señales todavía se encuentran dentro de su ventana de evaluación.

## Market Context — Week ending 04-SEP-2026

Esta sección es contexto externo. No explica causalmente los resultados producidos por ARGOS.

### Crypto

Bitcoin comenzó parte de la semana operando aproximadamente en la zona de `77k-78k USD`. Posteriormente recuperó `80k` y llegó aproximadamente a la zona de `81k-82k`.

El movimiento estuvo acompañado por cambios en expectativas de tasas, entradas relevantes en Bitcoin ETFs y liquidaciones de posiciones short. Después, el reporte laboral estadounidense del 04-SEP mostró aproximadamente `162,000` empleos creados frente a expectativas cercanas a `53k-65k`, elevando expectativas de política monetaria más restrictiva. Los Treasury yields subieron y Bitcoin volvió a perder temporalmente la zona de `80k`.

Caracterización descriptiva de la semana crypto:

```text
HIGH VOLATILITY / MACRO-SENSITIVE
```

Esto no se convierte en clasificación automática del engine.

Fuentes externas consultadas:

- Yahoo Finance — The Jobs Report Came In at Three Times the Estimate. Can Bitcoin Get $80,000 Back?: https://finance.yahoo.com/markets/crypto/articles/jobs-report-came-three-times-131530555.html
- Barron's — Bitcoin Slips Below $80,000 After Jobs Data: https://www.barrons.com/articles/bitcoin-price-crypto-5ac5ccf8

### Equities

El 04-SEP, los principales índices estadounidenses cerraron con retrocesos moderados:

```text
S&P 500 ≈ -0.4%
Dow ≈ -0.5%
Nasdaq ≈ -0.3%
```

El cierre semanal fue más moderado:

```text
S&P 500 ≈ +0.1%
Nasdaq ≈ +0.4%
Dow ≈ -0.3%
```

El movimiento del viernes estuvo relacionado principalmente con la sorpresa positiva del employment report y el consecuente aumento de expectativas de tasas. También se observó fortaleza relativa en semiconductors durante la sesión del viernes, aun cuando los índices amplios cerraron ligeramente negativos.

Fuentes externas consultadas:

- AP — How major US stock indexes fared Friday 9/4/2026: https://apnews.com/article/ebc11cfa2cf8baf4491bf3d4199c1d74
- AP — Stocks fall after a surprisingly strong jobs report raises prospects of an interest rate hike: https://apnews.com/article/1af16359af43eb8abc66445465f633c8
- Investor's Business Daily — Stock Market Today: Dow Sinks Amid Rate Fears; Sandisk, KLA Lead Nasdaq-100 As Utilities Gain: https://www.investors.com/market-trend/stock-market-today/dow-jones-sp500-nasdaq-august-jobs-report-lululemon-lulu/

## H8 — Market Regime Dependency

Hipótesis:

> La efectividad forward de las señales de ARGOS podría depender significativamente del régimen de mercado en el que fueron generadas.

Definición sencilla de Market Regime:

El contexto dominante del mercado durante un periodo. Ejemplos:

- trending bullish;
- trending bearish;
- sideways;
- high volatility;
- low volatility;
- macro/news-driven.

Status:

```text
OPEN / INCONCLUSIVE
```

H8 es únicamente una hipótesis. No implica:

- implementar Market Regime detection;
- modificar scoring;
- cambiar weights;
- cambiar thresholds;
- cambiar targets;
- cambiar Stop Loss;
- excluir Evidence;
- crear filtros operacionales;
- cambiar `strategyVersion`.

Strategy v1 remains frozen.

## Metodología vigente

Este corte no autoriza cambios de estrategia.

Seguimos en:

```text
Research / Evidence Build
```

No iniciar Trade Plan Research todavía.

Regla metodológica vigente:

> No iniciar decisiones de Trade Plan basadas en Evidence antes del primer corte mensual, salvo correcciones de bugs o problemas metodológicos.

El siguiente objetivo sigue siendo acumular Evidence y realizar cortes descriptivos semanales.

## Conclusión del corte

1. ARGOS continúa acumulando Evidence correctamente.

2. El Forward Evaluator procesó los lotes actuales sin errores ni fallos de proveedor.

3. La cobertura de evaluación permanece alta, aproximadamente `92.6%`.

4. La muestra creció de forma importante respecto al 01-SEP.

5. El Global Target Ladder mantiene una caída fuerte de winRate conforme aumenta el target.

6. El score continúa sin mostrar una relación monotónica simple con el comportamiento futuro.

7. Se observan diferencias relevantes entre asset types y timeframes.

8. El contexto semanal fue macro-sensitive, especialmente por empleo, yields y expectativas de tasas.

9. El cambio de Market Universe del 31-AGO debe seguir considerándose al comparar cortes.

10. Strategy v1 permanece congelada.

---

# 2026-09-05 — Corte documental: Score Research, auditoría humana y Shadow Paper Trading v0.1

## Contexto

Este corte documenta observaciones y decisiones metodológicas al cierre del 05-SEP-2026. No cambia Strategy v1.

```text
strategy_version = v1
status = frozen
capital real = NO
broker integration = NO
ejecución automática = NO
```

Regla metodológica vigente:

> No iniciar decisiones de Trade Plan basadas en Evidence antes del primer corte mensual, salvo correcciones de bugs o problemas metodológicos.

Shadow Paper Trading v0.1 se registra como experimento paralelo de observación prospectiva. No reemplaza Forward Evaluation, no modifica Evidence y no retroalimenta Strategy v1 todavía.

## Score Performance Research

La relación entre Score y comportamiento futuro sigue sin mostrar una relación monotónica estable.

H7 permanece abierta:

> El Score podría estar midiendo intensidad/confluencia del estado técnico actual más que funcionar como predictor ordinal simple de magnitud/calidad futura.

Estado:

```text
OPEN / INCONCLUSIVE
```

Segmento observado que motivó Shadow Paper Trading:

```text
STOCK · 5m · Score100

sampleSize = 38
evaluated = 36
coverage = 94.74%

MFE average = +1.40%
MFE median  = +0.89%

MAE average = -1.21%
MAE median  = -1.05%
```

Comparación descriptiva con `STOCK · 5m · Score90-94`:

| Métrica    | Score100 | Score90-94 |
| ---------- | -------: | ---------: |
| N          |       38 |         57 |
| MFE avg    |   +1.40% |     +1.06% |
| MFE median |   +0.89% |     +0.47% |
| MAE avg    |   -1.21% |     -1.20% |
| MAE median |   -1.05% |     -1.04% |

Reach Rate:

| Target | Score100 | Score90-94 |
| ------ | -------: | ---------: |
| +0.5%  |   66.67% |     50.00% |
| +1.0%  |   47.22% |     32.65% |
| +2.0%  |   32.35% |     16.67% |
| +3.0%  |   21.21% |     10.42% |

Interpretación permitida:

> En la muestra actual, `STOCK · 5m · Score100` presenta mayor MFE promedio/mediano y mayor reach rate en varios targets relevantes que `STOCK · 5m · Score90-94`, sin incremento material del MAE mediano.

Interpretación no permitida:

```text
Score100 tiene edge.
Score100 es rentable.
Score100 predice ganancias.
```

## H9 — STOCK 5m Score100 como subconjunto descriptivamente distinto

Hipótesis:

> En la muestra actual, `STOCK · 5m · Score100` podría identificar un subconjunto descriptivamente distinto dentro de Strategy v1, útil para observación prospectiva mediante Shadow Paper Trading.

Estado:

```text
EARLY / OPEN
```

Debe sobrevivir a:

- crecimiento de muestra;
- primer corte mensual;
- calibración;
- evaluación futura out-of-sample.

## Score100 no es uniforme por timeframe

Resumen actual:

| Timeframe | Lectura descriptiva                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1m        | STOCK Score100 no domina claramente; 95-99 parece descriptivamente fuerte en varios targets, con N todavía insuficiente. |
| 5m        | STOCK Score100 es actualmente el subconjunto más interesante.                                                            |
| 15m       | STOCK Score100 no supera consistentemente 90-94 y además muestra discrepancias en auditoría humana.                      |
| 1h        | Sin Evidence útil todavía; fue agregado recientemente. Cero datos no significa mala estrategia.                          |
| 1d        | Muestra extremadamente pequeña.                                                                                          |
| 1w        | Sin Evidence suficiente.                                                                                                 |

Distribución llamativa en STOCK:

| Timeframe | 90-94 | 95-99 | 100 |
| --------- | ----: | ----: | --: |
| 1m        |    90 |    23 |  60 |
| 5m        |    57 |    11 |  38 |
| 15m       |    29 |     2 |  31 |
| 1h        |     0 |     0 |   0 |
| 1d        |     6 |     0 |   0 |
| 1w        |     0 |     0 |   0 |

Pregunta abierta:

> ¿Por qué Score100 aparece con relativa frecuencia mientras 95-99 es escaso?

No asumir bug. No asumir saturación demostrada. Investigación futura sugerida: `Exact Score Distribution Research` por `assetType + timeframe + strategyVersion + exactScore` y, cuando exista persistencia suficiente, composición de pilares que producen cada score.

## Auditoría humana STOCK 15m

Fuente revisada: `auditoria_argos_STOCK.md` disponible fuera del repo en el workspace local.

Casos Score100 auditados:

| Ticker | ARGOS | Human | Delta |
| ------ | ----: | ----: | ----: |
| MU     |   100 |    91 |    -9 |
| PYPL   |   100 |    90 |   -10 |
| CAT    |   100 |    90 |   -10 |
| META   |   100 |    83 |   -17 |
| T      |   100 |    87 |   -13 |
| NFLX   |   100 |    81 |   -19 |

Resumen:

```text
sampleSize = 6
humanScoreMean = 87.0
meanDelta = -13.0
humanRange = 81-91
```

Interpretación provisional:

`STOCK · 15m` presenta setups técnicamente buenos, pero ARGOS podría estar sobrecalibrado en scores altos dentro de esta muestra auditada.

Principal candidato: `Structure`.

Preguntas secundarias:

- Volume normalizado por hora de sesión;
- Momentum alrededor de RSI 65-70;
- contexto/madurez de Trend.

## Auditoría humana ETF 15m

Fuente revisada: `auditoria_argos_ETF.md` disponible fuera del repo en el workspace local.

Muestra:

| Ticker | ARGOS | Human | Delta |
| ------ | ----: | ----: | ----: |
| XLE    |   100 |    92 |    -8 |
| QQQ    |   100 |    80 |   -20 |
| GDX    |   100 |    74 |   -26 |
| XLRE   |   100 |    79 |   -21 |
| TLT    |    95 |    74 |   -21 |
| XLI    |    90 |    73 |   -17 |

Resumen:

```text
Asset Type = ETF
Timeframe = 15m
sampleSize = 6
ARGOS mean = 97.5
Human mean = 78.7
Mean delta = -18.8
```

Principal discrepancia: `Structure / breakout quality`.

## Hipótesis de auditoría

H-AUDIT-01:

> ARGOS podría puntuar correctamente la presencia de condiciones técnicas, pero sobrevalorar su calidad contextual al alcanzar puntuaciones máximas, especialmente en Structure.

H-AUDIT-02:

> Investigar si Volume Score intradía está normalizado por hora de sesión. Apertura/cierre presentan volumen naturalmente superior y podrían recibir puntuaciones elevadas si la comparación utiliza un promedio no ajustado por horario.

H-AUDIT-03:

> Momentum podría necesitar en una futura Strategy v2 una gradación contextual más fina: RSI 55-60, 60-65 y 65-70 no necesariamente representan la misma calidad aunque todos indiquen momentum constructivo.

Estado común:

```text
EXPLORATORY
NO STRATEGY CHANGE
NO SCORE CHANGE
NO PRODUCTION CHANGE
```

## Metodología de auditoría humana

1. La puntuación humana utiliza únicamente información disponible en `signalAt`.
2. No utilizar movimiento posterior para modificar la puntuación.
3. Un trade que posteriormente subió no convierte retrospectivamente la señal en perfecta.
4. Un trade que posteriormente cayó no convierte retrospectivamente la señal en mala.
5. Volumen elevado no demuestra por sí solo actividad institucional.
6. RSI < 70 no significa automáticamente momentum perfecto.
7. Breakout detectado no significa automáticamente `Structure=25`.
8. La auditoría evalúa calidad de señal.
9. Entradas alternativas, Stop Loss, Take Profit y gestión pertenecen a futuro Trade Plan Research.

## Decisión: Shadow Paper Trading v0.1

Se implementó `ARGOS Shadow Paper Trading v0.1` como experimento paralelo porque `STOCK · 5m · Score100` es actualmente el subconjunto descriptivamente más interesante.

Estado:

```text
IMPLEMENTED — PENDING MANUAL VALIDATION
```

Scope congelado:

```text
assetType = STOCK
timeframe = 5m
score = 100
strategyVersion = v1
paperStrategyVersion = paper-v0.1
referenceSnapshotDate = 2026-09-05
MFE reference = +0.89%
MAE reference = -1.05%
```

Niveles de revisión:

```text
+0.89% historical MFE median reference
-1.05% historical MAE median reference
+1.5%, +2.0%, +3.0%, +5.0% favorable follow-up levels
```

Estas zonas no son Take Profit automático. Son zonas de revisión / referencia.

Principio central:

```text
ARGOS detecta
ARGOS monitorea
ARGOS alerta
HUMANO decide
```

La implementación real incluye:

- migration `013_create_paper_trading_tables.sql`;
- tablas `market_signal_engine.paper_trades` y `market_signal_engine.paper_trade_levels`;
- `PaperTradeService`;
- `PaperTradeMonitorService`;
- repositorios Memory/PostgreSQL;
- timer `paperTradeMonitor` cada 1 minuto;
- integración con Telegram Control Bot;
- excepción de notificación para `STOCK + 5m + Score100 + strategy_version=v1`.

Limitación UX actual:

El Alerts Bot no procesa directamente los callbacks que procesa el Control Bot. Por lo tanto, todavía no existe botón funcional directo desde Alerts Bot para registrar el paper trade. El registro se realiza desde Telegram Control Bot.

Backlog UX futuro:

- callback transport para Alerts Bot;
- deep link hacia Control Bot.

## Decisiones explícitas

No se modificó:

- scoring;
- analyzers;
- pesos;
- thresholds;
- reglas de Evidence;
- Forward Evaluation;
- Target Ladder;
- Strategy Profiles;
- Research Snapshot;
- broker integration;
- ejecución automática;
- uso de capital real.

Conclusión vigente:

> Strategy v1 todavía no ha demostrado un profitable edge agregado.

## Próximo paso

Mantener V1.6-B — Sector-Aware Research como siguiente fase principal. Shadow Paper Trading v0.1 avanza en paralelo como observación prospectiva y no debe usarse para modificar Strategy v1 antes de revisión metodológica.

## 2026-09-08 — Corte diario Evidence / Strategy Research v1

## Contexto

Este corte continúa siendo investigación descriptiva de `strategy_version=v1`.

No demuestra edge, rentabilidad ni justifica cambios operativos.

Regla metodológica vigente:

> No iniciar decisiones de Trade Plan basadas en Evidence antes del primer corte mensual, salvo bugs o problemas metodológicos.

Este corte no modifica Strategy v1, scoring, thresholds, targets/stops, Evidence, Forward Evaluation, Market Scan, Telegram, ORB-FVG ni Shadow Paper Trading.

## 1. STOCK · 5m

### Score 100

| Métrica               |  Valor |
| --------------------- | -----: |
| sampleSize            |     39 |
| evaluatedCount        |     39 |
| evaluationCoveragePct |   100% |
| MFE average           | +1.33% |
| MFE median            | +0.87% |
| MAE average           | -1.13% |
| MAE median            | -1.02% |

Reach rate:

| Target |  Reach |
| ------ | -----: |
| +0.50% | 65.79% |
| +0.75% | 52.63% |
| +1.00% | 47.37% |
| +1.25% | 31.58% |
| +1.50% | 31.58% |
| +2.00% | 28.95% |
| +3.00% | 18.42% |
| +5.00% |  6.06% |

### Score 90–94

| Métrica        |  Valor |
| -------------- | -----: |
| sampleSize     |     64 |
| evaluatedCount |     62 |
| MFE average    | +1.08% |
| MFE median     | +0.50% |
| MAE average    | -1.10% |
| MAE median     | -1.02% |

Reach rate:

| Target |  Reach |
| ------ | -----: |
| +0.50% | 50.82% |
| +0.75% | 36.07% |
| +1.00% | 34.43% |
| +1.25% | 31.15% |
| +1.50% | 26.23% |
| +2.00% | 16.67% |
| +3.00% | 10.00% |
| +5.00% |  1.82% |

### Score 95–99

| Métrica        |  Valor |
| -------------- | -----: |
| sampleSize     |     13 |
| evaluatedCount |     11 |
| MFE average    | +1.02% |
| MFE median     | +0.37% |
| MAE average    | -1.07% |
| MAE median     | -1.03% |

Observación principal:

`STOCK · 5m · Score100` continúa siendo el segmento descriptivamente más interesante de Strategy v1.

Comparado con `Score90–94`:

| Métrica    | Score100 | Score90–94 |
| ---------- | -------: | ---------: |
| MFE median |   +0.87% |     +0.50% |
| MAE median |   -1.02% |     -1.02% |

Score100 continúa mostrando mayor excursión favorable posterior sin deterioro material de la excursión adversa mediana.

Esto fortalece descriptivamente H9, pero no demuestra profitability/edge. El segmento continúa temprano y no debe utilizarse todavía para calibrar Strategy v1.

## 2. STOCK · 15m

### Score 100

| Métrica        |  Valor |
| -------------- | -----: |
| sampleSize     |     32 |
| evaluatedCount |     29 |
| coverage       | 90.63% |
| MFE average    | +0.89% |
| MFE median     | +0.58% |
| MAE average    | -0.96% |
| MAE median     | -1.01% |

Reach:

| Target |  Reach |
| ------ | -----: |
| +0.50% | 51.72% |
| +0.75% | 31.03% |
| +1.00% | 31.03% |
| +1.25% | 27.59% |
| +1.50% | 24.14% |
| +2.00% | 17.24% |
| +3.00% |  6.90% |

### Score 90–94

| Métrica        |  Valor |
| -------------- | -----: |
| sampleSize     |     35 |
| evaluatedCount |     35 |
| MFE average    | +1.50% |
| MFE median     | +0.90% |
| MAE average    | -1.12% |
| MAE median     | -1.02% |

Reach:

| Target |  Reach |
| ------ | -----: |
| +0.50% | 62.86% |
| +0.75% | 57.58% |
| +1.00% | 51.52% |
| +1.25% | 36.36% |
| +1.50% | 28.13% |
| +2.00% | 15.63% |
| +3.00% | 15.63% |

Observación:

En `STOCK · 15m` no existe una relación monotónica simple donde Score100 produzca mejores resultados posteriores que Score90–94.

Score90–94 presenta actualmente mayor MFE average, mayor MFE median y mayor reach rate en buena parte de la escalera de targets.

Esto continúa siendo compatible con:

- H1: un score mayor no implica necesariamente mayor MFE/reach futuro.
- H7: Strategy v1 podría estar midiendo intensidad/cantidad de confluencias técnicas presentes más que una escala ordinal de calidad futura del setup.

Esta observación se relaciona con auditorías humanas previas de `STOCK · 15m`, donde varios Score100 fueron degradados humanamente, especialmente por contextual quality de Structure.

No cambiar Structure ni scoring todavía.

## 3. CRYPTO · 5m

### Score100

| Métrica        |  Valor |
| -------------- | -----: |
| sampleSize     |     15 |
| evaluatedCount |     14 |
| MFE average    | +1.70% |
| MFE median     | +1.53% |
| MAE average    | -1.59% |
| MAE median     | -1.30% |

Reach:

| Target |  Reach |
| ------ | -----: |
| +0.50% | 71.43% |
| +1.00% | 64.29% |
| +1.50% | 50.00% |
| +2.00% | 42.86% |
| +3.00% | 28.57% |

Comparativamente, `STOCK · 5m · Score100` muestra:

| Métrica    |  Valor |
| ---------- | -----: |
| MFE median | +0.87% |
| MAE median | -1.02% |

Observación:

Los datos continúan siendo compatibles con H3: CRYPTO puede presentar mayor amplitud favorable intradía que STOCK, acompañada potencialmente de mayor excursión adversa.

La muestra `N=15` sigue siendo insuficiente para una conclusión fuerte. Mantener segmentación por `assetType + timeframe`.

## 4. CRYPTO · 15m

### Score100

| Métrica     |  Valor |
| ----------- | -----: |
| sampleSize  |      7 |
| MFE average | +0.71% |
| MFE median  |  0.00% |
| MAE average | -1.52% |
| MAE median  | -1.10% |
| reach +1%   | 28.57% |
| reach +2%   | 14.29% |

Muestra demasiado pequeña. No extraer conclusiones.

## 5. ETF · 5m

### Score100

| Métrica     |  Valor |
| ----------- | -----: |
| sampleSize  |     10 |
| MFE average | +1.28% |
| MFE median  | +0.61% |
| MAE average | -0.63% |
| MAE median  | -0.28% |

Reach:

| Target |  Reach |
| ------ | -----: |
| +0.50% | 66.67% |
| +1.00% | 44.44% |
| +2.00% | 33.33% |
| +3.00% | 33.33% |

La MAE mediana resulta descriptivamente interesante, pero `N=10` es demasiado pequeño. Registrar únicamente como observación temprana; no promover a hipótesis fuerte todavía.

## Estado de hipótesis

### H1 — Higher score is not necessarily monotonic with future MFE/reach

Status:

```text
SUPPORTED / remains active
```

### H2 — Historical STOCK5m 95–100 behavior

Status:

```text
REQUIRES REFINEMENT
```

La separación actual entre `95–99` y `Score100` sugiere que no deberían interpretarse necesariamente como un único bloque.

### H3 — CRYPTO may exhibit larger favorable amplitude than STOCK intraday, potentially with larger MAE

Status:

```text
COMPATIBLE WITH CURRENT EVIDENCE / still insufficient sample
```

### H4 — Higher MFE does not imply a better executable trade

Status:

```text
ACTIVE / unchanged
```

### H5 — Strategy behavior should be researched separately by assetType + timeframe

Status:

```text
INCREASINGLY SUPPORTED
```

### H6 — Do not conclude from insufficient samples

Status:

```text
ACTIVE
```

### H7 — Score may measure technical-state intensity/confluence rather than ordinal future setup quality

Status:

```text
STRENGTHENED BY CURRENT 5m/15m DIVERGENCE
```

### H8 — Market-regime dependency

Status:

```text
OPEN / descriptive research pending
```

### H9 — STOCK 5m Score100 may identify a descriptively stronger subset than STOCK 5m Score90–94

Status:

```text
STRENGTHENED, BUT STILL EARLY / NOT PROFITABILITY EVIDENCE
```

Supporting observation:

- MFE median `+0.87%` vs `+0.50%`.
- MAE median `-1.02%` vs `-1.02%`.
- Score100 `N=39`, `100%` evaluation coverage.

No llamar a esto edge.

### H10 — Signal Timing / Movement Maturity

Hypothesis:

> Strategy v1 may sometimes identify strong technical confluence only after a substantial part of the movement has already occurred.

In that case, a high score could correctly describe the current technical state while still arriving relatively late from an entry/timing perspective.

Status:

```text
OPEN / UNTESTED
```

Potential future descriptive metrics:

- `preSignalMovePct`
- `distanceFromEMA20`
- `distanceFromEMA50`
- `distanceFromRecentLow`
- `distanceFromRecentHigh`
- `distanceToResistance`
- `barsSinceBreakout`
- `barsSinceMomentumExpansion`
- `RSIAtSignal`
- `ATR-normalized extension`

Estas métricas son candidatas de investigación futura. No se implementan en este corte.

Research futuro puede comparar timing de señales Strategy v1 contra timing de candidates ORB-FVG en el mismo ticker/session, pero esa comparación no se implementa ahora.

## Conclusión oficial diaria

Al corte de investigación del 2026-09-08, `STOCK · 5m · Score100` permanece como el segmento Strategy v1 más interesante descriptivamente. Con `N=39` y `100%` de cobertura de evaluación, mantiene una mediana MFE materialmente mayor que `Score90–94` (`+0.87%` vs `+0.50%`), mientras la mediana MAE permanece prácticamente idéntica (`-1.02%` vs `-1.02%`). Esto fortalece H9 descriptivamente, pero no demuestra rentabilidad ni edge ejecutable.

`STOCK · 15m` continúa mostrando comportamiento no monotónico por score: `Score90–94` supera actualmente a `Score100` en varias métricas de favorable excursion/reach. Esto fortalece la distinción entre intensidad de confluencia técnica presente y calidad/timing futuro del setup.

No se justifica ninguna calibración de Strategy v1 desde este corte diario. Continuar acumulando Evidence hasta el corte mensual planeado, salvo que se identifique un bug o problema metodológico.

## Boundaries

Este cierre diario de Strategy v1 no debe mezclarse con el experimento prospectivo ORB-FVG del mismo día. ORB-FVG tendrá una auditoría forense/calibración separada.

Los fake trades seleccionados manualmente del experimento ORB-FVG no son Evidence de Strategy v1.

No actualizar metodología ORB-FVG desde esta tarea.

No actualizar reglas de Shadow Paper Trading.

---

## 2026-09-08 — ORB-FVG v0.2 definido como variante 15m OR + 5m setup detection

Se crea la boundary experimental para `orb-fvg-v0.2`.

`orb-fvg-v0.1` queda preservado como histórico del experimento basado en:

```text
Opening Range = 15m
Automatic setup detection = 1m breakout + 1m FVG
```

La primera sesión prospectiva del 2026-09-08 dejó señales metodológicas importantes:

- 192 candidates;
- 65 tickers únicos;
- repeated crossings sobre el mismo Opening Range;
- detección retrospectiva/backfill observada;
- tiny 1m FVGs;
- discrepancia Yahoo/TradingView observada en PLD.

`orb-fvg-v0.2` cambia exclusivamente el timeframe de detección automática:

```text
Opening Range = 15m
Automatic setup detection = 5m breakout + 5m FVG
Manual entry refinement = 1m fuera del detector automático
```

Hipótesis:

> Usar 15m Opening Range y 5m Breakout/FVG confirmation puede reducir microstructure noise y producir estructuras ORB-FVG más significativas que detectar directamente en 1m.

Esto es una hipótesis experimental, no una afirmación de mejora, rentabilidad ni edge.

Telegram ORB-FVG permanece silenciado durante la validación técnica de v0.2. Strategy v1 Telegram y Shadow Paper Trading no cambian.

No se agregan todavía filtros de volumen, EMA, ATR, minimum FVG size, cooldown, one-candidate-per-day, retest automático, ejecución automática ni integración broker.

## 2026-09-08 — ORB-FVG v0.1 queda LONG-only

Cambio metodológico:

`orb-fvg-v0.1` queda restringido a investigación prospectiva LONG-only.

Motivo:

> El experimento inicial generaba LONG y SHORT, pero la hipótesis que se desea estudiar en esta fase corresponde únicamente a rupturas alcistas del Opening Range acompañadas por bullish FVG.

Impacto:

- no se modifica Strategy v1;
- no se modifica Evidence v1;
- no se modifica Forward Evaluation v1;
- no se modifica Shadow Paper Trading;
- no se modifica scoring;
- señales SHORT previas, si existen, se preservan como histórico;
- señales SHORT previas abiertas pueden terminar su forward evaluation;
- a partir de este boundary temporal no deben generarse nuevas señales ORB-FVG SHORT;
- al analizar resultados, no mezclar posibles SHORT históricos con el dataset prospectivo LONG-only posterior al 2026-09-08.

Estado:

```text
IMPLEMENTED — PENDING FIRST PROSPECTIVE SESSION VALIDATION
```

## 2026-09-08 — ORB-FVG RESULT Telegram notifications deshabilitadas

Cambio UX/operacional del experimento:

`orb-fvg-v0.1` conserva la alerta inicial de candidate LONG válido, pero deja de enviar notificaciones Telegram de resolución `ORB-FVG RESULT`.

Telegram behavior:

```text
candidate detection alerts only
```

Final outcomes are persisted silently for research.

Impacto:

- forward monitoring sigue activo;
- WIN / LOSS / AMBIGUOUS / EXPIRED siguen persistiendo;
- MFE / MAE / maxR siguen actualizándose;
- R ladder y timestamps de niveles siguen actualizándose;
- Strategy v1 alerts no cambian;
- Shadow Paper Trading alerts no cambian;
- Telegram Control Bot no cambia.

## 2026-09-08 — ORB-FVG Telegram temporalmente silenciado

Cambio temporal para la sesión de research:

Todas las notificaciones Telegram originadas por `orb-fvg-v0.1` quedan silenciadas durante la sesión.

Impacto esperado:

- candidate alerts deshabilitadas temporalmente;
- `ORB-FVG RESULT` sigue deshabilitado;
- scanner sigue activo;
- forward monitor sigue activo;
- persistencia PostgreSQL sigue activa;
- R ladder, MFE, MAE, maxR y outcomes siguen actualizándose;
- Strategy v1 Telegram no cambia;
- Shadow Paper Trading Telegram no cambia;
- Telegram Control Bot no cambia.

Objetivo:

Recolectar la sesión completa silenciosamente para auditoría manual posterior al cierre.
