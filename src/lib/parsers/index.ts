import type { BillParser, ParseResult } from './types'
import { alipayParser } from './alipay'
import { wechatParser } from './wechat'
import { cmbParser } from './cmb'

const parsers: BillParser[] = [alipayParser, wechatParser, cmbParser]

export function detectParser(fileName: string, buffer: Buffer): BillParser | null {
  for (const parser of parsers) {
    if (parser.canParse(fileName, buffer)) {
      return parser
    }
  }
  return null
}

export async function parseFile(fileName: string, buffer: Buffer): Promise<ParseResult> {
  const parser = detectParser(fileName, buffer)
  if (!parser) {
    throw new Error(`无法识别账单格式: ${fileName}`)
  }
  return parser.parse(buffer, fileName)
}

export { alipayParser, wechatParser, cmbParser }
export type { ParseResult, BillParser }
