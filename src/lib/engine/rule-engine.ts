import type {
  Transaction,
  TransactionDirection,
  AccountRule,
  ConditionGroup,
  MatchCondition,
  Member,
  RuleSide,
  VALID_ACCOUNT_TYPES,
} from '@/types'

// Re-import the constant
import { VALID_ACCOUNT_TYPES as ValidTypes } from '@/types'

// ========== Condition Evaluation ==========

/**
 * Evaluate a single match condition against a transaction field value.
 */
function evaluateCondition(condition: MatchCondition, tx: Transaction): boolean {
  const { field, operator, value } = condition

  // Get the field value from the transaction
  let fieldValue: string | number | undefined
  switch (field) {
    case 'counterparty':
      fieldValue = tx.counterparty
      break
    case 'description':
      fieldValue = tx.description
      break
    case 'paymentMethod':
      fieldValue = tx.paymentMethod
      break
    case 'platformCategory':
      fieldValue = tx.platformCategory
      break
    case 'amount':
      fieldValue = tx.amount
      break
    case 'status':
      fieldValue = tx.status
      break
    default:
      return false
  }

  // Amount-based operators
  if (field === 'amount') {
    const numValue = typeof fieldValue === 'number' ? fieldValue : parseFloat(String(fieldValue || '0'))
    const compareValue = parseFloat(value)
    if (isNaN(numValue) || isNaN(compareValue)) return false

    switch (operator) {
      case 'gt': return numValue > compareValue
      case 'gte': return numValue >= compareValue
      case 'lt': return numValue < compareValue
      case 'lte': return numValue <= compareValue
      case 'equals': return numValue === compareValue
      default: return false
    }
  }

  // String-based operators
  const strValue = String(fieldValue || '')
  if (!strValue && operator !== 'equals') return false

  const lowerValue = strValue.toLowerCase()
  const lowerPattern = value.toLowerCase()

  switch (operator) {
    case 'contains':
      return lowerValue.includes(lowerPattern)
    case 'notContains':
      return !lowerValue.includes(lowerPattern)
    case 'equals':
      return lowerValue === lowerPattern
    case 'startsWith':
      return lowerValue.startsWith(lowerPattern)
    case 'endsWith':
      return lowerValue.endsWith(lowerPattern)
    case 'regex':
      try {
        return new RegExp(value, 'i').test(strValue)
      } catch {
        return false
      }
    default:
      return false
  }
}

/**
 * Evaluate a condition group (ALL = AND, ANY = OR).
 */
function evaluateGroup(tx: Transaction, group: ConditionGroup): boolean {
  if (!group.conditions || group.conditions.length === 0) return false

  if (group.logic === 'ALL') {
    return group.conditions.every(c => evaluateCondition(c, tx))
  } else {
    return group.conditions.some(c => evaluateCondition(c, tx))
  }
}

// ========== Slot Resolution ==========

function getSlotsForDirection(direction: TransactionDirection): { credit: TransactionDirection; debit: TransactionDirection } {
  return { credit: direction, debit: direction }
}

/**
 * Check if a rule's appliesTo matches a given transaction type and side.
 */
function ruleMatchesSlot(rule: AccountRule, txType: TransactionDirection, side: RuleSide): boolean {
  const { transactionType } = rule.appliesTo
  if (rule.appliesTo.side !== side) return false

  const types = Array.isArray(transactionType) ? transactionType : [transactionType]
  return types.includes(txType)
}

// ========== Member Handling ==========

/**
 * Resolve member name from memberId.
 */
function resolveMemberName(memberId: string | undefined, members: Member[]): string {
  if (!memberId) return ''
  const member = members.find(m => m.id === memberId)
  return member?.name || (memberId.charAt(0).toUpperCase() + memberId.slice(1))
}

/**
 * Expand {member} placeholder in account path.
 */
function expandMemberPlaceholder(accountPath: string, memberName: string): string {
  if (!memberName) return accountPath.replace(/\{member\}/g, '')
  return accountPath.replace(/\{member\}/g, memberName)
}

// ========== Account Type Validation ==========

/**
 * Get the top-level account type from an account path.
 */
function getAccountType(path: string): string {
  return path.split(':')[0]
}

/**
 * Validate that credit and debit accounts are legal for the given transaction direction.
 */
function validateAccountTypes(
  direction: TransactionDirection,
  creditPath: string | undefined,
  debitPath: string | undefined
): string[] {
  const warnings: string[] = []
  const validTypes = ValidTypes[direction]
  if (!validTypes) return warnings

  if (creditPath) {
    const creditType = getAccountType(creditPath)
    if (!validTypes.credit.includes(creditType as never)) {
      warnings.push(`贷方账户类型 ${creditType} 不符合 ${direction} 交易要求 (应为 ${validTypes.credit.join('/')})`)
    }
  }

  if (debitPath) {
    const debitType = getAccountType(debitPath)
    if (!validTypes.debit.includes(debitType as never)) {
      warnings.push(`借方账户类型 ${debitType} 不符合 ${direction} 交易要求 (应为 ${validTypes.debit.join('/')})`)
    }
  }

  return warnings
}

// ========== Main Engine ==========

/**
 * Match a single slot (credit or debit) for a transaction.
 * Returns the matched account path and rule ID.
 */
function matchSlot(
  tx: Transaction,
  rules: AccountRule[],
  txType: TransactionDirection,
  side: RuleSide,
  members: Member[]
): { account?: string; ruleId?: string } {
  // Step 3: Filter rules for this slot
  const slotRules = rules.filter(r => {
    if (!r.enabled) return false
    if (!ruleMatchesSlot(r, txType, side)) return false
    // Member filter: rule.member must be undefined or match tx.memberId
    if (r.member && r.member !== tx.memberId) return false
    return true
  })

  // Step 4: Sort by priority descending
  slotRules.sort((a, b) => b.priority - a.priority)

  // Step 5: Match rules
  for (const rule of slotRules) {
    if (evaluateGroup(tx, rule.match)) {
      return { account: rule.account, ruleId: rule.id }
    }
  }

  return {}
}

/**
 * Apply all rules to a list of transactions.
 * Implements the 8-step matching flow from the PRD.
 */
export function applyRules(
  transactions: Transaction[],
  rules: AccountRule[],
  members: Member[] = []
): Transaction[] {
  return transactions.map(tx => {
    // Skip manual overrides
    if (tx.manualOverride) return tx

    const result: Transaction = { ...tx, warnings: [] }

    // Step 1: Direction already determined by parser (may be refined by user)

    // Step 2: Determine slots
    const slots = getSlotsForDirection(tx.direction)

    // Steps 3-5: Match credit and debit
    const creditMatch = matchSlot(tx, rules, tx.direction, 'credit', members)
    const debitMatch = matchSlot(tx, rules, tx.direction, 'debit', members)

    // Step 7: Expand member placeholder
    const memberName = resolveMemberName(tx.memberId, members)

    if (creditMatch.account) {
      result.creditAccount = expandMemberPlaceholder(creditMatch.account, memberName)
      result.matchedCreditRuleId = creditMatch.ruleId
    } else {
      result.creditAccount = undefined
    }

    if (debitMatch.account) {
      result.debitAccount = expandMemberPlaceholder(debitMatch.account, memberName)
      result.matchedDebitRuleId = debitMatch.ruleId
    } else {
      result.debitAccount = undefined
    }

    // Step 6: Validate account types
    const warnings = validateAccountTypes(
      tx.direction,
      result.creditAccount,
      result.debitAccount
    )
    if (warnings.length > 0) {
      result.warnings = [...(result.warnings || []), ...warnings]
    }

    // Clean up empty warnings
    if (result.warnings && result.warnings.length === 0) {
      result.warnings = undefined
    }

    return result
  })
}

/**
 * Get statistics about mapping coverage.
 */
export function getMappingStats(transactions: Transaction[]) {
  const total = transactions.length
  const unmappedCredit = transactions.filter(
    t => !t.creditAccount
  ).length
  const unmappedDebit = transactions.filter(
    t => !t.debitAccount
  ).length
  const fullyMapped = transactions.filter(
    t => t.creditAccount && t.debitAccount
  ).length

  return { total, unmappedCredit, unmappedDebit, fullyMapped }
}

/**
 * Validate an AccountRule's account path against valid types for its slot.
 */
export function validateRuleAccountType(rule: AccountRule): string | null {
  const types = Array.isArray(rule.appliesTo.transactionType)
    ? rule.appliesTo.transactionType
    : [rule.appliesTo.transactionType]
  const side = rule.appliesTo.side
  const accountType = getAccountType(rule.account) as never

  for (const txType of types) {
    const validTypes = ValidTypes[txType]
    if (!validTypes) continue

    const allowed = validTypes[side]
    if (!allowed.includes(accountType)) {
      return `账户类型 ${getAccountType(rule.account)} 不符合 ${txType}.${side} 槽位要求 (应为 ${allowed.join('/')})`
    }
  }
  return null
}

/**
 * Validate member/account consistency for an AccountRule.
 */
export function validateRuleMemberConsistency(rule: AccountRule): string | null {
  const hasMemberPlaceholder = rule.account.includes('{member}')

  if (rule.member && hasMemberPlaceholder) {
    return '指定成员的规则，账户路径中不应出现 {member}'
  }

  if (!rule.member && !hasMemberPlaceholder) {
    const accountType = getAccountType(rule.account)
    if (accountType === 'Assets' || accountType === 'Liabilities') {
      return '通用规则（所有成员）的 Assets/Liabilities 账户路径必须包含 {member}'
    }
  }

  return null
}
