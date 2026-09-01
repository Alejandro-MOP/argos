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

| Métrica | Valor |
| ------- | ----: |
| strategyVersion | v1 |
| Evidence total / elegible | 473 |
| Evidence evaluada | 356 |
| Evidence sin evaluación | 117 |
| Señales/oportunidades con operational threshold >= 90 | 191 |

### Distribución por scoreBucket

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

## Forward Evaluation del corte

La ejecución manual de `POST /api/forward-evaluate` realizada inmediatamente antes del Research Snapshot produjo:

| Métrica | Total |
| ------- | ----: |
| Evidence pendientes | 100 |
| Evaluadas | 100 |
| PARTIALLY_RESOLVED | 9 |
| OPEN | 91 |
| Provider errors | 0 |
| Evaluation errors | 0 |
| Casos sin future candles | 0 |

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
| +0.50% | 181 | 105 | 63.29% |
| +0.75% | 152 | 118 | 56.30% |
| +1.00% | 123 | 131 | 48.43% |
| +1.25% | 105 | 143 | 42.34% |
| +1.50% | 93 | 145 | 39.08% |
| +2.00% | 67 | 165 | 28.88% |
| +3.00% | 41 | 174 | 19.07% |
| +5.00% | 10 | 176 | 5.38% |

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

| Hito | Estado | Impacto experimental |
| ---- | ------ | -------------------- |
| V1.5-A — Control Core | Implementado y validado | Ingeniería / observabilidad |
| V1.5-B — Telegram Control Transport / Long Polling | Implementado y validado | Ingeniería / observabilidad |
| V1.5-C — Read-Only Research Integrations | Implementado y validado | Observabilidad read-only |
| V1.5-D — Telegram Transaction Costs | Implementado y validado | Simulación/costos read-only |
| V1.5-E — Analyze Symbol | Implementado y validado | Análisis ad-hoc read-only |
| V1.5-F — Full Market Scan from Telegram | Implementado; commit presente | Mecanismo de ejecución/recolección |

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

| Concepto | Valor |
| -------- | ----: |
| Símbolos activos | 61 |
| Timeframes | 5 |
| Combinaciones símbolo-timeframe aproximadas | 305 |

Después:

| Concepto | Valor |
| -------- | ----: |
| Símbolos activos | 103 |
| Timeframes | 5 |
| Combinaciones símbolo-timeframe | 515 |
| Símbolos nuevos | 42 |

Composición final:

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

| Métrica | 31-AGO-2026 |
| ------- | ----------: |
| Evidence | 473 |
| Evaluadas | 356 |
| Operacionales >= 90 | 191 |

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

Por ahora únicamente se registra el antes/después y se buscarán patrones repetidos con más Evidence.

