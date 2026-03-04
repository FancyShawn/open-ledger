import { z } from 'zod'
import { getAIClient, getModelConfig } from './client'
import type { Transaction, Account, AIClassifyResult } from '@/types'

const ClassificationSchema = z.object({
  transactionId: z.string(),
  creditAccount: z.string().optional(),
  debitAccount: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
})

const AIClassifyResponseSchema = z.object({
  classifications: z.array(ClassificationSchema),
  suggestedAccounts: z
    .array(
      z.object({
        type: z.enum(['Assets', 'Liabilities', 'Expenses', 'Income', 'Equity']),
        name: z.string(),
        path: z.string(),
        currency: z.string().default('CNY'),
      })
    )
    .optional(),
})

function buildClassifyPrompt(
  accounts: Account[],
  transactions: { id: string; counterparty: string; description: string; direction: string; amount: number; paymentMethod: string }[]
): string {
  const accountList = accounts
    .map(a => `  - ${a.path} (${a.name}) [${a.type}]`)
    .join('\n')

  const txList = transactions
    .map(
      (t, i) =>
        `  ${i + 1}. [id="${t.id}"] 方向=${t.direction} 金额=${t.amount} 交易对方="${t.counterparty}" 描述="${t.description}" 支付方式="${t.paymentMethod}"`
    )
    .join('\n')

  return `你是一个复式记账助手，负责为交易分配贷方（credit）和借方（debit）账户。

## 复式记账规则
| 交易类型 | 贷方 (Credit) | 借方 (Debit) |
|---|---|---|
| expense 支出 | Assets / Liabilities | Expenses |
| income 收入 | Income | Assets |
| transfer 转账/内部流转 | Assets / Liabilities | Assets / Liabilities |

## 当前账户体系
${accountList}

## 待分类交易
${txList}

## 输出要求
返回纯 JSON（不要 markdown 代码块），格式如下：
{
  "classifications": [
    {
      "transactionId": "交易id",
      "creditAccount": "Assets:Shawn:CMB:Savings:1526",
      "debitAccount": "Expenses:Living",
      "confidence": "high",
      "reason": "简要说明分类依据"
    }
  ],
  "suggestedAccounts": [
    { "type": "Expenses", "name": "餐饮", "path": "Expenses:Food", "currency": "CNY" }
  ]
}`
}

/**
 * Classify unmapped transactions using AI.
 * Now handles both credit and debit accounts.
 */
export async function classifyTransactions(
  accounts: Account[],
  transactions: Transaction[]
): Promise<AIClassifyResult> {
  // Filter transactions missing either credit or debit account
  const unmapped = transactions.filter(
    tx => !tx.creditAccount || !tx.debitAccount
  )

  if (unmapped.length === 0) {
    return { classifications: [] }
  }

  // Limit to 30 per batch
  const batch = unmapped.slice(0, 30)

  const samples = batch.map(tx => ({
    id: tx.id,
    counterparty: tx.counterparty,
    description: tx.description,
    direction: tx.direction,
    amount: tx.amount,
    paymentMethod: tx.paymentMethod,
  }))

  const prompt = buildClassifyPrompt(accounts, samples)

  const client = await getAIClient()
  const { model, temperature } = await getModelConfig()

  const response = await client.chat.completions.create({
    model,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.choices[0]?.message?.content?.trim() || '{}'
  const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`AI 返回的 JSON 格式无效: ${cleaned.slice(0, 200)}`)
  }

  const validated = AIClassifyResponseSchema.parse(parsed)

  return {
    classifications: validated.classifications,
    suggestedAccounts: validated.suggestedAccounts,
  }
}
