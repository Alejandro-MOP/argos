INSERT INTO market_signal_engine.engine_config (key, value, value_type, category, description, is_active)
VALUES
  (
    'MARKET_DATA_MAX_CONCURRENCY',
    '5',
    'number',
    'market-data-throughput',
    'Cantidad máxima de requests simultáneos permitidos contra el proveedor de datos durante un market scan.',
    true
  ),
  (
    'MARKET_DATA_BATCH_DELAY_MS',
    '250',
    'number',
    'market-data-throughput',
    'Pausa opcional que aplica cada worker antes de tomar un nuevo job del pool; 0 desactiva el delay.',
    true
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

UPDATE market_signal_engine.engine_config
SET value = '3',
    value_type = 'number',
    category = 'market-data-throughput',
    description = 'Número máximo de reintentos para errores temporales del proveedor de datos usando exponential backoff.',
    is_active = true,
    updated_at = now()
WHERE key = 'MARKET_DATA_MAX_RETRIES';

UPDATE market_signal_engine.engine_config
SET value = '1000',
    value_type = 'number',
    category = 'market-data-throughput',
    description = 'Delay base en milisegundos para exponential backoff al reintentar errores temporales del proveedor de datos.',
    is_active = true,
    updated_at = now()
WHERE key = 'MARKET_DATA_RETRY_BASE_DELAY_MS';

UPDATE market_signal_engine.engine_config
SET category = 'deprecated',
    description = 'DEPRECATED desde V1.1.1: reemplazado por MARKET_DATA_MAX_CONCURRENCY. Se conserva por compatibilidad ENV/fallback, pero no debe estar activo junto con el pool.',
    is_active = false,
    updated_at = now()
WHERE key = 'MARKET_DATA_SEQUENTIAL';

UPDATE market_signal_engine.engine_config
SET category = 'deprecated',
    description = 'DEPRECATED desde V1.1.1: reemplazado por MARKET_DATA_BATCH_DELAY_MS. Se conserva por compatibilidad ENV/fallback, pero no debe estar activo junto con el pool.',
    is_active = false,
    updated_at = now()
WHERE key = 'MARKET_DATA_REQUEST_DELAY_MS';
