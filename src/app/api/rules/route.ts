import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { getRules, saveRules } from '@/lib/storage/json-store'
import type { AccountRule } from '@/types'

export async function GET() {
  const rules = await getRules()
  return NextResponse.json(rules)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Support batch creation (array) or single
    const incoming: Partial<AccountRule>[] = Array.isArray(body) ? body : [body]
    const rules = await getRules()

    const created: AccountRule[] = []
    for (const item of incoming) {
      if (!item.account || !item.appliesTo) {
        continue // Skip rules without account or slot definition
      }
      const rule: AccountRule = {
        id: item.id || uuid(),
        name: item.name || '未命名规则',
        priority: item.priority ?? 200,
        enabled: item.enabled ?? true,
        source: item.source || 'user',
        appliesTo: item.appliesTo,
        member: item.member,
        match: item.match || { logic: 'ALL', conditions: [] },
        account: item.account,
        accountDisplayName: item.accountDisplayName || item.account,
      }
      rules.push(rule)
      created.push(rule)
    }

    await saveRules(rules)
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const rules = await getRules()
    const idx = rules.findIndex(r => r.id === body.id)

    if (idx === -1) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 })
    }

    rules[idx] = { ...rules[idx], ...body }
    await saveRules(rules)

    return NextResponse.json(rules[idx])
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

    const rules = await getRules()
    const filtered = rules.filter(r => r.id !== id)

    if (filtered.length === rules.length) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 })
    }

    await saveRules(filtered)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
