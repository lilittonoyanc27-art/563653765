import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLevel,
  resolvePenaltyShot,
  calculateSrsPriority,
  normalizeSpanish,
  isSpanishAnswerMatch,
  checkAchievements,
} from './pure_logic.ts';
import type { UserProfile, Achievement } from './types.ts';

test('calculateLevel computes levels and progress percent correctly', () => {
  // Level 1: 0 - 99 XP (cost = 100)
  const l1 = calculateLevel(0);
  assert.equal(l1.level, 1);
  assert.equal(l1.currentLevelXp, 0);
  assert.equal(l1.nextLevelXpThreshold, 100);
  assert.equal(l1.progressPercent, 0);

  const l1Half = calculateLevel(50);
  assert.equal(l1Half.level, 1);
  assert.equal(l1Half.currentLevelXp, 50);
  assert.equal(l1Half.progressPercent, 50);

  // Level 2 begins at 100 XP, threshold = 200 XP
  const l2 = calculateLevel(100);
  assert.equal(l2.level, 2);
  assert.equal(l2.currentLevelXp, 0);
  assert.equal(l2.nextLevelXpThreshold, 200);

  // Level 3 begins at 300 XP (100 + 200)
  const l3 = calculateLevel(350);
  assert.equal(l3.level, 3);
  assert.equal(l3.currentLevelXp, 50);
});

test('resolvePenaltyShot correctly determines goal or save', () => {
  // Target 1, keeper dives 1 -> saved
  const save = resolvePenaltyShot(1, 1);
  assert.equal(save.isGoal, false);
  assert.match(save.messageEs, /detiene/i);

  // Target 1, keeper dives 3 -> goal!
  const goal = resolvePenaltyShot(1, 3);
  assert.equal(goal.isGoal, true);
  assert.match(goal.messageEs, /GOOOOLAZO/i);
});

test('calculateSrsPriority prioritizes items with mistakes and low mastery', () => {
  const troubledItem = {
    masteryLevel: 1,
    wrongCount: 4,
    timesReviewed: 3,
    lastReviewed: Date.now() - 1000 * 60 * 60 * 12,
  };
  const masteredItem = {
    masteryLevel: 5,
    wrongCount: 0,
    timesReviewed: 8,
    lastReviewed: Date.now() - 1000 * 60 * 60 * 1,
  };

  const priorityTroubled = calculateSrsPriority(troubledItem);
  const priorityMastered = calculateSrsPriority(masteredItem);

  assert.ok(priorityTroubled > priorityMastered);
});

test('normalizeSpanish and isSpanishAnswerMatch handle accents and punctuation', () => {
  assert.equal(normalizeSpanish('¡Hola, amigo!'), 'hola amigo');
  assert.equal(normalizeSpanish('¿Cómo estás?'), 'como estas');

  assert.equal(isSpanishAnswerMatch('¡Pásame el balón!', 'pasame el balon'), true);
  assert.equal(isSpanishAnswerMatch('Estoy listo.', 'ESTOY LISTO'), true);
  assert.equal(isSpanishAnswerMatch('No quiero', 'Quiero jugar'), false);
});

test('checkAchievements unlocks badges when criteria are met', () => {
  const baseProfile: UserProfile = {
    name: 'Razmik',
    position: 'Centrocampista',
    spanishLevel: 'A1',
    footballLevel: 1,
    xp: 650,
    goals: 2,
    wordsLearnedCount: 12,
    phrasesLearnedCount: 22,
    matchesPlayed: 6,
    trophiesWon: 1,
    streak: 11,
    bestStreak: 11,
    jerseyColor: '#16a34a',
    jerseyNumber: 10,
    hairStyle: 'short',
    teamName: 'FC Razmik Champions',
    clubEmblem: '⚡',
  };

  const mockAchievements: Achievement[] = [
    { id: 'first_goal', titleEs: 'Primer gol', titleHy: 'Առաջին գոլ', descEs: '', descHy: '', icon: '⚽', unlocked: false },
    { id: 'words_10', titleEs: '10 palabras', titleHy: '10 բառ', descEs: '', descHy: '', icon: '🎯', unlocked: false },
    { id: 'streak_10', titleEs: '10 racha', titleHy: '10 անընդմեջ', descEs: '', descHy: '', icon: '🔥', unlocked: false },
    { id: 'legend', titleEs: 'Leyenda', titleHy: 'Լեգենդ', descEs: '', descHy: '', icon: '👑', unlocked: false },
  ];

  const { updatedAchievements, newlyUnlocked } = checkAchievements(baseProfile, mockAchievements);

  // first_goal, words_10, streak_10 should unlock, but not legend (goals < 15)
  assert.equal(newlyUnlocked.length, 3);
  assert.equal(updatedAchievements.find(a => a.id === 'first_goal')?.unlocked, true);
  assert.equal(updatedAchievements.find(a => a.id === 'words_10')?.unlocked, true);
  assert.equal(updatedAchievements.find(a => a.id === 'streak_10')?.unlocked, true);
  assert.equal(updatedAchievements.find(a => a.id === 'legend')?.unlocked, false);
});
