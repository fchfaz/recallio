import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  Brain,
  Sparkles,
  Zap,
} from 'lucide-react';
import { db } from '@/lib/db/database';
import type { ReviewLog, Card } from '@/types';

export const Statistics: React.FC = () => {
  const [reviews, setReviews] = useState<ReviewLog[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const revs = await db.reviews.toArray();
    const crds = await db.cards.toArray();
    setReviews(revs);
    setCards(crds);
  };

  // Card Maturity breakdown
  const newCards = cards.filter((c) => c.state === 'new').length;
  const learningCards = cards.filter((c) => c.state === 'learning' || c.state === 'relearning').length;
  const youngCards = cards.filter((c) => c.state === 'review' && c.stability < 21).length;
  const matureCards = cards.filter((c) => c.state === 'review' && c.stability >= 21).length;
  const totalCards = cards.length || 1;

  // Filter reviews based on range
  const now = Date.now();
  const rangeMs =
    timeRange === '7d' ? 7 * 86400000 : timeRange === '30d' ? 30 * 86400000 : Infinity;
  const filteredReviews = reviews.filter((r) => now - r.reviewedAt <= rangeMs);

  // Retention rate (ratings 2, 3, 4 considered recalled, 3 & 4 successful recall)
  const totalReviewsCount = filteredReviews.length;
  const againCount = filteredReviews.filter((r) => r.rating === 1).length;
  const hardCount = filteredReviews.filter((r) => r.rating === 2).length;
  const goodCount = filteredReviews.filter((r) => r.rating === 3).length;
  const easyCount = filteredReviews.filter((r) => r.rating === 4).length;

  const recallAccuracy =
    totalReviewsCount > 0 ? Math.round(((goodCount + easyCount) / totalReviewsCount) * 100) : 90;

  // Average answer time
  const totalDuration = filteredReviews.reduce((sum, r) => sum + (r.reviewDurationMs || 3500), 0);
  const avgSeconds =
    totalReviewsCount > 0 ? (totalDuration / totalReviewsCount / 1000).toFixed(1) : '3.5';

  // Total study time
  const totalMinutes = Math.round(totalDuration / 60000);

  // Group reviews by day for activity chart
  const daysCount = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 14;
  const chartDays: { label: string; count: number; again: number; good: number }[] = [];

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 86400000;

    const dayReviews = reviews.filter((r) => r.reviewedAt >= dayStart && r.reviewedAt < dayEnd);
    const dayAgain = dayReviews.filter((r) => r.rating === 1).length;
    const dayGood = dayReviews.filter((r) => r.rating >= 2).length;

    chartDays.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: dayReviews.length,
      again: dayAgain,
      good: dayGood,
    });
  }

  const maxDaily = Math.max(...chartDays.map((c) => c.count), 5);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Title & Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-500" />
            <span>Spaced Repetition Analytics</span>
          </h2>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
            FSRS memory stability, retrievability curves, and study volume
          </p>
        </div>

        <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {(['7d', '30d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                timeRange === range
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500">Total Reviews</span>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
            {totalReviewsCount}
          </div>
          <span className="text-xs text-slate-400 mt-1 block">In selected period</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500">Recall Accuracy</span>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold text-emerald-500">
            {recallAccuracy}%
          </div>
          <span className="text-xs text-slate-400 mt-1 block">Good & Easy responses</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500">Avg Answer Speed</span>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold text-indigo-500">
            {avgSeconds}s
          </div>
          <span className="text-xs text-slate-400 mt-1 block">Per card prompt</span>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500">Study Duration</span>
          <div className="mt-2 text-2xl md:text-3xl font-extrabold text-amber-500">
            {totalMinutes}m
          </div>
          <span className="text-xs text-slate-400 mt-1 block">Focused recall time</span>
        </div>
      </div>

      {/* Daily Review Volume Chart */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Daily Review Count
            </h3>
            <p className="text-xs text-slate-400">Cards reviewed per day</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600" />
              <span>Recalled</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
              <span>Again (Lapsed)</span>
            </span>
          </div>
        </div>

        <div className="h-52 flex items-end justify-between gap-1 sm:gap-2 pt-6">
          {chartDays.map((d, idx) => {
            const heightPercent = Math.max(6, Math.round((d.count / maxDaily) * 100));
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <span className="text-[10px] font-mono text-slate-400">
                  {d.count > 0 ? d.count : ''}
                </span>
                <div
                  style={{ height: `${heightPercent}%` }}
                  className="w-full max-w-[28px] rounded-t-lg bg-indigo-600/90 relative overflow-hidden transition-all duration-300"
                >
                  {d.again > 0 && (
                    <div
                      style={{ height: `${(d.again / d.count) * 100}%` }}
                      className="w-full bg-rose-500 absolute bottom-0"
                    />
                  )}
                </div>
                <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 rotate-45 sm:rotate-0 origin-left">
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Column: Memory Distribution & Rating Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Maturity Distribution */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Memory Stability Distribution
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-emerald-500">Mature (Interval &gt; 21d)</span>
                <span>{matureCards} ({Math.round((matureCards / totalCards) * 100)}%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full"
                  style={{ width: `${(matureCards / totalCards) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-indigo-500">Young (Interval &le; 21d)</span>
                <span>{youngCards} ({Math.round((youngCards / totalCards) * 100)}%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                <div
                  className="bg-indigo-500 h-2.5 rounded-full"
                  style={{ width: `${(youngCards / totalCards) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-amber-500">Learning / Relearning</span>
                <span>{learningCards} ({Math.round((learningCards / totalCards) * 100)}%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                <div
                  className="bg-amber-500 h-2.5 rounded-full"
                  style={{ width: `${(learningCards / totalCards) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-blue-500">New (Unstudied)</span>
                <span>{newCards} ({Math.round((newCards / totalCards) * 100)}%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full"
                  style={{ width: `${(newCards / totalCards) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rating Breakdown */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              FSRS Rating Breakdown
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Again</span>
              <div className="mt-1 text-xl font-extrabold text-rose-700 dark:text-rose-300">
                {againCount}
              </div>
              <span className="text-[11px] text-rose-500/80">Lapsed recall</span>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Hard</span>
              <div className="mt-1 text-xl font-extrabold text-amber-700 dark:text-amber-300">
                {hardCount}
              </div>
              <span className="text-[11px] text-amber-500/80">Effortful retrieval</span>
            </div>

            <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Good</span>
              <div className="mt-1 text-xl font-extrabold text-indigo-700 dark:text-indigo-300">
                {goodCount}
              </div>
              <span className="text-[11px] text-indigo-500/80">Solid recall</span>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Easy</span>
              <div className="mt-1 text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
                {easyCount}
              </div>
              <span className="text-[11px] text-emerald-500/80">Instant recall</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
