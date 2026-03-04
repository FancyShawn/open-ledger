import { NextRequest, NextResponse } from 'next/server'
import { parseFile } from '@/lib/parsers'
import { getRules, getMembers } from '@/lib/storage/json-store'
import { applyRules } from '@/lib/engine/rule-engine'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const memberId = formData.get('memberId') as string | null

    if (!file) {
      return NextResponse.json({ error: '请上传一个文件' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await parseFile(file.name, buffer)

    // Apply unified rules
    const [rules, members] = await Promise.all([
      getRules(),
      getMembers(),
    ])

    // Stamp memberId on transactions before applying rules
    const txsWithMember = result.transactions.map(tx => ({
      ...tx,
      memberId: memberId || undefined,
    }))

    const mapped = applyRules(txsWithMember, rules, members)

    return NextResponse.json({
      transactions: mapped,
      source: result.source,
      meta: result.meta,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '解析失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
