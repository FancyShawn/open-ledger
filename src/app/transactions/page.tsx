"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { SLOT_LABELS } from "@/types";
import type {
  AccountRule,
  Member,
  TransactionDirection,
  ConditionField,
  ConditionOperator,
} from "@/types";
import {
  Search,
  Download,
  Trash2,
  FileText,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  Filter,
  Copy,
  Check,
  Users,
  AlertTriangle,
  Info,
  Unlink,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

export default function TransactionsPage() {
  const { transactions, setTransactions, rules } = useStore();
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterMapped, setFilterMapped] = useState("all");
  const [filterMember, setFilterMember] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [beancountText, setBeancountText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then(setMembers);
    fetch("/api/rules")
      .then((r) => r.json())
      .then((data: AccountRule[]) => useStore.getState().setRules(data));
  }, []);

  const ruleMap = useMemo(() => {
    const map = new Map<string, AccountRule>();
    for (const rule of rules) {
      map.set(rule.id, rule);
    }
    return map;
  }, [rules]);

  function detachRule(txId: string, side: "credit" | "debit") {
    setTransactions(
      transactions.map((tx) => {
        if (tx.id !== txId) return tx;
        if (side === "credit") {
          return {
            ...tx,
            creditAccount: undefined,
            matchedCreditRuleId: undefined,
            manualOverride: true,
          };
        }
        return {
          ...tx,
          debitAccount: undefined,
          matchedDebitRuleId: undefined,
          manualOverride: true,
        };
      }),
    );
    toast.success("已取消该规则的应用，可重新手动指定账户");
  }

  // Extract unique periods from transactions
  const availablePeriods = useMemo(() => {
    const periods = new Set<string>();
    for (const tx of transactions) {
      if (tx.period) periods.add(tx.period);
    }
    return Array.from(periods).sort().reverse();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterSource !== "all" && tx.source !== filterSource) return false;
      if (filterMember !== "all" && tx.memberId !== filterMember) return false;
      if (filterPeriod !== "all" && tx.period !== filterPeriod) return false;
      if (filterDirection !== "all" && tx.direction !== filterDirection)
        return false;
      if (filterMapped === "mapped") {
        if (!tx.creditAccount || !tx.debitAccount) return false;
      }
      if (filterMapped === "unmapped") {
        if (tx.creditAccount && tx.debitAccount) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          tx.counterparty.toLowerCase().includes(q) ||
          tx.description.toLowerCase().includes(q) ||
          tx.paymentMethod.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [
    transactions,
    search,
    filterSource,
    filterMapped,
    filterMember,
    filterPeriod,
    filterDirection,
  ]);

  const stats = useMemo(() => {
    const total = transactions.length;
    const mapped = transactions.filter(
      (t) => t.creditAccount && t.debitAccount,
    ).length;
    const totalExpense = transactions
      .filter((t) => t.direction === "expense" && !t.skipReason)
      .reduce((s, t) => s + t.amount, 0);
    const totalIncome = transactions
      .filter((t) => t.direction === "income" && !t.skipReason)
      .reduce((s, t) => s + t.amount, 0);
    const withWarnings = transactions.filter(
      (t) => t.warnings && t.warnings.length > 0,
    ).length;
    return {
      total,
      mapped,
      unmapped: total - mapped,
      totalExpense,
      totalIncome,
      withWarnings,
    };
  }, [transactions]);

  async function handleExport() {
    if (filtered.length === 0) {
      toast.error("没有可导出的交易");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: filtered }),
      });
      if (!res.ok) throw new Error("导出失败");
      const text = await res.text();
      setBeancountText(text);
      setPreviewOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  function downloadBeancount() {
    const blob = new Blob([beancountText], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${new Date().toISOString().slice(0, 10)}.beancount`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已下载");
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(beancountText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("已复制到剪贴板");
  }

  function clearAll() {
    setTransactions([]);
    toast.success("已清空所有交易");
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Transactions
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              账单记录 · 导出 Beancount
            </p>
          </div>
          <div className="flex gap-2">
            {transactions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setClearConfirmOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                清空
              </Button>
            )}
            <ConfirmDialog
              open={clearConfirmOpen}
              onOpenChange={setClearConfirmOpen}
              title="清空所有交易记录"
              description="确定要清空所有交易记录吗？此操作不可恢复。"
              confirmLabel="清空"
              onConfirm={clearAll}
            />
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting || transactions.length === 0}
            >
              {exporting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  导出 Beancount
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        {transactions.length > 0 && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
            <MiniStatCard
              icon={FileText}
              label="总计"
              value={`${stats.total} 笔`}
            />
            <MiniStatCard
              icon={TrendingDown}
              label="支出"
              value={`\u00A5${stats.totalExpense.toFixed(2)}`}
              className="text-emerald-600"
            />
            <MiniStatCard
              icon={TrendingUp}
              label="收入"
              value={`\u00A5${stats.totalIncome.toFixed(2)}`}
              className="text-rose-600"
            />
            <MiniStatCard
              icon={CheckCircle2}
              label="已映射"
              value={`${stats.mapped} 笔`}
              className="text-emerald-600"
            />
            <MiniStatCard
              icon={AlertCircle}
              label="待映射"
              value={`${stats.unmapped} 笔`}
              className={
                stats.unmapped > 0 ? "text-amber-600" : "text-muted-foreground"
              }
            />
          </div>
        )}

        {/* Filters */}
        {transactions.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索交易对方 / 描述 / 支付方式..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="w-[130px]">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="alipay">支付宝</SelectItem>
                <SelectItem value="wechat">微信</SelectItem>
                <SelectItem value="cmb">招商银行</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDirection} onValueChange={setFilterDirection}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="expense">支出</SelectItem>
                <SelectItem value="income">收入</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterMapped} onValueChange={setFilterMapped}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="mapped">已映射</SelectItem>
                <SelectItem value="unmapped">待映射</SelectItem>
              </SelectContent>
            </Select>
            {members.length > 0 && (
              <Select value={filterMember} onValueChange={setFilterMember}>
                <SelectTrigger className="w-[120px]">
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部成员</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {availablePeriods.length > 0 && (
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部月份</SelectItem>
                  {availablePeriods.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Empty state */}
        {transactions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 rounded-full bg-muted p-3">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium">暂无交易记录</h3>
              <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
                上传账单文件，完成分类后保存，交易记录将显示在此处
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/upload">
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  上传账单
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        {transactions.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">日期</TableHead>
                      <TableHead className="w-[60px]">来源</TableHead>
                      <TableHead className="w-[60px]">类型</TableHead>
                      {members.length > 0 && (
                        <TableHead className="w-[60px]">成员</TableHead>
                      )}
                      <TableHead>交易对方</TableHead>
                      <TableHead className="text-right w-[100px]">
                        金额
                      </TableHead>
                      <TableHead className="w-[110px]">
                        {filterDirection !== "all"
                          ? SLOT_LABELS[filterDirection as TransactionDirection]
                              .credit
                          : "贷方"}
                      </TableHead>
                      <TableHead className="w-[120px]">
                        {filterDirection !== "all"
                          ? SLOT_LABELS[filterDirection as TransactionDirection]
                              .debit
                          : "借方"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={members.length > 0 ? 8 : 7}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          无匹配交易
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((tx) => {
                        const isSkipped = !!tx.skipReason;
                        const hasWarnings =
                          tx.warnings && tx.warnings.length > 0;
                        const labels =
                          SLOT_LABELS[tx.direction] || SLOT_LABELS.expense;

                        return (
                          <TableRow
                            key={tx.id}
                            className={isSkipped ? "opacity-50" : ""}
                          >
                            <TableCell className="tabular-nums text-xs font-medium">
                              {tx.date.slice(0, 10)}
                            </TableCell>
                            <TableCell>
                              <SourceBadge source={tx.source} />
                            </TableCell>
                            <TableCell>
                              <DirectionBadge
                                direction={tx.direction}
                                onChange={(newDirection) => {
                                  setTransactions(
                                    transactions.map((t) =>
                                      t.id === tx.id
                                        ? {
                                            ...t,
                                            direction: newDirection,
                                            creditAccount: undefined,
                                            debitAccount: undefined,
                                            matchedCreditRuleId: undefined,
                                            matchedDebitRuleId: undefined,
                                            manualOverride: true,
                                          }
                                        : t,
                                    ),
                                  );
                                  toast.success("已修改交易类型");
                                }}
                              />
                            </TableCell>
                            {members.length > 0 && (
                              <TableCell className="text-xs">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-normal"
                                >
                                  {members.find((m) => m.id === tx.memberId)
                                    ?.name || "-"}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell className="max-w-[160px] truncate text-sm">
                              {tx.counterparty}
                              {isSkipped && (
                                <span className="ml-1.5 text-[10px] text-muted-foreground">
                                  ({tx.skipReason})
                                </span>
                              )}
                            </TableCell>
                            <TableCell
                              className={`text-right tabular-nums text-sm font-medium ${
                                tx.direction === "income"
                                  ? "text-rose-600"
                                  : tx.direction === "expense"
                                    ? "text-emerald-600"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {tx.direction === "income"
                                ? "+"
                                : tx.direction === "expense"
                                  ? "-"
                                  : ""}
                              {tx.amount.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <AccountBadge
                                value={tx.creditAccount}
                                label={labels.credit}
                                hasWarning={hasWarnings}
                                warnings={tx.warnings}
                                rule={
                                  tx.matchedCreditRuleId
                                    ? ruleMap.get(tx.matchedCreditRuleId)
                                    : undefined
                                }
                                onDetach={() => detachRule(tx.id, "credit")}
                              />
                            </TableCell>
                            <TableCell>
                              <AccountBadge
                                value={tx.debitAccount}
                                label={labels.debit}
                                hasWarning={hasWarnings}
                                warnings={tx.warnings}
                                rule={
                                  tx.matchedDebitRuleId
                                    ? ruleMap.get(tx.matchedDebitRuleId)
                                    : undefined
                                }
                                onDetach={() => detachRule(tx.id, "debit")}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Beancount preview */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Beancount 预览
              </DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Textarea
                value={beancountText}
                readOnly
                className="h-[55vh] font-mono text-xs leading-relaxed"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={copyToClipboard}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                关闭
              </Button>
              <Button onClick={downloadBeancount}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                下载 .beancount
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function MiniStatCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <div className="rounded-md bg-muted p-2">
          <Icon className={`h-4 w-4 ${className || "text-muted-foreground"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p
            className={`text-sm font-semibold tabular-nums truncate ${
              className || ""
            }`}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; className: string }> = {
    alipay: {
      label: "支付宝",
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    wechat: {
      label: "微信",
      className:
        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    cmb: {
      label: "招行",
      className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
  };
  const config = map[source] || { label: source, className: "" };
  return (
    <Badge
      variant="secondary"
      className={`text-[10px] font-normal ${config.className}`}
    >
      {config.label}
    </Badge>
  );
}

function DirectionBadge({
  direction,
  onChange,
}: {
  direction: TransactionDirection;
  onChange?: (newDirection: TransactionDirection) => void;
}) {
  const map: Record<
    TransactionDirection,
    { label: string; className: string }
  > = {
    expense: {
      label: "支出",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    },
    income: {
      label: "收入",
      className:
        "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    },
  };
  const config = map[direction] || { label: direction, className: "" };

  const handleClick = () => {
    if (!onChange) return;
    // Toggle between income and expense
    onChange(direction === "expense" ? "income" : "expense");
  };

  return (
    <Badge
      variant="secondary"
      className={`text-[10px] font-normal cursor-pointer ${config.className} hover:opacity-80 ${onChange ? 'ring-1 ring-transparent hover:ring-current' : ''}`}
      onClick={handleClick}
    >
      {config.label}
    </Badge>
  );
}

const FIELD_LABELS: Record<ConditionField, string> = {
  counterparty: "交易对方",
  description: "交易描述",
  paymentMethod: "支付方式",
  platformCategory: "平台分类",
  amount: "金额",
  status: "状态",
};

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  contains: "包含",
  notContains: "不包含",
  equals: "等于",
  startsWith: "开头是",
  endsWith: "结尾是",
  regex: "正则匹配",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
};

function RuleDetailPopover({
  rule,
  onDetach,
}: {
  rule: AccountRule;
  onDetach: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center rounded-full p-0 h-4 w-4 hover:bg-muted transition-colors shrink-0"
          title="查看匹配规则"
        >
          <Info className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start" side="bottom">
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{rule.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {rule.accountDisplayName || rule.account}
              </p>
            </div>
            <Badge
              variant="secondary"
              className="text-[10px] font-normal shrink-0"
            >
              {rule.source === "ai"
                ? "AI"
                : rule.source === "user"
                  ? "手动"
                  : "系统"}
            </Badge>
          </div>

          <div className="border-t pt-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
              匹配条件（{rule.match.logic === "ALL" ? "全部满足" : "任一满足"}）
            </p>
            <div className="space-y-1">
              {rule.match.conditions.map((condition, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1 text-[11px] bg-muted/50 rounded px-1.5 py-0.5"
                >
                  <span className="text-muted-foreground shrink-0">
                    {FIELD_LABELS[condition.field] || condition.field}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {OPERATOR_LABELS[condition.operator] || condition.operator}
                  </span>
                  <span className="font-mono truncate font-medium">
                    {condition.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive flex-1"
              onClick={onDetach}
            >
              <Unlink className="mr-1 h-3 w-3" />
              取消应用
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs flex-1"
              asChild
            >
              <Link href="/rules">
                <ExternalLink className="mr-1 h-3 w-3" />
                管理规则
              </Link>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountBadge({
  value,
  label,
  hasWarning,
  warnings,
  rule,
  onDetach,
}: {
  value?: string;
  label: string;
  hasWarning?: boolean;
  warnings?: string[];
  rule?: AccountRule;
  onDetach?: () => void;
}) {
  if (!value) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className="text-[10px] font-normal bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 cursor-help"
          >
            未分类
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">无匹配规则</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const short = value.split(":").pop() || value;

  if (hasWarning && warnings && warnings.length > 0) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="text-[10px] font-normal gap-0.5 cursor-help"
            >
              {short}
              <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs">
                {w}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
        {rule && onDetach && (
          <RuleDetailPopover rule={rule} onDetach={onDetach} />
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className="text-[10px] font-normal cursor-help"
          >
            {short}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-mono">{value}</p>
        </TooltipContent>
      </Tooltip>
      {rule && onDetach && (
        <RuleDetailPopover rule={rule} onDetach={onDetach} />
      )}
    </span>
  );
}
