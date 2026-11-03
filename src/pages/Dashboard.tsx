import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Layers,
  Flame,
  Clock,
  CheckCircle,
  AlertCircle,
  Sparkles,
  TrendingUp,
  ArrowRight,
  BookOpen,
  Calendar,
} from 'lucide-react';
import { db, getDeckStats } from '@/lib/db/database';
import type { DeckStats, ReviewLog } from '@/types';

interface DashboardProps {
  onStartStudy: (deckId?: string) => void;
  onOpenDeckList: () => void;
  onOpenAddCard: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onStartStudy,
  onOpenDeckList,
  onOpenAddCard,
}) => {
  const [deckStats, setDeckStats] = useState<DeckStats[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [dueCards, setDueCards] = useState(0);
  const [newCards, setNewCards] = useState(0);
  const [learningCards, setLearningCards] = useState(0);
  const [reviewCards, setReviewCards] = useState(0);
  const [totalStudyMinutes, setTotalStudyMinutes] = useState(0);
  const [streakDays, setStreakDays] = useState(1);
  const [weeklyActivity, setWeeklyActivity] = useState<{ day: string; count: number; active: boolean }[]>([]);
  const [retentionRate, setRetentionRate] = useState<number>(92);

  useEffect(() => {
    loadDashboardMetrics();
  }, []);

  const loadDashboardMetrics = async () => {
    const stats = await getDeckStats();
    setDeckStats(stats);

    const allCards = await db.cards.toArray();
    const allReviews = await db.reviews.toArray();
    const now = new Date();

    let due = 0;
    let n = 0;
    let l = 0;
    let r = 0;

    for (const card of allCards) {
      if (card.state === 'new') n++;
      else if (card.state === 'learning' || card.state === 'relearning') l++;
      else if (card.state === 'review') r++;

      if (new Date(card.due) <= now || card.state === 'new') {
        due++;
      }
    }

    setTotalCards(allCards.length);
    setDueCards(due);
    setNewCards(n);
    setLearningCards(l);
    setReviewCards(r);

    // Calculate total study time
    const totalMs = allReviews.reduce((sum, rev) => sum + (rev.reviewDurationMs || 3000), 0);
    setTotalStudyMinutes(Math.max(1, Math.round(totalMs / 60000)));

    // Calculate Retention rate: Good (3) & Easy (4) vs total reviews
    if (allReviews.length > 0) {
      const recalled = allReviews.filter((rev) => rev.rating >= 3).length;
      setRetentionRate(Math.round((recalled / allReviews.length) * 100));
    }

    // Weekly activity (last 7 days)
    const daysArr: { day: string; count: number; active: boolean }[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;

      const count = allReviews.filter((rev) => rev.reviewedAt >= dayStart && rev.reviewedAt < dayEnd).length;
      daysArr.push({
        day: i === 0 ? 'Today' : dayNames[d.getDay()],
        count,
        active: count > 0 || i === 0,
      });
    }
    setWeeklyActivity(daysArr);

    // Simple streak calculation
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const count = allReviews.filter((rev) => rev.reviewedAt >= dayStart && rev.reviewedAt < dayEnd).length;
      if (count > 0 || i === 0) {
        streak++;
      } else {
        break;
      }
    }
    setStreakDays(Math.max(1, streak));
  };

  const maxWeeklyCount = Math.max(...weeklyActivity.map((w) => w.count), 10);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Hero Quick Study Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 md:p-8 text-white shadow-xl shadow-indigo-950/20 border border-indigo-700/40">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>FSRS Powered Review Queue</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {dueCards > 0
                ? `You have ${dueCards} cards ready for recall!`
                : 'All caught up for today! 🎉'}
            </h2>
            <p className="text-sm text-indigo-200 leading-relaxed">
              Consistent daily spaced repetition optimizes memory stability and halts the exponential forgetting curve.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onStartStudy()}
              disabled={dueCards === 0 && totalCards === 0}
              className="px-6 py-3.5 rounded-2xl bg-white text-indigo-950 font-bold text-sm shadow-lg shadow-black/20 hover:bg-indigo-50 transition-all hover:scale-102 active:scale-98 disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              <GraduationCap className="w-5 h-5 text-indigo-600" />
              <span>{dueCards > 0 ? 'Start Review Now' : 'Study Anyway'}</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
            <button
              onClick={onOpenAddCard}
              className="px-4 py-3.5 rounded-2xl bg-indigo-700/60 hover:bg-indigo-700 font-semibold text-sm text-white border border-indigo-500/40 transition cursor-pointer"
            >
              + Add Flashcard
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Cards */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Cards</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
              {totalCards}
            </span>
            <p className="text-xs text-slate-400 mt-0.5">Across {deckStats.length} decks</p>
          </div>
        </div>

        {/* Due Today */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Due Today</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl md:text-3xl font-extrabold text-rose-600 dark:text-rose-400">
              {dueCards}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
              <span className="text-blue-500 font-semibold">{newCards} new</span> •{' '}
              <span className="text-rose-500 font-semibold">{learningCards} learn</span>
            </div>
          </div>
        </div>

        {/* Retention Rate */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Retention</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl md:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {retentionRate}%
            </span>
            <p className="text-xs text-slate-400 mt-0.5">Target: 90% FSRS target</p>
          </div>
        </div>

        {/* Study Streak */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Daily Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl md:text-3xl font-extrabold text-amber-500">
                {streakDays}
              </span>
              <span className="text-xs font-bold text-slate-400">days</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{totalStudyMinutes} min total study</p>
          </div>
        </div>
      </div>

      {/* Charts & Decks Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Activity Bar Chart */}
        <div className="lg:col-span-1 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span>Weekly Activity</span>
              </h3>
              <span className="text-xs text-slate-400">Last 7 days</span>
            </div>

            {/* Visual Bar Chart */}
            <div className="flex items-end justify-between gap-2 h-40 pt-6 px-1">
              {weeklyActivity.map((item, idx) => {
                const heightPercent = Math.max(8, Math.round((item.count / maxWeeklyCount) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <span className="text-[10px] font-mono text-slate-400">
                      {item.count > 0 ? item.count : ''}
                    </span>
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-lg transition-all duration-300 ${
                        item.count > 0
                          ? 'bg-gradient-to-t from-indigo-600 to-violet-500 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    />
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {item.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>Keep your daily rhythm active</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">FSRS Active</span>
          </div>
        </div>

        {/* Recent Decks with Study CTA */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span>Your Decks</span>
            </h3>
            <button
              onClick={onOpenDeckList}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              View All &rarr;
            </button>
          </div>

          <div className="space-y-3">
            {deckStats.map((deck) => (
              <div
                key={deck.id}
                className="group p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                    {deck.name}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{deck.totalCards} cards</span>
                    <span>•</span>
                    <span className="text-emerald-500 font-medium">
                      {deck.masteredCards} mastered
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400">
                      {deck.newCards} new
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400">
                      {deck.dueCards} due
                    </span>
                  </div>
                  <button
                    onClick={() => onStartStudy(deck.id)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-1"
                  >
                    <span>Study</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
