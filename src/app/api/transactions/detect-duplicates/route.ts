import { NextRequest, NextResponse } from 'next/server'
import { detectDuplicates, type DuplicateDetectionConfig } from '@/lib/engine/duplicate-detector'
import type { Transaction } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { transactions, config } = body as {
      transactions: Transaction[]
      config?: DuplicateDetectionConfig
    }

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Invalid transactions data' },
        { status: 400 }
      )
    }

    const matches = detectDuplicates(transactions, config)

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Error detecting duplicates:', error)
    return NextResponse.json(
      { error: 'Failed to detect duplicates' },
      { status: 500 }
    )
  }
}
