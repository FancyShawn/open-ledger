import * as XLSX from 'xlsx'
import { v4 as uuid } from 'uuid'
import type { Transaction } from '@/types'
import type { BillParser, ParseResult } from './types'

/**
 * WeChat Pay XLSX parser.
 * First ~16 rows are metadata, row 17 is the header.
 */
export const wechatParser: BillParser = {
  source: 'wechat',

  canParse(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return (lower.includes('微信') || lower.includes('wechat')) &&
      (lower.endsWith('.xlsx') || lower.endsWith('.xls'))
  },

  async parse(buffer: Buffer, _fileName: string): Promise<ParseResult> {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false })

    // Extract metadata
    let accountName: string | undefined
    let dateStart: string | undefined
    let dateEnd: string | undefined

    for (const row of allRows.slice(0, 20)) {
      const line = (row as string[]).join('')
      const nickMatch = line.match(/微信昵称[：:]\[(.+?)\]/)
      if (nickMatch) accountName = nickMatch[1]

      const dateMatch = line.match(/起始时间[：:]\[(.+?)\]\s*终止时间[：:]\[(.+?)\]/)
      if (dateMatch) {
        dateStart = dateMatch[1].split(' ')[0]
        dateEnd = dateMatch[2].split(' ')[0]
      }
    }

    // Find header row (contains "交易时间")
    let headerIdx = -1
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i] as string[]
      if (row && row.some(cell => cell && cell.toString().includes('交易时间'))) {
        headerIdx = i
        break
      }
    }

    if (headerIdx === -1) {
      throw new Error('无法找到微信账单表头行')
    }

    const headers = (allRows[headerIdx] as string[]).map(h => (h || '').toString().trim())
    const dataRows = allRows.slice(headerIdx + 1)

    const colIdx = {
      time: headers.indexOf('交易时间'),
      type: headers.indexOf('交易类型'),
      counterparty: headers.indexOf('交易对方'),
      product: headers.indexOf('商品'),
      direction: headers.indexOf('收/支'),
      amount: headers.findIndex(h => h.includes('金额')),
      paymentMethod: headers.indexOf('支付方式'),
      status: headers.indexOf('当前状态'),
      orderId: headers.indexOf('交易单号'),
      merchantOrderId: headers.indexOf('商户单号'),
    }

    const transactions: Transaction[] = []

    for (const row of dataRows) {
      const cells = row as string[]
      if (!cells || cells.length < 5) continue

      const cell = (idx: number) => (idx >= 0 && cells[idx] ? cells[idx].toString().trim() : '')

      const directionStr = cell(colIdx.direction)
      const status = cell(colIdx.status)
      const platformCategory = cell(colIdx.type)

      // Clean amount: remove ¥ prefix
      let amountStr = cell(colIdx.amount)
      amountStr = amountStr.replace(/[¥￥,]/g, '').trim()
      const amount = parseFloat(amountStr)

      const dateStr = cell(colIdx.time)
      const date = dateStr // Keep full datetime: YYYY-MM-DD HH:mm:ss

      // Skip completely empty rows
      if (!date && !cell(colIdx.counterparty)) continue

      // Build raw data from all columns
      const rawData: Record<string, string> = {}
      headers.forEach((header, idx) => {
        if (header && cells[idx]) {
          rawData[header] = cells[idx].toString().trim()
        }
      })

      // Determine direction
      let direction: Transaction['direction'] = 'expense'
      if (directionStr === '收入') {
        direction = 'income'
      }

      // No automatic skip reasons - all skips must be user-defined via rules
      let skipReason: string | undefined

      // Handle partial refunds: extract refund amount from status like "已退款(￥40.13)"
      let finalAmount = isNaN(amount) || amount < 0 ? 0 : amount
      const partialRefundMatch = status.match(/已退款[（(][¥￥]?([\d.]+)[）)]/)
      if (partialRefundMatch) {
        const refundAmount = parseFloat(partialRefundMatch[1])
        if (!isNaN(refundAmount)) {
          rawData['原始金额'] = String(finalAmount)
          rawData['退款金额'] = String(refundAmount)
          finalAmount = finalAmount - refundAmount
        }
      }

      // Detect refund transactions - use merchant order ID to link to original transaction
      let refundFor: string | undefined
      if (platformCategory.includes('退款')) {
        // 商户单号 points to the original transaction, not the refund's own orderId
        refundFor = cell(colIdx.merchantOrderId) || undefined
      }

      const tx: Transaction = {
        id: uuid(),
        source: 'wechat',
        date,
        counterparty: cell(colIdx.counterparty),
        description: cell(colIdx.product),
        direction,
        amount: finalAmount,
        paymentMethod: cell(colIdx.paymentMethod),
        status,
        orderId: cell(colIdx.orderId),
        platformCategory: platformCategory || undefined,
        refundFor,
        rawData,
        skipReason,
      }

      transactions.push(tx)
    }

    return {
      transactions,
      source: 'wechat',
      meta: {
        accountName,
        dateRange: dateStart && dateEnd ? { start: dateStart, end: dateEnd } : undefined,
        totalCount: transactions.length,
      },
    }
  },
}
