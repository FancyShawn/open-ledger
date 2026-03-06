import { parse } from 'csv-parse/sync'
import * as iconv from 'iconv-lite'
import { v4 as uuid } from 'uuid'
import type { Transaction } from '@/types'
import type { BillParser, ParseResult } from './types'

/**
 * Alipay CSV parser.
 * File is GBK-encoded. First ~24 lines are metadata, then header + data rows.
 */
export const alipayParser: BillParser = {
  source: 'alipay',

  canParse(fileName: string, buffer: Buffer): boolean {
    if (!fileName.includes('支付宝') && !fileName.toLowerCase().includes('alipay')) {
      return false
    }
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext !== 'csv') return false
    // Quick check: decode first bytes and look for alipay marker
    const head = iconv.decode(buffer.subarray(0, 200), 'gbk')
    return head.includes('支付宝') || head.includes('交易')
  },

  async parse(buffer: Buffer, _fileName: string): Promise<ParseResult> {
    const content = iconv.decode(buffer, 'gbk')
    const lines = content.split(/\r?\n/)

    // Extract metadata from header section
    let accountName: string | undefined
    let dateStart: string | undefined
    let dateEnd: string | undefined

    for (const line of lines.slice(0, 25)) {
      const accMatch = line.match(/支付宝账户[：:](.+)/)
      if (accMatch) accountName = accMatch[1].trim()

      const dateMatch = line.match(/起始时间[：:]\[(.+?)\]\s+终止时间[：:]\[(.+?)\]/)
      if (dateMatch) {
        dateStart = dateMatch[1].split(' ')[0]
        dateEnd = dateMatch[2].split(' ')[0]
      }
    }

    // Find the header line (contains "交易时间")
    let headerIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('交易时间') && lines[i].includes('交易对方')) {
        headerIdx = i
        break
      }
    }

    if (headerIdx === -1) {
      throw new Error('无法找到支付宝 CSV 表头行')
    }

    // Parse CSV from header line onwards
    const csvContent = lines.slice(headerIdx).join('\n')
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[]

    const transactions: Transaction[] = []

    for (const row of records) {
      const directionStr = row['收/支']?.trim()
      const status = row['交易状态']?.trim() || ''
      const platformCategory = (row['交易分类'] || row['交易类型'] || '').trim()

      const amountStr = (row['金额'] || row['金额(元)'] || '0').trim()
      const amount = parseFloat(amountStr)

      const dateStr = (row['交易时间'] || '').trim()
      const date = dateStr // Keep full datetime: YYYY-MM-DD HH:mm:ss

      // Skip completely empty rows
      if (!date && !row['交易对方']?.trim()) continue

      // Build raw data from all columns
      const rawData: Record<string, string> = {}
      for (const [key, value] of Object.entries(row)) {
        if (key && value) {
          rawData[key.trim()] = value.trim()
        }
      }

      // Determine direction
      // "收益发放" (like 余额宝收益) and "银行卡定时转入" are income
      let direction: Transaction['direction'] = 'expense'
      const description = (row['商品说明'] || '').trim()
      if (directionStr === '收入' || description.includes('收益发放') || description.includes('银行卡定时转入')) {
        direction = 'income'
      }

      // No automatic skip reasons - all skips must be user-defined via rules
      let skipReason: string | undefined

      // Handle partial refund amounts
      let finalAmount = isNaN(amount) || amount < 0 ? 0 : amount
      const partialRefundMatch = status.match(/已退款[（(][¥￥]?([\d.]+)[）)]/)
      if (partialRefundMatch && !skipReason) {
        const refundAmount = parseFloat(partialRefundMatch[1])
        if (!isNaN(refundAmount)) {
          rawData['原始金额'] = String(finalAmount)
          rawData['退款金额'] = String(refundAmount)
          finalAmount = finalAmount - refundAmount
        }
      }

      // Detect compound payment methods (contains &)
      const paymentMethodRaw = (row['收/付款方式'] || '').trim()
      const warnings: string[] = []
      if (paymentMethodRaw.includes('&')) {
        warnings.push('复合支付方式，仅使用第一个')
      }

      const tx: Transaction = {
        id: uuid(),
        source: 'alipay',
        date,
        counterparty: (row['交易对方'] || '').trim(),
        description: (row['商品说明'] || '').trim(),
        direction,
        amount: finalAmount,
        paymentMethod: paymentMethodRaw,
        status,
        orderId: (row['交易订单号'] || '').trim(),
        platformCategory: platformCategory || undefined,
        rawData,
        skipReason,
        warnings: warnings.length > 0 ? warnings : undefined,
      }

      transactions.push(tx)
    }

    return {
      transactions,
      source: 'alipay',
      meta: {
        accountName,
        dateRange: dateStart && dateEnd ? { start: dateStart, end: dateEnd } : undefined,
        totalCount: transactions.length,
      },
    }
  },
}
