# Market Signal Engine --- Roadmap, Hitos y Versionamiento

> Documento vivo del proyecto. Codex debe actualizarlo en cada cambio
> relevante.
>
> **Estado actual:** `v0.9 — Pre-V1 / Evidence Build` **Próximo hito:**
> `v1.0.0 — Detection & Evidence`

## 1. Objetivo

Market Signal Engine es un radar cuantitativo de mercado que analiza
automáticamente múltiples símbolos y temporalidades, filtra ruido,
detecta oportunidades y mide posteriormente qué ocurrió con cada señal.

La filosofía es:

**Mercado → Radar → Señales relevantes → Evidencia → Decisión humana**

Actualmente el universo soporta aproximadamente 61 símbolos y cinco
temporalidades (`1m`, `5m`, `15m`, `1d`, `1w`), es decir, hasta 305
combinaciones potenciales por ciclo antes de aplicar filtros de sesión y
configuración.

## 2. Estado general

  -----------------------------------------------------------------------
  Versión                 Objetivo                Estado
  ----------------------- ----------------------- -----------------------
  V0 --- Core             Núcleo cuantitativo     ✅ Completado
                          desacoplado

  V1 --- Signal Engine    Detectar, persistir,    ✅ Funcional
                          notificar y evaluar señales

  V1.1 --- Dynamic        Configuración, universo ✅ Completado
  Configuration           y sesiones desde PostgreSQL

  V1.1.1 --- Market       Concurrencia controlada ✅ Completado
  Data Throughput         y retries seguros

  **V1.2 --- Evidence**   Demostrar               ✅ Implementado
                          estadísticamente la     pendiente de validar
                          calidad de las señales  con muestra real

  V2 --- Calibration      Mejorar estrategia      📋 Backlog
                          utilizando evidencia

  V3 --- Trade Companion  Seguimiento de trades   📋 Backlog
                          realmente tomados

  V3.1 --- Trading        Medir decisiones y      📋 Backlog
  Journal                 resultados reales

  V4 --- Product          Dashboard y             🌱 Futuro
                          administración visual

  V5 --- Platform         Usuarios, preferencias  💭 Futuro
                          y posible
                          comercialización
  -----------------------------------------------------------------------

## 3. V0 --- Core

### Implementado

-   Arquitectura hexagonal / Ports & Adapters.
-   Modelo normalizado `Candle`.
-   Market Data Provider.
-   Yahoo Finance como adaptador.
-   Trend Analyzer.
-   Volume Analyzer.
-   Momentum Analyzer.
-   Structure Analyzer.
-   Scoring compuesto `/100`.
-   EMA rápida/lenta.
-   RSI.
-   Volumen.
-   Higher Highs / Higher Lows.
-   Breakouts y consolidaciones.

``` text
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

## 4. V1 --- Signal Engine

### Implementado

-   Escaneo automático de múltiples símbolos.
-   Multi-timeframe: `1m`, `5m`, `15m`, `1d`, `1w`.
-   Opportunities.
-   Signals.
-   PostgreSQL.
-   Trade Plan.
-   Entry.
-   Stop técnico.
-   Stop financiero.
-   TP1 / TP2.
-   Telegram.
-   Backtesting.
-   Forward testing.
-   `TradeOutcomeEvaluator`.
-   `ForwardSignalEvaluator`.
-   Timer de evaluación forward.
-   Estados `OPEN`, `PARTIALLY_RESOLVED`, `CLOSED`, `EXPIRED`,
    `AMBIGUOUS`.
-   Outcomes `WIN`, `LOSS`, `EXPIRED`, `AMBIGUOUS`.
-   MFE y MAE.

``` text
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

## 5. V1.1 --- Dynamic Engine Configuration & Market Universe

### Implementado

-   `engine_config`: configuración funcional con descripción, categoría,
    tipo y activación.
-   `market_symbols`: catálogo de instrumentos.
-   `symbol_timeframes`: temporalidades activables por símbolo.
-   Metadata: asset type, sector, industry, exchange, market, timezone y
    session type.
-   `provider_symbol` para desacoplar el símbolo lógico del proveedor.
-   Sesiones `US_REGULAR` y `TWENTY_FOUR_SEVEN`.
-   Acciones/ETF intradía fuera de sesión → `market-closed` sin llamar
    Yahoo.
-   `1d` y `1w` pueden analizarse fuera de sesión.
-   Crypto continúa 24/7.
-   `strategy_version` para separar evidencia entre versiones del
    algoritmo.
-   Fallback a ENV/configuración anterior cuando corresponde.

## 5.1. V1.1.1 --- Market Data Throughput

### Implementado

-   Pool de concurrencia controlada para requests de datos de mercado.
-   Configuración funcional desde `engine_config` / ENV:
    `MARKET_DATA_MAX_CONCURRENCY`, `MARKET_DATA_BATCH_DELAY_MS`,
    `MARKET_DATA_MAX_RETRIES`, `MARKET_DATA_RETRY_BASE_DELAY_MS`.
-   Reintentos con exponential backoff para errores recuperables: `429`,
    `408`, `5xx`, timeout y errores temporales de red.
-   Errores no recuperables como símbolos inválidos, delisted o sin datos
    no se reintentan.
-   Filtro de sesión antes de consultar Yahoo: combinaciones `market-closed`
    no generan request al proveedor.
-   Métricas visibles en logs y response HTTP: combinaciones, mercado cerrado,
    requests reales, éxitos, fallos, rate limits, retries y duración.
-   `MARKET_DATA_SEQUENTIAL` y `MARKET_DATA_REQUEST_DELAY_MS` quedan
    deprecadas/inactivas en PostgreSQL, conservadas solo por compatibilidad
    de fallback.

### No implementado todavía

-   Resampling de velas.
-   Deduplicación de requests por símbolo/timeframe.


## 6. Estado actual --- v0.9 Pre-V1 / Evidence Build

El motor ya puede:

**Analizar → Detectar → Persistir → Notificar → Observar qué ocurrió
después.**

Lo que falta para considerar V1 completa es convertir las evaluaciones
individuales en evidencia estadística agregada. El siguiente hito funcional sigue siendo V1.2 Evidence.

## 7. V1.2 --- Evidence 🔥

### Objetivo

Responder con datos:

> ¿Las alertas del motor realmente identifican oportunidades útiles?

### Implementado en V1.2

-   `EVIDENCE_MIN_SCORE=80` como configuración funcional independiente.
-   Dataset dedicado `evidence_signals` para capturar setups observados por
    investigación sin convertirlos necesariamente en Opportunities operativas.
-   Separación explícita:
    `EVIDENCE_MIN_SCORE` != `OPPORTUNITY_MIN_SCORE` !=
    `TELEGRAM_NOTIFICATION_MIN_SCORE`.
-   Score `80-89` → Evidence-only, sin Opportunity ni Telegram.
-   Score `90+` con configuración operativa actual → Evidence + Opportunity +
    Signal/Telegram según `notify` y threshold de Telegram.
-   Deduplicación Evidence por `ticker + timeframe + strategy_version` dentro
    de la ventana `OPPORTUNITY_DUPLICATE_WINDOW_MINUTES`.
-   Snapshot inmutable con score, sub-scores, reasons, entry, stop técnico,
    stop financiero, TP1/TP2, metadata de mercado y `strategy_version`.
-   `EvidenceSignalEvaluator` reutilizando `TradeOutcomeEvaluator`.
-   Evaluación con estados `OPEN`, `PARTIALLY_RESOLVED`, `CLOSED`, `EXPIRED`,
    `AMBIGUOUS` y outcomes `WIN`, `LOSS`, `EXPIRED`, `AMBIGUOUS`.
-   MFE/MAE con la misma semántica existente.
-   Target Ladder experimental normalizado: `0.50`, `0.75`, `1.00`, `1.25`,
    `1.50`, `2.00`, `3.00`, `5.00`.
-   Tabla normalizada `evidence_target_evaluations` para poder agregar nuevos
    niveles en V2 sin migraciones destructivas.
-   `PostgresForwardPerformanceProvider` para consultar evidencia real
    observada por el engine, separado del Backtest.
-   Endpoint `GET /api/forward-performance` con filtros por ticker, timeframe,
    score, bucket, asset type, sector, industry, strategy version y fechas.
-   Score buckets exactos: `80-84`, `85-89`, `90-94`, `95-100`.
-   Performance por timeframe, ticker, asset type, sector, industry y
    `strategy_version`.
-   `sampleSize`, `smallSample`, win rate TP1/TP2, expired/ambiguous rate,
    promedio/mediana MFE/MAE.
-   `historicalForwardExpectancyPercent` para targets experimentales, excluyendo
    EXPIRED/AMBIGUOUS del cálculo principal.
-   Profit Factor experimental solo cuando hay pérdidas resueltas suficientes;
    si no, se devuelve `null` para no inventar una métrica falsa.

### Pendiente antes de tag `v1.0.0`

-   Ejecutar varios ciclos reales hasta acumular muestra suficiente.
-   Validar manualmente que `evidence_signals` y evaluaciones crezcan con datos
    reales.
-   Decidir si el mensaje Telegram debe consumir `PostgresForwardPerformanceProvider`.
    En este commit se dejó intencionalmente sin cambios.
-   Evaluar si hace falta cache compartido de velas entre ForwardSignalEvaluator
    y EvidenceSignalEvaluator para evitar requests duplicados en evaluación.

### Deuda técnica nueva

-   El timer reutiliza infraestructura y ejecuta Forward + Evidence, pero todavía
    no comparte cache de velas entre ambos evaluadores.
-   El endpoint de performance trabaja sobre PostgreSQL; sin `DATABASE_URL`
    responde que la métrica no está disponible.
-   Profit Factor queda limitado a targets experimentales resueltos con pérdidas;
    no se fuerza cuando la muestra no permite cálculo riguroso.

### Preguntas clave

-   ¿Score 95-100 funciona mejor que 90-94?
-   ¿15m funciona mejor que 5m?
-   ¿Qué sectores funcionan mejor?
-   ¿Crypto se comporta distinto?
-   ¿Cuánto suele avanzar favorablemente una señal?
-   ¿Cuánto suele caer antes de funcionar?

## 8. Hito v1.0.0 --- Detection & Evidence

Crear el primer release/tag formal cuando V1.2 esté funcionando.

``` text
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
Resultado
  ↓
Performance estadístico
```

## 9. V2 --- Strategy Calibration

### Backlog

-   Validar si mayor Score implica mejores resultados.
-   Market Data Candle Resampling / Request Deduplication.
-   Backtestear TP: `+0.50`, `+0.75`, `+1.00`, `+1.25`, `+1.50`, `+2`,
    `+3`, `+5%`.
-   Backtestear distintos Stop Loss.
-   Calibrar TP/SL por timeframe.
-   Analizar expectancy.
-   Comparar V1 contra V2.
-   Crear nueva `strategy_version` ante cambios materiales del
    algoritmo.

Principio: **no cambiar el algoritmo por intuición; cambiarlo cuando la
evidencia lo justifique.**

## 10. V3 --- Trade Companion

### Backlog

-   Telegram bidireccional.
-   Identificador legible de señal.
-   Comando conceptual `/enter SIGNAL_ID`.
-   Tabla separada de trades reales.
-   Trade Monitor automático.
-   Seguimiento de trades `OPEN`.
-   Alertas de 50%/75% hacia SL.
-   Alerta de SL alcanzado.
-   Alertas de proximidad a TP1/TP2.
-   Alertas de TP1/TP2 alcanzados.
-   Deduplicación.
-   Cierre/cancelación desde Telegram.

Separación:

``` text
SIGNAL = el algoritmo detectó una oportunidad
TRADE  = el usuario decidió operar esa señal
```

## 11. V3.1 --- Trading Journal

### Backlog

-   Entry/exit real.
-   Capital.
-   PnL realizado.
-   Duración.
-   Win rate personal.
-   Average win/loss.
-   Expectancy.
-   Profit factor.
-   Drawdown.
-   Performance por score/timeframe/sector.
-   Comparación resultado teórico vs resultado real.

``` text
SIGNAL
¿Qué detectó el algoritmo?

FORWARD EVALUATION
¿Qué hizo el mercado?

TRADE
¿Qué decidió operar el usuario?

TRADE RESULT
¿Qué resultado obtuvo?
```

## 12. V4 --- Product

### Backlog futuro

-   Dashboard web.
-   Signals / Opportunities.
-   Trades activos.
-   Trading Journal.
-   Forward/Backtest Performance.
-   Administración de `engine_config`.
-   Administración de símbolos y timeframes.
-   Visualización por sector/industry.
-   Strategy versions.
-   Calendario bursátil completo.
-   Holidays / early closes / sesiones especiales.

## 13. V5 --- Platform

Solo considerar si existe necesidad real:

-   Usuarios.
-   Suscripciones.
-   Planes.
-   Preferencias.
-   Distribución Telegram.
-   Billing.

## 14. Principios del roadmap

1.  **Medir antes de optimizar.**
2.  **No mover la portería:** conservar reglas de una strategy version
    mientras se mide.
3.  **Separar detección de ejecución:** el engine detecta; el humano
    decide.
4.  **Forward data \> impresión visual.**
5.  **Una muestra pequeña no demuestra ventaja.**
6.  **Evitar look-ahead bias.**
7.  **Secrets/API keys nunca pertenecen a configuración funcional.**

## 15. Definición del producto

> **Radar cuantitativo de mercado que analiza automáticamente múltiples
> activos y temporalidades, filtra condiciones técnicas relevantes,
> notifica oportunidades y mide posteriormente su eficacia mediante
> evidencia histórica y forward.**

``` text
61 símbolos × 5 temporalidades
          ↓
hasta 305 análisis potenciales
          ↓
MARKET SIGNAL ENGINE
          ↓
pocas oportunidades relevantes
          ↓
decisión humana
```

## 16. Política obligatoria de actualización

Este archivo es un **documento vivo** y debe formar parte del proceso de
desarrollo.

### Bloque para agregar a futuros prompts de Codex

``` text
DOCUMENTATION REQUIREMENT

Antes de finalizar el commit:

1. Revisa ROADMAP.md.
2. Actualiza el estado de las funcionalidades implementadas.
3. Marca como completados únicamente elementos realmente implementados y validados.
4. Agrega nueva deuda técnica o backlog descubierto durante el desarrollo.
5. Actualiza "Estado actual" si cambió el hito.
6. No marques una versión como completada si sus criterios todavía no se cumplen.
7. Si el cambio modifica materialmente la estrategia, documenta el nuevo strategy_version.
8. Conserva el historial conceptual de hitos; no borres etapas anteriores.
9. Incluye la actualización de ROADMAP.md dentro del mismo commit.
10. En el resumen final indica explícitamente qué se modificó en ROADMAP.md.

ROADMAP.md es la fuente de verdad del estado, hitos, versiones y backlog del proyecto.
```

## 17. Próximo paso

**🔥 V1.2 --- Forward Performance**

Transformar `signal_evaluations` en estadísticas agregadas y confiables.

Al completar y validar esta etapa:

``` text
v0.9
  ↓
v1.0.0 — Detection & Evidence
```

Después comienza V2 --- Strategy Calibration.

------------------------------------------------------------------------

**Última actualización conceptual:** 2026-08-25\
**Estado:** `v0.9 — Pre-V1 / Evidence Build`\
**Próximo release planeado:** `v1.0.0 — Detection & Evidence`
