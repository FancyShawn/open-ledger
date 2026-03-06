'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { Transaction } from '@/types'
import type { DuplicateMatch } from '@/lib/engine/duplicate-detector'

interface DuplicateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  match: DuplicateMatch | null
  transactions: Transaction[]
  onResolve: (keepId: string, removeId: string) => void
  onSkip: () => void
}

export function DuplicateDialog({
  open,
  onOpenChange,
  match,
  transactions,
  onResolve,
  onSkip,
}: DuplicateDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!match) return null

  const tx1 = transactions.find(t => t.id === match.transactionId)
  const tx2 = transactions.find(t => t.id === match.duplicateId)

  if (!tx1 || !tx2) return null

  const handleConfirm = () => {
    if (!selectedId) return
    const removeId = selectedId === tx1.id ? tx2.id : tx1.id
    onResolve(selectedId, removeId)
    setSelectedId(null)
  }

  const handleSkip = () => {
    setSelectedId(null)
    onSkip()
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      cmb: '招商银行',
      alipay: '支付宝',
      wechat: '微信',
    }
    return labels[source] || source
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            检测到可能的重复交易
          </DialogTitle>
          <DialogDescription>
            以下两条交易记录可能是同一笔支出，请选择保留哪一条
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Similarity Score */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">相似度：</span>
            <Badge variant={match.score > 0.9 ? 'destructive' : 'secondary'}>
              {Math.round(match.score * 100)}%
            </Badge>
            <span className="text-xs text-muted-foreground">
              {match.reasons.join(' · ')}
            </span>
          </div>

          {/* Transaction Comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Transaction 1 */}
            <button
              onClick={() => setSelectedId(tx1.id)}
              className={`
                relative rounded-lg border-2 p-4 text-left transition-all
                ${
                  selectedId === tx1.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }
              `}
            >
              {selectedId === tx1.id && (
                <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 text-primary" />
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{getSourceLabel(tx1.source)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(tx1.date)}
                  </span>
                </div>
                <div className="font-medium">{tx1.counterparty}</div>
                <div className="text-sm text-muted-foreground">
                  {tx1.description}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">支付方式：</span>
                  {tx1.paymentMethod}
                </div>
                <div className="text-lg font-semibold text-red-600">
                  -¥{tx1.amount.toFixed(2)}
                </div>
              </div>
            </button>

            {/* Transaction 2 */}
            <button
              onClick={() => setSelectedId(tx2.id)}
              className={`
                relative rounded-lg border-2 p-4 text-left transition-all
                ${
                  selectedId === tx2.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }
              `}
            >
              {selectedId === tx2.id && (
                <CheckCircle2 className="absolute right-2 top-2 h-5 w-5 text-primary" />
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{getSourceLabel(tx2.source)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(tx2.date)}
                  </span>
                </div>
                <div className="font-medium">{tx2.counterparty}</div>
                <div className="text-sm text-muted-foreground">
                  {tx2.description}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">支付方式：</span>
                  {tx2.paymentMethod}
                </div>
                <div className="text-lg font-semibold text-red-600">
                  -¥{tx2.amount.toFixed(2)}
                </div>
              </div>
            </button>
          </div>

          {/* Recommendation */}
          <div className="rounded-lg bg-muted p-3 text-sm">
            <span className="font-medium">💡 建议：</span>
            {tx1.source === 'cmb' || tx2.source === 'cmb' ? (
              <span>
                银行账单通常更准确，建议保留{' '}
                <strong>
                  {tx1.source === 'cmb' ? '左侧' : '右侧'}（
                  {getSourceLabel(tx1.source === 'cmb' ? tx1.source : tx2.source)}
                  ）
                </strong>
                的记录
              </span>
            ) : (
              <span>建议保留时间更精确的记录</span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleSkip}>
            跳过
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId}>
            确认保留选中项
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
