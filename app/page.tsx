
'use client';

import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PortfolioItem {
  Ticker: string;
  Shares: number;
  Avg_Cost: number;
  Current_Price?: number;
  Current_Value?: number;
  Target_Weight?: number;
  Current_Weight?: number;
  Drift_Value?: number;
  Drift_Percent?: number;
  Suggested_Shares?: number;
}

interface PriceResponse {
  quotes: {
    symbol: string;
    price: number | null;
    error?: string;
  }[];
  error?: string;
}

interface TLHOpportunity {
  Ticker: string;
  Shares: number;
  Avg_Cost: number;
  Current_Price: number;
  Unrealized_Loss: number;
  Tax_Saving: number;
  Loss_Per_Share: number;
}


// ─── Constants ───────────────────────────────────────────────────────────────

const TARGET_ALLOCATIONS: Record<string, number> = {
  VTI: 0.4,
  VXUS: 0.2,
  BND: 0.2,
  AAPL: 0.1,
  TSLA: 0.1,
};

const CHART_COLORS = ['#2563eb', '#16a34a', '#f97316', '#e11d48', '#0d9488'];
const TAX_BRACKET = 0.25; // 25% assumed tax bracket — user can change this later
const TLH_THRESHOLD = 100; // Only flag losses greater than $100


// ─── Helpers ─────────────────────────────────────────────────────────────────

function getColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCurrency(value?: number | null, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(digits)}`;
}

function formatWholeCurrency(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [pricesLoaded, setPricesLoaded] = useState(false);

    // ── ADD HERE ──
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── CSV Upload ──────────────────────────────────────────────────────────────

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setPricesLoaded(false);

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const cleaned: PortfolioItem[] = (results.data || [])
            .map((row) => ({
              Ticker: String(row.Ticker ?? '').trim().toUpperCase(),
              Shares: toNumber(row.Shares),
              Avg_Cost: toNumber(row.Avg_Cost),
            }))
            .filter(
              (item) =>
                item.Ticker.length > 0 &&
                Number.isFinite(item.Shares) &&
                Number.isFinite(item.Avg_Cost)
            );

          if (cleaned.length === 0) {
            setError('No valid rows found. Please use columns: Ticker, Shares, Avg_Cost');
            return;
          }

          setPortfolio(cleaned);
        } catch (err) {
          console.error(err);
          setError('Failed to parse CSV file.');
        }
      },
      error: (err) => {
        setError(err.message || 'CSV parsing failed.');
      },
    });
  };

  // ── Fetch Prices ────────────────────────────────────────────────────────────

  const fetchLivePrices = async () => {
    if (portfolio.length === 0) return;

    try {
      setIsLoadingPrices(true);
      setError(null);

      const tickers = portfolio.map((item) => item.Ticker);

      const res = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });

      const data: PriceResponse = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch prices');

      const priceMap: Record<string, number> = {};
      for (const quote of data.quotes || []) {
        const symbol = String(quote.symbol || '').toUpperCase();
        const price = typeof quote.price === 'number' ? quote.price : NaN;
        if (symbol && Number.isFinite(price)) {
          priceMap[symbol] = price;
        }
      }

      const updated = portfolio.map((item) => {
        const currentPrice = priceMap[item.Ticker];
        const currentValue =
          typeof currentPrice === 'number' && Number.isFinite(currentPrice)
            ? currentPrice * item.Shares
            : undefined;
        return { ...item, Current_Price: currentPrice, Current_Value: currentValue };
      });

      setPortfolio(updated);
      setPricesLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching prices');
    } finally {
      setIsLoadingPrices(false);
    }
  };

  const fetchAIAdvice = async () => {
  if (rebalancedPortfolio.length === 0) return;

  try {
    setIsLoadingAI(true);
    setAiError(null);
    setAiAdvice(null);

    // Build a plain-text summary to send to Ollama
    const lines = rebalancedPortfolio.map((item) => {
      const action =
        (item.Drift_Value || 0) > 50
          ? 'BUY'
          : (item.Drift_Value || 0) < -50
          ? 'SELL'
          : 'HOLD';
      return `${item.Ticker}: Current ${((item.Current_Weight || 0) * 100).toFixed(1)}%, Target ${((item.Target_Weight || 0) * 100).toFixed(1)}%, Drift $${(item.Drift_Value || 0).toFixed(0)}, Action: ${action}`;
    });

    const tlhLines =
      tlhOpportunities.length > 0
        ? `\nTax-Loss Harvesting Opportunities:\n${tlhOpportunities
            .map((t) => `${t.Ticker}: Unrealized loss $${t.Unrealized_Loss.toFixed(0)}, Est. tax saving $${t.Tax_Saving.toFixed(0)}`)
            .join('\n')}`
        : '\nNo tax-loss harvesting opportunities detected.';

    const portfolioSummary = `Total Portfolio Value: $${totalPortfolioValue.toFixed(0)}\n\nHoldings:\n${lines.join('\n')}${tlhLines}`;

    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioSummary }),
    });

    const data = await res.json() as { advice?: string; error?: string };

    if (!res.ok) throw new Error(data.error || 'AI request failed');

    setAiAdvice(data.advice || null);
  } catch (err) {
    console.error(err);
    setAiError(err instanceof Error ? err.message : 'AI request failed');
  } finally {
    setIsLoadingAI(false);
  }
};

  // ── Derived Data ─────────────────────────────────────────────────────────────
  // NOTE: ALL useMemo hooks are INSIDE the component so they can access state

  const totalPortfolioValue = useMemo(
    () => portfolio.reduce((sum, item) => sum + (item.Current_Value || 0), 0),
    [portfolio]
  );

  const rebalancedPortfolio = useMemo(() => {
    if (portfolio.length === 0 || totalPortfolioValue === 0) return [];

    return portfolio.map((item) => {
      const currentValue = item.Current_Value || 0;
      const currentPrice = item.Current_Price || 0;
      const targetWeight = TARGET_ALLOCATIONS[item.Ticker] || 0;
      const currentWeight = currentValue / totalPortfolioValue;
      const targetValue = totalPortfolioValue * targetWeight;
      const driftValue = targetValue - currentValue;
      const driftPercent = targetWeight - currentWeight;
      const suggestedShares = currentPrice > 0 ? driftValue / currentPrice : 0;

      return {
        ...item,
        Target_Weight: targetWeight,
        Current_Weight: currentWeight,
        Drift_Value: driftValue,
        Drift_Percent: driftPercent,
        Suggested_Shares: suggestedShares,
      };
    });
  }, [portfolio, totalPortfolioValue]);

  const allocationChartData = useMemo(() => {
    if (portfolio.length === 0 || totalPortfolioValue === 0) return [];
    return portfolio
      .filter((item) => (item.Current_Value || 0) > 0)
      .map((item) => ({
        name: item.Ticker,
        value: item.Current_Value || 0,
      }));
  }, [portfolio, totalPortfolioValue]);

  const targetChartData = useMemo(() => {
    if (totalPortfolioValue === 0) return [];
    return Object.entries(TARGET_ALLOCATIONS).map(([ticker, weight]) => ({
      name: ticker,
      value: totalPortfolioValue * weight,
    }));
  }, [totalPortfolioValue]);

  const tlhOpportunities = useMemo((): TLHOpportunity[] => {
  if (portfolio.length === 0 || !pricesLoaded) return [];

  return portfolio
    .filter((item) => {
      const currentPrice = item.Current_Price;
      const avgCost = item.Avg_Cost;
      if (!currentPrice || !avgCost) return false;

      const unrealizedLoss = (currentPrice - avgCost) * item.Shares;
      return unrealizedLoss < -TLH_THRESHOLD; // Only losses beyond threshold
    })
    .map((item) => {
      const currentPrice = item.Current_Price!;
      const unrealizedLoss = (currentPrice - item.Avg_Cost) * item.Shares;
      const taxSaving = Math.abs(unrealizedLoss) * TAX_BRACKET;
      const lossPerShare = currentPrice - item.Avg_Cost;

      return {
        Ticker: item.Ticker,
        Shares: item.Shares,
        Avg_Cost: item.Avg_Cost,
        Current_Price: currentPrice,
        Unrealized_Loss: unrealizedLoss,
        Tax_Saving: taxSaving,
        Loss_Per_Share: lossPerShare,
      };
    })
    .sort((a, b) => a.Unrealized_Loss - b.Unrealized_Loss); // Worst losses first
}, [portfolio, pricesLoaded]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">

      {/* HEADER */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
              AI
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Portfolio Rebalancer</h1>
              <p className="text-sm text-gray-500">Privacy-first portfolio analysis</p>
            </div>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-500">
            {process.env.NEXT_PUBLIC_APP_BADGE || 'Powered by OpenClaw'}
          </span>
        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:px-8">

        {/* ── LEFT COLUMN ── */}
        <div className="w-full space-y-6 lg:w-1/3">

          {/* Upload */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">1. Upload Portfolio</h2>
            <p className="mb-4 text-sm text-gray-500">
              Upload a CSV with columns: Ticker, Shares, Avg_Cost
            </p>
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="w-full cursor-pointer text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <button
              onClick={fetchLivePrices}
              disabled={portfolio.length === 0 || isLoadingPrices}
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {isLoadingPrices ? 'Fetching Live Prices...' : '2. Fetch Live Prices'}
            </button>
          </div>

          {/* Target Allocation */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">3. Target Allocation</h2>
            <ul className="space-y-2 rounded border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
              {Object.entries(TARGET_ALLOCATIONS).map(([ticker, weight]) => (
                <li key={ticker} className="flex justify-between">
                  <span className="font-medium">{ticker}</span>
                  <span>{(weight * 100).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold">Portfolio Summary</h2>
            <p className="text-sm text-gray-500">Total current value</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {totalPortfolioValue > 0 ? formatWholeCurrency(totalPortfolioValue) : '—'}
            </p>
          </div>

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="w-full space-y-6 lg:w-2/3">

          {/* Allocation Charts */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Allocation Overview</h2>
              {pricesLoaded && (
                <span className="text-xs text-gray-400">Based on latest prices</span>
              )}
            </div>

            {allocationChartData.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">

                {/* Current Pie */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">Current Allocation</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                        <Pie
                          data={allocationChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={65}
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                          labelLine={true}
                        >
                          {allocationChartData.map((entry, index) => (
                            <Cell key={`current-${entry.name}`} fill={getColor(index)} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatWholeCurrency(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Target Pie */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">Target Allocation</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={targetChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {targetChartData.map((entry, index) => (
                            <Cell key={`target-${entry.name}`} fill={getColor(index)} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatWholeCurrency(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">
                Upload a portfolio and fetch prices to see allocation charts.
              </p>
            )}
          </div>


          {/* Current Portfolio Table */}
          <div className="min-h-[300px] rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Current Portfolio</h2>
              {pricesLoaded && (
                <span className="text-xs text-green-600">Live prices loaded</span>
              )}
            </div>

            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {portfolio.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Ticker', 'Shares', 'Avg Cost', 'Current Price', 'Current Value'].map(
                        (col) => (
                          <th
                            key={col}
                            className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                          >
                            {col}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {portfolio.map((item, index) => (
                      <tr key={`${item.Ticker}-${index}`}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                          {item.Ticker}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {Number(item.Shares).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {formatCurrency(item.Avg_Cost)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {formatCurrency(item.Current_Price)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                          {formatWholeCurrency(item.Current_Value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="flex h-40 items-center justify-center text-sm text-gray-400">
                Upload a CSV to view your portfolio
              </p>
            )}
          </div>

          {/* Recommended Trades */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Recommended Trades</h2>

            {rebalancedPortfolio.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Ticker', 'Current %', 'Target %', 'Drift $', 'Drift %', 'Shares', 'Action'].map(
                        (col) => (
                          <th
                            key={col}
                            className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                          >
                            {col}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {rebalancedPortfolio.map((item) => {
                      const driftValue = item.Drift_Value || 0;
                      const action =
                        driftValue > 50 ? 'Buy' : driftValue < -50 ? 'Sell' : 'Hold';
                      return (
                        <tr key={item.Ticker}>
                          <td className="px-4 py-4 text-sm font-medium text-gray-900">
                            {item.Ticker}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {((item.Current_Weight || 0) * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {((item.Target_Weight || 0) * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {formatWholeCurrency(item.Drift_Value)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {((item.Drift_Percent || 0) * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500">
                            {Math.abs(item.Suggested_Shares || 0).toFixed(2)}
                          </td>
                          <td
                            className={`px-4 py-4 text-sm font-bold ${
                              action === 'Buy'
                                ? 'text-green-600'
                                : action === 'Sell'
                                ? 'text-red-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {action}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Fetch live prices to generate trade recommendations.
              </p>
            )}
          </div>

{/* Tax-Loss Harvesting Scanner */}
<div className="rounded-xl border border-amber-100 bg-white p-6 shadow-sm">
  <div className="mb-4 flex items-center justify-between">
    <div className="flex items-center space-x-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        ⚠️
      </div>
      <h2 className="text-lg font-semibold">Tax-Loss Harvesting</h2>
    </div>
    {tlhOpportunities.length > 0 && (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
        {tlhOpportunities.length} opportunity{tlhOpportunities.length > 1 ? 's' : ''} found
      </span>
    )}
  </div>

  {!pricesLoaded ? (
    <p className="text-sm text-gray-400">
      Fetch live prices to scan for tax-loss harvesting opportunities.
    </p>
  ) : tlhOpportunities.length === 0 ? (
    <div className="flex items-center space-x-3 rounded-lg border border-green-100 bg-green-50 p-4">
      <span className="text-2xl">✅</span>
      <div>
        <p className="text-sm font-medium text-green-800">No significant losses detected</p>
        <p className="text-xs text-green-600">
          All positions are within the ${TLH_THRESHOLD} threshold
        </p>
      </div>
    </div>
  ) : (
    <>
      {/* Summary banner */}
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">
          Total unrealized losses:{' '}
          <span className="text-red-600">
            {formatWholeCurrency(
              tlhOpportunities.reduce((sum, t) => sum + t.Unrealized_Loss, 0)
            )}
          </span>
        </p>
        <p className="mt-1 text-sm font-semibold text-amber-800">
          Estimated tax savings at {TAX_BRACKET * 100}% bracket:{' '}
          <span className="text-green-700">
            {formatWholeCurrency(
              tlhOpportunities.reduce((sum, t) => sum + t.Tax_Saving, 0)
            )}
          </span>
        </p>
      </div>

      {/* Opportunities table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Ticker', 'Avg Cost', 'Current Price', 'Loss/Share', 'Unrealized Loss', 'Est. Tax Saving'].map(
                (col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    {col}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {tlhOpportunities.map((item) => (
              <tr key={item.Ticker} className="bg-red-50/30">
                <td className="px-4 py-4 text-sm font-bold text-gray-900">
                  {item.Ticker}
                </td>
                <td className="px-4 py-4 text-sm text-gray-500">
                  {formatCurrency(item.Avg_Cost)}
                </td>
                <td className="px-4 py-4 text-sm text-red-600 font-medium">
                  {formatCurrency(item.Current_Price)}
                </td>
                <td className="px-4 py-4 text-sm text-red-600">
                  {formatCurrency(item.Loss_Per_Share)}
                </td>
                <td className="px-4 py-4 text-sm font-bold text-red-600">
                  {formatWholeCurrency(item.Unrealized_Loss)}
                </td>
                <td className="px-4 py-4 text-sm font-bold text-green-600">
                  {formatWholeCurrency(item.Tax_Saving)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Disclaimer */}
      <p className="mt-3 text-xs text-gray-400">
        * Estimates only. Consult a tax professional. Beware of 30-day wash-sale rules.
      </p>
    </>
  )}
</div>


{/* AI Advisor */}
<div className="min-h-[150px] rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
  <div className="mb-4 flex items-center justify-between">
    <h3 className="flex items-center text-lg font-semibold text-blue-900">
      <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      AI Advisor Insights
    </h3>

    <button
      onClick={fetchAIAdvice}
      disabled={rebalancedPortfolio.length === 0 || isLoadingAI}
      className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
    >
      {isLoadingAI ? (
        <>
          <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Analyzing...
        </>
      ) : (
        '✨ Get AI Advice'
      )}
    </button>
  </div>

  {aiError && (
    <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
      {aiError}
    </div>
  )}

          {aiAdvice ? (
            <div className="space-y-2">
              {aiAdvice
                .split('\n')
                .filter((line) => line.trim().length > 0)
                .map((line, index) => (
                  <p key={index} className="text-sm leading-relaxed text-blue-900">
                    {line}
                  </p>
                ))}
            </div>
          ) : (
            <p className="text-sm text-blue-800 opacity-70">
              {rebalancedPortfolio.length === 0
                ? 'Fetch live prices first, then click Get AI Advice.'
                : 'Click "Get AI Advice" to generate personalized rebalancing insights.'}
            </p>
          )}
        </div>

        </div>
      </main>
    </div>
  );
}
