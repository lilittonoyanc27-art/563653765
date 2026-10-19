import type { UserProfile, Achievement } from './types.ts';

/**
 * Calculates user level and progress from total XP.
 * Level 1 = 0 XP, each level requires 100 * level XP.
 */
export function calculateLevel(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXpThreshold: number;
  progressPercent: number;
} {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  let accumulated = 0;

  while (true) {
    const costForNext = level * 100;
    if (accumulated + costForNext > safeXp) {
      const currentLevelXp = safeXp - accumulated;
      const progressPercent = Math.min(100, Math.round((currentLevelXp / costForNext) * 100));
      return {
        level,
        currentLevelXp,
        nextLevelXpThreshold: costForNext,
        progressPercent,
      };
    }
    accumulated += costForNext;
    level += 1;
  }
}

/**
 * Calculates goalkeeper dive and whether penalty results in a goal.
 * Target zones: 0 (top-left), 1 (bottom-left), 2 (center), 3 (top-right), 4 (bottom-right)
 */
export function resolvePenaltyShot(
  targetZone: number,
  forcedKeeperDive?: number
): {
  isGoal: boolean;
  keeperDiveZone: number;
  messageEs: string;
  messageHy: string;
} {
  const keeperZone = forcedKeeperDive !== undefined 
    ? forcedKeeperDive 
    : Math.floor(Math.random() * 5);

  // If keeper dives to exact zone, saved! If adjacent or different, goal!
  const isGoal = keeperZone !== targetZone;

  if (isGoal) {
    return {
      isGoal: true,
      keeperDiveZone: keeperZone,
      messageEs: '¡GOOOOLAZO! ¡Qué gran definición!',
      messageHy: 'ԳՈ՜Լ։ Հիանալի և անվրեպ հարված։',
    };
  } else {
    return {
      isGoal: false,
      keeperDiveZone: keeperZone,
      messageEs: '¡El portero la detiene! Buen intento, Razmik.',
      messageHy: 'Դարպասապահը հետ մղեց գնդակը։ Լավ փորձ էր, Ռազմիկ։',
    };
  }
}

/**
 * Calculates priority score for spaced repetition.
 * Higher score means the word/phrase should be shown sooner.
 */
export function calculateSrsPriority(item: {
  masteryLevel: number;
  wrongCount: number;
  timesReviewed: number;
  lastReviewed?: number;
}): number {
  const now = Date.now();
  const timeSinceLastMs = item.lastReviewed ? Math.max(0, now - item.lastReviewed) : 1000 * 60 * 60 * 24;
  const hoursSinceLast = timeSinceLastMs / (1000 * 60 * 60);

  // High wrong count increases priority
  // High mastery level decreases priority unless lots of time has passed
  const mistakeWeight = item.wrongCount * 3.5;
  const timeWeight = Math.min(10, hoursSinceLast / 4);
  const masteryDecay = item.masteryLevel * 2.0;

  return Math.max(0, mistakeWeight + timeWeight - masteryDecay + (item.timesReviewed === 0 ? 5 : 0));
}

/**
 * Normalizes Spanish text for comparisons (removes punctuation, lowercases, handles accents).
 */
export function normalizeSpanish(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accent diacritics for flexible matching
    .replace(/[¡!¿?.,;:"]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Checks if a typed answer closely matches the expected answer.
 */
export function isSpanishAnswerMatch(userInput: string, expected: string): boolean {
  const normUser = normalizeSpanish(userInput);
  const normExpected = normalizeSpanish(expected);
  return normUser === normExpected;
}

/**
 * Checks all achievement conditions against the player profile.
 */
export function checkAchievements(
  profile: UserProfile,
  achievements: Achievement[]
): { updatedAchievements: Achievement[]; newlyUnlocked: Achievement[] } {
  const newlyUnlocked: Achievement[] = [];

  const updatedAchievements = achievements.map((ach) => {
    if (ach.unlocked) return ach;

    let shouldUnlock = false;
    switch (ach.id) {
      case 'first_goal':
        shouldUnlock = profile.goals >= 1;
        break;
      case 'words_10':
        shouldUnlock = profile.wordsLearnedCount >= 10;
        break;
      case 'streak_10':
        shouldUnlock = profile.bestStreak >= 10;
        break;
      case 'phrases_master':
        shouldUnlock = profile.phrasesLearnedCount >= 20;
        break;
      case 'listening_king':
        shouldUnlock = profile.matchesPlayed >= 5;
        break;
      case 'conversation_champ':
        shouldUnlock = profile.xp >= 600;
        break;
      case 'legend':
        shouldUnlock = profile.goals >= 15 && profile.wordsLearnedCount >= 50 && profile.phrasesLearnedCount >= 30;
        break;
    }

    if (shouldUnlock) {
      const unlockedAch: Achievement = { ...ach, unlocked: true, unlockedAt: Date.now() };
      newlyUnlocked.push(unlockedAch);
      return unlockedAch;
    }
    return ach;
  });

  return { updatedAchievements, newlyUnlocked };
}
