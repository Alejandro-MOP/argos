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
