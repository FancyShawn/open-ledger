# 跳过策略设计文档

## 一、策略分层

```
┌─────────────────────────────────────────────────────────────┐
│                     交易跳过策略系统                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Parser 层（解析时判断）                                      │
│  ├─ 内部流转          - 不计收支的内部账户转账               │
│  ├─ 已全额退款        - 平台标记的退款交易                   │
│  ├─ 交易已退还/已关闭 - 交易状态异常                         │
│  └─ 银行结息          - 银行自动结息记录                     │
│                                                               │
│  Post-Processing 层（解析后处理）                            │
│  ├─ 已退款（配对）    - 通过 refundFor 配对成功的退款        │
│  └─ 重复交易          - 检测到的重复记录                     │
│                                                               │
│  Manual 层（用户手动）                                        │
│  └─ 用户标记跳过      - 用户手动标记不需要记录的交易         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 二、退款配对策略

### 2.1 配对逻辑

```typescript
// 优先级：orderId > 商户单号
function findOriginalTransaction(refund) {
  // 1. 尝试通过 orderId 匹配
  if (byOrderId.has(refund.refundFor)) {
    return byOrderId.get(refund.refundFor)
  }

  // 2. 尝试通过商户单号匹配
  if (byMerchantId.has(refund.refundFor)) {
    return byMerchantId.get(refund.refundFor)
  }

  return undefined
}
```

### 2.2 配对规则

| 场景 | 原始交易 | 退款交易 | 处理结果 |
|------|---------|---------|---------|
| **全额退款** | amount: 100 | amount: 100 | 两条都跳过 |
| **部分退款** | amount: 100 | amount: 50 | 两条都保留 |
| **多次部分退款** | amount: 100 | amount: 50 + 50 | 全部保留 |
| **找不到原始交易** | - | amount: 100 | 仅退款保留 parser 的 skipReason |

### 2.3 NZERO Bad Case 解决方案

**场景描述：**
```
支出交易：
  orderId: A001
  商户单号: M001
  amount: 100

退款交易：
  orderId: A002
  商户单号: M001
  refundFor: M001  ← 指向商户单号，不是 orderId
  amount: 100
  skipReason: "已全额退款"
```

**处理流程：**
```
1. 构建索引
   byOrderId: { A001 -> 支出交易 }
   byMerchantId: { M001 -> 支出交易 }

2. 处理退款交易
   refundFor = M001

   2.1 尝试 orderId 匹配
       byOrderId.has(M001) -> false ❌

   2.2 尝试商户单号匹配
       byMerchantId.has(M001) -> true ✅
       找到原始交易

   2.3 检查金额
       100 === 100 -> 全额退款 ✅

3. 标记结果
   支出交易: skipReason = "已退款（配对）"
   退款交易: skipReason = "已全额退款" (保持 parser 的原因)
```

## 三、跳过原因标准化

### 3.1 常量定义

```typescript
export const SKIP_REASONS = {
  // Parser level
  INTERNAL_TRANSFER: '内部流转',
  REFUNDED: '已全额退款',
  TRANSACTION_CANCELLED: '交易已退还/已关闭/已撤销',
  BANK_INTEREST: '银行结息',

  // Post-processing level
  REFUND_PAIRED: '已退款（配对）',
  DUPLICATE: '重复交易',

  // Manual
  USER_MARKED: '用户标记跳过',
} as const
```

### 3.2 优先级规则

当一条交易可能有多个跳过原因时，按以下优先级保留：

1. **Parser 层原因** - 最高优先级，不会被覆盖
2. **Post-Processing 层原因** - 仅在没有 Parser 原因时设置
3. **Manual 层原因** - 用户手动设置，可覆盖任何原因

## 四、使用示例

### 4.1 基本使用

```typescript
import { applySkipStrategies, SKIP_REASONS } from '@/lib/engine/skip-strategy'

// 应用跳过策略
const processedTransactions = applySkipStrategies(transactions, {
  autoPairRefunds: true,        // 自动配对退款
  autoDetectDuplicates: false,  // 手动检测重复（默认）
})
```

### 4.2 获取统计信息

```typescript
import { getSkipStats } from '@/lib/engine/skip-strategy'

const stats = getSkipStats(transactions)
// {
//   total: 100,
//   active: 85,
//   skipped: 15,
//   byReason: {
//     '内部流转': 5,
//     '已退款（配对）': 8,
//     '重复交易': 2,
//   }
// }
```

### 4.3 验证跳过原因

```typescript
import { isValidSkipReason, getSkipReasonCategory } from '@/lib/engine/skip-strategy'

if (isValidSkipReason(reason)) {
  const category = getSkipReasonCategory(reason)
  // 'parser' | 'post-processing' | 'manual'
}
```

## 五、测试覆盖

### 5.1 核心测试用例

- ✅ NZERO Bad Case: refundFor 指向商户单号
- ✅ 全额退款配对
- ✅ 部分退款保留
- ✅ 多次部分退款
- ✅ 找不到原始交易
- ✅ orderId 匹配优先级
- ✅ 商户单号匹配

### 5.2 边界情况

- ✅ 金额浮点数精度（0.01 容差）
- ✅ 原始交易已有 skipReason
- ✅ 退款交易已有 skipReason（保持不变）
- ✅ 同一原始交易的多个退款

## 六、与其他系统集成

### 6.1 规则引擎集成

```typescript
// rule-engine.ts
export function applyRules(transactions, rules, members) {
  // Step 0: 应用跳过策略
  const txsWithSkips = applySkipStrategies(transactions, {
    autoPairRefunds: true
  })

  // Step 1-N: 应用规则...
  return txsWithSkips.map(tx => {
    if (tx.skipReason) return tx // 跳过已标记的交易
    // ...
  })
}
```

### 6.2 重复检测集成

```typescript
// 手动检测重复
const duplicates = detectDuplicates(transactions)

// 用户确认后标记
const resolved = markAsDuplicate(transactions, duplicateId, originalId)
```

## 七、未来扩展

### 7.1 可配置的跳过规则

```typescript
interface CustomSkipRule {
  name: string
  condition: (tx: Transaction) => boolean
  reason: string
}

// 允许用户自定义跳过规则
const customRules: CustomSkipRule[] = [
  {
    name: '小额测试交易',
    condition: (tx) => tx.amount < 0.01,
    reason: '测试交易',
  },
]
```

### 7.2 跳过原因本地化

```typescript
const SKIP_REASONS_I18N = {
  'zh-CN': {
    INTERNAL_TRANSFER: '内部流转',
    REFUNDED: '已全额退款',
    // ...
  },
  'en-US': {
    INTERNAL_TRANSFER: 'Internal Transfer',
    REFUNDED: 'Fully Refunded',
    // ...
  },
}
```

### 7.3 跳过历史记录

```typescript
interface SkipHistory {
  transactionId: string
  reason: SkipReason
  timestamp: string
  operator: 'system' | 'user'
  metadata?: Record<string, any>
}

// 记录跳过操作历史，便于审计和回溯
```
