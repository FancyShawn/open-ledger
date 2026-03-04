// ========== Core Types ==========

export type TransactionSource = 'alipay' | 'wechat' | 'cmb'
export type TransactionDirection = 'income' | 'expense'
export type AccountType = 'Assets' | 'Liabilities' | 'Expenses' | 'Income' | 'Equity'
export type RuleCreator = 'user' | 'ai' | 'system'

// ========== Member ==========

export interface Member {
  id: string           // e.g. "shawn"
  name: string         // e.g. "Shawn"
}

// ========== Transaction ==========

export interface Transaction {
  id: string
  source: TransactionSource
  date: string // YYYY-MM-DD HH:mm:ss

  // Transaction info
  direction: TransactionDirection
  amount: number // positive
  counterparty: string
  description: string
  paymentMethod: string
  status: string

  // Platform original category (e.g. WeChat "交易类型", Alipay "交易分类")
  platformCategory?: string

  // Identifiers
  orderId?: string
  refundFor?: string             // Original orderId for refund transactions

  // Raw data from original bill file
  rawData?: Record<string, string>

  // Skip reason - if set, transaction should not be included in final export
  skipReason?: string
  manualOverride?: boolean       // User manually assigned accounts, rule engine won't override

  // Family / period
  memberId?: string
  period?: string // YYYY-MM

  // Rule engine output (credit/debit replaces old source/target)
  creditAccount?: string         // Credit side account (expanded with member name)
  debitAccount?: string          // Debit side account
  matchedCreditRuleId?: string
  matchedDebitRuleId?: string
  warnings?: string[]            // Config errors, type mismatches, etc.
}

// ========== Account ==========

export interface Account {
  id: string
  type: AccountType
  name: string // Display name (Chinese)
  path: string // Beancount path, e.g. "Assets:Alipay"
  currency: string
}

// ========== Condition System ==========

export type ConditionField =
  | 'counterparty'
  | 'description'
  | 'paymentMethod'
  | 'platformCategory'
  | 'amount'
  | 'status'

export type ConditionOperator =
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'regex'
  | 'gt' | 'gte' | 'lt' | 'lte'

export interface MatchCondition {
  field: ConditionField
  operator: ConditionOperator
  value: string
}

export interface ConditionGroup {
  logic: 'ALL' | 'ANY'
  conditions: MatchCondition[]
}

// ========== AccountRule (Unified Rule) ==========

export type RuleSide = 'credit' | 'debit'

export interface AccountRule {
  id: string
  name: string
  priority: number           // Higher = matched first
  enabled: boolean
  source: RuleCreator

  // Which slot this rule belongs to
  appliesTo: {
    transactionType: TransactionDirection | TransactionDirection[]
    side: RuleSide
  }

  // Member scope
  member?: string            // If unset, applies to all members

  // Match conditions
  match: ConditionGroup

  // Account
  account: string            // Account path template, e.g. "Assets:{member}:CMB:Savings:1526"
  accountDisplayName: string // Display name, e.g. "招商储蓄卡 1526"
}

// ========== Rule Slot IDs ==========

export type RuleSlotId =
  | 'expense.credit'
  | 'expense.debit'
  | 'income.credit'
  | 'income.debit'

// ========== AI ==========

export interface AIConfig {
  enabled: boolean
  provider: string
  base_url: string
  api_key: string
  model: string
  temperature: number
}

export interface AIRuleSuggestion {
  name: string
  appliesTo: {
    transactionType: TransactionDirection | TransactionDirection[]
    side: RuleSide
  }
  match: ConditionGroup
  account: string
  accountDisplayName: string
}

export interface AIGenerateResult {
  rules: AIRuleSuggestion[]
  suggestedAccounts?: Omit<Account, 'id'>[]
}

// ========== AI Classification ==========

export interface AIClassification {
  transactionId: string
  creditAccount?: string
  debitAccount?: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface AIClassifyResult {
  classifications: AIClassification[]
  suggestedAccounts?: Omit<Account, 'id'>[]
}

// ========== Storage ==========

export interface AppData {
  accounts: Account[]
  rules: AccountRule[]
  members: Member[]
}

// ========== Valid Account Type Combinations ==========

export const VALID_ACCOUNT_TYPES: Record<TransactionDirection, { credit: AccountType[]; debit: AccountType[] }> = {
  expense: {
    credit: ['Assets', 'Liabilities'],
    debit: ['Expenses'],
  },
  income: {
    credit: ['Income'],
    debit: ['Assets'],
  },
}

// ========== Slot Labels for UI ==========

export const SLOT_LABELS: Record<TransactionDirection, { credit: string; debit: string; label: string }> = {
  expense: { credit: '支付账户', debit: '消费分类', label: '支出' },
  income: { credit: '收入来源', debit: '到账账户', label: '收入' },
}
