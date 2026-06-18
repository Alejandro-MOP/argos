# Backtesting

Esta carpeta prepara la arquitectura para simulación histórica futura.

La intención es reutilizar el mismo pipeline de análisis:

```text
Historical MarketData
  -> Analyzers
  -> Opportunity
  -> Ranking
  -> Filter
  -> Risk
  -> TradeSimulation
  -> BacktestResult
```

`BacktestEngine` todavía no implementa la lógica completa. El siguiente paso natural es agregar:

- Un proveedor histórico que implemente `MarketDataProvider`.
- Un simulador de entradas y salidas basado en `Signal`.
- Métricas como drawdown, expectancy, Sharpe ratio y profit factor.
