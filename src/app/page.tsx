"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import {
  Upload,
  List,
  FileText,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Settings,
} from "lucide-react";

export default function HomePage() {
  const { transactions } = useStore();

  const totalTx = transactions.length;
  const totalExpense = transactions
    .filter((t) => t.direction === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const totalIncome = transactions
    .filter((t) => t.direction === "income")
    .reduce((s, t) => s + t.amount, 0);
  const unmapped = transactions.filter(
    (t) => !t.creditAccount || !t.debitAccount,
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          账单解析 · 规则映射 · Beancount 导出
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          title="交易笔数"
          value={totalTx.toString()}
          suffix="笔"
        />
        <StatCard
          icon={TrendingDown}
          title="支出总额"
          value={totalExpense.toFixed(2)}
          prefix="¥"
          className="text-emerald-600"
        />
        <StatCard
          icon={TrendingUp}
          title="收入总额"
          value={totalIncome.toFixed(2)}
          prefix="¥"
          className="text-rose-600"
        />
        <StatCard
          icon={AlertCircle}
          title="待映射"
          value={unmapped.toString()}
          suffix="笔"
          accent={unmapped > 0}
          className={unmapped > 0 ? "text-amber-600" : ""}
        />
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">快速操作</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            icon={Upload}
            title="上传账单"
            description="解析账单，AI 分类，审阅保存"
            href="/upload"
            primary
          />
          <ActionCard
            icon={Settings}
            title="规则管理"
            description="统一规则：支付账户 + 消费分类"
            href="/rules"
          />
          <ActionCard
            icon={List}
            title="账单记录"
            description="查看历史，导出 Beancount"
            href="/transactions"
          />
        </div>
      </div>

      {/* Empty state hint */}
      {totalTx === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-primary/10 p-3">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-base font-medium">开始使用</h3>
            <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
              上传你的第一份账单文件，AI 将帮助你自动分类交易，生成 Beancount
              格式的复式记账记录
            </p>
            <Button asChild className="mt-4">
              <Link href="/upload">
                <Upload className="mr-2 h-4 w-4" />
                上传账单
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  prefix,
  suffix,
  accent,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  prefix?: string;
  suffix?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <Card className={accent ? "border-amber-200 dark:border-amber-900" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">
          {title}
        </CardTitle>
        <div className="rounded-md bg-muted p-1.5">
          <Icon className={`h-4 w-4 ${className || "text-muted-foreground"}`} />
        </div>
      </CardHeader>
      <CardContent>
        <p
          className={`text-2xl font-semibold tabular-nums ${
            accent ? "text-amber-600" : className || ""
          }`}
        >
          {prefix}
          {value}
          {suffix && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {suffix}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  href,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link href={href} className="group">
      <Card
        className={`h-full transition-all duration-200 hover:shadow-md ${
          primary
            ? "border-primary/30 bg-primary/5 hover:border-primary/50"
            : "hover:border-muted-foreground/30"
        }`}
      >
        <CardContent className="flex flex-col h-full pt-5">
          <div
            className={`mb-3 w-fit rounded-lg p-2 ${
              primary ? "bg-primary/10" : "bg-muted"
            }`}
          >
            <Icon
              className={`h-5 w-5 ${
                primary ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </div>
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground flex-1">
            {description}
          </p>
          <div className="mt-4 flex items-center text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            前往
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
