"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import type {
  Transaction,
  TransactionDirection,
  AIClassification,
  Account,
  AccountType,
  AccountRule,
  Member,
  ConditionField,
  ConditionOperator,
} from "@/types";
import { SLOT_LABELS } from "@/types";
import { applyRules } from "@/lib/engine/rule-engine";
import {
  Upload,
  FileSpreadsheet,
  Sparkles,
  Save,
  Check,
  X,
  RefreshCw,
  Search,
  Plus,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  MoreHorizontal,
  Settings2,
  Copy,
  Trash2,
  Wand2,
  Users,
  Info,
  Unlink,
} from "lucide-react";

// Staged file before parsing
interface StagedFile {
  id: string;
  file: File;
  memberId: string;
  detectedSource: string;
}

function detectSource(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "cmb";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "wechat";
  if (lower.endsWith(".csv")) return "alipay";
  return "unknown";
}

function sourceIcon(source: string) {
  const map: Record<string, string> = {
    alipay: "支付宝",
    wechat: "微信",
    cmb: "招行",
    unknown: "未知",
  };
  return map[source] || source;
}

export default function UploadPage() {
  const router = useRouter();
  const {
    addTransactions,
    setLoading,
    loading,
    accounts,
    setAccounts,
    rules,
    setRules,
    draftTransactions,
    setDraftTransactions,
    clearDraftTransactions,
  } = useStore();
  const [result, setResult] = useState<{
    transactions: Transaction[];
    source: string;
    meta: { accountName?: string; totalCount?: number };
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // AI classification state
  const [aiClassifying, setAiClassifying] = useState(false);
  const [aiClassifications, setAiClassifications] = useState<
    Map<string, AIClassification>
  >(new Map());
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Working copy of transactions (persisted in store to survive page navigation)
  const workingTxs = draftTransactions;
  const setWorkingTxs = setDraftTransactions;

  // New account dialog
  const [newAccountDialogOpen, setNewAccountDialogOpen] = useState(false);
  const [newAccountType, setNewAccountType] = useState<AccountType>("Expenses");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountPathSuffix, setNewAccountPathSuffix] = useState("");
  const [pendingAccountCallback, setPendingAccountCallback] = useState<
    ((path: string) => void) | null
  >(null);

  // Transaction detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "skipped">(
    "active",
  );

  // Multi-file upload
  const [members, setMembers] = useState<Member[]>([]);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [batchParsing, setBatchParsing] = useState(false);

  // Load accounts, members, and rules on mount
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then(setAccounts);
    fetch("/api/members")
      .then((r) => r.json())
      .then(setMembers);
    fetch("/api/rules")
      .then((r) => r.json())
      .then(setRules);
  }, [setAccounts, setRules]);

  const ruleMap = useMemo(() => {
    const map = new Map<string, AccountRule>();
    for (const rule of rules) {
      map.set(rule.id, rule);
    }
    return map;
  }, [rules]);

  function detachRuleFromTx(txId: string, side: "credit" | "debit") {
    setWorkingTxs((prev) =>
      prev.map((tx) => {
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
    toast.success("已取消该规则的应用");
  }

  // Stats
  const stats = useMemo(() => {
    if (workingTxs.length === 0) return null;
    const activeTxs = workingTxs.filter((t) => !t.skipReason);
    const skippedCount = workingTxs.length - activeTxs.length;
    const totalExpense = activeTxs
      .filter((t) => t.direction === "expense")
      .reduce((s, t) => s + t.amount, 0);
    const totalIncome = activeTxs
      .filter((t) => t.direction === "income")
      .reduce((s, t) => s + t.amount, 0);
    const unmapped = activeTxs.filter(
      (t) => !t.creditAccount || !t.debitAccount,
    ).length;
    const mapped = activeTxs.length - unmapped;
    return {
      totalExpense,
      totalIncome,
      unmapped,
      mapped,
      total: activeTxs.length,
      skipped: skippedCount,
    };
  }, [workingTxs]);

  const pendingClassifications = Array.from(aiClassifications.values()).filter(
    (c) =>
      !acceptedIds.has(c.transactionId) && !rejectedIds.has(c.transactionId),
  );

  // Filtered transactions based on search and filter
  const filteredTxs = useMemo(() => {
    let result = workingTxs;

    // Apply tab filter
    if (filterTab === "active") {
      result = result.filter((tx) => !tx.skipReason);
    } else if (filterTab === "skipped") {
      result = result.filter((tx) => tx.skipReason);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.counterparty.toLowerCase().includes(query) ||
          tx.description.toLowerCase().includes(query) ||
          tx.paymentMethod.toLowerCase().includes(query),
      );
    }

    return result;
  }, [workingTxs, filterTab, searchQuery]);

  // Stage files for upload (multi-file) with deduplication
  const handleStageFiles = useCallback(
    (files: FileList | File[]) => {
      const defaultMember = members[0];
      const newFiles: StagedFile[] = [];

      for (const file of Array.from(files)) {
        // Check if file already exists (by name + size)
        const isDuplicate = stagedFiles.some(
          (sf) => sf.file.name === file.name && sf.file.size === file.size,
        );

        if (!isDuplicate) {
          newFiles.push({
            id: crypto.randomUUID(),
            file,
            memberId: defaultMember?.id || "",
            detectedSource: detectSource(file.name),
          });
        }
      }

      if (newFiles.length === 0 && files.length > 0) {
        toast.info("文件已存在，已跳过重复文件");
        return;
      }

      const skipped = files.length - newFiles.length;
      if (skipped > 0) {
        toast.info(`已跳过 ${skipped} 个重复文件`);
      }

      setStagedFiles((prev) => [...prev, ...newFiles]);
    },
    [members, stagedFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        handleStageFiles(e.dataTransfer.files);
      }
    },
    [handleStageFiles],
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleStageFiles(e.target.files);
      }
      // Reset input so re-selecting same file works
      e.target.value = "";
    },
    [handleStageFiles],
  );

  function updateStagedFileMember(fileId: string, memberId: string) {
    setStagedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, memberId } : f)),
    );
  }

  function removeStagedFile(fileId: string) {
    setStagedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  // Batch parse all staged files
  async function handleBatchParse() {
    if (stagedFiles.length === 0) return;
    if (members.length > 0 && stagedFiles.some((f) => !f.memberId)) {
      toast.error("请为每个文件指定归属成员");
      return;
    }

    setBatchParsing(true);
    setLoading(true);
    setResult(null);
    setAiClassifications(new Map());
    setAcceptedIds(new Set());
    setRejectedIds(new Set());
    setWorkingTxs([]);

    try {
      const allTransactions: Transaction[] = [];
      let lastSource = "";

      for (const sf of stagedFiles) {
        const formData = new FormData();
        formData.append("file", sf.file);
        formData.append("memberId", sf.memberId);
        const res = await fetch("/api/parse", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          toast.error(`${sf.file.name}: ${err.error || "解析失败"}`);
          continue;
        }
        const data = await res.json();
        lastSource = data.source;

        // Stamp memberId and auto-derive period from transaction date
        const txs = (data.transactions as Transaction[]).map((tx) => ({
          ...tx,
          memberId: sf.memberId,
          period: tx.date ? tx.date.substring(0, 7) : undefined, // YYYY-MM from date
        }));
        allTransactions.push(...txs);
      }

      if (allTransactions.length === 0) {
        toast.error("未解析出任何交易记录");
        return;
      }

      const source = stagedFiles.length === 1 ? lastSource : "mixed";
      setResult({
        transactions: allTransactions,
        source,
        meta: { totalCount: allTransactions.length },
      });
      setWorkingTxs(allTransactions);
      toast.success(
        `解析完成：${allTransactions.length} 笔交易，来自 ${stagedFiles.length} 个文件`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解析失败");
    } finally {
      setBatchParsing(false);
      setLoading(false);
    }
  }

  async function handleAIClassify() {
    if (workingTxs.length === 0) return;
    if (stats?.unmapped === 0) {
      toast.info("所有交易已完成分类");
      return;
    }
    setAiClassifying(true);
    try {
      // Only send uncategorized and non-skipped transactions
      const uncategorized = workingTxs.filter(
        (tx) => !tx.skipReason && (!tx.creditAccount || !tx.debitAccount),
      );

      if (uncategorized.length === 0) {
        toast.info("没有需要分类的交易");
        return;
      }

      const res = await fetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: uncategorized }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "AI 分类失败");
      }
      const data = await res.json();
      const map = new Map<string, AIClassification>();
      for (const c of data.classifications) {
        map.set(c.transactionId, c);
      }
      setAiClassifications(map);
      setAcceptedIds(new Set());
      setRejectedIds(new Set());
      toast.success(
        `AI 为 ${data.classifications.length} 条交易生成了分类建议`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI 分类失败");
    } finally {
      setAiClassifying(false);
    }
  }

  function acceptClassification(txId: string) {
    const c = aiClassifications.get(txId);
    if (!c) return;
    setWorkingTxs((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              creditAccount: c.creditAccount || tx.creditAccount,
              debitAccount: c.debitAccount || tx.debitAccount,
            }
          : tx,
      ),
    );
    setAcceptedIds((prev) => new Set(prev).add(txId));
  }

  function rejectClassification(txId: string) {
    setRejectedIds((prev) => new Set(prev).add(txId));
  }

  function acceptAll() {
    const updates = new Map<string, AIClassification>();
    for (const c of pendingClassifications) {
      updates.set(c.transactionId, c);
    }
    setWorkingTxs((prev) =>
      prev.map((tx) => {
        const cls = updates.get(tx.id);
        return cls
          ? {
              ...tx,
              creditAccount: cls.creditAccount || tx.creditAccount,
              debitAccount: cls.debitAccount || tx.debitAccount,
            }
          : tx;
      }),
    );
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      for (const c of pendingClassifications) next.add(c.transactionId);
      return next;
    });
    toast.success(`已采纳 ${pendingClassifications.length} 条分类`);
  }

  // Manual credit account selection
  function updateTxCreditAccount(txId: string, value: string) {
    setWorkingTxs((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? { ...tx, creditAccount: value, manualOverride: true }
          : tx,
      ),
    );
  }

  // Manual debit account selection
  function updateTxDebitAccount(txId: string, value: string) {
    setWorkingTxs((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? { ...tx, debitAccount: value, manualOverride: true }
          : tx,
      ),
    );
  }

  // Update transaction direction
  function updateTxDirection(txId: string, newDirection: TransactionDirection) {
    setWorkingTxs((prev) => {
      const updated = prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              direction: newDirection,
              manualOverride: false,
              creditAccount: undefined,
              debitAccount: undefined,
              matchedCreditRuleId: undefined,
              matchedDebitRuleId: undefined,
            }
          : tx,
      );
      return applyRules(updated, rules, members);
    });
    setDetailTx((prev) => (prev ? { ...prev, direction: newDirection } : null));
  }

  function openNewAccountDialog(callback: (path: string) => void) {
    setNewAccountType("Expenses");
    setNewAccountName("");
    setNewAccountPathSuffix("");
    setPendingAccountCallback(() => callback);
    setNewAccountDialogOpen(true);
  }

  async function handleCreateAccount() {
    if (!newAccountName || !newAccountPathSuffix) {
      toast.error("请填写账户名称和路径");
      return;
    }
    const fullPath = `${newAccountType}:${newAccountPathSuffix}`;
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newAccountType,
          name: newAccountName,
          path: fullPath,
          currency: "CNY",
        }),
      });
      if (!res.ok) throw new Error("创建失败");
      const updated = await fetch("/api/accounts").then((r) => r.json());
      setAccounts(updated);
      toast.success(`已创建账户: ${fullPath}`);
      if (pendingAccountCallback) {
        pendingAccountCallback(fullPath);
      }
      setNewAccountDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建失败");
    }
  }

  // Create missing account from path (e.g. "Assets:Fancy:Alipay")
  function openCreateMissingAccount(path: string) {
    const parts = path.split(":");
    if (parts.length < 2) {
      toast.error("无效的账户路径");
      return;
    }

    const type = parts[0] as AccountType;
    const suffix = parts.slice(1).join(":");
    const lastPart = parts[parts.length - 1];
    const memberPart = parts.length > 2 ? parts[1] : "";
    const suggestedName = memberPart ? `${memberPart}的${lastPart}` : lastPart;

    setNewAccountType(type);
    setNewAccountPathSuffix(suffix);
    setNewAccountName(suggestedName);
    setPendingAccountCallback(null);
    setNewAccountDialogOpen(true);
  }

  // Apply classification to similar transactions
  function applyToSimilar(tx: Transaction) {
    if (!tx.debitAccount) {
      toast.error("请先为此交易设置借方分类");
      return;
    }

    const similarCount = workingTxs.filter(
      (t) => t.id !== tx.id && t.counterparty === tx.counterparty,
    ).length;

    if (similarCount === 0) {
      toast.info("没有找到相同交易对方的其他交易");
      return;
    }

    setWorkingTxs((prev) =>
      prev.map((t) =>
        t.counterparty === tx.counterparty
          ? {
              ...t,
              debitAccount: tx.debitAccount,
              creditAccount: tx.creditAccount,
            }
          : t,
      ),
    );

    toast.success(`已将分类应用到 ${similarCount} 条相似交易`);
  }

  async function copyTransaction(tx: Transaction) {
    const text = `${tx.date} | ${tx.counterparty} | ${tx.description} | ${
      tx.direction === "income" ? "+" : "-"
    }${tx.amount.toFixed(2)}`;
    await navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  }

  function removeTransaction(txId: string) {
    setWorkingTxs((prev) => prev.filter((t) => t.id !== txId));
    toast.success("已移除");
  }

  function showTransactionDetail(tx: Transaction) {
    setDetailTx(tx);
    setDetailDialogOpen(true);
  }

  async function handleSave() {
    if (workingTxs.length === 0) return;
    setSaving(true);
    try {
      // Only save non-skipped transactions
      const activeTransactions = workingTxs.filter((tx) => !tx.skipReason);
      const skippedCount = workingTxs.length - activeTransactions.length;

      if (activeTransactions.length > 0) {
        addTransactions(activeTransactions);
      }

      // Build toast message
      const parts: string[] = [];
      if (activeTransactions.length > 0) {
        parts.push(`已保存 ${activeTransactions.length} 笔交易`);
      }
      if (skippedCount > 0) {
        parts.push(`跳过 ${skippedCount} 笔`);
      }
      toast.success(parts.join("，"));

      setResult(null);
      setWorkingTxs([]);
      setAiClassifications(new Map());
      setAcceptedIds(new Set());
      setRejectedIds(new Set());
      router.push("/transactions");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function resetUpload() {
    setResult(null);
    setWorkingTxs([]);
    setAiClassifications(new Map());
    setAcceptedIds(new Set());
    setRejectedIds(new Set());
    setStagedFiles([]);
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              上传账单文件，AI 辅助分类，审阅后保存
            </p>
          </div>
          {workingTxs.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAIClassify}
                disabled={aiClassifying || stats?.unmapped === 0}
              >
                {aiClassifying ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    分类中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    AI 分类 ({stats?.unmapped})
                  </>
                )}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    保存交易
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Upload setup - shown when no results yet */}
        {!result && (
          <div className="space-y-4">
            {members.length === 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="flex items-center gap-2 py-3">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <p className="text-sm text-amber-700">
                    尚未配置家庭成员，请先到设置页面添加
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Drop zone */}
            <Card
              className={`border-2 border-dashed transition-all duration-200 ${
                dragActive
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
            >
              <CardContent className="flex flex-col items-center justify-center py-14">
                <div
                  className={`mb-4 rounded-full p-4 transition-colors ${
                    dragActive ? "bg-primary/10" : "bg-muted"
                  }`}
                >
                  <Upload
                    className={`h-8 w-8 transition-colors ${
                      dragActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <p className="text-base font-medium">
                  {dragActive ? "释放以添加文件" : "拖拽账单文件到此处"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  支持同时上传多个文件，为每个文件指定归属成员
                </p>
                <label>
                  <input
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,.xls,.pdf"
                    onChange={onFileSelect}
                    multiple
                    disabled={loading}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    disabled={loading}
                    asChild
                  >
                    <span>
                      <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                      选择文件
                    </span>
                  </Button>
                </label>
                <div className="mt-6 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> 支付宝 CSV
                  </span>
                  <span className="flex items-center gap-1">
                    <FileSpreadsheet className="h-3 w-3" /> 微信 XLSX
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> 招行 PDF
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Staged files list */}
            {stagedFiles.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    已选文件
                    <Badge variant="secondary">{stagedFiles.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {stagedFiles.map((sf) => (
                    <div
                      key={sf.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate flex-1 min-w-0">
                        {sf.file.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {sourceIcon(sf.detectedSource)}
                      </Badge>
                      {members.length > 0 && (
                        <Select
                          value={sf.memberId}
                          onValueChange={(v) =>
                            updateStagedFileMember(sf.id, v)
                          }
                        >
                          <SelectTrigger className="w-28 h-7 text-xs">
                            <SelectValue placeholder="选择成员" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                <div className="flex items-center gap-1.5">
                                  <Users className="h-3 w-3" />
                                  {m.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeStagedFile(sf.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleBatchParse}
                      disabled={batchParsing || stagedFiles.length === 0}
                    >
                      {batchParsing ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          解析中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          开始解析 ({stagedFiles.length} 个文件)
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Result */}
        {result && workingTxs.length > 0 && (
          <>
            {/* Stats */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
              <MiniStatCard
                icon={FileSpreadsheet}
                label={sourceLabel(result.source)}
                value={`${stats?.total} 笔`}
              />
              <MiniStatCard
                icon={TrendingDown}
                label="支出"
                value={`\u00A5${stats?.totalExpense?.toFixed(2)}`}
                className="text-emerald-600"
              />
              <MiniStatCard
                icon={TrendingUp}
                label="收入"
                value={`\u00A5${stats?.totalIncome?.toFixed(2)}`}
                className="text-rose-600"
              />
              <MiniStatCard
                icon={stats?.unmapped ? AlertCircle : CheckCircle2}
                label={stats?.unmapped ? "待分类" : "全部完成"}
                value={
                  stats?.unmapped
                    ? `${stats.unmapped} 笔`
                    : `${stats?.mapped} 笔`
                }
                className={
                  stats?.unmapped ? "text-amber-600" : "text-emerald-600"
                }
              />
              {(stats?.skipped ?? 0) > 0 && (
                <MiniStatCard
                  icon={X}
                  label="已跳过"
                  value={`${stats?.skipped} 笔`}
                  className="text-muted-foreground"
                />
              )}
            </div>

            {/* AI bar */}
            {pendingClassifications.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-600" />
                    <p className="text-sm">
                      AI 建议了{" "}
                      <span className="font-semibold">
                        {pendingClassifications.length}
                      </span>{" "}
                      条分类
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={acceptAll}>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    全部采纳
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Action bar */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <Tabs
                  value={filterTab}
                  onValueChange={(v) => setFilterTab(v as typeof filterTab)}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="active" className="text-xs px-3 h-7">
                      有效 {stats?.total}
                    </TabsTrigger>
                    <TabsTrigger value="skipped" className="text-xs px-3 h-7">
                      跳过 {stats?.skipped || 0}
                    </TabsTrigger>
                    <TabsTrigger value="all" className="text-xs px-3 h-7">
                      全部 {workingTxs.length}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative max-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="搜索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-muted-foreground"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {searchQuery && filteredTxs.length !== workingTxs.length && (
                  <span className="text-xs text-muted-foreground">
                    {filteredTxs.length} 条结果
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={resetUpload}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  重新上传
                </Button>
              </div>
            </div>

            {/* Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">交易明细</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[1000px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[88px]">时间</TableHead>
                        {members.length > 0 && (
                          <TableHead className="w-[56px]">成员</TableHead>
                        )}
                        <TableHead className="w-[60px]">类型</TableHead>
                        <TableHead className="w-[100px]">支付方式</TableHead>
                        <TableHead className="w-[150px]">交易对方</TableHead>
                        <TableHead className="min-w-[140px]">描述</TableHead>
                        <TableHead className="text-right w-[80px]">
                          金额
                        </TableHead>
                        <TableHead className="w-[130px]">贷方</TableHead>
                        <TableHead className="w-[130px]">借方</TableHead>
                        <TableHead className="w-[56px] text-center">
                          操作
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTxs.map((tx) => {
                        const c = aiClassifications.get(tx.id);
                        const isPending =
                          c &&
                          !acceptedIds.has(tx.id) &&
                          !rejectedIds.has(tx.id);
                        const isAccepted = acceptedIds.has(tx.id);
                        const isRejected = rejectedIds.has(tx.id);
                        const isClassified =
                          tx.creditAccount && tx.debitAccount;
                        const labels =
                          SLOT_LABELS[tx.direction] || SLOT_LABELS.expense;

                        const similarCount = workingTxs.filter(
                          (t) =>
                            t.id !== tx.id &&
                            t.counterparty === tx.counterparty,
                        ).length;

                        const isSkipped = !!tx.skipReason;

                        return (
                          <TableRow
                            key={tx.id}
                            className={
                              isSkipped
                                ? "bg-muted/50 opacity-60"
                                : isPending
                                  ? "bg-amber-50/80 dark:bg-amber-950/20"
                                  : isAccepted
                                    ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                                    : ""
                            }
                          >
                            <TableCell className="tabular-nums text-xs font-medium">
                              <div className="flex items-center gap-1">
                                <Tooltip>
                                  <TooltipTrigger className="cursor-default">
                                    {formatDateTime(tx.date)}
                                  </TooltipTrigger>
                                  <TooltipContent>{tx.date}</TooltipContent>
                                </Tooltip>
                                {isSkipped && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0 h-4 text-muted-foreground"
                                      >
                                        跳过
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {tx.skipReason} - 不计入账本
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
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
                            <TableCell>
                              <DirectionBadge
                                direction={tx.direction}
                                onChange={(newDir) =>
                                  updateTxDirection(tx.id, newDir)
                                }
                              />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <Tooltip>
                                <TooltipTrigger className="truncate block cursor-default max-w-[90px]">
                                  {tx.paymentMethod || "-"}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {tx.paymentMethod || "无"}
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-1">
                                <Tooltip>
                                  <TooltipTrigger className="truncate block cursor-default max-w-[120px]">
                                    {tx.counterparty}
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    {tx.counterparty}
                                  </TooltipContent>
                                </Tooltip>
                                {similarCount > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1 py-0 h-4 shrink-0"
                                  >
                                    {similarCount}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <Tooltip>
                                <TooltipTrigger className="truncate block cursor-default max-w-[130px]">
                                  {tx.description || "-"}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {tx.description || "无"}
                                </TooltipContent>
                              </Tooltip>
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
                            {/* Credit account */}
                            <TableCell>
                              {isSkipped ? (
                                <span className="text-xs text-muted-foreground">
                                  -
                                </span>
                              ) : isPending && c?.creditAccount ? (
                                <AIBadge
                                  value={c.creditAccount}
                                  confidence={c.confidence}
                                  reason={c.reason}
                                />
                              ) : (
                                <AccountSelector
                                  value={tx.creditAccount}
                                  label={labels.credit}
                                  accounts={accounts}
                                  onChange={(v) =>
                                    updateTxCreditAccount(tx.id, v)
                                  }
                                  onCreateNew={openNewAccountDialog}
                                  onCreateMissingAccount={
                                    openCreateMissingAccount
                                  }
                                />
                              )}
                            </TableCell>
                            {/* Debit account */}
                            <TableCell>
                              {isSkipped ? (
                                <span className="text-xs text-muted-foreground">
                                  -
                                </span>
                              ) : isPending && c?.debitAccount ? (
                                <AIBadge
                                  value={c.debitAccount}
                                  confidence={c.confidence}
                                  reason={c.reason}
                                />
                              ) : (
                                <AccountSelector
                                  value={tx.debitAccount}
                                  label={labels.debit}
                                  accounts={accounts}
                                  onChange={(v) =>
                                    updateTxDebitAccount(tx.id, v)
                                  }
                                  onCreateNew={openNewAccountDialog}
                                  onCreateMissingAccount={
                                    openCreateMissingAccount
                                  }
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {isPending && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
                                          onClick={() =>
                                            acceptClassification(tx.id)
                                          }
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>采纳</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-100"
                                          onClick={() =>
                                            rejectClassification(tx.id)
                                          }
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>拒绝</TooltipContent>
                                    </Tooltip>
                                  </>
                                )}

                                {isAccepted && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] bg-emerald-100 text-emerald-700"
                                  >
                                    <Check className="mr-0.5 h-3 w-3" />
                                    已采纳
                                  </Badge>
                                )}
                                {isRejected && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] text-muted-foreground"
                                  >
                                    已拒绝
                                  </Badge>
                                )}

                                {!isPending && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                          onClick={() =>
                                            showTransactionDetail(tx)
                                          }
                                        >
                                          <Info className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>查看详情</TooltipContent>
                                    </Tooltip>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                        >
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        className="w-48"
                                      >
                                        <DropdownMenuItem
                                          onClick={() => applyToSimilar(tx)}
                                          disabled={
                                            !isClassified || similarCount === 0
                                          }
                                        >
                                          <Users className="mr-2 h-4 w-4" />
                                          应用到相似 ({similarCount})
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => copyTransaction(tx)}
                                        >
                                          <Copy className="mr-2 h-4 w-4" />
                                          复制信息
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() =>
                                            removeTransaction(tx.id)
                                          }
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          移除此条
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* New account dialog */}
        <Dialog
          open={newAccountDialogOpen}
          onOpenChange={setNewAccountDialogOpen}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                新建账户
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>账户类型</Label>
                <Select
                  value={newAccountType}
                  onValueChange={(v) => setNewAccountType(v as AccountType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Assets">资产 (Assets)</SelectItem>
                    <SelectItem value="Liabilities">
                      负债 (Liabilities)
                    </SelectItem>
                    <SelectItem value="Expenses">支出 (Expenses)</SelectItem>
                    <SelectItem value="Income">收入 (Income)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>账户名称（中文）</Label>
                <Input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="如：餐饮"
                />
              </div>
              <div className="space-y-2">
                <Label>账户路径</Label>
                <div className="flex items-center gap-0">
                  <span className="flex h-9 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm font-mono text-muted-foreground">
                    {newAccountType}:
                  </span>
                  <Input
                    value={newAccountPathSuffix}
                    onChange={(e) => setNewAccountPathSuffix(e.target.value)}
                    placeholder="Food"
                    className="rounded-l-none font-mono text-sm"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setNewAccountDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleCreateAccount}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transaction detail dialog */}
        <Sheet open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto" side="right">
            <SheetHeader className="pb-3">
              <SheetTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                交易详情
              </SheetTitle>
              <SheetDescription>
                原始记录的完整信息，可用于定义分类规则
              </SheetDescription>
            </SheetHeader>

            {detailTx && (
              <div className="flex-1 overflow-y-auto px-5 space-y-4 min-h-0">
                {/* 基本信息 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      基本信息
                    </span>
                    <Badge
                      variant={
                        detailTx.direction === "income"
                          ? "destructive"
                          : "default"
                      }
                      className="text-[10px] cursor-pointer hover:opacity-80"
                      onClick={() => {
                        // Toggle between income and expense
                        updateTxDirection(detailTx.id, detailTx.direction === "income" ? "expense" : "income");
                      }}
                    >
                      {detailTx.direction === "income" ? "收入" : "支出"}
                    </Badge>
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {detailTx.date}
                      </span>
                      <span
                        className={`text-base font-semibold tabular-nums ${
                          detailTx.direction === "income"
                            ? "text-rose-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {detailTx.direction === "income" ? "+" : "-"}
                        {detailTx.amount.toFixed(2)}
                      </span>
                    </div>
                    <DetailRow
                      label="交易对方"
                      value={detailTx.counterparty}
                      mono
                    />
                    <DetailRow
                      label="描述/备注"
                      value={detailTx.description}
                      mono
                    />
                    <DetailRow
                      label="支付方式"
                      value={detailTx.paymentMethod}
                      mono
                    />
                    <DetailRow
                      label="平台分类"
                      value={detailTx.platformCategory || "-"}
                    />
                    <DetailRow label="交易状态" value={detailTx.status} />
                    <DetailRow
                      label="订单号"
                      value={detailTx.orderId || "-"}
                      mono
                    />
                    <DetailRow
                      label="账单来源"
                      value={sourceLabel(detailTx.source)}
                    />
                  </div>
                </div>

                {/* 账户与规则 */}
                {(detailTx.creditAccount ||
                  detailTx.debitAccount ||
                  detailTx.matchedCreditRuleId ||
                  detailTx.matchedDebitRuleId) && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      账户与规则
                    </span>
                    <div className="rounded-md border p-3 space-y-2">
                      {detailTx.creditAccount && (
                        <DetailRow
                          label="贷方账户"
                          value={detailTx.creditAccount}
                        />
                      )}
                      {detailTx.matchedCreditRuleId &&
                        ruleMap.has(detailTx.matchedCreditRuleId) && (
                          <RuleDetailCard
                            label="贷方规则"
                            rule={ruleMap.get(detailTx.matchedCreditRuleId)!}
                            onDetach={() => {
                              detachRuleFromTx(detailTx.id, "credit");
                              setDetailDialogOpen(false);
                            }}
                          />
                        )}
                      {detailTx.debitAccount && (
                        <DetailRow
                          label="借方账户"
                          value={detailTx.debitAccount}
                        />
                      )}
                      {detailTx.matchedDebitRuleId &&
                        ruleMap.has(detailTx.matchedDebitRuleId) && (
                          <RuleDetailCard
                            label="借方规则"
                            rule={ruleMap.get(detailTx.matchedDebitRuleId)!}
                            onDetach={() => {
                              detachRuleFromTx(detailTx.id, "debit");
                              setDetailDialogOpen(false);
                            }}
                          />
                        )}
                    </div>
                  </div>
                )}

                {/* 原始数据 */}
                {detailTx.rawData &&
                  Object.keys(detailTx.rawData).length > 0 && (
                    <div className="space-y-2 pb-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        原始记录（账单文件）
                      </span>
                      <div className="bg-muted/50 rounded-md p-2.5 space-y-1">
                        {Object.entries(detailTx.rawData).map(
                          ([key, value]) => (
                            <div key={key} className="flex gap-2 text-xs">
                              <span
                                className="text-muted-foreground shrink-0 w-24 truncate"
                                title={key}
                              >
                                {key}
                              </span>
                              <span className="font-mono text-foreground break-all">
                                {value}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}

            <SheetFooter className="flex-row gap-2 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => detailTx && copyTransaction(detailTx)}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                复制信息
              </Button>
              <Button size="sm" onClick={() => setDetailDialogOpen(false)}>
                关闭
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
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
            className={`text-sm font-semibold tabular-nums truncate ${className || ""}`}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DirectionBadge({
  direction,
  onChange,
}: {
  direction: TransactionDirection;
  onChange?: (newDirection: TransactionDirection) => void;
}) {
  const map: Record<TransactionDirection, { label: string; className: string }> = {
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

function AIBadge({
  value,
  confidence,
  reason,
}: {
  value: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}) {
  const confidenceColors = {
    high: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    medium:
      "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    low: "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
  };
  const confidenceLabels = { high: "高", medium: "中", low: "低" };

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge
          variant="outline"
          className={`text-[10px] font-normal cursor-help ${confidenceColors[confidence]}`}
        >
          <Sparkles className="mr-0.5 h-2.5 w-2.5" />
          {value.split(":").pop()}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <p className="text-xs font-medium">{value}</p>
          <p className="text-xs text-muted-foreground">{reason}</p>
          <p className="text-[10px] text-muted-foreground">
            置信度: {confidenceLabels[confidence]}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function AccountSelector({
  value,
  label,
  accounts,
  onChange,
  onCreateNew,
  onCreateMissingAccount,
}: {
  value?: string;
  label: string;
  accounts: Account[];
  onChange: (value: string) => void;
  onCreateNew: (callback: (path: string) => void) => void;
  onCreateMissingAccount?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isUnmapped = !value;

  // Find the matching account to show its Chinese name
  const matchedAccount = accounts.find((a) => a.path === value);

  let displayValue = "未分类";
  if (!isUnmapped && value) {
    if (matchedAccount?.name) {
      displayValue = matchedAccount.name;
    } else {
      const parts = value.split(":");
      displayValue = parts[parts.length - 1];
    }
  }

  const isMissingAccount = !isUnmapped && !matchedAccount;

  const filteredAccounts = useMemo(() => {
    const query = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        a.path.toLowerCase().includes(query),
    );
  }, [accounts, search]);

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    for (const a of filteredAccounts) {
      if (!groups[a.type]) groups[a.type] = [];
      groups[a.type].push(a);
    }
    return groups;
  }, [filteredAccounts]);

  const typeLabels: Record<string, string> = {
    Expenses: "支出",
    Income: "收入",
    Assets: "资产",
    Liabilities: "负债",
    Equity: "权益",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant={
            isUnmapped
              ? "destructive"
              : isMissingAccount
                ? "outline"
                : "secondary"
          }
          className={`text-[10px] font-normal cursor-pointer hover:opacity-80 transition-opacity ${
            isMissingAccount
              ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
              : ""
          }`}
          title={isMissingAccount ? `账户 ${value} 不存在，点击创建` : label}
        >
          {displayValue}
          {isMissingAccount && (
            <AlertCircle className="ml-0.5 h-3 w-3 shrink-0" />
          )}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {isMissingAccount && value && (
          <div className="p-2 border-b bg-amber-50/50 dark:bg-amber-950/20">
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-1.5">
              账户「{value.length > 25 ? value.substring(0, 25) + "..." : value}
              」不存在
            </p>
            <button
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={() => {
                setOpen(false);
                onCreateMissingAccount?.(value);
              }}
            >
              <Plus className="h-3 w-3" />
              创建此账户
            </button>
          </div>
        )}

        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索账户..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto p-1">
          {Object.entries(groupedAccounts).map(([typeName, accs]) => (
            <div key={typeName} className="mb-1">
              <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {typeLabels[typeName] || typeName}
              </p>
              {accs.map((a) => (
                <button
                  key={a.id}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded-md flex items-center justify-between transition-colors ${
                    value === a.path
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => {
                    onChange(a.path);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="truncate">{a.name}</span>
                  {value === a.path && (
                    <Check className="h-3.5 w-3.5 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ))}
          {filteredAccounts.length === 0 && (
            <p className="px-2 py-4 text-sm text-center text-muted-foreground">
              未找到匹配的账户
            </p>
          )}
        </div>

        <div className="border-t p-1 space-y-0.5">
          {!isUnmapped && (
            <button
              className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted text-muted-foreground flex items-center gap-1.5 transition-colors"
              onClick={() => {
                onChange("");
                setOpen(false);
                setSearch("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              清除选择
            </button>
          )}
          <button
            className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted text-primary flex items-center gap-1.5 transition-colors"
            onClick={() => {
              setOpen(false);
              setSearch("");
              onCreateNew((path) => onChange(path));
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            新建账户
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Format datetime for display: "MM-DD HH:mm" or "YYYY-MM-DD" for date only
function formatDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  if (dateStr.includes(" ")) {
    const [datePart, timePart] = dateStr.split(" ");
    const [, month, day] = datePart.split("-");
    const [hour, minute] = timePart.split(":");
    return `${month}-${day} ${hour}:${minute}`;
  }
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[1]}-${parts[2]}`;
  }
  return dateStr;
}

function sourceLabel(source: string) {
  const map: Record<string, string> = {
    alipay: "支付宝",
    wechat: "微信",
    cmb: "招商银行",
  };
  return map[source] || source;
}

function DetailRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={`text-sm flex-1 break-all ${mono ? "font-mono bg-muted px-1.5 py-0.5 rounded text-xs" : ""} ${className || ""}`}
      >
        {value}
      </span>
    </div>
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

function RuleDetailCard({
  label,
  rule,
  onDetach,
}: {
  label: string;
  rule: AccountRule;
  onDetach: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex-1 space-y-1.5 bg-muted/40 rounded-md p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{rule.name}</span>
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
        <p className="text-[11px] text-muted-foreground">
          目标账户：{rule.accountDisplayName || rule.account}
        </p>
        <div className="space-y-0.5">
          <p className="text-[11px] text-muted-foreground">
            匹配条件（{rule.match.logic === "ALL" ? "全部满足" : "任一满足"}）
          </p>
          {rule.match.conditions.map((condition, index) => (
            <div
              key={index}
              className="flex items-center gap-1 text-[11px] bg-background/60 rounded px-1.5 py-0.5"
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
        <button
          className="flex items-center gap-1 text-[11px] text-destructive hover:underline mt-1"
          onClick={onDetach}
        >
          <Unlink className="h-3 w-3" />
          取消应用该规则
        </button>
      </div>
    </div>
  );
}
