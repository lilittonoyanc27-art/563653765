export type GameModeId =
  | 'menu'
  | 'juego1_penaltis'
  | 'juego2_entrenador'
  | 'juego3_vocabulario'
  | 'juego4_grita'
  | 'juego5_vestuario'
  | 'juego6_comentarista'
  | 'juego7_responderias'
  | 'juego8_pases'
  | 'juego9_champions'
  | 'juego10_fichaje'
  | 'progreso'
  | 'perfil';

export interface UserProfile {
  name: string;
  position: string;
  spanishLevel: 'A1' | 'A2' | 'B1';
  footballLevel: number;
  xp: number;
  goals: number;
  wordsLearnedCount: number;
  phrasesLearnedCount: number;
  matchesPlayed: number;
  trophiesWon: number;
  streak: number;
  bestStreak: number;
  jerseyColor: string;
  jerseyNumber: number;
  hairStyle: string;
  teamName: string;
  clubEmblem: string;
}

export interface VocabItem {
  id: string;
  category: 'campo' | 'posiciones' | 'acciones' | 'estadio';
  spanish: string;
  armenian: string;
  phonetic?: string;
  exampleEs: string;
  exampleHy: string;
  masteryLevel: number; // 0 to 5
  timesReviewed: number;
  lastReviewed?: number;
  wrongCount: number;
}

export interface MatchPhrase {
  id: string;
  spanish: string;
  armenian: string;
  context: string;
  contextHy: string;
  difficulty: 'A1' | 'A2' | 'B1';
}

export interface CoachQuestion {
  id: string;
  questionEs: string;
  questionHy: string;
  options: {
    textEs: string;
    textHy: string;
    isCorrect: boolean;
  }[];
  wordsToAssemble: string[];
  sampleAnswerEs: string;
  sampleAnswerHy: string;
}

export interface PenaltyChallenge {
  id: string;
  spokenPhraseEs: string;
  armenianTranslation: string;
  optionsHy: string[];
  correctIndex: number;
  explanationHy: string;
}

export interface LockerRoomScene {
  id: string;
  character: 'Entrenador' | 'Capitán' | 'Portero' | 'Amigo' | 'Fichaje Nuevo';
  situationEs: string;
  situationHy: string;
  phraseEs: string;
  phraseHy: string;
  replies: {
    textEs: string;
    textHy: string;
    nuanceHy: string;
    reactionEs: string;
    reactionHy: string;
    moraleBonus: number;
  }[];
}

export interface CommentatorScenario {
  id: string;
  title: string;
  situationHy: string;
  visualAction: 'corriendo' | 'disparo' | 'pase_largo' | 'parada_portero' | 'celebracion' | 'falta';
  optionsEs: string[];
  correctIndex: number;
  translationHy: string;
  detailedCommentaryEs: string;
  detailedCommentaryHy: string;
}

export interface ReflexQuestion {
  id: string;
  topic: string;
  topicHy: string;
  questionEs: string;
  questionHy: string;
  optionsEs: string[];
  correctIndex: number;
  translationHy: string;
  speedBonus: number;
}

export interface PassChallenge {
  id: string;
  promptEs: string;
  promptHy: string;
  teammates: {
    playerPos: 'left' | 'center' | 'right';
    name: string;
    optionEs: string;
    isCorrect: boolean;
    explanationHy: string;
  }[];
}

export interface StoryChapter {
  id: number;
  titleEs: string;
  titleHy: string;
  introEs: string;
  introHy: string;
  dialoguePairs: {
    speaker: string;
    lineEs: string;
    lineHy: string;
  }[];
  decision: {
    promptEs: string;
    promptHy: string;
    choices: {
      choiceEs: string;
      choiceHy: string;
      outcomeEs: string;
      outcomeHy: string;
      xpReward: number;
    }[];
  };
}

export interface TournamentStage {
  stageNumber: number;
  nameEs: string;
  nameHy: string;
  opponent: string;
  opponentBadge: string;
  descriptionEs: string;
  descriptionHy: string;
  targetScore: number;
  questionsCount: number;
  unlocked: boolean;
  completed: boolean;
}

export interface Achievement {
  id: string;
  titleEs: string;
  titleHy: string;
  descEs: string;
  descHy: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
}
