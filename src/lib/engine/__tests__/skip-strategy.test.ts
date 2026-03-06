import { applySkipStrategies, SKIP_REASONS } from '../skip-strategy'
import type { Transaction } from '@/types'

describe('Skip Strategy - Refund Pairing', () => {
  it('should handle NZERO bad case: refundFor points to merchant order ID', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        source: 'wechat',
        date: '2024-12-04 10:00:00',
        direction: 'expense',
        amount: 100.00,
        counterparty: 'NZERO',
        description: '购买商品',
        paymentMethod: '招商银行',
        status: '支付成功',
        orderId: 'A001',
        rawData: {
          '商户单号': 'M001',
        },
      },
      {
        id: 'tx-2',
        source: 'wechat',
        date: '2024-12-04 11:00:00',
        direction: 'income',
        amount: 100.00,
        counterparty: 'NZERO',
        description: '退款',
        paymentMethod: '招商银行',
        status: '已全额退款',
        orderId: 'A002',
        refundFor: 'M001', // Points to merchant order ID, not orderId
        skipReason: SKIP_REASONS.REFUNDED,
        rawData: {
          '商户单号': 'M001',
        },
      },
    ]

    const result = applySkipStrategies(transactions, { autoPairRefunds: true })

    // Both transactions should be marked as skipped
    expect(result[0].skipReason).toBe(SKIP_REASONS.REFUND_PAIRED)
    expect(result[1].skipReason).toBe(SKIP_REASONS.REFUNDED) // Keep parser's skip reason
  })

  it('should handle partial refund - keep both transactions', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        source: 'wechat',
        date: '2024-12-04 10:00:00',
        direction: 'expense',
        amount: 100.00,
        counterparty: 'Shop',
        description: '购买商品',
        paymentMethod: '招商银行',
        status: '支付成功',
        orderId: 'A001',
        rawData: {
          '商户单号': 'M001',
        },
      },
      {
        id: 'tx-2',
        source: 'wechat',
        date: '2024-12-04 11:00:00',
        direction: 'income',
        amount: 50.00, // Partial refund
        counterparty: 'Shop',
        description: '部分退款',
        paymentMethod: '招商银行',
        status: '已退款',
        orderId: 'A002',
        refundFor: 'M001',
        rawData: {
          '商户单号': 'M001',
        },
      },
    ]

    const result = applySkipStrategies(transactions, { autoPairRefunds: true })

    // Both transactions should NOT be skipped (partial refund)
    expect(result[0].skipReason).toBeUndefined()
    expect(result[1].skipReason).toBeUndefined()
  })

  it('should match by orderId when refundFor points to orderId', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        source: 'alipay',
        date: '2024-12-04 10:00:00',
        direction: 'expense',
        amount: 100.00,
        counterparty: 'Shop',
        description: '购买商品',
        paymentMethod: '支付宝',
        status: '交易成功',
        orderId: 'A001',
      },
      {
        id: 'tx-2',
        source: 'alipay',
        date: '2024-12-04 11:00:00',
        direction: 'income',
        amount: 100.00,
        counterparty: 'Shop',
        description: '退款',
        paymentMethod: '支付宝',
        status: '退款成功',
        orderId: 'A002',
        refundFor: 'A001', // Points to orderId
        skipReason: SKIP_REASONS.REFUNDED,
      },
    ]

    const result = applySkipStrategies(transactions, { autoPairRefunds: true })

    // Both should be skipped
    expect(result[0].skipReason).toBe(SKIP_REASONS.REFUND_PAIRED)
    expect(result[1].skipReason).toBe(SKIP_REASONS.REFUNDED)
  })

  it('should not pair if original transaction not found', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-2',
        source: 'wechat',
        date: '2024-12-04 11:00:00',
        direction: 'income',
        amount: 100.00,
        counterparty: 'Shop',
        description: '退款',
        paymentMethod: '招商银行',
        status: '已退款',
        orderId: 'A002',
        refundFor: 'M001', // Original transaction not in the list
        skipReason: SKIP_REASONS.REFUNDED,
      },
    ]

    const result = applySkipStrategies(transactions, { autoPairRefunds: true })

    // Only the refund keeps its parser skip reason
    expect(result[0].skipReason).toBe(SKIP_REASONS.REFUNDED)
  })

  it('should handle multiple refunds for the same original transaction', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        source: 'wechat',
        date: '2024-12-04 10:00:00',
        direction: 'expense',
        amount: 100.00,
        counterparty: 'Shop',
        description: '购买商品',
        paymentMethod: '招商银行',
        status: '支付成功',
        orderId: 'A001',
        rawData: { '商户单号': 'M001' },
      },
      {
        id: 'tx-2',
        source: 'wechat',
        date: '2024-12-04 11:00:00',
        direction: 'income',
        amount: 50.00,
        counterparty: 'Shop',
        description: '部分退款1',
        paymentMethod: '招商银行',
        status: '已退款',
        orderId: 'A002',
        refundFor: 'M001',
      },
      {
        id: 'tx-3',
        source: 'wechat',
        date: '2024-12-04 12:00:00',
        direction: 'income',
        amount: 50.00,
        counterparty: 'Shop',
        description: '部分退款2',
        paymentMethod: '招商银行',
        status: '已退款',
        orderId: 'A003',
        refundFor: 'M001',
      },
    ]

    const result = applySkipStrategies(transactions, { autoPairRefunds: true })

    // All should be kept (multiple partial refunds)
    expect(result[0].skipReason).toBeUndefined()
    expect(result[1].skipReason).toBeUndefined()
    expect(result[2].skipReason).toBeUndefined()
  })
})
