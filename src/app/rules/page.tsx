"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import type {
  AccountRule,
  SkipRule,
  TransactionDirection,
  RuleSide,
  ConditionField,
  ConditionOperator,
  ConditionGroup,
  MatchCondition,
} from "@/types";
import { SLOT_LABELS, VALID_ACCOUNT_TYPES } from "@/types";
import {
  Plus,
  Sparkles,
  Pencil,
  Trash2,
  Settings2,
  ArrowRight,
  Loader2,
  Check,
  Bot,
  User,
  Zap,
  Search,
  FlaskConical,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CreditCard,
  Wallet,
  RefreshCw,
} from "lucide-react";

type SlotKey = `${TransactionDirection}.${RuleSide}`;

const DIRECTION_ORDER: TransactionDirection[] = [
  "expense",
  "income",
];

const DIRECTION_ICONS: Record<
  TransactionDirection,
  React.ComponentType<{ className?: string }>
> = {
  expense: CreditCard,
  income: Wallet,
};

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

export default function RulesPage() {
  const {
    rules,
    setRules,
    skipRules,
    setSkipRules,
    transactions,
    accounts,
    setAccounts,
    members,
    setMembers,
  } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRule | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(new Set());
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  // Skip rules state
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [editingSkip, setEditingSkip] = useState<SkipRule | null>(null);
  const [deletingSkipRuleId, setDeletingSkipRuleId] = useState<string | null>(null);
  const [skipForm, setSkipForm] = useState({
    name: "",
    priority: 200,
    member: "" as string,
    conditions: [{ field: "counterparty" as ConditionField, operator: "contains" as ConditionOperator, value: "" }] as MatchCondition[],
    logic: "ALL" as "ALL" | "ANY",
    reason: "",
  });

  // Form state
  const [form, setForm] = useState({
    name: "",
    priority: 200,
    transactionType: "expense" as TransactionDirection,
    side: "credit" as RuleSide,
    member: "" as string,
    conditions: [
      {
        field: "counterparty" as ConditionField,
        operator: "contains" as ConditionOperator,
        value: "",
      },
    ] as MatchCondition[],
    logic: "ALL" as "ALL" | "ANY",
    account: "",
    accountDisplayName: "",
    excludeFromStats: false,
  });

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then(setRules);
    fetch("/api/skip-rules")
      .then((r) => r.json())
      .then(setSkipRules);
    fetch("/api/accounts")
      .then((r) => r.json())
      .then(setAccounts);
    fetch("/api/members")
      .then((r) => r.json())
      .then(setMembers);
  }, [setRules, setSkipRules, setAccounts, setMembers]);

  // Group rules by slot
  const rulesBySlot = useMemo(() => {
    const map: Record<string, AccountRule[]> = {};
    for (const dir of DIRECTION_ORDER) {
      for (const side of ["credit", "debit"] as RuleSide[]) {
        map[`${dir}.${side}`] = [];
      }
    }

    for (const rule of rules) {
      const types = Array.isArray(rule.appliesTo.transactionType)
        ? rule.appliesTo.transactionType
        : [rule.appliesTo.transactionType];
      const side = rule.appliesTo.side;
      for (const t of types) {
        const key = `${t}.${side}`;
        if (map[key]) {
          map[key].push(rule);
        }
      }
    }

    // Sort each slot by priority descending
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => b.priority - a.priority);
    }
    return map;
  }, [rules]);

  // Filter rules by search
  const filterRule = (rule: AccountRule) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      rule.name.toLowerCase().includes(q) ||
      rule.account.toLowerCase().includes(q) ||
      rule.accountDisplayName?.toLowerCase().includes(q) ||
      rule.match.conditions.some((c) => c.value.toLowerCase().includes(q))
    );
  };

  // Get accounts valid for a slot
  const getValidAccounts = (txType: TransactionDirection, side: RuleSide) => {
    const validTypes = VALID_ACCOUNT_TYPES[txType]?.[side] || [];
    return accounts.filter((a) => validTypes.includes(a.type as never));
  };

  // Test preview for form
  const testMatchedTxs = useMemo(() => {
    if (!form.conditions.some((c) => c.value)) return [];
    return transactions.filter((tx) => {
      if (tx.skipReason) return false;
      // Check direction match
      if (tx.direction !== form.transactionType) {
        return false;
      }
      // Evaluate conditions
      const group: ConditionGroup = {
        logic: form.logic,
        conditions: form.conditions.filter((c) => c.value),
      };
      if (group.conditions.length === 0) return false;
      return evaluateGroupClient(tx, group);
    });
  }, [form.conditions, form.logic, form.transactionType, transactions]);

  function toggleSlot(key: string) {
    setCollapsedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openCreate(txType?: TransactionDirection, side?: RuleSide) {
    setEditing(null);
    setForm({
      name: "",
      priority: 200,
      transactionType: txType || "expense",
      side: side || "credit",
      member: "",
      conditions: [{ field: "counterparty", operator: "contains", value: "" }],
      logic: "ALL",
      account: "",
      accountDisplayName: "",
      excludeFromStats: false,
    });
    setDialogOpen(true);
  }

  function openEdit(rule: AccountRule) {
    setEditing(rule);
    const types = Array.isArray(rule.appliesTo.transactionType)
      ? rule.appliesTo.transactionType
      : [rule.appliesTo.transactionType];
    setForm({
      name: rule.name,
      priority: rule.priority,
      transactionType: types[0],
      side: rule.appliesTo.side,
      member: rule.member || "",
      conditions:
        rule.match.conditions.length > 0
          ? [...rule.match.conditions]
          : [{ field: "counterparty", operator: "contains", value: "" }],
      logic: rule.match.logic,
      account: rule.account,
      accountDisplayName: rule.accountDisplayName || "",
      excludeFromStats: rule.excludeFromStats || false,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name) {
      toast.error("请填写规则名称");
      return;
    }
    const validConditions = form.conditions.filter((c) => c.value);
    if (validConditions.length === 0) {
      toast.error("请至少添加一个有效条件");
      return;
    }
    if (!form.account) {
      toast.error("请选择账户");
      return;
    }

    // Warn about account type mismatch (non-blocking)
    const validTypes =
      VALID_ACCOUNT_TYPES[form.transactionType]?.[form.side] || [];
    const accountType = form.account.split(":")[0];
    if (!validTypes.includes(accountType as never)) {
      toast.warning(
        `注意：账户类型 ${accountType} 不在 ${SLOT_LABELS[form.transactionType].label} 槽位的推荐类型中，已保存`,
      );
    }

    const body: Partial<AccountRule> = {
      name: form.name,
      priority: form.priority,
      enabled: true,
      source: "user",
      appliesTo: {
        transactionType: form.transactionType,
        side: form.side,
      },
      member: form.member || undefined,
      match: {
        logic: form.logic,
        conditions: validConditions,
      },
      account: form.account,
      accountDisplayName: form.accountDisplayName || form.account,
      excludeFromStats: form.excludeFromStats,
    };

    try {
      if (editing) {
        const res = await fetch("/api/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, id: editing.id }),
        });
        if (!res.ok) throw new Error("更新失败");
      } else {
        const res = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("创建失败");
      }
      const updated = await fetch("/api/rules").then((r) => r.json());
      setRules(updated);
      setDialogOpen(false);
      toast.success(editing ? "已更新" : "已创建");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/rules?id=${id}`, { method: "DELETE" });
      const updated = await fetch("/api/rules").then((r) => r.json());
      setRules(updated);
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  }

  async function handleToggle(rule: AccountRule) {
    try {
      await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      const updated = await fetch("/api/rules").then((r) => r.json());
      setRules(updated);
    } catch {
      toast.error("切换失败");
    }
  }

  function addCondition() {
    setForm({
      ...form,
      conditions: [
        ...form.conditions,
        { field: "description", operator: "contains", value: "" },
      ],
    });
  }

  function removeCondition(idx: number) {
    if (form.conditions.length <= 1) return;
    setForm({
      ...form,
      conditions: form.conditions.filter((_, i) => i !== idx),
    });
  }

  function updateCondition(idx: number, patch: Partial<MatchCondition>) {
    setForm({
      ...form,
      conditions: form.conditions.map((c, i) =>
        i === idx ? { ...c, ...patch } : c,
      ),
    });
  }

  // ========== Skip Rules Handlers ==========

  function openCreateSkip() {
    setEditingSkip(null);
    setSkipForm({
      name: "",
      priority: 200,
      member: "",
      conditions: [{ field: "counterparty", operator: "contains", value: "" }],
      logic: "ALL",
      reason: "",
    });
    setSkipDialogOpen(true);
  }

  function openEditSkip(rule: SkipRule) {
    setEditingSkip(rule);
    setSkipForm({
      name: rule.name,
      priority: rule.priority,
      member: rule.member || "",
      conditions:
        rule.match.conditions.length > 0
          ? [...rule.match.conditions]
          : [{ field: "counterparty", operator: "contains", value: "" }],
      logic: rule.match.logic,
      reason: rule.reason,
    });
    setSkipDialogOpen(true);
  }

  async function handleSaveSkip() {
    if (!skipForm.name) {
      toast.error("请填写规则名称");
      return;
    }
    if (!skipForm.reason) {
      toast.error("请填写跳过原因");
      return;
    }
    const validConditions = skipForm.conditions.filter((c) => c.value);
    if (validConditions.length === 0) {
      toast.error("请至少添加一个有效条件");
      return;
    }

    const body: Partial<SkipRule> = {
      name: skipForm.name,
      priority: skipForm.priority,
      enabled: true,
      source: "user",
      member: skipForm.member || undefined,
      match: {
        logic: skipForm.logic,
        conditions: validConditions,
      },
      reason: skipForm.reason,
    };

    try {
      if (editingSkip) {
        const res = await fetch("/api/skip-rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, id: editingSkip.id }),
        });
        if (!res.ok) throw new Error("更新失败");
      } else {
        const res = await fetch("/api/skip-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("创建失败");
      }
      const updated = await fetch("/api/skip-rules").then((r) => r.json());
      setSkipRules(updated);
      setSkipDialogOpen(false);
      toast.success(editingSkip ? "已更新" : "已创建");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleDeleteSkip(id: string) {
    try {
      await fetch(`/api/skip-rules?id=${id}`, { method: "DELETE" });
      const updated = await fetch("/api/skip-rules").then((r) => r.json());
      setSkipRules(updated);
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  }

  async function handleToggleSkip(rule: SkipRule) {
    try {
      await fetch("/api/skip-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      const updated = await fetch("/api/skip-rules").then((r) => r.json());
      setSkipRules(updated);
    } catch {
      toast.error("切换失败");
    }
  }

  function addSkipCondition() {
    setSkipForm({
      ...skipForm,
      conditions: [
        ...skipForm.conditions,
        { field: "description", operator: "contains", value: "" },
      ],
    });
  }

  function removeSkipCondition(idx: number) {
    if (skipForm.conditions.length <= 1) return;
    setSkipForm({
      ...skipForm,
      conditions: skipForm.conditions.filter((_, i) => i !== idx),
    });
  }

  function updateSkipCondition(idx: number, patch: Partial<MatchCondition>) {
    setSkipForm({
      ...skipForm,
      conditions: skipForm.conditions.map((c, i) =>
        i === idx ? { ...c, ...patch } : c,
      ),
    });
  }

  // Stats
  const stats = {
    total: rules.length,
    enabled: rules.filter((r) => r.enabled).length,
    bySource: {
      ai: rules.filter((r) => r.source === "ai").length,
      user: rules.filter((r) => r.source === "user").length,
      system: rules.filter((r) => r.source === "system").length,
    },
  };

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              统一规则管理 · 按交易类型和槽位组织
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新建规则
            </Button>
          </div>
        </div>

        {/* Quick Navigation Tabs */}
        <div className="flex gap-2 border-b pb-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              document.getElementById("expense-rules")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <CreditCard className="h-3.5 w-3.5" />
            支出规则
            <Badge variant="outline" className="text-[10px]">
              {(rulesBySlot["expense.credit"]?.length || 0) + (rulesBySlot["expense.debit"]?.length || 0)}
            </Badge>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              document.getElementById("income-rules")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Wallet className="h-3.5 w-3.5" />
            收入规则
            <Badge variant="outline" className="text-[10px]">
              {(rulesBySlot["income.credit"]?.length || 0) + (rulesBySlot["income.debit"]?.length || 0)}
            </Badge>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              document.getElementById("skip-rules")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            跳过规则
            <Badge variant="outline" className="text-[10px]">
              {skipRules.length}
            </Badge>
          </Button>
        </div>

        {/* Stats */}
        {rules.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary" className="gap-1">
              <Settings2 className="h-3 w-3" />
              总计 {stats.total}
            </Badge>
            <Badge
              variant="secondary"
              className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
            >
              <Check className="h-3 w-3" />
              启用 {stats.enabled}
            </Badge>
            {stats.bySource.ai > 0 && (
              <Badge
                variant="secondary"
                className="gap-1 bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300"
              >
                <Bot className="h-3 w-3" />
                AI {stats.bySource.ai}
              </Badge>
            )}
            {stats.bySource.user > 0 && (
              <Badge
                variant="secondary"
                className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              >
                <User className="h-3 w-3" />
                用户 {stats.bySource.user}
              </Badge>
            )}
          </div>
        )}

        {/* Search */}
        {rules.length > 0 && (
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索规则..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        )}

        {/* Rules by slot */}
        {rules.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 rounded-full bg-muted p-3">
                <Settings2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium">暂无规则</h3>
              <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
                创建规则来自动为交易分配贷方和借方账户
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => openCreate()}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建规则
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {DIRECTION_ORDER.map((dir) => {
              const Icon = DIRECTION_ICONS[dir];
              const label = SLOT_LABELS[dir];
              const creditKey = `${dir}.credit` as SlotKey;
              const debitKey = `${dir}.debit` as SlotKey;
              const creditRules = (rulesBySlot[creditKey] || []).filter(
                filterRule,
              );
              const debitRules = (rulesBySlot[debitKey] || []).filter(
                filterRule,
              );
              const totalInGroup = creditRules.length + debitRules.length;

              if (searchQuery && totalInGroup === 0) return null;

              return (
                <Card key={dir} id={`${dir}-rules`}>
                  <CardContent className="py-4 space-y-3">
                    {/* Group header */}
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold">{label.label}</h2>
                      <Badge variant="outline" className="text-[10px]">
                        {totalInGroup} 规则
                      </Badge>
                    </div>

                    {/* Credit slot */}
                    <SlotSection
                      slotKey={creditKey}
                      label={`贷方 - ${label.credit}`}
                      rules={creditRules}
                      collapsed={collapsedSlots.has(creditKey)}
                      onToggle={() => toggleSlot(creditKey)}
                      onAdd={() => openCreate(dir, "credit")}
                      onEdit={openEdit}
                      onDelete={setDeletingRuleId}
                      onToggleRule={handleToggle}
                    />

                    {/* Debit slot */}
                    <SlotSection
                      slotKey={debitKey}
                      label={`借方 - ${label.debit}`}
                      rules={debitRules}
                      collapsed={collapsedSlots.has(debitKey)}
                      onToggle={() => toggleSlot(debitKey)}
                      onAdd={() => openCreate(dir, "debit")}
                      onEdit={openEdit}
                      onDelete={setDeletingRuleId}
                      onToggleRule={handleToggle}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Skip Rules Section */}
        <Card id="skip-rules" className="border-amber-200/50">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold">跳过规则</h2>
                <Badge variant="outline" className="text-[10px]">
                  {skipRules.length} 规则
                </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={openCreateSkip}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建跳过规则
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              匹配这些规则的交易将被标记为跳过，不会计入最终账单
            </p>

            {skipRules.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                暂无跳过规则
              </div>
            ) : (
              <div className="space-y-1.5">
                {skipRules
                  .sort((a, b) => b.priority - a.priority)
                  .map((rule) => (
                    <div
                      key={rule.id}
                      className={`flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-opacity ${
                        rule.enabled ? "" : "opacity-50"
                      }`}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={() => handleToggleSkip(rule)}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {rule.enabled ? "点击禁用" : "点击启用"}
                        </TooltipContent>
                      </Tooltip>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {rule.name}
                          </p>
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0 tabular-nums"
                          >
                            P{rule.priority}
                          </Badge>
                          {rule.member && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] shrink-0"
                            >
                              {rule.member}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                            {skipConditionSummary(rule)}
                          </code>
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                          >
                            跳过: {rule.reason}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditSkip(rule)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>编辑</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeletingSkipRuleId(rule.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <ConfirmDialog
          open={!!deletingRuleId}
          onOpenChange={(open) => {
            if (!open) setDeletingRuleId(null);
          }}
          title="确定要删除这条规则吗？"
          confirmLabel="删除"
          onConfirm={() => {
            if (deletingRuleId) handleDelete(deletingRuleId);
          }}
        />

        <ConfirmDialog
          open={!!deletingSkipRuleId}
          onOpenChange={(open) => {
            if (!open) setDeletingSkipRuleId(null);
          }}
          title="确定要删除这条跳过规则吗？"
          confirmLabel="删除"
          onConfirm={() => {
            if (deletingSkipRuleId) handleDeleteSkip(deletingSkipRuleId);
          }}
        />

        {/* Create / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editing ? (
                  <>
                    <Pencil className="h-4 w-4" />
                    编辑规则
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    新建规则
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>规则名称</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="如：招行储蓄卡"
                  />
                </div>
                <div className="space-y-2">
                  <Label>优先级</Label>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        priority: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>不计入收支统计</Label>
                  <p className="text-xs text-muted-foreground">
                    匹配此规则的交易不计入收支统计（如转账类）
                  </p>
                </div>
                <Switch
                  checked={form.excludeFromStats}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, excludeFromStats: checked })
                  }
                />
              </div>

              <Separator />

              {/* Slot selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>交易类型</Label>
                  <Select
                    value={form.transactionType}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        transactionType: v as TransactionDirection,
                        account: "",
                        accountDisplayName: "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECTION_ORDER.map((d) => (
                        <SelectItem key={d} value={d}>
                          {SLOT_LABELS[d].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>槽位</Label>
                  <Select
                    value={form.side}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        side: v as RuleSide,
                        account: "",
                        accountDisplayName: "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">
                        贷方 - {SLOT_LABELS[form.transactionType].credit}
                      </SelectItem>
                      <SelectItem value="debit">
                        借方 - {SLOT_LABELS[form.transactionType].debit}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Member scope */}
              {members.length > 0 && (
                <div className="space-y-2">
                  <Label>成员作用域</Label>
                  <Select
                    value={form.member || "__all__"}
                    onValueChange={(v) =>
                      setForm({ ...form, member: v === "__all__" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">所有成员</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          仅 {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* Conditions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label>匹配条件</Label>
                  {form.conditions.length > 1 && (
                    <Select
                      value={form.logic}
                      onValueChange={(v) =>
                        setForm({ ...form, logic: v as "ALL" | "ANY" })
                      }
                    >
                      <SelectTrigger className="w-[100px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">全部满足</SelectItem>
                        <SelectItem value="ANY">任一满足</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {form.conditions.map((cond, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <Select
                      value={cond.field}
                      onValueChange={(v) =>
                        updateCondition(idx, { field: v as ConditionField })
                      }
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(FIELD_LABELS) as [
                            ConditionField,
                            string,
                          ][]
                        ).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={cond.operator}
                      onValueChange={(v) =>
                        updateCondition(idx, {
                          operator: v as ConditionOperator,
                        })
                      }
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cond.field === "amount"
                          ? (
                              [
                                "equals",
                                "gt",
                                "gte",
                                "lt",
                                "lte",
                              ] as ConditionOperator[]
                            ).map((op) => (
                              <SelectItem key={op} value={op}>
                                {OPERATOR_LABELS[op]}
                              </SelectItem>
                            ))
                          : (
                              [
                                "contains",
                                "notContains",
                                "equals",
                                "startsWith",
                                "endsWith",
                                "regex",
                              ] as ConditionOperator[]
                            ).map((op) => (
                              <SelectItem key={op} value={op}>
                                {OPERATOR_LABELS[op]}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      value={cond.value}
                      onChange={(e) =>
                        updateCondition(idx, { value: e.target.value })
                      }
                      placeholder="值"
                    />
                    {form.conditions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => removeCondition(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="mr-1 h-3 w-3" />
                  添加条件
                </Button>
              </div>

              <Separator />

              {/* Account selection */}
              <div className="space-y-2">
                <Label>
                  账户（
                  {form.side === "credit"
                    ? SLOT_LABELS[form.transactionType].credit
                    : SLOT_LABELS[form.transactionType].debit}
                  ）
                </Label>
                <Select
                  value={form.account || "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") return;
                    const acc = accounts.find((a) => a.path === v);
                    setForm({
                      ...form,
                      account: v,
                      accountDisplayName: acc?.name || v,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择账户" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>
                      选择账户
                    </SelectItem>
                    {getValidAccounts(form.transactionType, form.side).map(
                      (a) => (
                        <SelectItem key={a.id} value={a.path}>
                          {a.name} ({a.path})
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                {/* Manual account path input */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    或手动输入账户路径（支持 {"{member}"} 占位符）
                  </Label>
                  <Input
                    value={form.account}
                    onChange={(e) =>
                      setForm({ ...form, account: e.target.value })
                    }
                    placeholder="如 Assets:{member}:CMB:Savings:1526"
                    className="text-xs"
                  />
                </div>
                {form.account &&
                  (() => {
                    const validTypes =
                      VALID_ACCOUNT_TYPES[form.transactionType]?.[form.side] ||
                      [];
                    const accountType = form.account.split(":")[0];
                    if (!validTypes.includes(accountType as never)) {
                      return (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          账户类型 {accountType} 不在推荐类型中 (推荐{" "}
                          {validTypes.join("/")})，仍可保存
                        </div>
                      );
                    }
                    return null;
                  })()}
              </div>

              {/* Display name */}
              <div className="space-y-2">
                <Label>显示名称</Label>
                <Input
                  value={form.accountDisplayName}
                  onChange={(e) =>
                    setForm({ ...form, accountDisplayName: e.target.value })
                  }
                  placeholder="如：招商储蓄卡 1526"
                />
              </div>

              {/* Rule test preview */}
              {transactions.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-muted-foreground">规则测试</Label>
                      {form.conditions.some((c) => c.value) && (
                        <Badge
                          variant={
                            testMatchedTxs.length > 0 ? "default" : "secondary"
                          }
                          className="text-[10px]"
                        >
                          匹配 {testMatchedTxs.length} 条
                        </Badge>
                      )}
                    </div>
                    {testMatchedTxs.length > 0 ? (
                      <div className="bg-muted/50 rounded-md p-2 space-y-1 max-h-32 overflow-y-auto">
                        {testMatchedTxs.slice(0, 5).map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="truncate flex-1">
                              {tx.counterparty} · {tx.description}
                            </span>
                            <span
                              className={`tabular-nums shrink-0 ml-2 ${
                                tx.direction === "income"
                                  ? "text-rose-600"
                                  : "text-emerald-600"
                              }`}
                            >
                              {tx.direction === "income" ? "+" : "-"}
                              {tx.amount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                        {testMatchedTxs.length > 5 && (
                          <p className="text-[10px] text-muted-foreground text-center pt-1">
                            还有 {testMatchedTxs.length - 5} 条...
                          </p>
                        )}
                      </div>
                    ) : form.conditions.some((c) => c.value) ? (
                      <p className="text-xs text-muted-foreground">
                        当前条件未匹配到任何交易
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        输入匹配条件后可预览匹配结果
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSave}>{editing ? "保存" : "创建"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Skip Rules Dialog */}
        <Dialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingSkip ? (
                  <>
                    <Pencil className="h-4 w-4" />
                    编辑跳过规则
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    新建跳过规则
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>规则名称</Label>
                  <Input
                    value={skipForm.name}
                    onChange={(e) =>
                      setSkipForm({ ...skipForm, name: e.target.value })
                    }
                    placeholder="如：内部转账"
                  />
                </div>
                <div className="space-y-2">
                  <Label>优先级</Label>
                  <Input
                    type="number"
                    value={skipForm.priority}
                    onChange={(e) =>
                      setSkipForm({
                        ...skipForm,
                        priority: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              {/* Skip reason */}
              <div className="space-y-2">
                <Label>跳过原因</Label>
                <Input
                  value={skipForm.reason}
                  onChange={(e) =>
                    setSkipForm({ ...skipForm, reason: e.target.value })
                  }
                  placeholder="如：内部转账、退款、不计收支"
                />
                <p className="text-xs text-muted-foreground">
                  匹配的交易将被标记为此原因并跳过
                </p>
              </div>

              <Separator />

              {/* Member scope */}
              {members.length > 0 && (
                <div className="space-y-2">
                  <Label>成员作用域</Label>
                  <Select
                    value={skipForm.member || "__all__"}
                    onValueChange={(v) =>
                      setSkipForm({
                        ...skipForm,
                        member: v === "__all__" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">所有成员</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          仅 {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* Conditions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label>匹配条件</Label>
                  {skipForm.conditions.length > 1 && (
                    <Select
                      value={skipForm.logic}
                      onValueChange={(v) =>
                        setSkipForm({ ...skipForm, logic: v as "ALL" | "ANY" })
                      }
                    >
                      <SelectTrigger className="w-[100px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">全部满足</SelectItem>
                        <SelectItem value="ANY">任一满足</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {skipForm.conditions.map((cond, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <Select
                      value={cond.field}
                      onValueChange={(v) =>
                        updateSkipCondition(idx, {
                          field: v as ConditionField,
                        })
                      }
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(FIELD_LABELS) as [
                            ConditionField,
                            string,
                          ][]
                        ).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={cond.operator}
                      onValueChange={(v) =>
                        updateSkipCondition(idx, {
                          operator: v as ConditionOperator,
                        })
                      }
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cond.field === "amount"
                          ? (
                              [
                                "equals",
                                "gt",
                                "gte",
                                "lt",
                                "lte",
                              ] as ConditionOperator[]
                            ).map((op) => (
                              <SelectItem key={op} value={op}>
                                {OPERATOR_LABELS[op]}
                              </SelectItem>
                            ))
                          : (
                              [
                                "contains",
                                "notContains",
                                "equals",
                                "startsWith",
                                "endsWith",
                                "regex",
                              ] as ConditionOperator[]
                            ).map((op) => (
                              <SelectItem key={op} value={op}>
                                {OPERATOR_LABELS[op]}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      value={cond.value}
                      onChange={(e) =>
                        updateSkipCondition(idx, { value: e.target.value })
                      }
                      placeholder="值"
                    />
                    {skipForm.conditions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => removeSkipCondition(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSkipCondition}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  添加条件
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSkipDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleSaveSkip}>
                {editingSkip ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ========== Sub-components ==========

function SlotSection({
  slotKey,
  label,
  rules,
  collapsed,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  onToggleRule,
}: {
  slotKey: string;
  label: string;
  rules: AccountRule[];
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (rule: AccountRule) => void;
  onDelete: (id: string) => void;
  onToggleRule: (rule: AccountRule) => void;
}) {
  return (
    <div className="rounded-md border bg-muted/20">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/40 transition-colors rounded-t-md"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-medium">{label}</span>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {rules.length}
        </Badge>
      </button>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-1.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-opacity ${
                rule.enabled ? "" : "opacity-50"
              }`}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => onToggleRule(rule)}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {rule.enabled ? "点击禁用" : "点击启用"}
                </TooltipContent>
              </Tooltip>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{rule.name}</p>
                  <Badge
                    variant="outline"
                    className="text-[10px] shrink-0 tabular-nums"
                  >
                    P{rule.priority}
                  </Badge>
                  {rule.member && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {rule.member}
                    </Badge>
                  )}
                  <CreatedByBadge createdBy={rule.source} />
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                    {conditionSummary(rule)}
                  </code>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {rule.accountDisplayName || rule.account?.split(":").pop()}
                  </span>
                </div>
              </div>

              <div className="flex gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(rule)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>编辑</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDelete(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>删除</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            className="w-full border border-dashed text-muted-foreground hover:text-foreground"
            onClick={onAdd}
          >
            <Plus className="mr-1.5 h-3 w-3" />
            添加规则
          </Button>
        </div>
      )}
    </div>
  );
}

function CreatedByBadge({ createdBy }: { createdBy: string }) {
  const config: Record<
    string,
    {
      icon: React.ComponentType<{ className?: string }>;
      className: string;
      label: string;
    }
  > = {
    ai: {
      icon: Bot,
      className:
        "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
      label: "AI",
    },
    user: {
      icon: User,
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      label: "用户",
    },
    system: {
      icon: Zap,
      className:
        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      label: "系统",
    },
  };
  const c = config[createdBy] || config.user;
  const Icon = c.icon;

  return (
    <Badge
      variant="secondary"
      className={`text-[10px] shrink-0 gap-0.5 ${c.className}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </Badge>
  );
}

function conditionSummary(rule: AccountRule): string {
  if (!rule.match?.conditions?.length) return "(无条件)";
  const parts = rule.match.conditions.map((c) => {
    const field = FIELD_LABELS[c.field] || c.field;
    const op =
      c.operator === "contains"
        ? "含"
        : c.operator === "regex"
          ? "~"
          : OPERATOR_LABELS[c.operator] || c.operator;
    return `${field}${op}"${c.value}"`;
  });
  const joiner = rule.match.logic === "ALL" ? " & " : " | ";
  return parts.join(joiner);
}

function skipConditionSummary(rule: SkipRule): string {
  if (!rule.match?.conditions?.length) return "(无条件)";
  const parts = rule.match.conditions.map((c) => {
    const field = FIELD_LABELS[c.field] || c.field;
    const op =
      c.operator === "contains"
        ? "含"
        : c.operator === "regex"
          ? "~"
          : OPERATOR_LABELS[c.operator] || c.operator;
    return `${field}${op}"${c.value}"`;
  });
  const joiner = rule.match.logic === "ALL" ? " & " : " | ";
  return parts.join(joiner);
}

// Client-side condition evaluation for test preview
function evaluateGroupClient(
  tx: {
    counterparty: string;
    description: string;
    paymentMethod: string;
    platformCategory?: string;
    amount: number;
    status: string;
  },
  group: ConditionGroup,
): boolean {
  if (!group.conditions || group.conditions.length === 0) return false;

  const evalCond = (c: MatchCondition): boolean => {
    let fieldValue: string | number | undefined;
    switch (c.field) {
      case "counterparty":
        fieldValue = tx.counterparty;
        break;
      case "description":
        fieldValue = tx.description;
        break;
      case "paymentMethod":
        fieldValue = tx.paymentMethod;
        break;
      case "platformCategory":
        fieldValue = tx.platformCategory;
        break;
      case "amount":
        fieldValue = tx.amount;
        break;
      case "status":
        fieldValue = tx.status;
        break;
      default:
        return false;
    }

    if (c.field === "amount") {
      const numVal =
        typeof fieldValue === "number"
          ? fieldValue
          : parseFloat(String(fieldValue || "0"));
      const cmpVal = parseFloat(c.value);
      if (isNaN(numVal) || isNaN(cmpVal)) return false;
      switch (c.operator) {
        case "gt":
          return numVal > cmpVal;
        case "gte":
          return numVal >= cmpVal;
        case "lt":
          return numVal < cmpVal;
        case "lte":
          return numVal <= cmpVal;
        case "equals":
          return numVal === cmpVal;
        default:
          return false;
      }
    }

    const str = String(fieldValue || "").toLowerCase();
    const pat = c.value.toLowerCase();
    switch (c.operator) {
      case "contains":
        return str.includes(pat);
      case "notContains":
        return !str.includes(pat);
      case "equals":
        return str === pat;
      case "startsWith":
        return str.startsWith(pat);
      case "endsWith":
        return str.endsWith(pat);
      case "regex":
        try {
          return new RegExp(c.value, "i").test(String(fieldValue || ""));
        } catch {
          return false;
        }
      default:
        return false;
    }
  };

  return group.logic === "ALL"
    ? group.conditions.every(evalCond)
    : group.conditions.some(evalCond);
}
