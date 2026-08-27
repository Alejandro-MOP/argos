# Resumen ejecutivo — ARGOS

## Qué es

ARGOS es un sistema experimental de soporte a decisiones de mercado que revisa activos financieros, detecta
posibles oportunidades de trading y genera un plan básico de entrada, stop y objetivos. No compra,
no vende y no se conecta a brokers; funciona como una capa de análisis, evidencia y alerta.

La propuesta central es simple: convertir muchas velas de mercado en una respuesta clara:

```text
¿Hay una oportunidad suficientemente buena?
Si la hay, ¿dónde sería razonable entrar, cuánto se arriesga y qué objetivo se busca?
```

## Qué problema resuelve

Cuando se revisan muchos tickers manualmente, es fácil perder oportunidades o perseguir movimientos
sin estructura. ARGOS Engine ayuda a filtrar ruido usando reglas consistentes:

- Revisa una lista de activos.
- Evalúa tendencia, volumen, momentum y estructura.
- Asigna un score objetivo de 0 a 100.
- Separa oportunidades normales de alertas Telegram de alta prioridad.
- Calcula un plan de operación con capital, pérdida estimada y ganancia estimada.
- Permite probar históricamente si esas reglas habrían funcionado.

## Cómo funciona ARGOS Engine

El flujo operativo es:

```text
Tickers
  -> Datos de mercado de Yahoo Finance
  -> Análisis técnico por componentes
  -> Score total
  -> Filtro de oportunidad
  -> Plan de riesgo
  -> Respuesta HTTP y/o Telegram
```

ARGOS Engine analiza velas normalizadas con precio de apertura, máximo, mínimo, cierre y volumen. Con esas
velas calcula cuatro bloques, cada uno con máximo 25 puntos.

## Cómo calcula una oportunidad

El score total va de 0 a 100:

```text
Score = Trend + Volume + Momentum + Structure
```

### 1. Trend — tendencia

Busca que la tendencia esté alineada. La señal más fuerte ocurre cuando EMA20 está por encima de EMA50
y ambas medias vienen ascendiendo. En términos sencillos: el precio no solo sube, sino que la dirección
general acompaña.

### 2. Volume — participación

Compara el volumen actual contra su promedio reciente. Un movimiento con volumen fuerte suele tener
más calidad que un movimiento con poca participación. No garantiza éxito, pero ayuda a evitar señales
flojas.

### 3. Momentum — fuerza del movimiento

Usa RSI14 para detectar si el activo está en una zona constructiva. ARGOS Engine favorece momentum positivo,
pero intenta no premiar movimientos demasiado extendidos.

### 4. Structure — comportamiento del precio

Evalúa si hay breakout, máximos/mínimos ascendentes o consolidación cerca de resistencia. Este bloque
intenta capturar si el precio está construyendo una estructura operable.

## Thresholds importantes

El sistema separa dos decisiones:

| Configuración | Para qué sirve |
| --- | --- |
| `OPPORTUNITY_MIN_SCORE` | Score mínimo para considerar una oportunidad válida. |
| `TELEGRAM_NOTIFICATION_MIN_SCORE` | Score mínimo para mandar alerta por Telegram. |

Ejemplo: si una oportunidad tiene score 60 y `OPPORTUNITY_MIN_SCORE=50`, aparece como oportunidad.
Pero si `TELEGRAM_NOTIFICATION_MIN_SCORE=80`, no se manda Telegram. Esto permite ver oportunidades
intermedias sin llenar Telegram de alertas.

## Cómo interpreta entry, stop y target

Cuando una oportunidad es válida, ARGOS Engine crea un plan:

- `entry`: precio de referencia para entrar, basado en el cierre de la vela señal.
- `financialStop`: precio donde se asume una pérdida porcentual controlada, por ejemplo -1%.
- `technicalStop`: mínimo de la vela señal; sirve como referencia técnica.
- `takeProfit1`: primer objetivo, por ejemplo +2%.
- `takeProfit2`: segundo objetivo, por ejemplo +3%.

Si se manda `capital`, ARGOS estima pérdida y ganancia usando ese capital completo para cada
oportunidad individual. No reparte automáticamente el capital entre todas las oportunidades.

## Temporalidad y tipo de oportunidad

La temporalidad cambia la lectura práctica de la señal:

| Timeframe | Tipo | Interpretación |
| --- | --- | --- |
| `1m`, `5m` | Scalping | Movimientos rápidos de minutos. |
| `15m`, `30m` | Intradía | Operaciones dentro del día. |
| `1h` | Swing corto | Horas a pocos días. |
| `1d` | Swing | Días a semanas. |
| `1w` | Posición | Semanas a meses. |

Una señal de `1m` no debe interpretarse igual que una señal de `1w`. La primera es táctica y rápida;
la segunda es más estratégica y lenta.

## Qué aporta el backtesting

El backtesting responde dos preguntas:

1. ¿La estrategia habría funcionado históricamente?
2. ¿Ha funcionado recientemente o su desempeño se está deteriorando?

El nuevo endpoint `POST /api/backtest` simula señales pasadas con la misma lógica que usa producción.
Esto es importante porque evita crear una estrategia bonita en backtest pero distinta a la que manda
alertas reales.

## Cómo evita hacerse trampa

El backtest aplica una regla clave: no usa información futura para generar señales. Para cada fecha,
solo analiza las velas que habrían existido hasta ese momento. Las velas futuras se usan después, solo
para revisar si el trade habría tocado stop o take profit.

Esto se conoce como evitar `look-ahead bias`, uno de los errores más comunes en backtesting.

## Cómo evalúa resultados

Cada trade histórico evalúa dos objetivos:

- TP1, por ejemplo +2%.
- TP2, por ejemplo +3%.

Cada uno puede terminar como:

| Resultado | Significado |
| --- | --- |
| `WIN` | El precio tocó el target antes del stop. |
| `LOSS` | El precio tocó el stop antes del target. |
| `EXPIRED` | No tocó ni stop ni target dentro de la ventana máxima. |
| `AMBIGUOUS` | En una misma vela tocó ambos; no sabemos qué pasó primero. |

El win rate se calcula solo con wins y losses. Los casos expirados o ambiguos se muestran, pero no se
mezclan automáticamente como aciertos o fallos.

## Métricas adicionales

El backtest incluye:

- `averageScore`: score promedio de señales históricas.
- `averageMfePercent`: máximo avance favorable promedio mientras el trade estuvo activo.
- `averageMaePercent`: máximo retroceso adverso promedio mientras estuvo activo.
- Ventanas recientes: periodo completo, últimos 12 meses, 6 meses, 30 días y 7 días.

Esto permite ver no solo si algo funcionó en el pasado lejano, sino si sigue funcionando en condiciones
recientes.


## Configuración dinámica y universo de mercado

ARGOS ya cuenta con una capa de configuración dinámica en PostgreSQL. Esto reduce la dependencia de
variables de entorno para la operación diaria y permite ajustar parámetros sin redeploy cuando la base de
datos está disponible.

La separación es intencional:

| Componente | Vive en | Motivo |
| --- | --- | --- |
| Secretos y bootstrap | Variables de entorno | No deben guardarse tokens ni credenciales en base de datos. |
| Configuración funcional | PostgreSQL | Permite ajustar scoring, riesgo, retries y parámetros de ARGOS Engine con trazabilidad. |
| Universo de mercado | PostgreSQL | Permite activar/desactivar símbolos y timeframes por símbolo sin tocar código. |

El universo ahora incluye símbolos, tipo de activo, sector, industria, mercado, exchange, timezone,
sesión de mercado y `provider_symbol`. Esto último desacopla el ticker lógico de ARGOS Engine del ticker que
se manda al proveedor de datos.

## Conciencia de horario de mercado

Antes, un ticker intradía fuera de sesión podía aparecer como `stale-market-data`. Ahora ARGOS Engine separa
los casos:

- `market-closed`: el mercado regular está cerrado y no conviene llamar a Yahoo.
- `stale-market-data`: el mercado debería estar disponible, pero la última vela llegó vieja.

Para acciones y ETFs estadounidenses, los timeframes intradía solo se consultan durante la sesión regular
09:30-16:00 en `America/New_York`. Las velas `1d` y `1w` siguen permitidas fuera de sesión. Crypto se
mantiene 24/7.

## Versionado de estrategia

Las señales reales y oportunidades se guardan con `strategy_version`. Esto permite comparar en el futuro
la eficacia de señales generadas por `v1` contra señales generadas después de cambiar scoring, stop loss,
take profits o reglas de oportunidad.

El siguiente paso natural será guardar también un `config_snapshot` completo por señal para auditoría más
fina.

## Límites actuales

El proyecto todavía tiene límites importantes:

- No ejecuta órdenes reales.
- No considera comisiones, slippage, spreads ni liquidez real.
- Usa datos de Yahoo Finance, que pueden tener retrasos, huecos o restricciones históricas.
- No modela fills intravela; si una vela toca stop y target, el resultado queda `AMBIGUOUS`.
- No hace optimización automática de parámetros.
- La persistencia en PostgreSQL ya existe, pero las métricas ejecutivas de forward performance todavía están en evolución.
- No reemplaza criterio humano ni gestión de riesgo profesional.

## Riesgos principales

- Un buen backtest no garantiza resultados futuros.
- ARGOS Engine puede sobreajustarse si se cambian reglas solo para mejorar resultados históricos.
- Las señales de temporalidades pequeñas pueden ser más sensibles a ruido, latencia y spread.
- El cálculo de capital asume una operación individual; si se operan varias a la vez, el riesgo real
  acumulado puede ser mayor.

## Próximas mejoras recomendadas

1. Forward testing con persistencia: guardar señales reales y evaluarlas días después.
2. Reportes por activo y por timeframe para saber dónde funciona mejor.
3. Métricas de expectancy, drawdown y profit factor.
4. Costos operativos: comisiones, spread y slippage.
5. Gestión de portafolio: límite de riesgo total si aparecen varias oportunidades simultáneas.
6. Dashboard visual para revisar señales, resultados y evolución reciente.
7. Alertas diferenciadas por tipo de oportunidad: scalping, intradía, swing y posición.

## Mensaje para presentación

ARGOS no pretende adivinar el mercado. Su valor está en estandarizar el análisis, reducir ruido,
medir resultados históricos y crear disciplina antes de tomar una decisión. Es una herramienta de
soporte: detecta setups con reglas claras, muestra el riesgo de forma explícita y permite validar si
la lógica tiene sentido antes de escalarla.


## Signal Intelligence en Telegram

Las alertas de Telegram ahora se explican en tres capas para que una persona pueda leerlas sin mezclar
conceptos:

### 1. Setup actual

Muestra lo que ARGOS Engine ve hoy: ticker, temporalidad, score, tendencia, volumen, momentum, estructura,
razones técnicas y plan de operación. Esta capa responde si el setup actual cumple las reglas de ARGOS Engine.

### 2. Evidencia histórica — Backtest

Muestra qué ocurrió en el pasado con setups comparables usando ARGOS Engine. Incluye cuántos casos
históricos existen, resultados para TP +2% y TP +3%, MFE promedio y MAE promedio. Esta información sirve
como evidencia, no como promesa. Un 71% histórico no significa “71% de probabilidad de ganar”.

Si la muestra es pequeña, el mensaje lo advierte. Si no hay suficientes datos históricos, el sistema lo
dice de forma explícita y no inventa números.

### 3. Evidencia real — Forward Test

Esta capa queda preparada para medir señales reales emitidas por el bot. Es diferente al backtest porque
no simula el pasado: audita alertas que el sistema realmente generó en vivo. En la versión actual todavía
no hay persistencia suficiente para calcularlo, por eso Telegram muestra que está pendiente de recopilar
señales reales.

## Por qué importa esta separación

Separar score, backtest y forward test evita vender humo. El score mide calidad técnica actual; el
backtest mide comportamiento histórico de reglas comparables; el forward test medirá desempeño real del
bot cuando exista historial vivo. Esa separación hace que el sistema sea más honesto, auditable y fácil
de explicar a usuarios no técnicos.
