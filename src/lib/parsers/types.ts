import type { Transaction, TransactionSource } from '@/types'

export interface ParseResult {
  transactions: Transaction[]
  source: TransactionSource
  meta: {
    accountName?: string
    dateRange?: { start: string; end: string }
    totalCount?: number
  }
}

export interface BillParser {
  source: TransactionSource
  canParse(fileName: string, buffer: Buffer): boolean
  parse(buffer: Buffer, fileName: string): Promise<ParseResult>
}
