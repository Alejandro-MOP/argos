# EXPERIMENT_LOG.md — Bitácora experimental de Market Signal Engine / ARGOS

Esta bitácora documenta la evolución empírica del motor con datos observados en ejecución real.
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

Las Evidence Signals son snapshots inmutables de lo que el engine sabía en T0.
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
