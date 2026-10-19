import type { UserProfile, VocabItem, Achievement, TournamentStage } from './types.ts';
import { INITIAL_VOCABULARY } from './data_vocab.ts';
import { INITIAL_ACHIEVEMENTS, TOURNAMENT_STAGES } from './data_challenges.ts';

const STORAGE_KEYS = {
  PROFILE: 'razmik_football_profile_v1',
  VOCAB: 'razmik_football_vocab_v1',
  ACHIEVEMENTS: 'razmik_football_achievements_v1',
  TOURNAMENTS: 'razmik_football_tournaments_v1',
  SOUND_ENABLED: 'razmik_football_sound_v1',
};

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Razmik',
  position: 'Centrocampista',
  spanishLevel: 'A1',
  footballLevel: 1,
  xp: 0,
  goals: 0,
  wordsLearnedCount: 0,
  phrasesLearnedCount: 0,
  matchesPlayed: 0,
  trophiesWon: 0,
  streak: 0,
  bestStreak: 0,
  jerseyColor: '#16a34a', // Emerald pitch green
  jerseyNumber: 10,
  hairStyle: 'classic',
  teamName: 'FC Razmik Champions',
  clubEmblem: '⚡',
};

export function loadProfile(): UserProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: UserProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save profile', err);
  }
}

export function loadVocab(): VocabItem[] {
  if (typeof window === 'undefined') return INITIAL_VOCABULARY;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VOCAB);
    if (!raw) return INITIAL_VOCABULARY;
    const parsed: VocabItem[] = JSON.parse(raw);
    // Merge in case we added new vocabulary items
    const map = new Map(parsed.map((item) => [item.id, item]));
    return INITIAL_VOCABULARY.map((initItem) => {
      const existing = map.get(initItem.id);
      return existing ? { ...initItem, ...existing } : initItem;
    });
  } catch {
    return INITIAL_VOCABULARY;
  }
}

export function saveVocab(vocab: VocabItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.VOCAB, JSON.stringify(vocab));
  } catch (err) {
    console.error('Failed to save vocab', err);
  }
}

export function loadAchievements(): Achievement[] {
  if (typeof window === 'undefined') return INITIAL_ACHIEVEMENTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
    if (!raw) return INITIAL_ACHIEVEMENTS;
    const parsed: Achievement[] = JSON.parse(raw);
    const map = new Map(parsed.map((item) => [item.id, item]));
    return INITIAL_ACHIEVEMENTS.map((init) => {
      const existing = map.get(init.id);
      return existing ? { ...init, ...existing } : init;
    });
  } catch {
    return INITIAL_ACHIEVEMENTS;
  }
}

export function saveAchievements(achievements: Achievement[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(achievements));
  } catch (err) {
    console.error('Failed to save achievements', err);
  }
}

export function loadTournaments(): TournamentStage[] {
  if (typeof window === 'undefined') return TOURNAMENT_STAGES;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TOURNAMENTS);
    if (!raw) return TOURNAMENT_STAGES;
    const parsed: TournamentStage[] = JSON.parse(raw);
    const map = new Map(parsed.map((item) => [item.stageNumber, item]));
    return TOURNAMENT_STAGES.map((init) => {
      const existing = map.get(init.stageNumber);
      return existing ? { ...init, ...existing } : init;
    });
  } catch {
    return TOURNAMENT_STAGES;
  }
}

export function saveTournaments(stages: TournamentStage[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.TOURNAMENTS, JSON.stringify(stages));
  } catch (err) {
    console.error('Failed to save tournaments', err);
  }
}

export function exportSaveData(): string {
  const data = {
    profile: loadProfile(),
    vocab: loadVocab(),
    achievements: loadAchievements(),
    tournaments: loadTournaments(),
    exportedAt: new Date().toISOString(),
    version: '1.0',
  };
  return JSON.stringify(data, null, 2);
}

export function importSaveData(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);
    if (data.profile) saveProfile(data.profile);
    if (data.vocab && Array.isArray(data.vocab)) saveVocab(data.vocab);
    if (data.achievements && Array.isArray(data.achievements)) saveAchievements(data.achievements);
    if (data.tournaments && Array.isArray(data.tournaments)) saveTournaments(data.tournaments);
    return true;
  } catch {
    return false;
  }
}
