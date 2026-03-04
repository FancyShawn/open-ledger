import { NextRequest, NextResponse } from 'next/server'
import { getMembers, saveMembers } from '@/lib/storage/json-store'
import type { Member } from '@/types'

export async function GET() {
  const members = await getMembers()
  return NextResponse.json(members)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const members = await getMembers()

    if (!body.name?.trim()) {
      return NextResponse.json({ error: '成员名称不能为空' }, { status: 400 })
    }

    const id = body.name.trim().toLowerCase()
    if (members.some(m => m.id === id)) {
      return NextResponse.json({ error: '成员已存在' }, { status: 400 })
    }

    const newMember: Member = {
      id,
      name: body.name.trim(),
    }

    members.push(newMember)
    await saveMembers(members)

    return NextResponse.json(newMember, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const members = await getMembers()
    const idx = members.findIndex(m => m.id === body.id)

    if (idx === -1) {
      return NextResponse.json({ error: '成员不存在' }, { status: 404 })
    }

    members[idx] = { ...members[idx], name: body.name || members[idx].name }
    await saveMembers(members)

    return NextResponse.json(members[idx])
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

    const members = await getMembers()
    if (!members.some(m => m.id === id)) {
      return NextResponse.json({ error: '成员不存在' }, { status: 404 })
    }

    const filtered = members.filter(m => m.id !== id)
    await saveMembers(filtered)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '操作失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
