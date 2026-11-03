import React, { useState, useEffect } from 'react';
import {
  X,
  Bold,
  Italic,
  Underline,
  Code,
  Tag,
  Layers,
  Sparkles,
  HelpCircle,
  Eye,
  Edit3,
  Image as ImageIcon,
  Volume2,
} from 'lucide-react';
import { db, createNoteAndCards } from '@/lib/db/database';
import type { CardModelType, Deck } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { renderClozeFront, renderClozeBack } from '@/lib/cloze/parser';

interface CardEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDeckId?: string;
  onCardSaved?: () => void;
}

export const CardEditorModal: React.FC<CardEditorModalProps> = ({
  isOpen,
  onClose,
  defaultDeckId,
  onCardSaved,
}) => {
  const { showToast } = useToast();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [modelType, setModelType] = useState<CardModelType>('basic');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [hint, setHint] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load decks
  useEffect(() => {
    if (isOpen) {
      db.decks.toArray().then((loaded) => {
        setDecks(loaded);
        if (defaultDeckId && loaded.some((d) => d.id === defaultDeckId)) {
          setSelectedDeckId(defaultDeckId);
        } else if (loaded.length > 0) {
          setSelectedDeckId(loaded[0].id);
        }
      });
      // Reset form
      setFront('');
      setBack('');
      setHint('');
      setTagsInput('');
      setIsPreview(false);
      setPreviewFlipped(false);
    }
  }, [isOpen, defaultDeckId]);

  if (!isOpen) return null;

  // Insert formatting into active textarea
  const insertFormatting = (prefix: string, suffix: string = prefix, placeholder: string = 'text') => {
    const textarea = document.getElementById('card-front-input') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = front.substring(start, end) || placeholder;
    const replacement = `${prefix}${selectedText}${suffix}`;

    const newFront = front.substring(0, start) + replacement + front.substring(end);
    setFront(newFront);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 10);
  };

  const insertCloze = () => {
    // Count existing clozes to auto-increment c1, c2...
    const clozeRegex = /\{\{c(\d+)::/g;
    let maxIndex = 0;
    let match;
    while ((match = clozeRegex.exec(front)) !== null) {
      const idx = parseInt(match[1], 10);
      if (idx > maxIndex) maxIndex = idx;
    }
    const nextIndex = maxIndex + 1;
    insertFormatting(`{{c${nextIndex}::`, '}}', 'keyword');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const imgHtml = `<img src="${dataUrl}" alt="${file.name}" class="rounded-lg max-h-48 my-2 inline-block shadow-sm" />`;
      setFront((prev) => `${prev}\n${imgHtml}`);
      showToast('Image inserted!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleSpeechPronounce = () => {
    if (!front) return;
    const textToSpeak = front.replace(/<[^>]*>/g, '').replace(/\{\{c\d+::(.*?)\}\}/g, '$1');
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      window.speechSynthesis.speak(utterance);
    } else {
      showToast('Text-to-speech not supported in this browser.', 'info');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim()) {
      showToast('Front content cannot be empty.', 'error');
      return;
    }
    if (modelType === 'cloze' && !front.includes('{{c')) {
      showToast('Cloze card requires at least one {{c1::cloze deletion}} pattern.', 'error');
      return;
    }
    if (modelType !== 'cloze' && !back.trim()) {
      showToast('Back answer cannot be empty for this card type.', 'error');
      return;
    }
    if (!selectedDeckId) {
      showToast('Please select a deck.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const { cards } = await createNoteAndCards(
        selectedDeckId,
        modelType,
        {
          front: front.trim(),
          back: back.trim(),
          hint: hint.trim() || undefined,
        },
        tags
      );

      showToast(`Created ${cards.length} card${cards.length > 1 ? 's' : ''} successfully!`, 'success');
      onCardSaved?.();
      onClose();
    } catch (err) {
      console.error('Failed to create card:', err);
      showToast('Failed to save card. Check data and retry.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Create Flashcard</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Add to your FSRS review queue</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                isPreview
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isPreview ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isPreview ? 'Edit Mode' : 'Live Preview'}</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Deck Selection & Card Type Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Target Deck</span>
              </label>
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Card Template</span>
              </label>
              <select
                value={modelType}
                onChange={(e) => setModelType(e.target.value as CardModelType)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="basic">Basic (Front &rarr; Back)</option>
                <option value="reversed">Basic (and reversed card)</option>
                <option value="cloze">Cloze Deletion (Fill in the blank)</option>
                <option value="optional_reversed">Optional Reversed</option>
              </select>
            </div>
          </div>

          {isPreview ? (
            /* Live Flip Card Preview */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>Interactive Preview (Click card to flip)</span>
                <span className="text-indigo-500">Showing {previewFlipped ? 'Back' : 'Front'}</span>
              </div>
              <div
                onClick={() => setPreviewFlipped(!previewFlipped)}
                className="group relative cursor-pointer min-h-[200px] rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-800/80 bg-slate-50 dark:bg-slate-800/50 p-6 flex flex-col items-center justify-center text-center transition hover:border-indigo-500 shadow-inner"
              >
                {!previewFlipped ? (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-2 block">
                      Card Front
                    </span>
                    <div
                      className="text-lg font-medium text-slate-900 dark:text-white leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html:
                          modelType === 'cloze'
                            ? renderClozeFront(front || 'Type {{c1::text}} above', 1)
                            : front || '<span class="text-slate-400 italic">Front question preview...</span>',
                      }}
                    />
                    {hint && (
                      <div className="mt-4 text-xs text-amber-500 font-medium flex items-center justify-center gap-1">
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Hint: {hint}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2 block">
                      Card Back
                    </span>
                    <div
                      className="text-lg font-medium text-slate-900 dark:text-white leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html:
                          modelType === 'cloze'
                            ? `${renderClozeBack(front, 1)}${back ? `<div class="mt-3 pt-3 border-t border-slate-700/50 text-sm">${back}</div>` : ''}`
                            : back || '<span class="text-slate-400 italic">Back answer preview...</span>',
                      }}
                    />
                  </div>
                )}
                <span className="absolute bottom-3 text-[11px] text-slate-400 group-hover:text-indigo-400 transition">
                  Tap to flip
                </span>
              </div>
            </div>
          ) : (
            /* Card Inputs */
            <div className="space-y-4">
              {/* Front Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {modelType === 'cloze' ? 'Text with Cloze {{c1::...}}' : 'Front (Prompt)'}
                  </label>
                  {/* Rich Text Toolbar */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => insertFormatting('<strong>', '</strong>', 'bold text')}
                      className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                      title="Bold"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('<em>', '</em>', 'italic text')}
                      className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                      title="Italic"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('<u>', '</u>', 'underlined')}
                      className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                      title="Underline"
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('<code>', '</code>', 'code')}
                      className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                      title="Code"
                    >
                      <Code className="w-3.5 h-3.5" />
                    </button>
                    {modelType === 'cloze' && (
                      <button
                        type="button"
                        onClick={insertCloze}
                        className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[11px] font-bold hover:bg-indigo-500"
                        title="Add cloze deletion {{c1::...}}"
                      >
                        [..] Cloze
                      </button>
                    )}
                    <label
                      title="Insert Image"
                      className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleSpeechPronounce}
                      className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                      title="Pronounce text with TTS"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <textarea
                  id="card-front-input"
                  rows={3}
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                  placeholder={
                    modelType === 'cloze'
                      ? 'e.g. {{c1::Spaced repetition}} helps consolidate memory in the {{c2::hippocampus}}.'
                      : 'e.g. What is the capital of Indonesia?'
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-sans"
                />
              </div>

              {/* Back Field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {modelType === 'cloze' ? 'Extra Notes / Explanation (Optional)' : 'Back (Answer)'}
                </label>
                <textarea
                  rows={3}
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                  placeholder={
                    modelType === 'cloze'
                      ? 'Additional explanation displayed on reveal...'
                      : 'e.g. Nusantara (previously Jakarta)'
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-sans"
                />
              </div>

              {/* Hint & Tags */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Optional Hint</span>
                  </label>
                  <input
                    type="text"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="e.g. Island of Borneo"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Tags (comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="e.g. geography, capitals"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <span>Saving...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Save to Queue</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
