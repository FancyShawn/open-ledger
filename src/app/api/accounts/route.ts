import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { getAccounts, saveAccounts, getRules, saveRules } from '@/lib/storage/json-store'
import type { Account } from '@/types'

export async function GET() {
  const accounts = await getAccounts()
  return NextResponse.json(accounts)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const accounts = await getAccounts()

    const newAccount: Account = {
      id: body.id || uuid(),
      type: body.type,
      name: body.name,
      path: body.path,
      currency: body.currency || 'CNY',
    }

    accounts.push(newAccount)
    await saveAccounts(accounts)

    return NextResponse.json(newAccount, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const accounts = await getAccounts()
    const idx = accounts.findIndex(a => a.id === body.id)

    if (idx === -1) {
      return NextResponse.json({ error: '账户不存在' }, { status: 404 })
    }

    const oldPath = accounts[idx].path
    const newPath = body.path

    // Update account
    accounts[idx] = { ...accounts[idx], ...body }
    await saveAccounts(accounts)

    // If path changed, update all rules referencing this path
    if (oldPath !== newPath) {
      const rules = await getRules()
      let rulesUpdated = 0
      
      for (const rule of rules) {
        if (rule.account === oldPath) {
          rule.account = newPath
          rulesUpdated++
        }
      }
      
      if (rulesUpdated > 0) {
        await saveRules(rules)
      }
    }

    return NextResponse.json(accounts[idx])
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 })
    }

    const accounts = await getAccounts()
    const filtered = accounts.filter(a => a.id !== id)

    if (filtered.length === accounts.length) {
      return NextResponse.json({ error: '账户不存在' }, { status: 404 })
    }

    await saveAccounts(filtered)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
