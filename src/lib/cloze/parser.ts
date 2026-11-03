/**
 * Cloze deletion helper utilities for Anki compatibility and editor
 */

export interface ClozeMatch {
  index: number; // e.g. 1 from c1
  text: string;
  hint?: string;
  raw: string;
}

// Extract all cloze occurrences from text: {{c1::text}} or {{c1::text::hint}}
export function extractClozes(text: string): ClozeMatch[] {
  const clozeRegex = /\{\{c(\d+)::([^:]+?)(?:::(.*?))?\}\}/g;
  const matches: ClozeMatch[] = [];
  let match;

  while ((match = clozeRegex.exec(text)) !== null) {
    matches.push({
      index: parseInt(match[1], 10),
      text: match[2],
      hint: match[3],
      raw: match[0],
    });
  }

  return matches;
}

// Get all unique cloze numbers used in a note (e.g. [1, 2])
export function getUniqueClozeIndices(text: string): number[] {
  const clozes = extractClozes(text);
  const set = new Set(clozes.map(c => c.index));
  return Array.from(set).sort((a, b) => a - b);
}

// Render cloze for the front of the card (hiding target cloze)
export function renderClozeFront(text: string, activeClozeIndex: number): string {
  const clozeRegex = /\{\{c(\d+)::([^:]+?)(?:::(.*?))?\}\}/g;

  return text.replace(clozeRegex, (_match, indexStr, answer, hint) => {
    const idx = parseInt(indexStr, 10);
    if (idx === activeClozeIndex) {
      if (hint && hint.trim()) {
        return `<span class="cloze-hidden">[${hint.trim()}]</span>`;
      }
      return `<span class="cloze-hidden">[ ... ]</span>`;
    }
    // Other clozes show just the answer text
    return answer;
  });
}

// Render cloze for the back of the card (highlighting target cloze)
export function renderClozeBack(text: string, activeClozeIndex: number): string {
  const clozeRegex = /\{\{c(\d+)::([^:]+?)(?:::(.*?))?\}\}/g;

  return text.replace(clozeRegex, (_match, indexStr, answer) => {
    const idx = parseInt(indexStr, 10);
    if (idx === activeClozeIndex) {
      return `<span class="cloze-bracket">${answer}</span>`;
    }
    return answer;
  });
}
