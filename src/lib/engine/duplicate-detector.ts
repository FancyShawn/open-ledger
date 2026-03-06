import type { Transaction } from '@/types'

/**
 * Configuration for duplicate detection
 */
export interface DuplicateDetectionConfig {
  // Time window in hours (default: 24 hours)
  timeWindowHours?: number
  // Minimum similarity score (0-1, default: 0.8)
  minSimilarityScore?: number
  // Whether to check amount exactly (default: true)
  exactAmountMatch?: boolean
}

/**
 * Result of duplicate detection for a single transaction
 */
export interface DuplicateMatch {
  transactionId: string
  duplicateId: string
  score: number
  reasons: string[]
}

const DEFAULT_CONFIG: Required<DuplicateDetectionConfig> = {
  timeWindowHours: 24,
  minSimilarityScore: 0.8,
  exactAmountMatch: true,
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses simple character-based similarity
 */
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  if (str1 === str2) return 1

  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.9
  }

  // Simple character overlap ratio
  const set1 = new Set(s1.split(''))
  const set2 = new Set(s2.split(''))
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])

  return intersection.size / union.size
}

/**
 * Check if two transactions are within the time window
 */
function isWithinTimeWindow(
  date1: string,
  date2: string,
  windowHours: number
): boolean {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  const diffMs = Math.abs(d1.getTime() - d2.getTime())
  const diffHours = diffMs / (1000 * 60 * 60)
  return diffHours <= windowHours
}

/**
 * Calculate duplicate score between two transactions
 * Returns a score between 0 and 1, where 1 means highly likely duplicate
 */
function calculateDuplicateScore(tx1: Transaction, tx2: Transaction): {
  score: number
  reasons: string[]
} {
  const reasons: string[] = []
  let score = 0
  let maxScore = 0

  // 1. Amount match (weight: 0.4)
  maxScore += 0.4
  if (tx1.amount === tx2.amount) {
    score += 0.4
    reasons.push('金额完全相同')
  }

  // 2. Date proximity (weight: 0.2)
  maxScore += 0.2
  const d1 = new Date(tx1.date)
  const d2 = new Date(tx2.date)
  const diffMs = Math.abs(d1.getTime() - d2.getTime())
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours === 0) {
    score += 0.2
    reasons.push('时间完全相同')
  } else if (diffHours < 1) {
    score += 0.15
    reasons.push('时间相差不到1小时')
  } else if (diffHours < 24) {
    score += 0.1
    reasons.push('同一天内')
  }

  // 3. Counterparty similarity (weight: 0.25)
  maxScore += 0.25
  const counterpartySim = stringSimilarity(tx1.counterparty, tx2.counterparty)
  if (counterpartySim > 0.8) {
    score += 0.25 * counterpartySim
    reasons.push(`商户名称相似 (${Math.round(counterpartySim * 100)}%)`)
  }

  // 4. Description similarity (weight: 0.15)
  maxScore += 0.15
  const descSim = stringSimilarity(tx1.description, tx2.description)
  if (descSim > 0.5) {
    score += 0.15 * descSim
    reasons.push(`描述相似 (${Math.round(descSim * 100)}%)`)
  }

  // Normalize score
  const normalizedScore = maxScore > 0 ? score / maxScore : 0

  return { score: normalizedScore, reasons }
}

/**
 * Detect duplicate transactions in a list
 * Returns matches where score >= minSimilarityScore
 */
export function detectDuplicates(
  transactions: Transaction[],
  config: DuplicateDetectionConfig = {}
): DuplicateMatch[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const matches: DuplicateMatch[] = []

  // Sort by date for efficient comparison
  const sorted = [...transactions].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  for (let i = 0; i < sorted.length; i++) {
    const tx1 = sorted[i]

    // Skip if already marked as duplicate
    if (tx1.duplicateOf || tx1.skipReason === 'duplicate') continue

    // Only compare with transactions within time window
    for (let j = i + 1; j < sorted.length; j++) {
      const tx2 = sorted[j]

      // Skip if already marked as duplicate
      if (tx2.duplicateOf || tx2.skipReason === 'duplicate') continue

      // Check time window
      if (!isWithinTimeWindow(tx1.date, tx2.date, cfg.timeWindowHours)) {
        break // No need to check further
      }

      // Skip if different direction
      if (tx1.direction !== tx2.direction) continue

      // Calculate similarity
      const { score, reasons } = calculateDuplicateScore(tx1, tx2)

      if (score >= cfg.minSimilarityScore) {
        matches.push({
          transactionId: tx1.id,
          duplicateId: tx2.id,
          score,
          reasons,
        })
      }
    }
  }

  return matches
}

/**
 * Mark a transaction as duplicate of another
 */
export function markAsDuplicate(
  transactions: Transaction[],
  duplicateId: string,
  originalId: string
): Transaction[] {
  return transactions.map(tx => {
    if (tx.id === duplicateId) {
      return {
        ...tx,
        duplicateOf: originalId,
        skipReason: 'duplicate',
      }
    }
    return tx
  })
}

/**
 * Unmark a transaction as duplicate
 */
export function unmarkDuplicate(
  transactions: Transaction[],
  transactionId: string
): Transaction[] {
  return transactions.map(tx => {
    if (tx.id === transactionId) {
      const { duplicateOf, skipReason, ...rest } = tx
      return {
        ...rest,
        skipReason: skipReason === 'duplicate' ? undefined : skipReason,
      } as Transaction
    }
    return tx
  })
}

/**
 * Get all transactions that are marked as duplicates of a given transaction
 */
export function getDuplicatesOf(
  transactions: Transaction[],
  originalId: string
): Transaction[] {
  return transactions.filter(tx => tx.duplicateOf === originalId)
}

/**
 * Auto-resolve duplicates by keeping the transaction from the preferred source
 * Priority: cmb > alipay > wechat (bank records are usually more accurate)
 */
export function autoResolveDuplicates(
  transactions: Transaction[],
  matches: DuplicateMatch[]
): Transaction[] {
  const sourcePriority: Record<string, number> = {
    cmb: 3,
    alipay: 2,
    wechat: 1,
  }

  let result = [...transactions]

  for (const match of matches) {
    const tx1 = result.find(t => t.id === match.transactionId)
    const tx2 = result.find(t => t.id === match.duplicateId)

    if (!tx1 || !tx2) continue

    const priority1 = sourcePriority[tx1.source] || 0
    const priority2 = sourcePriority[tx2.source] || 0

    // Keep the one with higher priority, mark the other as duplicate
    if (priority1 > priority2) {
      result = markAsDuplicate(result, tx2.id, tx1.id)
    } else if (priority2 > priority1) {
      result = markAsDuplicate(result, tx1.id, tx2.id)
    }
    // If same priority, keep the first one (by date)
    else {
      const date1 = new Date(tx1.date).getTime()
      const date2 = new Date(tx2.date).getTime()
      if (date1 <= date2) {
        result = markAsDuplicate(result, tx2.id, tx1.id)
      } else {
        result = markAsDuplicate(result, tx1.id, tx2.id)
      }
    }
  }

  return result
}

