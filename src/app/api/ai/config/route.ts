import { NextRequest, NextResponse } from 'next/server'
import { getAIConfig, saveAIConfig, type AIConfig } from '@/lib/storage/json-store'

export async function GET() {
  const config = await getAIConfig()
  return NextResponse.json(config)
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const config: AIConfig = {
      enabled: Boolean(body.enabled),
      provider: body.provider || 'openai',
      base_url: body.base_url || '',
      api_key: body.api_key || '',
      model: body.model || '',
      temperature: Number(body.temperature) || 0.3,
    }
    await saveAIConfig(config)
    return NextResponse.json(config)
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
