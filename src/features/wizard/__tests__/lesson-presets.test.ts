import { LESSON_PRESETS, lookupLessonEmoji } from '../lesson-presets';

describe('LESSON_PRESETS', () => {
  it('contains exactly 10 entries (designer v0.3 §WIZ-03)', () => {
    expect(LESSON_PRESETS).toHaveLength(10);
  });

  it('every preset has an emoji and a non-empty name', () => {
    for (const p of LESSON_PRESETS) {
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it('preset names are unique (lookup table integrity)', () => {
    const names = LESSON_PRESETS.map((p) => p.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('matches the locked-in designer order', () => {
    expect(LESSON_PRESETS.map((p) => p.name)).toEqual([
      'スイミング',
      'ピアノ',
      'サッカー',
      '英会話',
      '空手',
      'そろばん',
      '絵画',
      '書道',
      'バレエ',
      '体操',
    ]);
  });
});

describe('lookupLessonEmoji', () => {
  it('returns the matching emoji for a known preset name', () => {
    expect(lookupLessonEmoji('スイミング')).toBe('🏊');
    expect(lookupLessonEmoji('ピアノ')).toBe('🎹');
    expect(lookupLessonEmoji('体操')).toBe('🤸');
  });

  it('returns null for free-form names', () => {
    expect(lookupLessonEmoji('囲碁')).toBeNull();
    expect(lookupLessonEmoji('フィギュアスケート')).toBeNull();
  });

  it('trims surrounding whitespace before lookup', () => {
    expect(lookupLessonEmoji('  ピアノ  ')).toBe('🎹');
    expect(lookupLessonEmoji('\nスイミング\t')).toBe('🏊');
  });

  it('is case-sensitive for Japanese names (no normalization beyond trim)', () => {
    // 半角/全角の差は normalize しない設計 (現在の Map ベース実装)
    expect(lookupLessonEmoji('ピアノ ')).toBe('🎹');
    expect(lookupLessonEmoji('ぴあの')).toBeNull();
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(lookupLessonEmoji('')).toBeNull();
    expect(lookupLessonEmoji('   ')).toBeNull();
  });
});
