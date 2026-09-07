# ARGOS Market Universe

Este documento describe el universo operativo de mercado que ARGOS usa para escanear oportunidades.

## Principio de diseño

ARGOS no intenta analizar todo el mercado. Trabaja con un universo curado y segmentado para que el motor pueda comparar oportunidades entre activos relevantes sin disparar llamadas innecesarias al proveedor de datos.

El catálogo vive en PostgreSQL como fuente única de verdad funcional:

- `market_signal_engine.market_symbols`: símbolo lógico, símbolo del proveedor, asset type y metadata descriptiva.
- `market_signal_engine.symbol_timeframes`: temporalidades activas por símbolo.

Si PostgreSQL no está disponible o el universo activo está vacío, ARGOS falla explícitamente. Ya no existe fallback runtime a variables de entorno ni a `WatchlistService`.

## Símbolo lógico vs símbolo del proveedor

Cada activo tiene dos identificadores:

- `symbol`: ticker lógico usado dentro de ARGOS.
- `provider_symbol`: ticker enviado al proveedor de datos.

Hoy Yahoo Finance es el proveedor principal y normalmente ambos valores son iguales. Aun así, el desacoplamiento evita amarrar reglas de negocio a Yahoo.

Ejemplo:

```text
symbol=BTC-USD
provider_symbol=BTC-USD
```

## Segmentación actual

V1.6-A expande el universo desde 61 símbolos a un objetivo operativo de 90-110 símbolos activos. La expansión agrega cobertura en:

- Broad Market ETFs: `SPY`, `QQQ`, `DIA`, `IWM`.
- Sector ETFs: `XLK`, `XLF`, `XLE`, `XLV`, `XLY`, `XLP`, `XLI`, `XLU`, `XLC`, `XLRE`.
- Semiconductors: `SMH`, `SOXX`, `TSM`.
- Mega cap / growth: `AAPL`, `ADBE`.
- Financial Services: `WFC`, `V`, `MA`.
- Energy: `SLB`.
- Industrials: `HON`, `UPS`.
- Consumer Cyclical: `HD`, `BKNG`.
- Healthcare: `UNH`.
- Communication Services: `CMCSA`, `T`, `VZ`.
- Utilities: `NEE`, `DUK`, `SO`.
- Real Estate / REITs: `AMT`, `PLD`, `O`.
- Rates/Bonds: `TLT`, `IEF`, `SHY`.
- Metals: `SLV`, `GDX`; además `GLD` conserva el símbolo existente y recibe clasificación `Metals` si estaba sin sector.

Se conserva el universo previo, incluyendo crypto y acciones ya monitoreadas.

## Timeframes

Para cada símbolo nuevo se activan las temporalidades soportadas por el schema actual:

```text
1m
5m
15m
1d
1w
```

La combinación real escaneada depende de la configuración activa, overrides HTTP/Telegram y reglas de sesión.

## Market hours

ARGOS evita llamar Yahoo cuando una combinación no tiene sentido operativo:

- `STOCK`/`ETF` con sesión `US_REGULAR` e intradía se omiten fuera de mercado como `market-closed`.
- `STOCK`/`ETF` en `1d` y `1w` pueden analizarse fuera de sesión usando la última vela disponible.
- `CRYPTO` con sesión `TWENTY_FOUR_SEVEN` puede evaluarse siempre.

## Validación de provider symbols

Antes de insertar nuevos símbolos, V1.6-A validó los `provider_symbol` contra el cliente real de Yahoo Finance. Los símbolos inválidos no deben insertarse en el universo.

La metadata se mantiene conservadora: si un dato no es confiable, debe quedar `NULL` en lugar de inventarse.

## Qué no cambia en V1.6-A

Esta etapa no cambia:

- scoring;
- analyzers;
- Evidence;
- Strategy Profiles;
- Telegram Control;
- Full Market Scan;
- RiskService;
- Transaction Costs;
- persistencia histórica.

La mejora es de cobertura y segmentación del universo, no de metodología de decisión.

## Consultas útiles

Ver universo activo:

```sql
SELECT symbol, provider_symbol, asset_type, sector, industry, market, exchange, session_type
FROM market_signal_engine.market_symbols
WHERE is_active = true
ORDER BY asset_type, sector, symbol;
```

Ver distribución por asset type:

```sql
SELECT asset_type, count(*)
FROM market_signal_engine.market_symbols
WHERE is_active = true
GROUP BY asset_type
ORDER BY count(*) DESC, asset_type;
```

Ver distribución por sector:

```sql
SELECT coalesce(sector, '<NULL>') AS sector, count(*)
FROM market_signal_engine.market_symbols
WHERE is_active = true
GROUP BY coalesce(sector, '<NULL>')
ORDER BY count(*) DESC, sector;
```

Ver combinaciones activas símbolo/timeframe:

```sql
SELECT symbol.symbol, timeframe.timeframe
FROM market_signal_engine.market_symbols symbol
JOIN market_signal_engine.symbol_timeframes timeframe
  ON timeframe.symbol_id = symbol.id
WHERE symbol.is_active = true
  AND timeframe.is_active = true
ORDER BY symbol.symbol, timeframe.timeframe;
```
