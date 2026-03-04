import type { Transaction, Account } from '@/types'

/**
 * Generate a complete Beancount file from accounts and transactions.
 * Uses creditAccount/debitAccount from the unified rule engine.
 */
export function generateBeancount(
  accounts: Account[],
  transactions: Transaction[]
): string {
  const lines: string[] = []

  // Header
  lines.push(`;; Open Ledger Export`)
  lines.push(`;; Generated: ${new Date().toISOString().split('T')[0]}`)
  lines.push('')

  // Account declarations
  lines.push(`;; ====== Accounts ======`)

  const typeOrder: Account['type'][] = ['Assets', 'Liabilities', 'Expenses', 'Income', 'Equity']
  const sorted = [...accounts].sort(
    (a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
  )

  // Use earliest transaction date or default
  const earliestDate = transactions.length > 0
    ? transactions.reduce((min, tx) => tx.date < min ? tx.date : min, transactions[0].date)
    : '2025-01-01'
  const openDate = earliestDate.slice(0, 7) + '-01'

  for (const acc of sorted) {
    lines.push(`${openDate} open ${acc.path} ${acc.currency}`)
  }

  // Ensure all used accounts are declared
  const usedPaths = new Set<string>()
  for (const tx of transactions) {
    if (tx.creditAccount) usedPaths.add(tx.creditAccount)
    if (tx.debitAccount) usedPaths.add(tx.debitAccount)
  }
  const declaredPaths = new Set(sorted.map(a => a.path))
  for (const path of usedPaths) {
    if (!declaredPaths.has(path)) {
      lines.push(`${openDate} open ${path} CNY`)
    }
  }

  lines.push('')
  lines.push(`;; ====== Transactions ======`)

  // Sort transactions by date descending
  const sortedTx = [...transactions].sort((a, b) => b.date.localeCompare(a.date))

  for (const tx of sortedTx) {
    if (!tx.creditAccount || !tx.debitAccount) continue
    if (tx.skipReason) continue

    lines.push('')

    const payee = escapeQuote(tx.counterparty || '')
    const narration = escapeQuote(tx.description || '')
    const dateOnly = tx.date.slice(0, 10) // Extract YYYY-MM-DD from datetime
    lines.push(`${dateOnly} * "${payee}" "${narration}"`)

    const amountFormatted = tx.amount.toFixed(2)

    // Beancount: debit account gets positive amount, credit account gets negative
    // debit = money goes to, credit = money comes from
    lines.push(`  ${padAccount(tx.debitAccount)} ${amountFormatted} CNY`)
    lines.push(`  ${padAccount(tx.creditAccount)} -${amountFormatted} CNY`)
  }

  lines.push('')
  return lines.join('\n')
}

function escapeQuote(s: string): string {
  return s.replace(/"/g, '\\"')
}

function padAccount(account: string): string {
  return account.padEnd(40)
}
