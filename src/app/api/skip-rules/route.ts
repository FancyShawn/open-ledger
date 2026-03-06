import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuid } from 'uuid'
import { getSkipRules, saveSkipRules } from '@/lib/storage/json-store'
import type { SkipRule } from '@/types'

export async function GET() {
  const rules = await getSkipRules()
  return NextResponse.json(rules)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const incoming: Partial<SkipRule>[] = Array.isArray(body) ? body : [body]
    const rules = await getSkipRules()

    const created: SkipRule[] = []
    for (const item of incoming) {
      if (!item.reason || !item.match) {
        continue
      }
      const rule: SkipRule = {
        id: item.id || uuid(),
        name: item.name || '未命名跳过规则',
        priority: item.priority ?? 200,
        enabled: item.enabled ?? true,
        source: item.source || 'user',
        member: item.member,
        match: item.match,
        reason: item.reason,
      }
      rules.push(rule)
      created.push(rule)
    }

    await saveSkipRules(rules)
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const rules = await getSkipRules()
    const idx = rules.findIndex(r => r.id === body.id)

    if (idx === -1) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 })
    }

    rules[idx] = { ...rules[idx], ...body }
    await saveSkipRules(rules)

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

    const rules = await getSkipRules()
    const filtered = rules.filter(r => r.id !== id)

    if (filtered.length === rules.length) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 })
    }

    await saveSkipRules(filtered)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
