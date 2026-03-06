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
import { Switch } from "@/components/ui/switch";
import type { Member } from "@/types";

interface AIConfig {
  enabled: boolean;
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
}

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

// ========== AI Config ==========

function AIConfigSection() {
  const [config, setConfig] = useState<AIConfig>({
    enabled: false,
    provider: "openai",
    base_url: "",
    api_key: "",
    model: "",
    temperature: 0.3,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ai/config")
      .then((r) => r.json())
      .then(setConfig)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("AI 配置已保存");
      } else {
        const data = await res.json();
        toast.error(data.error || "保存失败");
      }
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI 配置</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">加载中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">AI 配置</CardTitle>
            <CardDescription>
              配置 AI 接口用于智能分类和解析
            </CardDescription>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) =>
              setConfig({ ...config, enabled: checked })
            }
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Input
              placeholder="openai"
              value={config.provider}
              onChange={(e) =>
                setConfig({ ...config, provider: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Input
              placeholder="gpt-4o-mini"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Base URL</Label>
          <Input
            placeholder="https://api.openai.com/v1"
            value={config.base_url}
            onChange={(e) =>
              setConfig({ ...config, base_url: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
            type="password"
            placeholder="sk-..."
            value={config.api_key}
            onChange={(e) =>
              setConfig({ ...config, api_key: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Temperature ({config.temperature})</Label>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={config.temperature}
            onChange={(e) =>
              setConfig({
                ...config,
                temperature: parseFloat(e.target.value) || 0.3,
              })
            }
          />
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存配置"}
        </Button>
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

      <AIConfigSection />
    </div>
  );
}
