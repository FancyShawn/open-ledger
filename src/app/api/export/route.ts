import { NextRequest, NextResponse } from 'next/server'
import { getAccounts } from '@/lib/storage/json-store'
import { generateBeancount } from '@/lib/beancount/generator'
import type { Transaction } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const transactions: Transaction[] = body.transactions

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ error: '没有提供交易数据' }, { status: 400 })
    }

    const accounts = await getAccounts()
    const beancount = generateBeancount(accounts, transactions)

    return new NextResponse(beancount, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="export.beancount"',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '导出失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
