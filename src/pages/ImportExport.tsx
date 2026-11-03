import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  Download,
  FileArchive,
  Database,
  CheckCircle,
  AlertTriangle,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
  HardDrive,
  FileCheck,
} from 'lucide-react';
import { parseAnkiPackage } from '@/lib/anki/parser';
import { executeAnkiImport, type ImportResultSummary } from '@/lib/anki/importer';
import { exportDeckToAnki, exportJsonBackup, restoreJsonBackup, triggerFileDownload } from '@/lib/anki/exporter';
import { db } from '@/lib/db/database';
import type { AnkiImportPreview, Deck, ImportHistory } from '@/types';
import { useToast } from '@/components/ui/Toast';

export const ImportExport: React.FC<{ onNavigateToDecks: () => void }> = ({ onNavigateToDecks }) => {
  const { showToast } = useToast();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistory[]>([]);
  const [selectedExportDeckId, setSelectedExportDeckId] = useState<string>('all');

  // Import State
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseStage, setParseStage] = useState('');
  const [importPreview, setImportPreview] = useState<AnkiImportPreview | null>(null);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportResultSummary | null>(null);

  // Restore State
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const d = await db.decks.toArray();
    setDecks(d);
    const h = await db.importHistory.reverse().toArray();
    setImportHistory(h);
  };

  // Handle .apkg File Selection
  const handleApkgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.apkg') && !file.name.endsWith('.zip')) {
      showToast('Please select a valid Anki package (.apkg) file.', 'error');
      return;
    }

    try {
      setIsParsing(true);
      setImportPreview(null);
      setImportSummary(null);

      const preview = await parseAnkiPackage(file, (percent, stage) => {
        setParseProgress(percent);
        setParseStage(stage);
      });

      setImportPreview(preview);
      setSelectedDeckIds(preview.decks.map((d) => d.id));
      showToast(`Parsed "${file.name}" with ${preview.totalCards} cards!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to parse Anki package.', 'error');
    } finally {
      setIsParsing(false);
    }
  };

  // Toggle selection of a deck inside the preview
  const toggleDeckSelection = (deckId: string) => {
    setSelectedDeckIds((prev) =>
      prev.includes(deckId) ? prev.filter((id) => id !== deckId) : [...prev, deckId]
    );
  };

  // Execute Anki Import
  const handleConfirmImport = async () => {
    if (!importPreview || selectedDeckIds.length === 0) {
      showToast('Please select at least one deck to import.', 'error');
      return;
    }

    try {
      setIsImporting(true);
      const summary = await executeAnkiImport(
        importPreview,
        selectedDeckIds,
        (progress, stage) => {
          setParseProgress(progress);
          setParseStage(stage);
        }
      );

      setImportSummary(summary);
      setImportPreview(null);
      showToast(
        `Imported ${summary.cardsImported} cards across ${summary.decksImported} decks!`,
        'success'
      );
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('Error during database import.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Export .apkg
  const handleExportAnki = async () => {
    try {
      showToast('Building Anki package (.apkg)...', 'info');
      const targetDeckId = selectedExportDeckId === 'all' ? undefined : selectedExportDeckId;
      const blob = await exportDeckToAnki(targetDeckId);

      const filename =
        selectedExportDeckId === 'all'
          ? 'Recallio_All_Decks.apkg'
          : `${decks.find((d) => d.id === selectedExportDeckId)?.name || 'Deck'}.apkg`;

      triggerFileDownload(blob, filename);
      showToast('Anki package downloaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Export failed. Please retry.', 'error');
    }
  };

  // Export JSON Backup
  const handleExportJson = async () => {
    try {
      showToast('Generating JSON backup...', 'info');
      const blob = await exportJsonBackup();
      const dateStr = new Date().toISOString().slice(0, 10);
      triggerFileDownload(blob, `recallio_backup_${dateStr}.json`);
      showToast('JSON backup downloaded!', 'success');
    } catch (err) {
      console.error(err);
      showToast('JSON export failed.', 'error');
    }
  };

  // Restore JSON Backup
  const handleRestoreJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setIsRestoring(true);
        const jsonStr = reader.result as string;
        const result = await restoreJsonBackup(jsonStr);
        showToast(
          `Restored ${result.decksRestored} decks and ${result.cardsRestored} cards!`,
          'success'
        );
        loadData();
      } catch (err: any) {
        console.error(err);
        showToast(err.message || 'Failed to restore backup file.', 'error');
      } finally {
        setIsRestoring(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white">
          Import & Export Center
        </h2>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
          Native Anki package compatibility (`.apkg`) and full database backup
        </p>
      </div>

      {/* Progress Overlay */}
      {(isParsing || isImporting) && (
        <div className="p-6 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300">
            <span>{parseStage || 'Processing package...'}</span>
            <span>{parseProgress}%</span>
          </div>
          <div className="w-full bg-indigo-200 dark:bg-indigo-900 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${parseProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Import Summary Modal / Alert */}
      {importSummary && (
        <div className="p-6 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-slate-100 space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500 text-white">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-emerald-900 dark:text-emerald-100">
                  Import Succeeded!
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  All flashcards and media have been committed to local IndexedDB.
                </p>
              </div>
            </div>
            <button
              onClick={onNavigateToDecks}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <span>View Decks</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50">
              <span className="text-xl font-bold text-emerald-600">{importSummary.decksImported}</span>
              <span className="block text-[11px] text-slate-400 font-medium">Decks</span>
            </div>
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50">
              <span className="text-xl font-bold text-indigo-600">{importSummary.cardsImported}</span>
              <span className="block text-[11px] text-slate-400 font-medium">Cards</span>
            </div>
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50">
              <span className="text-xl font-bold text-purple-600">{importSummary.mediaImported}</span>
              <span className="block text-[11px] text-slate-400 font-medium">Media Files</span>
            </div>
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50">
              <span className="text-xl font-bold text-slate-500">{importSummary.skippedCards}</span>
              <span className="block text-[11px] text-slate-400 font-medium">Skipped</span>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Deck Selection */}
      {importPreview && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 shadow-xl space-y-5 animate-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-500">
                Package Inspection
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {importPreview.filename}
              </h3>
              <p className="text-xs text-slate-500">
                {importPreview.totalCards} cards • {importPreview.mediaCount} media assets
              </p>
            </div>
            <button
              onClick={handleConfirmImport}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Import Selected Decks</span>
            </button>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Select Decks to Import ({selectedDeckIds.length} of {importPreview.decks.length}{' '}
              selected)
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {importPreview.decks.map((deck) => {
                const isChecked = selectedDeckIds.includes(deck.id);
                return (
                  <label
                    key={deck.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition ${
                      isChecked
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDeckSelection(deck.id)}
                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {deck.name}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
                      {deck.cardCount} cards
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout: Import & Export */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Anki .apkg Importer */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Import Anki Package
                </h3>
                <p className="text-xs text-slate-500">Loads `.apkg` files with SQLite & media extraction</p>
              </div>
            </div>

            <label className="group relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 bg-slate-50 dark:bg-slate-800/30 transition cursor-pointer text-center">
              <FileArchive className="w-10 h-10 text-slate-400 group-hover:text-indigo-500 group-hover:scale-110 transition duration-200 mb-2" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Click or drop an .apkg file here
              </span>
              <span className="text-[11px] text-slate-400 mt-1">
                Standard Anki 2.0 / 2.1 collections supported
              </span>
              <input
                type="file"
                accept=".apkg,.zip"
                onChange={handleApkgFileChange}
                disabled={isParsing || isImporting}
                className="hidden"
              />
            </label>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
            <span>✨ Automatically extracts card fields, cloze deletions, and images.</span>
          </div>
        </div>

        {/* Anki .apkg Exporter */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-2xl bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Export to Anki (.apkg)
                </h3>
                <p className="text-xs text-slate-500">Create compatible Anki archives</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Select Deck to Export
                </label>
                <select
                  value={selectedExportDeckId}
                  onChange={(e) => setSelectedExportDeckId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs md:text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Decks Combined</option>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleExportAnki}
                className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Export Anki Package</span>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
            <span>Compatible with Anki Desktop, AnkiDroid, and AnkiMobile.</span>
          </div>
        </div>
      </div>

      {/* JSON Backup & Disaster Recovery */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              JSON Full Database Backup & Restore
            </h3>
            <p className="text-xs text-slate-500">
              Save or restore your entire study database, review history, and settings
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={handleExportJson}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Download JSON Backup</span>
          </button>

          <label className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 font-semibold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" />
            <span>{isRestoring ? 'Restoring...' : 'Restore from JSON'}</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreJson}
              disabled={isRestoring}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Import History Table */}
      {importHistory.length > 0 && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
            Import History Log
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {importHistory.map((h) => (
              <div key={h.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {h.filename}
                  </span>
                  <span className="text-slate-400 ml-2">
                    {new Date(h.importedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-slate-500 font-mono">
                  {h.cardCount} cards • {h.deckCount} decks
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
