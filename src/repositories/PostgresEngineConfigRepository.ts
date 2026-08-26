import type { Queryable } from '../db/postgres';
import type { EngineConfigEntry, EngineConfigValueType } from '../models/EngineConfig';
import type { EngineConfigRepository } from '../ports/EngineConfigRepository';

interface EngineConfigRow {
  key: string;
  value: string;
  value_type: EngineConfigValueType;
  category: string;
  description: string;
  is_active: boolean;
}

export class PostgresEngineConfigRepository implements EngineConfigRepository {
  public constructor(private readonly database: Queryable) {}

  public async findActive(): Promise<EngineConfigEntry[]> {
    const result = await this.database.query<EngineConfigRow>(
      `SELECT key, value, value_type, category, description, is_active
       FROM engine_config
       WHERE is_active = true
       ORDER BY category, key`,
    );

    return result.rows.map((row) => ({
      key: row.key,
      value: row.value,
      valueType: row.value_type,
      category: row.category,
      description: row.description,
      isActive: row.is_active,
    }));
  }
}
