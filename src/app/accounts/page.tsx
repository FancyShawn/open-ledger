"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import type { Account, AccountType, Member } from "@/types";
import { User, Users } from "lucide-react";

const TYPE_LABELS: Record<AccountType, string> = {
  Assets: "资产",
  Liabilities: "负债",
  Expenses: "支出",
  Income: "收入",
  Equity: "权益",
};

const TYPE_ORDER: AccountType[] = [
  "Assets",
  "Liabilities",
  "Expenses",
  "Income",
  "Equity",
];

// Types that support member grouping
const MEMBER_TYPES: AccountType[] = ["Assets", "Liabilities"];

export default function AccountsPage() {
  const { accounts, setAccounts } = useStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ type: "Expenses" as AccountType, name: "", pathSuffix: "" });

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then(setAccounts);
    fetch("/api/members")
      .then((r) => r.json())
      .then(setMembers);
  }, [setAccounts]);

  // Get member names for grouping
  const memberNames = useMemo(() => members.map(m => m.name), [members]);

  // Helper: extract member from path (e.g. "Assets:Shawn:Alipay" -> "Shawn")
  function extractMember(path: string, type: AccountType): string | null {
    if (!MEMBER_TYPES.includes(type)) return null;
    const parts = path.split(":");
    if (parts.length >= 3) {
      const potentialMember = parts[1];
      if (memberNames.includes(potentialMember)) {
        return potentialMember;
      }
    }
    return null;
  }

  // Group accounts by type and member
  const grouped = useMemo(() => {
    return TYPE_ORDER.map((type) => {
      const typeAccounts = accounts.filter((a) => a.type === type);
      
      if (MEMBER_TYPES.includes(type)) {
        // Group by member
        const byMember: Record<string, Account[]> = { __shared__: [] };
        memberNames.forEach(name => { byMember[name] = []; });
        
        for (const acc of typeAccounts) {
          const member = extractMember(acc.path, type);
          if (member && byMember[member]) {
            byMember[member].push(acc);
          } else {
            byMember.__shared__.push(acc);
          }
        }
        
        return {
          type,
          label: TYPE_LABELS[type],
          hasMemberGroups: true,
          memberGroups: byMember,
          items: typeAccounts,
        };
      } else {
        return {
          type,
          label: TYPE_LABELS[type],
          hasMemberGroups: false,
          memberGroups: null,
          items: typeAccounts,
        };
      }
    }).filter((g) => g.items.length > 0 || g.type !== "Equity");
  }, [accounts, memberNames]);

  // Helper: extract suffix from full path
  function extractSuffix(path: string, type: AccountType): string {
    const prefix = type + ":";
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  }

  function openCreate() {
    setEditing(null);
    setForm({ type: "Expenses", name: "", pathSuffix: "" });
    setDialogOpen(true);
  }

  function openEdit(acc: Account) {
    setEditing(acc);
    setForm({ 
      type: acc.type, 
      name: acc.name, 
      pathSuffix: extractSuffix(acc.path, acc.type) 
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.pathSuffix) {
      toast.error("请填写完整");
      return;
    }
    
    // Build full path from type + suffix
    const fullPath = `${form.type}:${form.pathSuffix}`;
    
    try {
      if (editing) {
        const res = await fetch("/api/accounts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...editing, type: form.type, name: form.name, path: fullPath }),
        });
        if (!res.ok) throw new Error("更新失败");
      } else {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: form.type, name: form.name, path: fullPath, currency: "CNY" }),
        });
        if (!res.ok) throw new Error("创建失败");
      }
      const updated = await fetch("/api/accounts").then((r) => r.json());
      setAccounts(updated);
      setDialogOpen(false);
      toast.success(editing ? "已更新" : "已创建");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      const updated = await fetch("/api/accounts").then((r) => r.json());
      setAccounts(updated);
      toast.success("已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  }

  // Render account row
  function AccountRow({ acc }: { acc: Account }) {
    return (
      <div
        className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
      >
        <div>
          <p className="text-sm font-medium">{acc.name}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {acc.path}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(acc)}
          >
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => handleDelete(acc.id)}
          >
            删除
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理 Beancount 账户体系
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          新建账户
        </Button>
      </div>

      <div className="space-y-6">
        {grouped.map((group) => (
          <Card key={group.type}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {group.label}
                <Badge variant="secondary" className="font-normal">
                  {group.type}
                </Badge>
                <span className="text-xs text-muted-foreground font-normal">
                  {group.items.length} 个账户
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无账户</p>
              ) : group.hasMemberGroups && group.memberGroups ? (
                <div className="space-y-4">
                  {/* Member-specific accounts */}
                  {memberNames.map((memberName) => {
                    const memberAccounts = group.memberGroups![memberName];
                    if (memberAccounts.length === 0) return null;
                    return (
                      <div key={memberName}>
                        <div className="flex items-center gap-2 mb-2 px-3">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium text-muted-foreground">
                            {memberName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({memberAccounts.length})
                          </span>
                        </div>
                        <div className="space-y-1 ml-5 border-l pl-3">
                          {memberAccounts.map((acc) => (
                            <AccountRow key={acc.id} acc={acc} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Shared accounts (no member prefix) */}
                  {group.memberGroups!.__shared__.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-3">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">
                          通用
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({group.memberGroups!.__shared__.length})
                        </span>
                      </div>
                      <div className="space-y-1 ml-5 border-l pl-3">
                        {group.memberGroups!.__shared__.map((acc) => (
                          <AccountRow key={acc.id} acc={acc} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {group.items.map((acc) => (
                    <AccountRow key={acc.id} acc={acc} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑账户" : "新建账户"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>账户类型</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as AccountType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]} ({t})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>显示名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：餐饮"
              />
            </div>
            <div className="space-y-2">
              <Label>Beancount 路径</Label>
              <div className="flex items-center gap-0">
                <span className="flex h-9 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm font-mono text-muted-foreground">
                  {form.type}:
                </span>
                <Input
                  value={form.pathSuffix}
                  onChange={(e) => setForm({ ...form, pathSuffix: e.target.value })}
                  placeholder="Food"
                  className="rounded-l-none font-mono text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                完整路径：<code className="bg-muted px-1 rounded">{form.type}:{form.pathSuffix || "..."}</code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>
              {editing ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
