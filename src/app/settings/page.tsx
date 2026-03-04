"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Member, Account } from "@/types";

// ========== Member Management ==========

function MemberSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const fetchMembers = useCallback(async () => {
    const res = await fetch("/api/members");
    if (res.ok) setMembers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleAdd() {
    if (!editingName.trim()) return;
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName.trim() }),
    });
    if (res.ok) {
      toast.success("成员已添加");
      setDialogOpen(false);
      setEditingName("");
      fetchMembers();
    } else {
      const data = await res.json();
      toast.error(data.error || "添加失败");
    }
  }

  async function handleDelete(member: Member) {
    const res = await fetch(`/api/members?id=${member.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("成员已删除");
      fetchMembers();
    } else {
      const data = await res.json();
      toast.error(data.error || "删除失败");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">家庭成员</CardTitle>
            <CardDescription>
              管理家庭成员，上传账单时需要指定归属人
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingName("");
              setDialogOpen(true);
            }}
          >
            添加成员
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无成员，请先添加</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">
                    {m.id}
                  </TableCell>{" "}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeletingMember(m)}
                  >
                    删除
                  </Button>{" "}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>添加家庭成员</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>成员名称</Label>
                <Input
                  placeholder="例如：Shawn"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <p className="text-xs text-muted-foreground">
                  名称将用于账户路径，如 Assets:Shawn:Alipay，建议使用英文
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleAdd} disabled={!editingName.trim()}>
                添加
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!deletingMember}
          onOpenChange={(open) => {
            if (!open) setDeletingMember(null);
          }}
          title={`确定删除成员 "${deletingMember?.name}" 吗？`}
          confirmLabel="删除"
          onConfirm={() => {
            if (deletingMember) handleDelete(deletingMember);
          }}
        />
      </CardContent>
    </Card>
  );
}

// ========== Account Migration ==========

interface MigrationPreview {
  account: Account;
  oldPath: string;
  newPath: string;
}

function MigrationSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [previews, setPreviews] = useState<MigrationPreview[]>([]);
  const [migrating, setMigrating] = useState(false);
  const [migrateConfirmOpen, setMigrateConfirmOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/members").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]).then(([m, a]) => {
      setMembers(m);
      setAccounts(a);
    });
  }, []);

  // Account types that need member prefix
  const MEMBER_TYPES = ["Assets", "Liabilities"];

  function generatePreview(memberId: string) {
    const member = members.find((m) => m.id === memberId);
    if (!member) {
      setPreviews([]);
      return;
    }

    // Preview account migrations
    const accountPreviews: MigrationPreview[] = [];
    for (const acc of accounts) {
      if (!MEMBER_TYPES.includes(acc.type)) continue;
      // Skip if already has member prefix
      const parts = acc.path.split(":");
      if (parts.length >= 2 && members.some((m) => m.name === parts[1]))
        continue;

      const newPath = `${parts[0]}:${member.name}:${parts.slice(1).join(":")}`;
      accountPreviews.push({ account: acc, oldPath: acc.path, newPath });
    }
    setPreviews(accountPreviews);
  }

  function handleMemberChange(memberId: string) {
    setSelectedMember(memberId);
    generatePreview(memberId);
  }

  async function handleMigrate() {
    if (previews.length === 0) return;
    setMigrating(true);
    try {
      for (const p of previews) {
        await fetch("/api/accounts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: p.account.id, path: p.newPath }),
        });
      }

      toast.success("迁移完成");
      const a = await fetch("/api/accounts").then((r) => r.json());
      setAccounts(a);
      setPreviews([]);
      setSelectedMember("");
    } catch {
      toast.error("迁移失败");
    } finally {
      setMigrating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">账户迁移工具</CardTitle>
        <CardDescription>
          将现有 Assets / Liabilities 账户路径添加成员前缀（如 Assets:Alipay →
          Assets:Shawn:Alipay）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">请先添加家庭成员</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label>选择归属成员</Label>
              <div className="flex gap-2">
                {members.map((m) => (
                  <Button
                    key={m.id}
                    variant={selectedMember === m.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleMemberChange(m.id)}
                  >
                    {m.name}
                  </Button>
                ))}
              </div>
            </div>

            {selectedMember && (
              <>
                {previews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    没有需要迁移的账户
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">
                        账户路径变更预览 ({previews.length})
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>账户名称</TableHead>
                            <TableHead>当前路径</TableHead>
                            <TableHead>→</TableHead>
                            <TableHead>迁移后路径</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previews.map((p) => (
                            <TableRow key={p.account.id}>
                              <TableCell>{p.account.name}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {p.oldPath}
                              </TableCell>
                              <TableCell>→</TableCell>
                              <TableCell className="font-mono text-xs">
                                {p.newPath}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      onClick={() => setMigrateConfirmOpen(true)}
                      disabled={migrating}
                    >
                      {migrating
                        ? "迁移中..."
                        : `执行迁移（${previews.length} 项）`}
                    </Button>
                    <ConfirmDialog
                      open={migrateConfirmOpen}
                      onOpenChange={setMigrateConfirmOpen}
                      title="确认迁移"
                      description={`确认将 ${previews.length} 个账户迁移到 ${members.find((m) => m.id === selectedMember)?.name} 名下？`}
                      confirmLabel="确认迁移"
                      variant="default"
                      onConfirm={handleMigrate}
                    />{" "}
                  </>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ========== Settings Page ==========

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted-foreground">管理家庭成员和系统配置</p>
      </div>

      <MemberSection />

      <Separator />

      <MigrationSection />
    </div>
  );
}
