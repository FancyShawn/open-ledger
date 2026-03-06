import pdf from 'pdf-parse'
import { v4 as uuid } from 'uuid'
import type { Transaction } from '@/types'
import type { BillParser, ParseResult } from './types'

/**
 * China Merchants Bank (CMB) savings account PDF parser.
 * Format: date CNY amount balance transactionType counterParty
 * Counterparty can span multiple lines.
 */
export const cmbParser: BillParser = {
  source: 'cmb',

  canParse(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return (lower.includes('招商') || lower.includes('cmb')) && lower.endsWith('.pdf')
  },

  async parse(buffer: Buffer): Promise<ParseResult> {
    const data = await pdf(buffer)
    const text = data.text

    // Extract date range from header
    const rangeMatch = text.match(/(\d{4}-\d{2}-\d{2})\s*--\s*(\d{4}-\d{2}-\d{2})/)
    const dateStart = rangeMatch?.[1]
    const dateEnd = rangeMatch?.[2]

    // Extract account number (last 4 digits) from PDF
    const accountMatch = text.match(/[*]{4}(\d{4})|尾号(\d{4})|账号[^\d]*(\d{4})\s|(\d{4})\s*储蓄/)
    const cardSuffix = accountMatch?.[1] || accountMatch?.[2] || accountMatch?.[3] || accountMatch?.[4] || ''
    const paymentMethod = cardSuffix 
      ? `招商银行储蓄卡(${cardSuffix})`
      : '招商银行储蓄卡'

    const transactions: Transaction[] = []

    // Match transaction rows:
    // date + CNY + amount + balance + type + counterparty
    const txRegex = /(\d{4}-\d{2}-\d{2})CNY([-]?[\d,]+\.\d{2})([\d,]+\.\d{2})(.+?)(?=\d{4}-\d{2}-\d{2}CNY|记账日期|$)/gs

    let match: RegExpExecArray | null
    while ((match = txRegex.exec(text)) !== null) {
      const dateStr = match[1]
      const amountStr = match[2].replace(/,/g, '')
      const amount = parseFloat(amountStr)
      // match[3] is the balance, skip it
      const rest = match[4].trim()

      // Split rest into transaction type and counterparty
      const typePatterns = [
        '银联快捷支付',
        '银联无卡自助消费（特约）',
        '银联无卡自助消费',
        '一网通支付',
        '快捷支付',
        '快捷退款',
        '网上转账',
        '代付业务',
        '工资',
        '结息',
        '定时转入',
      ]

      let txType = ''
      let counterparty = rest

      for (const tp of typePatterns) {
        const idx = rest.indexOf(tp)
        if (idx !== -1) {
          txType = tp
          counterparty = rest.slice(idx + tp.length).trim()
          break
        }
      }

      // Clean counterparty
      counterparty = counterparty
        .replace(/\n/g, ' ')
        .replace(/\d+\/\d+/g, '')
        .replace(/DateCurrency[\s\S]*?Counter Party/g, '')
        .replace(/记账日期[\s\S]*?对手信息/g, '')
        .trim()
      counterparty = counterparty.replace(/\s+\d{10,}$/, '').trim()

      const isIncome = amount > 0

      // Determine direction
      let direction: Transaction['direction'] = isIncome ? 'income' : 'expense'

      // Determine platformCategory from transaction type
      const platformCategory = txType || undefined

      // No automatic skip reasons - all skips must be user-defined via rules
      let skipReason: string | undefined

      // Build raw data
      const rawData: Record<string, string> = {
        '记账日期': dateStr,
        '币种': 'CNY',
        '交易金额': amountStr,
        '账户余额': match[3].replace(/,/g, ''),
        '交易类型': txType,
        '对手信息': counterparty,
        '原始文本': match[0].trim(),
      }

      const tx: Transaction = {
        id: uuid(),
        source: 'cmb',
        date: dateStr,
        counterparty: counterparty || txType,
        description: `${txType} ${counterparty}`.trim(),
        direction,
        amount: isNaN(amount) ? 0 : Math.abs(amount),
        paymentMethod,
        status: '已入账',
        platformCategory,
        rawData,
        skipReason,
      }

      transactions.push(tx)
    }

    return {
      transactions,
      source: 'cmb',
      meta: {
        dateRange: dateStart && dateEnd ? { start: dateStart, end: dateEnd } : undefined,
        totalCount: transactions.length,
      },
    }
  },
}
