import { NextRequest, NextResponse } from 'next/server'
import { getAccounts } from '@/lib/storage/json-store'
import { classifyTransactions } from '@/lib/ai/classifier'
import type { Transaction } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const transactions: Transaction[] = body.transactions

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ error: '没有提供交易数据' }, { status: 400 })
    }

    // Filter out skipped transactions - no need to classify them
    const activeTransactions = transactions.filter(tx => !tx.skipReason)

    if (activeTransactions.length === 0) {
      return NextResponse.json({ classifications: [] })
    }

    const accounts = await getAccounts()
    const result = await classifyTransactions(accounts, activeTransactions)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 分类失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
