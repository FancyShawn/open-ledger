import type { Transaction } from '@/types'

/**
 * Skip strategy configuration
 */
export interface SkipStrategyConfig {
  // Reserved for future use
}

const DEFAULT_CONFIG: Required<SkipStrategyConfig> = {}

/**
 * Apply all skip strategies to transactions
 * Note: All skip reasons must be set by user-defined rules or manual marking
 */
export function applySkipStrategies(
  transactions: Transaction[],
  config: SkipStrategyConfig = {}
): Transaction[] {
  // No automatic skip strategies - all skips must be user-defined
  return transactions
}

/**
 * Get statistics about skipped transactions
 */
export function getSkipStats(transactions: Transaction[]) {
  const total = transactions.length
  const skipped = transactions.filter(t => t.skipReason).length
  const active = total - skipped

  const byReason: Record<string, number> = {}
  for (const tx of transactions) {
    if (tx.skipReason) {
      byReason[tx.skipReason] = (byReason[tx.skipReason] || 0) + 1
    }
  }

  return {
    total,
    active,
    skipped,
    byReason,
  }
}