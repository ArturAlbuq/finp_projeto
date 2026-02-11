import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Target, ArrowUpCircle, ArrowDownCircle, Download, Upload, RefreshCcw } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// FinP — Single-file React app (localStorage). No login.
// - Transactions (income/expense)
// - Dashboard + charts (with range selector)
// - Goals with manual contributions (not tied to net balance)
// - Export/Import JSON backup

const LS_KEY = "finp:v1";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// New theme request:
const GOLD = "#d4af37";

// Deep tones that match gold (requested):
// - Gastos: deep red
// - Receitas: deep green
const BAR_COLOR_GASTOS = "#4b0f1a";
const BAR_COLOR_RECEITAS = "#0f3d2e";

// Paleta para o gráfico de pizza (categorias)
const PIE_COLORS = [
  "#d4af37", // gold
  "#3b82f6", // blue
  "#22c55e", // green
  "#a855f7", // purple
  "#f97316", // orange
  "#06b6d4", // cyan
  "#ef4444", // red
  "#84cc16", // lime
  "#e11d48", // rose
  "#f59e0b", // amber
  "#10b981", // emerald
  "#6366f1", // indigo
];

function startOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}

function isoToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

const DEFAULT_CATEGORIES = [
  "Alimentação",
  "Transporte",
  "Moradia",
  "Internet/Telefone",
  "Saúde",
  "Educação",
  "Lazer",
  "Compras",
  "Assinaturas",
  "Outros",
];

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function toNumberBR(input) {
  // Accepts "12,34" or "12.34" or "1.234,56"
  if (typeof input !== "string") return 0;
  const s = input
    .trim()
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function monthKey(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  // "fev/26" — compacto e legível no eixo
  return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") + "/" + String(y).slice(2);
}

function makeActiveMonthISO(year, monthIndex0) {
  const d = new Date(year, monthIndex0, 1);
  return d.toISOString().slice(0, 10);
}

function monthNamePT(monthIndex0) {
  const d = new Date(2026, monthIndex0, 1);
  return d.toLocaleDateString("pt-BR", { month: "long" });
}

function getYearFromIso(iso) {
  return new Date(iso + "T00:00:00").getFullYear();
}

export default function FinPApp() {
  const [state, setState] = useState(() => {
    const loaded = typeof window !== "undefined" ? loadState() : null;

    const base =
      loaded ||
      ({
        version: 1,
        currency: "BRL",
        categories: DEFAULT_CATEGORIES,
        transactions: [],
        goals: [],
      });

    // Migration: ensure goal.saved exists
    const migratedGoals = (base.goals || []).map((g) => ({
      ...g,
      saved: typeof g.saved === "number" ? g.saved : 0,
    }));

    return { ...base, goals: migratedGoals };
  });

  const now = new Date();
  const currentYear = now.getFullYear();

  const [year, setYear] = useState(() => Math.max(2026, currentYear));
  const [monthIndex0, setMonthIndex0] = useState(() => now.getMonth());

  const activeMonth = useMemo(() => makeActiveMonthISO(year, monthIndex0), [year, monthIndex0]);

  const [trendRange, setTrendRange] = useState("6m"); // month | 6m | 1y | all

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Years selector: start at 2026, extend to current year + include any year that exists in transactions
  const years = useMemo(() => {
    const set = new Set();
    set.add(2026);
    set.add(currentYear);
    for (const t of state.transactions) {
      set.add(getYearFromIso(t.date));
    }
    const arr = Array.from(set).sort((a, b) => a - b);
    const min = Math.min(...arr, 2026);
    const max = Math.max(...arr, currentYear);
    const full = [];
    for (let y = min; y <= max; y++) full.push(y);
    return full;
  }, [state.transactions, currentYear]);

  // Months selector: all 12 months
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({ idx: i, name: monthNamePT(i) }));
  }, []);

  useEffect(() => {
    if (!years.includes(year)) setYear(years[years.length - 1] || 2026);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years]);

  const monthTransactions = useMemo(() => {
    const start = new Date(activeMonth + "T00:00:00");
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return state.transactions
      .filter((t) => {
        const d = new Date(t.date + "T00:00:00");
        return d >= start && d < end;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [state.transactions, activeMonth]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of monthTransactions) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    const balance = income - expense;
    return { income, expense, balance };
  }, [monthTransactions]);

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const t of monthTransactions) {
      if (t.type !== "expense") continue;
      map.set(t.category, (map.get(t.category) || 0) + t.amount);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthTransactions]);

  const trendData = useMemo(() => {
    const txs = state.transactions;
    if (txs.length === 0) return [];

    // sums by month key
    const map = new Map();
    for (const t of txs) {
      const k = monthKey(t.date);
      const row = map.get(k) || { key: k, Receitas: 0, Gastos: 0 };
      if (t.type === "income") row.Receitas += t.amount;
      else row.Gastos += t.amount;
      map.set(k, row);
    }
    const byM = Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));

    const activeK = monthKey(activeMonth);

    if (trendRange === "month") {
      const found = byM.find((r) => r.key === activeK) || { key: activeK, Receitas: 0, Gastos: 0 };
      return [{ label: monthLabelFromKey(found.key), Receitas: found.Receitas, Gastos: found.Gastos }];
    }

    const base = new Date(activeMonth + "T00:00:00");

    if (trendRange === "6m") {
      const result = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const k = monthKey(d.toISOString().slice(0, 10));
        const row = byM.find((x) => x.key === k) || { key: k, Receitas: 0, Gastos: 0 };
        result.push({ label: monthLabelFromKey(row.key), Receitas: row.Receitas, Gastos: row.Gastos });
      }
      return result;
    }

    if (trendRange === "1y") {
      const result = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const k = monthKey(d.toISOString().slice(0, 10));
        const row = byM.find((x) => x.key === k) || { key: k, Receitas: 0, Gastos: 0 };
        result.push({ label: monthLabelFromKey(row.key), Receitas: row.Receitas, Gastos: row.Gastos });
      }
      return result;
    }

    // all time:
    // If many months, aggregate by year to keep readable.
    if (byM.length > 36) {
      const mapY = new Map();
      for (const r of byM) {
        const [y] = r.key.split("-");
        const row = mapY.get(y) || { label: y, Receitas: 0, Gastos: 0 };
        row.Receitas += r.Receitas;
        row.Gastos += r.Gastos;
        mapY.set(y, row);
      }
      return Array.from(mapY.values()).sort((a, b) => (a.label < b.label ? -1 : 1));
    }

    return byM.map((r) => ({ label: monthLabelFromKey(r.key), Receitas: r.Receitas, Gastos: r.Gastos }));
  }, [state.transactions, activeMonth, trendRange]);

  function addTransaction(tx) {
    setState((s) => ({ ...s, transactions: [tx, ...s.transactions] }));
  }

  function deleteTransaction(id) {
    setState((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== id) }));
  }

  function addGoal(goal) {
    setState((s) => ({ ...s, goals: [goal, ...s.goals] }));
  }

  function deleteGoal(id) {
    setState((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) }));
  }

  function contributeToGoal(goalId, amount) {
    if (!(amount > 0)) return;
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => (g.id === goalId ? { ...g, saved: (g.saved || 0) + amount } : g)),
    }));
  }

  function resetAll() {
    setState({
      version: 1,
      currency: "BRL",
      categories: DEFAULT_CATEGORIES,
      transactions: [],
      goals: [],
    });
    const d = new Date();
    setYear(Math.max(2026, d.getFullYear()));
    setMonthIndex0(d.getMonth());
  }

  // Theme helpers
  const cardCls = "bg-zinc-950 shadow-[0_10px_30px_rgba(0,0,0,0.45)]";
  const cardStyle = { border: `1px solid rgba(212,175,55,0.22)` };
  const softText = "text-zinc-300";

  // Common dropdown styles (fix invisible black text on dark theme)
  const selectContentCls = "bg-zinc-950 text-white border-zinc-800";
  const selectItemCls = "text-white focus:bg-zinc-900 focus:text-white";

  // Total guardado (acumulado): soma de todas as receitas - soma de todos os gastos
  // (não inclui valores de metas separadamente; metas são apenas um “objetivo”, não um saldo extra)
  const totalGuardado = useMemo(
    () =>
      state.transactions.reduce(
        (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
        0
      ),
    [state.transactions]
  );

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: GOLD }}>
                FinP
              </div>
              <Badge className="border" style={{ borderColor: GOLD, color: GOLD, background: "transparent" }}>
                pessoal
              </Badge>
            </div>
            <div className={`text-sm ${softText}`}>Controle simples de receitas, gastos e metas — tudo salvo no seu aparelho (sem login).</div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="grid grid-cols-2 gap-2 w-full sm:w-[340px]">
              <div>
                <Label className={`text-xs ${softText}`}>Ano</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-white">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)} className={selectItemCls}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className={`text-xs ${softText}`}>Mês</Label>
                <Select value={String(monthIndex0)} onValueChange={(v) => setMonthIndex0(Number(v))}>
                  <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-white">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    {months.map((m) => (
                      <SelectItem key={m.idx} value={String(m.idx)} className={selectItemCls}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className={`lg:col-span-2 ${cardCls}`} style={cardStyle}>
            <CardContent className="p-4 sm:p-6">
              <Tabs defaultValue="dashboard">
                <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border border-zinc-800">
                  <TabsTrigger className="text-white data-[state=active]:text-black data-[state=active]:bg-[var(--gold)]" style={{ "--gold": GOLD }} value="dashboard">
                    Resumo
                  </TabsTrigger>
                  <TabsTrigger className="text-white data-[state=active]:text-black data-[state=active]:bg-[var(--gold)]" style={{ "--gold": GOLD }} value="mov">
                    Movimentos
                  </TabsTrigger>
                  <TabsTrigger className="text-white data-[state=active]:text-black data-[state=active]:bg-[var(--gold)]" style={{ "--gold": GOLD }} value="metas">
                    Metas
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatCard title="Receitas" value={currency.format(totals.income)} icon={<ArrowUpCircle className="h-5 w-5" />} cardCls={cardCls} cardStyle={cardStyle} softText={softText} />
                    <StatCard title="Gastos" value={currency.format(totals.expense)} icon={<ArrowDownCircle className="h-5 w-5" />} cardCls={cardCls} cardStyle={cardStyle} softText={softText} />
                    <StatCard
                      title="Saldo do mês"
                      value={currency.format(totals.balance)}
                      emphasis={totals.balance < 0 ? "negative" : totals.balance > 0 ? "positive" : "neutral"}
                      cardCls={cardCls}
                      cardStyle={cardStyle}
                      softText={softText}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Card className={cardCls} style={cardStyle}>
                      <CardContent className="p-4">
                        <div className="flex items-end justify-between gap-3 flex-wrap">
                          <div>
                            <div className="font-medium" style={{ color: GOLD }}>Receitas vs. Gastos</div>
                            <div className={`text-xs ${softText}`}>Escolha o período</div>
                          </div>

                          <div className="w-52">
                            <Select value={trendRange} onValueChange={setTrendRange}>
                              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className={selectContentCls}>
                                <SelectItem value="month" className={selectItemCls}>Só este mês</SelectItem>
                                <SelectItem value="6m" className={selectItemCls}>Últimos 6 meses</SelectItem>
                                <SelectItem value="1y" className={selectItemCls}>Último ano</SelectItem>
                                <SelectItem value="all" className={selectItemCls}>Todo o tempo</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="mt-3 h-80">
                          {trendData.length === 0 ? (
                            <EmptyHint title="Sem dados ainda" desc="Adicione receitas/gastos para ver o gráfico." />
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={trendData} margin={{ top: 10, right: 10, bottom: 40, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis
                                  dataKey="label"
                                  interval={0}
                                  angle={-25}
                                  textAnchor="end"
                                  height={70}
                                  tickMargin={10}
                                  tick={{ fill: "#ddd", fontSize: 12 }}
                                  axisLine={{ stroke: "#555" }}
                                  tickLine={{ stroke: "#555" }}
                                />
                                <YAxis tick={{ fill: "#ddd", fontSize: 12 }} axisLine={{ stroke: "#555" }} tickLine={{ stroke: "#555" }} />
                                <Tooltip
                                  formatter={(v) => currency.format(Number(v))}
                                  contentStyle={{ background: "#0a0a0a", border: `1px solid ${GOLD}`, color: "#fff" }}
                                  labelStyle={{ color: "#fff" }}
                                  itemStyle={{ color: "#fff" }}
                                  cursor={{ fill: "rgba(0,0,0,0.45)" }}
                                />
                                <Legend wrapperStyle={{ color: "#ddd" }} />
                                <Bar dataKey="Gastos" fill={BAR_COLOR_GASTOS} radius={[6, 6, 0, 0]} />
                                <Bar dataKey="Receitas" fill={BAR_COLOR_RECEITAS} radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className={cardCls} style={cardStyle}>
                      <CardContent className="p-4">
                        <div className="font-medium" style={{ color: GOLD }}>Gastos por categoria (mês)</div>
                        <div className={`text-xs ${softText}`}>Onde o dinheiro está indo</div>
                        <div className="mt-3 h-80">
                          {byCategory.length === 0 ? (
                            <EmptyHint title="Sem gastos neste mês" desc="Adicione um gasto para ver o gráfico por categoria." />
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Tooltip
                                  formatter={(v) => currency.format(Number(v))}
                                  contentStyle={{ background: "#0a0a0a", border: `1px solid ${GOLD}`, color: "#fff" }}
                                  wrapperStyle={{ outline: "none" }}
                                  labelStyle={{ color: "#fff" }}
                                  itemStyle={{ color: "#fff" }}
                                />
                                <Legend wrapperStyle={{ color: "#ddd" }} />
                                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={90} paddingAngle={2}>
                                  {byCategory.map((_, i) => (
                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Separator className="my-4 bg-zinc-800" />

                  <Card className={cardCls} style={cardStyle}>
                    <CardContent className="p-4">
                      <div className="font-medium" style={{ color: GOLD }}>Metas (progresso)</div>
                      <div className={`text-xs ${softText}`}>Você registra aportes diretamente na meta.</div>
                      <div className="mt-3 flex flex-col gap-3">
                        {state.goals.length === 0 ? (
                          <EmptyHint title="Você ainda não criou metas" desc="Crie uma meta para acompanhar quanto falta." />
                        ) : (
                          state.goals.slice(0, 4).map((g) => (
                            <GoalRow key={g.id} goal={g} onContribute={(amt) => contributeToGoal(g.id, amt)} gold={GOLD} />
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="mov" className="mt-4">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Card className={cardCls} style={cardStyle}>
                      <CardContent className="p-4 sm:p-5">
                        <div>
                          <div className="font-medium" style={{ color: GOLD }}>Novo movimento</div>
                          <div className={`text-xs ${softText}`}>Registre receitas e gastos do dia a dia</div>
                        </div>
                        <div className="mt-3">
                          <TransactionForm categories={state.categories} onAdd={addTransaction} gold={GOLD} selectContentCls={selectContentCls} selectItemCls={selectItemCls} />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className={cardCls} style={cardStyle}>
                      <CardContent className="p-4 sm:p-5">
                        <div className="font-medium" style={{ color: GOLD }}>Movimentos do mês</div>
                        <div className={`text-xs ${softText}`}>Mais recentes primeiro</div>
                        <div className="mt-3">
                          {monthTransactions.length === 0 ? (
                            <EmptyHint title="Nada registrado neste mês" desc="Adicione sua primeira receita ou gasto." />
                          ) : (
                            <div className="flex flex-col gap-2">
                              {monthTransactions.map((t) => (
                                <TransactionRow key={t.id} tx={t} onDelete={() => deleteTransaction(t.id)} />
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="metas" className="mt-4">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Card className={cardCls} style={cardStyle}>
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium" style={{ color: GOLD }}>Criar meta</div>
                            <div className={`text-xs ${softText}`}>Ex: “Notebook”, “Viagem”, “Reserva”</div>
                          </div>
                          <Target className="h-5 w-5" style={{ color: GOLD }} />
                        </div>
                        <div className="mt-3">
                          <GoalForm onAdd={addGoal} gold={GOLD} />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className={cardCls} style={cardStyle}>
                      <CardContent className="p-4 sm:p-5">
                        <div className="font-medium" style={{ color: GOLD }}>Aportar em uma meta</div>
                        <div className={`text-xs ${softText}`}>Escolha a meta e registre um valor.</div>
                        <div className="mt-3">
                          <GoalContributionPanel goals={state.goals} onContribute={contributeToGoal} gold={GOLD} selectContentCls={selectContentCls} selectItemCls={selectItemCls} />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Separator className="my-4 bg-zinc-800" />

                  <Card className={cardCls} style={cardStyle}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="font-medium" style={{ color: GOLD }}>Suas metas</div>
                      <div className={`text-xs ${softText}`}>Quanto já foi guardado e quanto falta</div>
                      <div className="mt-3 flex flex-col gap-3">
                        {state.goals.length === 0 ? (
                          <EmptyHint title="Sem metas por enquanto" desc="Crie uma meta para o FinP calcular quanto falta." />
                        ) : (
                          state.goals.map((g) => (
                            <div key={g.id} className="rounded-2xl p-3 bg-zinc-950 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" style={cardStyle}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-medium truncate text-white">{g.name}</div>
                                  <div className={`text-xs ${softText}`}>Alvo: {currency.format(g.target)}</div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => deleteGoal(g.id)} aria-label="Excluir meta" className="text-zinc-200 hover:text-white">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="mt-3">
                                <GoalProgress goal={g} gold={GOLD} />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className={cardCls} style={cardStyle}>
              <CardContent className="p-4 sm:p-5">
                <div className="font-medium" style={{ color: GOLD }}>Backup</div>
                <div className={`text-xs ${softText}`}>Exporte/importe para não perder seus dados</div>
                <div className="mt-3">
                  <BackupControls state={state} setState={setState} onReset={resetAll} gold={GOLD} compact />
                </div>

                <div className="mt-4">
                  <Card className={cardCls} style={cardStyle}>
                    <CardContent className="p-4">
                      <div className="text-xs text-zinc-300">Total guardado</div>
                      <div className="mt-1 text-lg font-semibold" style={{ color: GOLD }}>
                        {currency.format(totalGuardado)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">(receitas acumuladas − gastos acumulados)</div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="mt-8 pb-6 text-center text-xs text-zinc-400">FinP • feito para uso pessoal • dados ficam no seu aparelho</footer>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, emphasis = "neutral", cardCls, cardStyle, softText }) {
  // Receitas/Gastos devem ficar brancos no tema escuro.
  // Apenas o saldo (quando passado com emphasis) pode ganhar cor.
  const cls =
    emphasis === "positive"
      ? "text-emerald-300"
      : emphasis === "negative"
      ? "text-rose-300"
      : "text-white";

  return (
    <Card className={cardCls} style={cardStyle}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className={`text-sm ${softText}`}>{title}</div>
          {icon ? <div className="text-zinc-200">{icon}</div> : null}
        </div>
        <div className={`mt-2 text-xl font-semibold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ title, desc }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-sm bg-zinc-950">
      <div className="font-medium text-white">{title}</div>
      <div className="text-zinc-300 mt-1">{desc}</div>
    </div>
  );
}

function TransactionForm({ categories, onAdd, gold, selectContentCls, selectItemCls }) {
  const [type, setType] = useState("expense");
  const [date, setDate] = useState(isoToday());
  const [amountText, setAmountText] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState(categories[0] || "Outros");

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] || "Outros");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const amount = useMemo(() => toNumberBR(amountText), [amountText]);

  const canSubmit = amount > 0 && desc.trim().length >= 2 && date;

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onAdd({
      id: uid(),
      type,
      date,
      amount,
      description: desc.trim(),
      category: type === "expense" ? category : "Receita",
      createdAt: new Date().toISOString(),
    });
    setAmountText("");
    setDesc("");
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-white">Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentCls}>
              <SelectItem value="expense" className={selectItemCls}>Gasto</SelectItem>
              <SelectItem value="income" className={selectItemCls}>Receita</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-white">Data</Label>
          <Input className="mt-1 bg-zinc-950 border-zinc-800 text-white" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-white">Valor (R$)</Label>
          <Input
            className="mt-1 bg-zinc-950 border-zinc-800 text-white"
            placeholder="Ex: 39,90"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
          />
          <div className="text-xs text-zinc-300 mt-1">Mostra: {amount > 0 ? currency.format(amount) : "—"}</div>
        </div>

        <div>
          <Label className="text-white">Categoria</Label>
          <Select value={category} onValueChange={setCategory} disabled={type !== "expense"}>
            <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-white">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent className={selectContentCls}>
              {categories.map((c) => (
                <SelectItem key={c} value={c} className={selectItemCls}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-zinc-300 mt-1">Receitas ficam como “Receita”.</div>
        </div>
      </div>

      <div>
        <Label className="text-white">Descrição</Label>
        <Input
          className="mt-1 bg-zinc-950 border-zinc-800 text-white"
          placeholder={type === "expense" ? "Ex: lanche, Uber, cinema" : "Ex: mesada, bico, venda"}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={!canSubmit} style={{ backgroundColor: gold, color: "#000" }} className="mt-1 hover:opacity-90">
        <Plus className="h-4 w-4 mr-2" />
        Adicionar
      </Button>

      <div className="text-xs text-zinc-300">Dica: use vírgula para centavos (ex: 12,50). O FinP converte automaticamente.</div>
    </form>
  );
}

function TransactionRow({ tx, onDelete }) {
  const sign = tx.type === "income" ? "+" : "-";
  const badgeVariant = tx.type === "income" ? "default" : "secondary";

  return (
    <div className="rounded-2xl p-3 bg-zinc-950 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" style={{ border: `1px solid rgba(212,175,55,0.18)` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariant}>{tx.type === "income" ? "Receita" : tx.category}</Badge>
            <div className="text-xs text-zinc-300">{new Date(tx.date + "T00:00:00").toLocaleDateString("pt-BR")}</div>
          </div>
          <div className="mt-1 font-medium truncate text-white">{tx.description}</div>
          <div className={`mt-1 text-sm ${tx.type === "income" ? "text-emerald-300" : "text-rose-300"}`}>
            {sign} {currency.format(tx.amount)}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Excluir movimento" className="text-zinc-200 hover:text-white">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function GoalForm({ onAdd, gold }) {
  const [name, setName] = useState("");
  const [targetText, setTargetText] = useState("");

  const target = useMemo(() => toNumberBR(targetText), [targetText]);
  const canSubmit = name.trim().length >= 2 && target > 0;

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onAdd({ id: uid(), name: name.trim(), target, saved: 0, createdAt: new Date().toISOString() });
    setName("");
    setTargetText("");
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3">
      <div>
        <Label className="text-white">Nome</Label>
        <Input className="mt-1 bg-zinc-950 border-zinc-800 text-white" placeholder="Ex: iPhone, notebook, viagem" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label className="text-white">Valor-alvo (R$)</Label>
        <Input className="mt-1 bg-zinc-950 border-zinc-800 text-white" placeholder="Ex: 3500" value={targetText} onChange={(e) => setTargetText(e.target.value)} inputMode="decimal" />
        <div className="text-xs text-zinc-300 mt-1">Mostra: {target > 0 ? currency.format(target) : "—"}</div>
      </div>
      <Button type="submit" disabled={!canSubmit} style={{ backgroundColor: gold, color: "#000" }} className="hover:opacity-90">
        <Target className="h-4 w-4 mr-2" />
        Criar meta
      </Button>
    </form>
  );
}

function GoalProgress({ goal, gold }) {
  const saved = typeof goal.saved === "number" ? goal.saved : 0;
  const progress = goal.target <= 0 ? 0 : clamp(saved / goal.target, 0, 1);
  const current = clamp(saved, 0, goal.target);
  const remaining = Math.max(0, goal.target - current);

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <div className="text-zinc-300">Progresso</div>
        <div className="font-medium text-white">{Math.round(progress * 100)}%</div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: gold }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
        <div>
          Guardado: <span className="font-medium text-white">{currency.format(current)}</span>
        </div>
        <div>
          Falta: <span className="font-medium text-white">{currency.format(remaining)}</span>
        </div>
      </div>
    </div>
  );
}

function GoalRow({ goal, onContribute, gold }) {
  const [amtText, setAmtText] = useState("");
  const amt = useMemo(() => toNumberBR(amtText), [amtText]);
  const can = amt > 0;

  return (
    <div className="rounded-2xl p-3 bg-zinc-950 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" style={{ border: `1px solid rgba(212,175,55,0.18)` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate text-white">{goal.name}</div>
          <div className="text-xs text-zinc-300">Alvo: {currency.format(goal.target)}</div>
        </div>
      </div>
      <div className="mt-3">
        <GoalProgress goal={goal} gold={gold} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 items-end">
        <div className="col-span-2">
          <Label className="text-xs text-zinc-300">Aportar</Label>
          <Input className="mt-1 bg-zinc-950 border-zinc-800 text-white" placeholder="Ex: 50" value={amtText} onChange={(e) => setAmtText(e.target.value)} inputMode="decimal" />
        </div>
        <Button
          className="mt-6 hover:opacity-90"
          disabled={!can}
          style={{ backgroundColor: gold, color: "#000" }}
          onClick={() => {
            if (!can) return;
            onContribute(amt);
            setAmtText("");
          }}
        >
          +
        </Button>
      </div>
    </div>
  );
}

function GoalContributionPanel({ goals, onContribute, gold, selectContentCls, selectItemCls }) {
  const [goalId, setGoalId] = useState(goals[0]?.id || "");
  const [amtText, setAmtText] = useState("");
  const amt = useMemo(() => toNumberBR(amtText), [amtText]);

  useEffect(() => {
    if (goals.length === 0) {
      setGoalId("");
      return;
    }
    if (!goals.some((g) => g.id === goalId)) setGoalId(goals[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals]);

  const can = goalId && amt > 0;

  return goals.length === 0 ? (
    <EmptyHint title="Crie uma meta primeiro" desc="Depois você vai conseguir escolher a meta e registrar aportes nela." />
  ) : (
    <div className="grid grid-cols-1 gap-3">
      <div>
        <Label className="text-white">Meta</Label>
        <Select value={goalId} onValueChange={setGoalId}>
          <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContentCls}>
            {goals.map((g) => (
              <SelectItem key={g.id} value={g.id} className={selectItemCls}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-white">Valor (R$)</Label>
        <Input className="mt-1 bg-zinc-950 border-zinc-800 text-white" placeholder="Ex: 100" value={amtText} onChange={(e) => setAmtText(e.target.value)} inputMode="decimal" />
        <div className="text-xs text-zinc-300 mt-1">Mostra: {amt > 0 ? currency.format(amt) : "—"}</div>
      </div>

      <Button
        disabled={!can}
        style={{ backgroundColor: gold, color: "#000" }}
        className="hover:opacity-90"
        onClick={() => {
          if (!can) return;
          onContribute(goalId, amt);
          setAmtText("");
        }}
      >
        Registrar aporte
      </Button>
    </div>
  );
}

function BackupControls({ state, setState, onReset, gold, compact = false }) {
  const fileRef = useRef(null);

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        if (!parsed || typeof parsed !== "object") throw new Error("invalid");
        if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.goals)) throw new Error("shape");

        const migratedGoals = parsed.goals.map((g) => ({
          ...g,
          saved: typeof g.saved === "number" ? g.saved : 0,
        }));

        setState({
          version: 1,
          currency: "BRL",
          categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES,
          transactions: parsed.transactions,
          goals: migratedGoals,
        });
      } catch {
        alert("Arquivo inválido. Escolha um backup do FinP (.json).\n\nDica: use o botão Backup do próprio FinP para gerar o arquivo.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex gap-2"}>
      <Button variant="secondary" onClick={exportJson} title="Exportar backup" style={compact ? { backgroundColor: gold, color: "#000" } : { border: `1px solid rgba(212,175,55,0.22)` }} className={compact ? "hover:opacity-90" : "bg-zinc-950 text-white hover:bg-zinc-900"}>
        <Download className="h-4 w-4 mr-2" />
        Backup
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />

      <Button variant="secondary" onClick={() => fileRef.current?.click()} title="Importar backup" style={compact ? { backgroundColor: "#111", border: `1px solid ${gold}`, color: gold } : { border: `1px solid rgba(212,175,55,0.22)` }} className={compact ? "hover:opacity-90" : "bg-zinc-950 text-white hover:bg-zinc-900"}>
        <Upload className="h-4 w-4 mr-2" />
        Importar
      </Button>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            title="Limpar tudo"
            className={`${compact ? "justify-start" : ""} text-[var(--gold)] hover:bg-black hover:text-[var(--gold)] border border-[rgba(212,175,55,0.22)]`}
            style={{ "--gold": gold, borderColor: "rgba(212,175,55,0.22)" }}
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Zerar
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-white" style={{ borderColor: `rgba(212,175,55,0.22)` }}>
          <DialogHeader>
            <DialogTitle>Zerar o FinP</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-zinc-300">Isso apaga todas as receitas, gastos e metas deste aparelho. Use <span className="font-medium">Backup</span> antes, se quiser guardar.</div>
          <DialogFooter>
            <Button style={{ backgroundColor: gold, color: "#000" }} className="hover:opacity-90" onClick={onReset}>
              Zerar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
