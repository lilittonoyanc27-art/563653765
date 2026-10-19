import React, { useState, useEffect, useMemo } from 'react';
import type {
  GameModeId,
  UserProfile,
  VocabItem,
  MatchPhrase,
  CoachQuestion,
  PenaltyChallenge,
  LockerRoomScene,
  CommentatorScenario,
  ReflexQuestion,
  PassChallenge,
  StoryChapter,
  TournamentStage,
  Achievement,
} from './types.ts';
import {
  loadProfile,
  saveProfile,
  loadVocab,
  saveVocab,
  loadAchievements,
  saveAchievements,
  loadTournaments,
  saveTournaments,
  exportSaveData,
  importSaveData,
} from './storage.ts';
import {
  calculateLevel,
  resolvePenaltyShot,
  calculateSrsPriority,
  isSpanishAnswerMatch,
  checkAchievements,
} from './pure_logic.ts';
import { sounds, speakSpanish, isSpeechRecognitionSupported } from './audio.ts';
import { INITIAL_VOCABULARY } from './data_vocab.ts';
import { MATCH_PHRASES } from './data_phrases.ts';
import { COACH_QUESTIONS, LOCKER_ROOM_SCENES } from './data_dialogues.ts';
import {
  PENALTY_CHALLENGES,
  COMMENTATOR_SCENARIOS,
  REFLEX_QUESTIONS,
  PASS_CHALLENGES,
  STORY_CHAPTERS,
  TOURNAMENT_STAGES,
} from './data_challenges.ts';
import { StadiumCanvas } from './StadiumCanvas.tsx';
import {
  Trophy,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Sparkles,
  Award,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Mic,
  Languages,
  User,
  Settings,
  HelpCircle,
  Download,
  Upload,
  ArrowLeft,
  Flame,
  Zap,
} from 'lucide-react';

export default function App() {
  // Navigation & Profile State
  const [currentMode, setCurrentMode] = useState<GameModeId>('menu');
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [vocab, setVocab] = useState<VocabItem[]>(loadVocab);
  const [achievements, setAchievements] = useState<Achievement[]>(loadAchievements);
  const [tournaments, setTournaments] = useState<TournamentStage[]>(loadTournaments);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [showArmenianHints, setShowArmenianHints] = useState<boolean>(true);
  const [unlockedBanner, setUnlockedBanner] = useState<Achievement | null>(null);

  // Auto-start query parameter check (?autostart=1)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        setHasStarted(true);
      }
    }
  }, []);

  // Sync profile & check achievements on XP or stat updates
  const addXpAndStats = (xpGain: number, extra?: Partial<UserProfile>) => {
    setProfile((prev) => {
      const newXp = prev.xp + xpGain;
      const { level } = calculateLevel(newXp);
      const updated: UserProfile = {
        ...prev,
        ...extra,
        xp: newXp,
        footballLevel: Math.max(prev.footballLevel, level),
        streak: (extra?.streak !== undefined ? extra.streak : prev.streak) + 1,
        bestStreak: Math.max(prev.bestStreak, (prev.streak || 0) + 1),
      };
      saveProfile(updated);

      // Check achievements
      const { updatedAchievements, newlyUnlocked } = checkAchievements(updated, achievements);
      if (newlyUnlocked.length > 0) {
        setAchievements(updatedAchievements);
        saveAchievements(updatedAchievements);
        setUnlockedBanner(newlyUnlocked[0]);
        sounds.playGoal();
        setTimeout(() => setUnlockedBanner(null), 5000);
      }

      return updated;
    });
  };

  const handleSoundToggle = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    sounds.setSoundEnabled(!next);
  };

  // --- SUBGAME STATES ---

  // Juego 1: Penaltis
  const [penIndex, setPenIndex] = useState(0);
  const [penAnsweredCorrect, setPenAnsweredCorrect] = useState(false);
  const [penSelectedZone, setPenSelectedZone] = useState<number | null>(null);
  const [penIsShooting, setPenIsShooting] = useState(false);
  const [penKeeperDive, setPenKeeperDive] = useState<number | null>(null);
  const [penShotResult, setPenShotResult] = useState<{ es: string; hy: string; isGoal: boolean } | null>(null);

  const currentPenalty = PENALTY_CHALLENGES[penIndex % PENALTY_CHALLENGES.length];

  const handlePenaltyChoice = (choiceIdx: number) => {
    if (choiceIdx === currentPenalty.correctIndex) {
      sounds.playCorrect();
      setPenAnsweredCorrect(true);
      speakSpanish(currentPenalty.spokenPhraseEs);
      addXpAndStats(15, { matchesPlayed: profile.matchesPlayed + 1 });
    } else {
      sounds.playWrong();
      setProfile((p) => ({ ...p, streak: 0 }));
    }
  };

  const handleTakePenalty = () => {
    if (penSelectedZone === null || penIsShooting) return;
    setPenIsShooting(true);
    sounds.playKick();

    const diveZone = Math.floor(Math.random() * 5);
    setPenKeeperDive(diveZone);

    setTimeout(() => {
      const res = resolvePenaltyShot(penSelectedZone, diveZone);
      setPenShotResult({ es: res.messageEs, hy: res.messageHy, isGoal: res.isGoal });
      setPenIsShooting(false);

      if (res.isGoal) {
        sounds.playGoal();
        addXpAndStats(35, { goals: profile.goals + 1 });
      } else {
        sounds.playWrong();
      }
    }, 1100);
  };

  const nextPenaltyQuestion = () => {
    setPenIndex((prev) => prev + 1);
    setPenAnsweredCorrect(false);
    setPenSelectedZone(null);
    setPenKeeperDive(null);
    setPenShotResult(null);
  };

  // Juego 2: Coach Dialogue
  const [coachIdx, setCoachIdx] = useState(0);
  const [coachMode, setCoachMode] = useState<'choice' | 'words' | 'type' | 'listen'>('choice');
  const [assembledWords, setAssembledWords] = useState<string[]>([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [coachAnswerStatus, setCoachAnswerStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const currentCoachQ = COACH_QUESTIONS[coachIdx % COACH_QUESTIONS.length];

  const handleCoachOptionSelect = (isCorrect: boolean) => {
    if (isCorrect) {
      sounds.playCorrect();
      setCoachAnswerStatus('correct');
      speakSpanish(currentCoachQ.sampleAnswerEs);
      addXpAndStats(25, { phrasesLearnedCount: profile.phrasesLearnedCount + 1 });
    } else {
      sounds.playWrong();
      setCoachAnswerStatus('wrong');
      setProfile((p) => ({ ...p, streak: 0 }));
    }
  };

  // Juego 3: Vocabulary Arena (Dribble duel)
  const [vocabCategory, setVocabCategory] = useState<'campo' | 'posiciones' | 'acciones' | 'estadio'>('campo');
  const [vocabDuelIdx, setVocabDuelIdx] = useState(0);
  const [duelDistance, setDuelDistance] = useState(0); // 0 to 4 (4 is goal!)
  const filteredVocab = useMemo(
    () => vocab.filter((v) => v.category === vocabCategory),
    [vocab, vocabCategory]
  );
  const currentVocabWord = filteredVocab[vocabDuelIdx % filteredVocab.length];

  // 3 choices for vocab duel
  const vocabChoices = useMemo(() => {
    if (!currentVocabWord) return [];
    const others = filteredVocab
      .filter((w) => w.id !== currentVocabWord.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
    const combined = [currentVocabWord, ...others].sort(() => 0.5 - Math.random());
    return combined;
  }, [currentVocabWord, filteredVocab]);

  const handleVocabAnswer = (chosenId: string) => {
    if (!currentVocabWord) return;
    if (chosenId === currentVocabWord.id) {
      sounds.playCorrect();
      speakSpanish(currentVocabWord.spanish);
      const newDist = duelDistance + 1;
      if (newDist >= 4) {
        sounds.playGoal();
        addXpAndStats(40, {
          goals: profile.goals + 1,
          wordsLearnedCount: profile.wordsLearnedCount + 1,
        });
        setDuelDistance(0);
      } else {
        setDuelDistance(newDist);
        addXpAndStats(10);
      }
      setVocabDuelIdx((p) => p + 1);
    } else {
      sounds.playWrong();
      setDuelDistance(Math.max(0, duelDistance - 1));
      setProfile((p) => ({ ...p, streak: 0 }));
    }
  };

  // Juego 4: Grita como un futbolista
  const [shoutIdx, setShoutIdx] = useState(0);
  const currentShout = MATCH_PHRASES[shoutIdx % MATCH_PHRASES.length];
  const shoutOptions = useMemo(() => {
    const others = MATCH_PHRASES.filter((p) => p.id !== currentShout.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 2);
    return [currentShout, ...others].sort(() => 0.5 - Math.random());
  }, [currentShout]);

  const handleShoutChoice = (selectedId: string) => {
    if (selectedId === currentShout.id) {
      sounds.playCorrect();
      speakSpanish(currentShout.spanish);
      addXpAndStats(20, { phrasesLearnedCount: profile.phrasesLearnedCount + 1 });
      setTimeout(() => setShoutIdx((p) => p + 1), 1200);
    } else {
      sounds.playWrong();
      setProfile((p) => ({ ...p, streak: 0 }));
    }
  };

  // Juego 5: El Vestuario
  const [sceneIdx, setSceneIdx] = useState(0);
  const [selectedLockerReply, setSelectedLockerReply] = useState<number | null>(null);
  const currentLockerScene = LOCKER_ROOM_SCENES[sceneIdx % LOCKER_ROOM_SCENES.length];

  // Juego 6: El Comentarista Loco
  const [comIdx, setComIdx] = useState(0);
  const [comStatus, setComStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const currentCommentary = COMMENTATOR_SCENARIOS[comIdx % COMMENTATOR_SCENARIOS.length];

  // Juego 7: ¿Qué responderías? (Reflex Q&A)
  const [reflexIdx, setReflexIdx] = useState(0);
  const [reflexTimer, setReflexTimer] = useState(12);
  const currentReflex = REFLEX_QUESTIONS[reflexIdx % REFLEX_QUESTIONS.length];

  useEffect(() => {
    if (currentMode !== 'juego7_responderias') return;
    const interval = setInterval(() => {
      setReflexTimer((prev) => {
        if (prev <= 1) {
          sounds.playWrong();
          setReflexIdx((i) => i + 1);
          return 12;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentMode, reflexIdx]);

  // Juego 8: Elige el pase correcto
  const [passIdx, setPassIdx] = useState(0);
  const [passFeedback, setPassFeedback] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const currentPassChallenge = PASS_CHALLENGES[passIdx % PASS_CHALLENGES.length];

  const handlePassChoice = (isCorrect: boolean, explanation: string) => {
    if (isCorrect) {
      sounds.playCorrect();
      setPassFeedback({ isCorrect: true, explanation });
      addXpAndStats(25);
    } else {
      sounds.playWrong();
      setPassFeedback({ isCorrect: false, explanation });
      setProfile((p) => ({ ...p, streak: 0 }));
    }
  };

  // Juego 9: Champions de las Palabras
  const [champStageIdx, setChampStageIdx] = useState(0);
  const [champScore, setChampScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [champQIndex, setChampQIndex] = useState(0);
  const currentTournament = tournaments[champStageIdx];

  // Juego 10: Misión Secreta: El Fichaje
  const [storyChapterIdx, setStoryChapterIdx] = useState(0);
  const [storyOutcome, setStoryOutcome] = useState<string | null>(null);
  const currentChapter = STORY_CHAPTERS[storyChapterIdx % STORY_CHAPTERS.length];

  // Level info
  const levelInfo = useMemo(() => calculateLevel(profile.xp), [profile.xp]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-400 selection:text-slate-950">
      {/* Top Header / Stadium Scoreboard Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-emerald-500/20 px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Logo / Club Title */}
          <button
            onClick={() => {
              setCurrentMode('menu');
              sounds.playClick();
            }}
            className="flex items-center gap-2.5 text-left group"
            aria-label="Volver al menú principal"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-amber-400 flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              {profile.clubEmblem || '⚽'}
            </div>
            <div>
              <div className="font-arcade text-lg font-bold tracking-wide text-amber-400 leading-tight">
                RAZMIK FOOTBALL
              </div>
              <div className="text-xs text-emerald-300 font-medium tracking-wider uppercase">
                {profile.teamName || 'Speaking Club'}
              </div>
            </div>
          </button>

          {/* Player Mini Stats HUD */}
          <div className="flex items-center gap-2 sm:gap-4 text-xs font-semibold">
            {/* Level Badge */}
            <div className="bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60 flex items-center gap-1.5">
              <span className="text-amber-400 font-arcade text-sm">LVL {levelInfo.level}</span>
              <div className="hidden sm:block w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                />
              </div>
            </div>

            {/* Goals Scored */}
            <div className="bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60 flex items-center gap-1">
              <span>⚽</span>
              <span className="text-emerald-400 font-arcade text-sm">{profile.goals}</span>
              <span className="hidden md:inline text-slate-400">goles</span>
            </div>

            {/* Streak */}
            {profile.streak > 1 && (
              <div className="hidden lg:flex items-center gap-1 bg-amber-500/20 text-amber-300 px-2.5 py-1.5 rounded-lg border border-amber-500/30">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>{profile.streak} racha</span>
              </div>
            )}

            {/* Audio Toggle */}
            <button
              onClick={handleSoundToggle}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              aria-label={soundMuted ? 'Activar sonido' : 'Silenciar sonido'}
              title={soundMuted ? 'Activar sonido' : 'Silenciar sonido'}
            >
              {soundMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            {/* Armenian Hint Toggle */}
            <button
              onClick={() => setShowArmenianHints((p) => !p)}
              className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${
                showArmenianHints ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
              }`}
              aria-label="Mostrar/Ocultar traducción armenia"
              title="Հայերեն թարգմանությունների ցուցադրում"
            >
              <Languages className="w-4 h-4" />
              <span className="hidden xl:inline text-xs">ՀԱՅ</span>
            </button>

            {/* Profile Drawer */}
            <button
              onClick={() => {
                setCurrentMode('perfil');
                sounds.playClick();
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              aria-label="Abrir perfil de Razmik"
              title="Профиль Размика"
            >
              <User className="w-4 h-4 text-amber-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Unlocked Achievement Toast Notification */}
      {unlockedBanner && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border-2 border-white animate-bounce">
          <span className="text-3xl">{unlockedBanner.icon}</span>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-900">¡NUEVO LOGRO DESBLOQUEADO!</div>
            <div className="text-base font-extrabold">{unlockedBanner.titleEs}</div>
            <div className="text-xs font-medium text-slate-800">{unlockedBanner.titleHy}</div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 flex flex-col">
        {/* WELCOME / FIRST SCREEN (When not yet started) */}
        {!hasStarted && currentMode === 'menu' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center my-auto py-8">
            {/* Animated Football Mascot Emblem */}
            <div className="relative mb-6">
              <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-emerald-500 via-green-600 to-amber-500 p-1 shadow-2xl shadow-emerald-500/40 animate-pulse-subtle">
                <div className="w-full h-full bg-slate-950 rounded-[22px] flex flex-col items-center justify-center p-3">
                  <span className="text-5xl mb-1">⚽</span>
                  <span className="font-arcade text-xs text-amber-400 font-bold uppercase tracking-widest">RAZMIK #10</span>
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md font-extrabold text-xs shadow-md">
                A1 - B1
              </div>
            </div>

            {/* Requested exact welcome headers */}
            <h1 className="text-3xl md:text-5xl font-extrabold font-arcade text-white tracking-tight mb-2">
              ⚽ ¡BIENVENIDO, RAZMIK!
            </h1>
            <h2 className="text-xl md:text-2xl font-bold text-amber-400 mb-2">
              ¡Hoy vas a hablar español como un verdadero futbolista!
            </h2>
            <p className="text-base md:text-lg text-emerald-300 font-medium max-w-xl mb-6">
              ¿ESTÁS LISTO PARA CONVERTIRTE EN UNA ESTRELLA DEL FÚTBOL Y DEL ESPAÑOL?
            </p>

            <div className="text-xs md:text-sm text-slate-400 max-w-lg mb-8">
              Խոսի՛ր իսպաներեն, խփի՛ր 11-մետրանոցներ, զրուցի՛ր մարզչի ու թիմակիցներիդ հետ հանդերձարանում և նվաճի՛ր Չեմպիոնների Լիգան։
            </div>

            {/* Requested Big Orange Button */}
            <button
              onClick={() => {
                setHasStarted(true);
                sounds.playWhistle();
              }}
              className="px-10 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-lg md:text-xl shadow-xl shadow-orange-500/30 transform hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-3 cursor-pointer"
            >
              <Play className="w-6 h-6 fill-current text-slate-950" />
              <span>🟢 ¡EMPEZAR A JUGAR!</span>
            </button>
          </div>
        )}

        {/* MAIN GAME HUB / MODES MENU */}
        {hasStarted && currentMode === 'menu' && (
          <div className="flex flex-col gap-6">
            {/* Stadium Banner & Quick Play Action */}
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 border border-emerald-500/30 p-6 md:p-8 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-emerald-500/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Stade de España • Modo Carrera</span>
                </div>
                <h2 className="text-2xl md:text-4xl font-extrabold font-arcade text-white">
                  ¡A JUGAR, RAZMIK!
                </h2>
                <p className="text-sm md:text-base text-slate-300 max-w-md">
                  Ընտրի՛ր 10 ինտերակտիվ ֆուտբոլային ռեժիմներից մեկը և կատարելագործիր խոսակցական իսպաներենդ։
                </p>
              </div>

              {/* Quick Launch Buttons */}
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  onClick={() => {
                    setCurrentMode('juego1_penaltis');
                    sounds.playClick();
                  }}
                  className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  <span>⚽</span>
                  <span>¡Disparar Penaltis!</span>
                </button>
                <button
                  onClick={() => {
                    setCurrentMode('progreso');
                    sounds.playClick();
                  }}
                  className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
                >
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span>Իմ առաջընթացը</span>
                </button>
              </div>
            </div>

            {/* 10 Game Modes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Game 1 */}
              <div
                onClick={() => {
                  setCurrentMode('juego1_penaltis');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
                    1
                  </div>
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    40+ Penaltis
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors mb-1 font-arcade">
                  ¡ESCUCHA Y DISPARA!
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Լսի՛ր իսպաներեն արտահայտությունը, ընտրի՛ր ճիշտ հայերեն թարգմանությունը և խփի՛ր 11-մետրանոց դարպասապահին։
                </p>
                <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <span>¡Jugar ahora!</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 2 */}
              <div
                onClick={() => {
                  setCurrentMode('juego2_entrenador');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl font-bold">
                    2
                  </div>
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    50+ Preguntas
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors mb-1 font-arcade">
                  ¡HABLA CON TU ENTRENADOR!
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Զրույց մարզչի հետ դաշտում։ 5 ռեժիմ՝ պատասխանի ընտրություն, բառերի հավաքում, մուտքագրում և ձայն։
                </p>
                <div className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                  <span>Conversar con el míster</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 3 */}
              <div
                onClick={() => {
                  setCurrentMode('juego3_vocabulario');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center text-xl font-bold">
                    3
                  </div>
                  <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                    150+ Palabras
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-sky-300 transition-colors mb-1 font-arcade">
                  VOCABULARY ARENA
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Ֆուտբոլային դուելներ։ Խաբս տուր պաշտպաններին ճիշտ թարգմանությամբ և հասիր դարպասին։
                </p>
                <div className="text-xs text-sky-400 font-semibold flex items-center gap-1">
                  <span>Entrar a la arena</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 4 */}
              <div
                onClick={() => {
                  setCurrentMode('juego4_grita');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center text-xl font-bold">
                    4
                  </div>
                  <span className="text-xs font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                    60+ Frases reales
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-orange-300 transition-colors mb-1 font-arcade">
                  ¡GRITA COMO UN FUTBOLISTA!
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Իրական խաղային գոռոցներ՝ «¡Pásame el balón!», «¡Estoy libre!», «¡Tira a puerta!» դաշտում։
                </p>
                <div className="text-xs text-orange-400 font-semibold flex items-center gap-1">
                  <span>Gritar en el campo</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 5 */}
              <div
                onClick={() => {
                  setCurrentMode('juego5_vestuario');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-xl font-bold">
                    5
                  </div>
                  <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    25+ Escenas
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors mb-1 font-arcade">
                  EL VESTUARIO
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Հանդերձարանի զրույցներ ավագի, դարպասապահի ու նորեկի հետ։ «¡Venga!», «¡No pasa nada!», «¡Genial!»։
                </p>
                <div className="text-xs text-purple-400 font-semibold flex items-center gap-1">
                  <span>Abrir vestuario</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 6 */}
              <div
                onClick={() => {
                  setCurrentMode('juego6_comentarista');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center text-xl font-bold">
                    6
                  </div>
                  <span className="text-xs font-bold text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20">
                    30+ Escenas
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-pink-300 transition-colors mb-1 font-arcade">
                  EL COMENTARISTA LOCO
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Դարձի՛ր ֆուտբոլային մեկնաբան։ Ուղիղ եթերում նկարագրիր գոլերը, հարվածներն ու սեյվերը։
                </p>
                <div className="text-xs text-pink-400 font-semibold flex items-center gap-1">
                  <span>Comentar jugadas</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 7 */}
              <div
                onClick={() => {
                  setCurrentMode('juego7_responderias');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center text-xl font-bold">
                    7
                  </div>
                  <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                    100 Preguntas
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-red-300 transition-colors mb-1 font-arcade">
                  ¿QUÉ RESPONDERÍAS?
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Լսողական ռեֆլեքսների խաղ։ Արագ արձագանքիր հարցերին ժամանակաչափով և վաստակիր բոնուսներ։
                </p>
                <div className="text-xs text-red-400 font-semibold flex items-center gap-1">
                  <span>Desafío de reflejos</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 8 */}
              <div
                onClick={() => {
                  setCurrentMode('juego8_pases');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center text-xl font-bold">
                    8
                  </div>
                  <span className="text-xs font-bold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                    30+ Pases
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-teal-300 transition-colors mb-1 font-arcade">
                  ELIGE EL PASE CORRECTO
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Դաշտում վազող 3 թիմակիցներ։ Գնդակը փոխանցիր քերականորեն ճիշտ տարբերակով խաղացողին։
                </p>
                <div className="text-xs text-teal-400 font-semibold flex items-center gap-1">
                  <span>Pasar el balón</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 9 */}
              <div
                onClick={() => {
                  setCurrentMode('juego9_champions');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-xl font-bold">
                    9
                  </div>
                  <span className="text-xs font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    5 Etapas
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors mb-1 font-arcade">
                  CHAMPIONS DE LAS PALABRAS
                </h3>
                <p className="text-xs text-slate-400 mb-2">
                  Բառերի Չեմպիոնների Լիգա 5 փուլով ընդդեմ Սևիլյայի, Ատլետիկոյի, Բարսելոնայի և Ռեալ Մադրիդի։
                </p>
                <div className="text-xs text-amber-300 font-semibold flex items-center gap-1">
                  <span>Jugar torneo</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Game 10 */}
              <div
                onClick={() => {
                  setCurrentMode('juego10_fichaje');
                  sounds.playClick();
                }}
                className="group relative p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/60 shadow-lg cursor-pointer transition-all transform hover:-translate-y-1 md:col-span-2 lg:col-span-3"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 flex items-center justify-center text-xl font-extrabold">
                      10
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Modo Historia • 10 Capítulos
                    </span>
                  </div>
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                    ¡MISIÓN SECRETA!
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-white group-hover:text-amber-300 transition-colors mb-1 font-arcade">
                  MISIÓN SECRETA: EL FICHAJE EN ESPAÑA
                </h3>
                <p className="text-xs md:text-sm text-slate-300 mb-2">
                  Ռազմիկին հրավիրել են իսպանական ակադեմիա։ Ինտերակտիվ սյուժետային պատմություն, որտեղ քո որոշումները որոշում են թիմի հաջողությունը։
                </p>
                <div className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                  <span>Comenzar aventura</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 1: ¡ESCUCHA Y DISPARA! (PENALTIS) */}
        {/* ============================================================== */}
        {currentMode === 'juego1_penaltis' && (
          <div className="flex-1 flex flex-col gap-5">
            {/* Sub-header navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-arcade">
                PENALTI #{penIndex + 1} DE {PENALTY_CHALLENGES.length}
              </div>
            </div>

            {/* Stadium Pitch Canvas */}
            <StadiumCanvas
              mode="penalty"
              profile={profile}
              isShooting={penIsShooting}
              targetZone={penSelectedZone}
              keeperDiveZone={penKeeperDive}
              onShootZoneSelect={(z) => setPenSelectedZone(z)}
              resultMessage={penShotResult}
            />

            {/* Listening & Question Card */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      sounds.playClick();
                      speakSpanish(currentPenalty.spokenPhraseEs);
                    }}
                    className="w-12 h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center text-xl shadow-lg shadow-amber-500/20 transition-transform active:scale-95 cursor-pointer"
                    aria-label="Escuchar frase en español"
                    title="Լսել իսպաներենով"
                  >
                    <Volume2 className="w-6 h-6" />
                  </button>
                  <div>
                    <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                      El entrenador dice:
                    </div>
                    <div className="text-lg md:text-xl font-extrabold text-white font-arcade">
                      «{currentPenalty.spokenPhraseEs}»
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-400 sm:text-right">
                  ¿Cuál es el significado correcto en armenio?
                </div>
              </div>

              {/* 4 Armenian Options */}
              {!penAnsweredCorrect ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentPenalty.optionsHy.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePenaltyChoice(idx)}
                      className="p-3.5 rounded-xl bg-slate-800/80 hover:bg-emerald-600/20 border border-slate-700 hover:border-emerald-500/60 text-left font-medium text-sm text-slate-200 hover:text-white transition-all flex items-center gap-3 cursor-pointer"
                    >
                      <span className="w-6 h-6 rounded-lg bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                        {['A', 'B', 'C', 'D'][idx]}
                      </span>
                      <span>{opt}</span>
                    </button>
                  ))}
                </div>
              ) : (
                /* Penalty Kick Controls after answering correctly */
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{currentPenalty.explanationHy}</span>
                  </div>

                  {!penShotResult ? (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                      <div className="space-y-1.5 w-full sm:w-auto">
                        <div className="text-xs text-slate-300">
                          {penSelectedZone === null ? (
                            <span className="text-amber-400 font-medium">
                              👆 Ընտրի՛ր հարվածի ուղղությունը դարպասին կամ կոճակներով՝
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-medium">
                              🎯 Ուղղությունն ընտրված է։ Պատրաստվի՛ր հարվածելու։
                            </span>
                          )}
                        </div>

                        {/* 5 Quick Direction Buttons */}
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { id: 0, label: '↖️ Ձախ վերև' },
                            { id: 1, label: '↙️ Ձախ ներքև' },
                            { id: 2, label: '🎯 Կենտրոն' },
                            { id: 3, label: '↗️ Աջ վերև' },
                            { id: 4, label: '↘️ Աջ ներքև' },
                          ].map((z) => (
                            <button
                              key={z.id}
                              type="button"
                              onClick={() => {
                                setPenSelectedZone(z.id);
                                sounds.playClick();
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                penSelectedZone === z.id
                                  ? 'bg-amber-400 text-slate-950 shadow-md scale-105'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {z.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={handleTakePenalty}
                        disabled={penSelectedZone === null || penIsShooting}
                        className={`px-7 py-3 rounded-xl font-bold font-arcade tracking-wider text-sm flex items-center justify-center gap-2 shadow-xl shrink-0 transition-all ${
                          penSelectedZone !== null && !penIsShooting
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-orange-500/30 hover:scale-105 cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <span>⚽</span>
                        <span>¡DISPARAR PENALTI!</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={nextPenaltyQuestion}
                        className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
                      >
                        <span>Siguiente penalti</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 2: ¡HABLA CON TU ENTRENADOR! */}
        {/* ============================================================== */}
        {currentMode === 'juego2_entrenador' && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              {/* Practice Mode Selector */}
              <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs">
                {(['choice', 'words', 'type', 'listen'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setCoachMode(m);
                      setCoachAnswerStatus('idle');
                      setAssembledWords([]);
                      setTypedAnswer('');
                    }}
                    className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                      coachMode === m ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m === 'choice' && 'Տարբերակներ'}
                    {m === 'words' && 'Հավաքել'}
                    {m === 'type' && 'Մուտքագրել'}
                    {m === 'listen' && 'Աուդիո'}
                  </button>
                ))}
              </div>
            </div>

            {/* Coach Speech Card */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-6 rounded-3xl border border-emerald-500/30 shadow-2xl space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-3xl shrink-0 shadow">
                  👨‍🏫
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      Míster Carlos (Entrenador)
                    </span>
                    <button
                      onClick={() => speakSpanish(currentCoachQ.questionEs)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs flex items-center gap-1"
                      title="Լսել իսպաներենով"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Escuchar</span>
                    </button>
                  </div>
                  <div className="text-xl md:text-2xl font-extrabold text-white font-arcade">
                    «{currentCoachQ.questionEs}»
                  </div>
                  {showArmenianHints && (
                    <div className="text-sm text-emerald-300 font-medium">
                      Մարզիչ — {currentCoachQ.questionHy}
                    </div>
                  )}
                </div>
              </div>

              {/* Interaction Modes */}
              <div className="pt-4 border-t border-slate-800">
                {coachMode === 'choice' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentCoachQ.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleCoachOptionSelect(opt.isCorrect)}
                        className="p-4 rounded-xl bg-slate-850 hover:bg-emerald-600/20 border border-slate-700/80 hover:border-emerald-500/60 text-left transition-all group cursor-pointer"
                      >
                        <div className="text-sm font-bold text-white group-hover:text-emerald-300">
                          {opt.textEs}
                        </div>
                        {showArmenianHints && (
                          <div className="text-xs text-slate-400 mt-1">
                            {opt.textHy}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {coachMode === 'words' && (
                  <div className="space-y-4">
                    {/* Assembled sentence area */}
                    <div className="min-h-14 p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap gap-2 items-center">
                      {assembledWords.length === 0 ? (
                        <span className="text-xs text-slate-500">
                          Կտտացրու ներքևի բառերի վրա՝ նախադասությունը ճիշտ հերթականությամբ հավաքելու համար...
                        </span>
                      ) : (
                        assembledWords.map((w, idx) => (
                          <span
                            key={idx}
                            onClick={() => setAssembledWords((prev) => prev.filter((_, i) => i !== idx))}
                            className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-sm font-semibold cursor-pointer hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 transition-colors"
                          >
                            {w} ✕
                          </span>
                        ))
                      )}
                    </div>

                    {/* Word pool */}
                    <div className="flex flex-wrap gap-2">
                      {currentCoachQ.wordsToAssemble
                        .filter((w) => !assembledWords.includes(w))
                        .map((w, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              sounds.playClick();
                              setAssembledWords((prev) => [...prev, w]);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium text-slate-200 transition-colors cursor-pointer"
                          >
                            {w}
                          </button>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setAssembledWords([])}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                      >
                        Մաքրել
                      </button>
                      <button
                        onClick={() => {
                          const assembled = assembledWords.join(' ');
                          const match = isSpanishAnswerMatch(assembled, currentCoachQ.sampleAnswerEs);
                          if (match) {
                            sounds.playCorrect();
                            setCoachAnswerStatus('correct');
                            speakSpanish(assembled);
                            addXpAndStats(25);
                          } else {
                            sounds.playWrong();
                            setCoachAnswerStatus('wrong');
                          }
                        }}
                        className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                      >
                        Ստուգել
                      </button>
                    </div>
                  </div>
                )}

                {coachMode === 'type' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={typedAnswer}
                      onChange={(e) => setTypedAnswer(e.target.value)}
                      placeholder="Escribe tu respuesta en español aquí..."
                      className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                    />
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Հուշում՝ {currentCoachQ.sampleAnswerHy}</span>
                      <button
                        onClick={() => {
                          const match = isSpanishAnswerMatch(typedAnswer, currentCoachQ.sampleAnswerEs);
                          if (match) {
                            sounds.playCorrect();
                            setCoachAnswerStatus('correct');
                            speakSpanish(typedAnswer);
                            addXpAndStats(30);
                          } else {
                            sounds.playWrong();
                            setCoachAnswerStatus('wrong');
                          }
                        }}
                        className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                      >
                        Ուղարկել
                      </button>
                    </div>
                  </div>
                )}

                {coachMode === 'listen' && (
                  <div className="text-center py-6 space-y-4">
                    <button
                      onClick={() => speakSpanish(currentCoachQ.questionEs)}
                      className="w-16 h-16 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 mx-auto flex items-center justify-center text-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <Volume2 className="w-8 h-8" />
                    </button>
                    <div className="text-sm text-slate-300">
                      Լսիր մարզչի հարցը առանց գրավոր տեքստի, այնուհետև ընտրիր ճիշտ պատասխանը։
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
                      {currentCoachQ.options.map((opt, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleCoachOptionSelect(opt.isCorrect)}
                          className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium text-white"
                        >
                          {opt.textEs}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Feedback & Next Button */}
                {coachAnswerStatus !== 'idle' && (
                  <div
                    className={`mt-4 p-4 rounded-2xl border flex items-center justify-between ${
                      coachAnswerStatus === 'correct'
                        ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                        : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm">
                        {coachAnswerStatus === 'correct' ? '¡Excelente respuesta, Razmik!' : 'Casi... Buen intento.'}
                      </div>
                      <div className="text-xs opacity-90 mt-0.5">
                        Ճիշտ արտահայտություն՝ «{currentCoachQ.sampleAnswerEs}» — {currentCoachQ.sampleAnswerHy}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setCoachIdx((p) => p + 1);
                        setCoachAnswerStatus('idle');
                        setAssembledWords([]);
                        setTypedAnswer('');
                      }}
                      className="px-4 py-2 rounded-xl bg-white text-slate-950 font-bold text-xs shadow hover:bg-slate-200"
                    >
                      Հաջորդ հարցը →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 3: VOCABULARY ARENA (DRIBBLE DUELS) */}
        {/* ============================================================== */}
        {currentMode === 'juego3_vocabulario' && currentVocabWord && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              {/* Category tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
                {(['campo', 'posiciones', 'acciones', 'estadio'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setVocabCategory(cat);
                      setVocabDuelIdx(0);
                      setDuelDistance(0);
                    }}
                    className={`px-3 py-1.5 rounded-lg font-bold uppercase transition-colors shrink-0 ${
                      vocabCategory === cat
                        ? 'bg-sky-500 text-slate-950 shadow'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat === 'campo' && 'Խաղադաշտ'}
                    {cat === 'posiciones' && 'Դիրքեր'}
                    {cat === 'acciones' && 'Գործողություններ'}
                    {cat === 'estadio' && 'Մարզադաշտ'}
                  </button>
                ))}
              </div>
            </div>

            {/* Dribble Duel Pitch Tracker */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border border-emerald-500/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏃‍♂️</span>
                <div>
                  <div className="text-xs font-bold text-amber-400 font-arcade">DUELO DE REGATES</div>
                  <div className="text-xs text-slate-300">
                    Անցիր մրցակիցներին ({duelDistance}/4) և հասիր դարպասին
                  </div>
                </div>
              </div>

              {/* Step dots */}
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      duelDistance >= step
                        ? 'bg-amber-400 text-slate-950 scale-110 shadow-lg shadow-amber-400/40'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {step === 4 ? '⚽' : step + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Target Word Card */}
            <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl text-center space-y-4">
              <div className="inline-block px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold border border-sky-500/30">
                ¿Cuál es la traducción al armenio?
              </div>

              <div className="space-y-1">
                <div className="text-3xl md:text-4xl font-extrabold text-white font-arcade tracking-wide flex items-center justify-center gap-3">
                  <span>{currentVocabWord.spanish}</span>
                  <button
                    onClick={() => speakSpanish(currentVocabWord.spanish)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-sm"
                    title="Լսել արտասանությունը"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
                {currentVocabWord.phonetic && (
                  <div className="text-xs text-amber-400/90 font-medium">
                    [Արտասանություն՝ {currentVocabWord.phonetic}]
                  </div>
                )}
                <div className="text-xs text-slate-400 italic">
                  Օրինակ՝ «{currentVocabWord.exampleEs}»
                </div>
              </div>

              {/* 4 Choices */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                {vocabChoices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => handleVocabAnswer(choice.id)}
                    className="p-4 rounded-2xl bg-slate-800/80 hover:bg-sky-600/20 border border-slate-700 hover:border-sky-500 text-slate-100 hover:text-white font-bold text-base transition-all transform active:scale-98 cursor-pointer shadow"
                  >
                    {choice.armenian}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 4: ¡GRITA COMO UN FUTBOLISTA! */}
        {/* ============================================================== */}
        {currentMode === 'juego4_grita' && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/20 font-arcade">
                SITUACIÓN #{shoutIdx + 1} DE {MATCH_PHRASES.length}
              </div>
            </div>

            {/* Tactical pitch situation */}
            <div className="bg-slate-900 p-6 rounded-3xl border border-orange-500/30 shadow-2xl space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center text-2xl shrink-0">
                  📢
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-orange-400">
                    Situación en el campo:
                  </div>
                  <div className="text-base md:text-lg font-bold text-white mt-1">
                    {currentShout.context}
                  </div>
                  <div className="text-xs text-emerald-300 font-medium mt-0.5">
                    {currentShout.contextHy}
                  </div>
                </div>
              </div>

              <div className="text-center py-2">
                <span className="font-arcade text-lg font-bold text-amber-400">
                  ¿QUÉ DEBES GRITAR EN ESTE MOMENTO?
                </span>
              </div>

              {/* 3 shouted options */}
              <div className="grid grid-cols-1 gap-3">
                {shoutOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleShoutChoice(opt.id)}
                    className="p-4 rounded-2xl bg-slate-850 hover:bg-orange-500/20 border border-slate-700 hover:border-orange-500/60 text-left transition-all flex items-center justify-between gap-4 group cursor-pointer"
                  >
                    <div>
                      <div className="text-lg font-extrabold text-white group-hover:text-orange-300 font-arcade">
                        {opt.spanish}
                      </div>
                      {showArmenianHints && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {opt.armenian}
                        </div>
                      )}
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-slate-800 group-hover:bg-orange-500 group-hover:text-slate-950 text-slate-400 flex items-center justify-center transition-colors shrink-0">
                      <Volume2 className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 5: EL VESTUARIO */}
        {/* ============================================================== */}
        {currentMode === 'juego5_vestuario' && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20 font-arcade">
                ESCENA #{sceneIdx + 1} • {currentLockerScene.character.toUpperCase()}
              </div>
            </div>

            {/* Locker room atmosphere */}
            <div className="bg-slate-900 p-6 rounded-3xl border border-purple-500/30 shadow-2xl space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center justify-center text-3xl shrink-0">
                  🧥
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-400">
                    {currentLockerScene.character}
                  </div>
                  <div className="text-lg md:text-xl font-bold text-white font-arcade mt-1">
                    «{currentLockerScene.phraseEs}»
                  </div>
                  {showArmenianHints && (
                    <div className="text-xs text-emerald-300 font-medium mt-0.5">
                      {currentLockerScene.phraseHy}
                    </div>
                  )}
                </div>
              </div>

              {/* Replies choices */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  ¿Cómo responderías tú, Razmik?
                </div>
                {currentLockerScene.replies.map((rep, idx) => (
                  <div key={idx} className="space-y-2">
                    <button
                      onClick={() => {
                        sounds.playClick();
                        setSelectedLockerReply(idx);
                        speakSpanish(rep.textEs);
                        addXpAndStats(rep.moraleBonus);
                      }}
                      className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                        selectedLockerReply === idx
                          ? 'bg-purple-950/70 border-purple-400 text-white shadow-lg'
                          : 'bg-slate-850 hover:bg-slate-800 border-slate-700/80 text-slate-200'
                      }`}
                    >
                      <div className="text-base font-bold font-arcade">{rep.textEs}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{rep.textHy}</div>
                    </button>

                    {/* Nuance explanation in Armenian if selected */}
                    {selectedLockerReply === idx && (
                      <div className="p-3.5 rounded-xl bg-slate-950 border border-purple-500/30 text-xs space-y-2 animate-fadeIn">
                        <div className="text-amber-300 font-medium">
                          💡 <span className="font-bold">Իմաստի նրբերանգ՝</span> {rep.nuanceHy}
                        </div>
                        <div className="text-slate-300 pl-4 border-l-2 border-purple-400">
                          <span className="font-bold text-white">{currentLockerScene.character} արձագանքում է՝</span> «{rep.reactionEs}» ({rep.reactionHy})
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectedLockerReply !== null && (
                <div className="flex justify-end pt-3">
                  <button
                    onClick={() => {
                      setSceneIdx((p) => p + 1);
                      setSelectedLockerReply(null);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs shadow-lg shadow-purple-500/20"
                  >
                    Հաջորդ երկխոսությունը →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 6: EL COMENTARISTA LOCO */}
        {/* ============================================================== */}
        {currentMode === 'juego6_comentarista' && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-pink-400 bg-pink-500/10 px-2.5 py-1 rounded-lg border border-pink-500/20 font-arcade">
                MICRÓFONO EN DIRECTO • #{comIdx + 1}
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-3xl border border-pink-500/30 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center text-xl shrink-0">
                  🎙️
                </div>
                <div>
                  <div className="text-xs font-bold text-pink-400 uppercase tracking-wider">
                    ¿Qué está ocurriendo en el campo?
                  </div>
                  <div className="text-lg font-bold text-white">
                    {currentCommentary.situationHy}
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3 pt-2">
                {currentCommentary.optionsEs.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (idx === currentCommentary.correctIndex) {
                        sounds.playCorrect();
                        setComStatus('correct');
                        speakSpanish(currentCommentary.detailedCommentaryEs);
                        addXpAndStats(25);
                      } else {
                        sounds.playWrong();
                        setComStatus('wrong');
                      }
                    }}
                    className="w-full p-4 rounded-2xl bg-slate-850 hover:bg-pink-600/20 border border-slate-700 hover:border-pink-500 text-left font-semibold text-sm text-slate-100 hover:text-white transition-all cursor-pointer"
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {comStatus === 'correct' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-pink-500/40 text-xs space-y-2 animate-fadeIn">
                  <div className="text-pink-300 font-bold uppercase tracking-wider">
                    🎙️ Մեկնաբանի ամբողջական խոսքը՝
                  </div>
                  <div className="text-base font-extrabold text-white font-arcade">
                    «{currentCommentary.detailedCommentaryEs}»
                  </div>
                  <div className="text-xs text-slate-300">
                    {currentCommentary.detailedCommentaryHy}
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        setComIdx((p) => p + 1);
                        setComStatus('idle');
                      }}
                      className="px-5 py-2 rounded-xl bg-pink-500 text-slate-950 font-bold text-xs"
                    >
                      Հաջորդ դրվագը →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 7: ¿QUÉ RESPONDERÍAS? (REFLEX Q&A) */}
        {/* ============================================================== */}
        {currentMode === 'juego7_responderias' && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>

              {/* Timer Bar */}
              <div className="flex items-center gap-2 bg-red-500/20 px-3 py-1.5 rounded-lg border border-red-500/40">
                <Zap className="w-4 h-4 text-red-400 animate-pulse" />
                <span className="font-arcade text-sm font-bold text-red-400">{reflexTimer}s</span>
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-3xl border border-red-500/30 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2.5 py-1 rounded">
                  Թեմա՝ {currentReflex.topicHy} ({currentReflex.topic})
                </span>
                <button
                  onClick={() => speakSpanish(currentReflex.questionEs)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs flex items-center gap-1"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Escuchar</span>
                </button>
              </div>

              <div className="text-2xl md:text-3xl font-extrabold text-white font-arcade text-center py-4">
                «{currentReflex.questionEs}»
              </div>
              {showArmenianHints && (
                <div className="text-center text-xs text-emerald-300 font-medium">
                  {currentReflex.questionHy}
                </div>
              )}

              {/* 3 rapid options */}
              <div className="grid grid-cols-1 gap-3 pt-3">
                {currentReflex.optionsEs.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (idx === currentReflex.correctIndex) {
                        sounds.playCorrect();
                        speakSpanish(opt);
                        addXpAndStats(currentReflex.speedBonus);
                        setReflexIdx((p) => p + 1);
                        setReflexTimer(12);
                      } else {
                        sounds.playWrong();
                        setProfile((p) => ({ ...p, streak: 0 }));
                      }
                    }}
                    className="p-4 rounded-2xl bg-slate-850 hover:bg-red-600/20 border border-slate-700 hover:border-red-500 text-left font-bold text-base text-slate-100 hover:text-white transition-all cursor-pointer"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 8: ELIGE EL PASE CORRECTO */}
        {/* ============================================================== */}
        {currentMode === 'juego8_pases' && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20 font-arcade">
                JUGADA #{passIdx + 1} DE {PASS_CHALLENGES.length}
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-3xl border border-teal-500/30 shadow-2xl space-y-4">
              <div className="text-center space-y-1">
                <div className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                  Táctica de Pase:
                </div>
                <div className="text-xl md:text-2xl font-extrabold text-white font-arcade">
                  {currentPassChallenge.promptEs}
                </div>
                <div className="text-xs text-slate-400">
                  {currentPassChallenge.promptHy}
                </div>
              </div>

              {/* 3 Running teammates on pitch */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                {currentPassChallenge.teammates.map((tm, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePassChoice(tm.isCorrect, tm.explanationHy)}
                    className="p-4 rounded-2xl bg-slate-850 hover:bg-teal-500/20 border border-slate-700 hover:border-teal-500 flex flex-col items-center text-center gap-2 transition-all cursor-pointer group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      🏃
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase">{tm.name}</div>
                    <div className="text-base font-extrabold text-white group-hover:text-teal-300 font-arcade">
                      «{tm.optionEs}»
                    </div>
                  </button>
                ))}
              </div>

              {passFeedback && (
                <div
                  className={`p-4 rounded-2xl border text-xs space-y-2 animate-fadeIn ${
                    passFeedback.isCorrect
                      ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                  }`}
                >
                  <div className="font-bold text-sm">
                    {passFeedback.isCorrect ? '¡Pase perfecto al hueco!' : '¡Balón interceptado por el rival!'}
                  </div>
                  <div>{passFeedback.explanation}</div>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        setPassIdx((p) => p + 1);
                        setPassFeedback(null);
                      }}
                      className="px-4 py-1.5 rounded-lg bg-white text-slate-950 font-bold text-xs"
                    >
                      Հաջորդ փոխանցումը →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 9: LA CHAMPIONS DE LAS PALABRAS */}
        {/* ============================================================== */}
        {currentMode === 'juego9_champions' && currentTournament && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-arcade">
                ETAPA {currentTournament.stageNumber} / 5
              </div>
            </div>

            {/* Stadium Matchboard */}
            <div className="bg-slate-900 p-6 rounded-3xl border border-amber-500/30 shadow-2xl space-y-5">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{profile.clubEmblem}</span>
                  <div>
                    <div className="font-arcade text-lg font-bold text-white">{profile.teamName}</div>
                    <div className="text-xs text-slate-400">Razmik FC</div>
                  </div>
                </div>

                <div className="font-arcade text-3xl font-extrabold text-amber-400 tracking-widest px-4">
                  {champScore} - {rivalScore}
                </div>

                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="font-arcade text-lg font-bold text-white">{currentTournament.opponent}</div>
                    <div className="text-xs text-slate-400">Rival Juvenil</div>
                  </div>
                  <span className="text-3xl">{currentTournament.opponentBadge}</span>
                </div>
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-xl font-extrabold text-white font-arcade">
                  {currentTournament.nameEs}
                </h3>
                <p className="text-xs text-slate-400">
                  {currentTournament.descriptionHy}
                </p>
              </div>

              {/* Tournament Match Question */}
              <div className="p-4 rounded-2xl bg-slate-850 border border-slate-700 text-center space-y-3">
                <div className="text-xs text-amber-400 font-bold uppercase">
                  Pregunta de partido #{champQIndex + 1}:
                </div>
                <div className="text-xl font-bold text-white font-arcade">
                  «¿Cómo dices: „Ես ազատ եմ, փոխանցի՛ր գնդակը“?»
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {[
                    { text: '¡Estoy libre, pásame el balón!', isCorrect: true },
                    { text: 'Tengo sueño, adiós partido.', isCorrect: false },
                    { text: 'El árbitro come fruta.', isCorrect: false },
                    { text: 'La portería está rota.', isCorrect: false },
                  ].map((ans, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (ans.isCorrect) {
                          sounds.playGoal();
                          setChampScore((s) => s + 1);
                          addXpAndStats(30, { goals: profile.goals + 1 });
                        } else {
                          sounds.playWrong();
                          setRivalScore((s) => s + 1);
                        }

                        if (champQIndex + 1 >= currentTournament.questionsCount) {
                          // Complete stage
                          if (champScore >= currentTournament.targetScore - 1) {
                            sounds.playGoal();
                            addXpAndStats(100, { trophiesWon: profile.trophiesWon + 1 });
                          }
                          setChampQIndex(0);
                          setChampStageIdx((prev) => Math.min(4, prev + 1));
                        } else {
                          setChampQIndex((p) => p + 1);
                        }
                      }}
                      className="p-3.5 rounded-xl bg-slate-900 hover:bg-amber-500/20 border border-slate-700 hover:border-amber-400 text-left font-semibold text-sm text-white transition-all cursor-pointer"
                    >
                      {ans.text}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* JUEGO 10: MISIÓN SECRETA: EL FICHAJE */}
        {/* ============================================================== */}
        {currentMode === 'juego10_fichaje' && currentChapter && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-arcade">
                CAPÍTULO #{currentChapter.id} DE {STORY_CHAPTERS.length}
              </div>
            </div>

            <div className="bg-slate-900 p-6 md:p-8 rounded-3xl border border-amber-500/30 shadow-2xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-2xl font-extrabold text-white font-arcade">
                  {currentChapter.titleEs}
                </h3>
                <div className="text-xs text-amber-400 font-medium mt-0.5">
                  {currentChapter.titleHy}
                </div>
              </div>

              {/* Story Intro */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-sm text-slate-300 leading-relaxed space-y-1">
                <div>{currentChapter.introEs}</div>
                {showArmenianHints && (
                  <div className="text-xs text-slate-400 italic">
                    {currentChapter.introHy}
                  </div>
                )}
              </div>

              {/* Dialogue Pairs */}
              <div className="space-y-3">
                {currentChapter.dialoguePairs.map((pair, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-slate-850 border border-slate-700/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                        {pair.speaker}
                      </span>
                      <button
                        onClick={() => speakSpanish(pair.lineEs)}
                        className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white text-xs flex items-center gap-1"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Escuchar</span>
                      </button>
                    </div>
                    <div className="text-base font-semibold text-white">
                      «{pair.lineEs}»
                    </div>
                    {showArmenianHints && (
                      <div className="text-xs text-emerald-300">
                        {pair.lineHy}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Decision Section */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="text-sm font-bold text-amber-400 font-arcade">
                  {currentChapter.decision.promptEs}
                </div>
                {showArmenianHints && (
                  <div className="text-xs text-slate-400">
                    {currentChapter.decision.promptHy}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  {currentChapter.decision.choices.map((ch, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        sounds.playCorrect();
                        setStoryOutcome(ch.outcomeEs);
                        addXpAndStats(ch.xpReward);
                      }}
                      className="p-4 rounded-2xl bg-slate-800/80 hover:bg-amber-500/20 border border-slate-700 hover:border-amber-400 text-left transition-all cursor-pointer group"
                    >
                      <div className="text-sm font-bold text-white group-hover:text-amber-300">
                        {ch.choiceEs}
                      </div>
                      {showArmenianHints && (
                        <div className="text-xs text-slate-400 mt-1">
                          {ch.choiceHy}
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {storyOutcome && (
                  <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs space-y-2 animate-fadeIn">
                    <div className="font-bold text-sm">¡Decisión tomada!</div>
                    <div>{storyOutcome}</div>
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => {
                          setStoryChapterIdx((p) => p + 1);
                          setStoryOutcome(null);
                        }}
                        className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                      >
                        Հաջորդ գլուխը →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* PROGRESO (ԻՄ ԱՌԱՋԸՆԹԱՑԸ) */}
        {/* ============================================================== */}
        {currentMode === 'progreso' && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-yellow-400 bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20 font-arcade">
                MI PROGRESO • ԻՄ ԱՌԱՋԸՆԹԱՑԸ
              </div>
            </div>

            {/* Overview Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
                <div className="text-xs text-slate-400">Goles Marcados</div>
                <div className="text-2xl font-extrabold text-emerald-400 font-arcade">⚽ {profile.goals}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
                <div className="text-xs text-slate-400">Palabras Dominadas</div>
                <div className="text-2xl font-extrabold text-sky-400 font-arcade">📖 {profile.wordsLearnedCount}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
                <div className="text-xs text-slate-400">Frases Reales</div>
                <div className="text-2xl font-extrabold text-orange-400 font-arcade">🗣️ {profile.phrasesLearnedCount}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
                <div className="text-xs text-slate-400">Experiencia (XP)</div>
                <div className="text-2xl font-extrabold text-amber-400 font-arcade">⭐ {profile.xp}</div>
              </div>
            </div>

            {/* Achievements Showcase */}
            <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-arcade text-lg font-bold text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>SALA DE TROFEOS Y LOGROS</span>
                </div>
                <span className="text-xs text-slate-400">
                  {achievements.filter((a) => a.unlocked).length} / {achievements.length} նվաճված
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {achievements.map((ach) => (
                  <div
                    key={ach.id}
                    className={`p-4 rounded-2xl border flex items-start gap-3 transition-all ${
                      ach.unlocked
                        ? 'bg-amber-500/10 border-amber-500/40 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-500 opacity-60'
                    }`}
                  >
                    <span className="text-3xl shrink-0">{ach.icon}</span>
                    <div>
                      <div className="font-bold text-sm font-arcade">{ach.titleEs}</div>
                      <div className="text-xs font-semibold text-emerald-300">{ach.titleHy}</div>
                      <div className="text-xs text-slate-400 mt-1">{ach.descEs}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Data Export & Import */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-white">Պահպանված տվյալների արտահանում / ներմուծում</div>
                <div className="text-xs text-slate-400">Կարող ես ներբեռնել քո առաջընթացը կամ բեռնել այն ուրիշ սարքում։</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const dataStr = exportSaveData();
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `razmik_football_save_${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Արտահանել (JSON)</span>
                </button>
                <label className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Ներմուծել</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const content = event.target?.result as string;
                        if (content && importSaveData(content)) {
                          sounds.playGoal();
                          setProfile(loadProfile());
                          setVocab(loadVocab());
                          setAchievements(loadAchievements());
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* PERFIL (CUSTOMIZATION MODAL / SCREEN) */}
        {/* ============================================================== */}
        {currentMode === 'perfil' && (
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setCurrentMode('menu');
                  sounds.playClick();
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al menú</span>
              </button>
              <div className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-arcade">
                PERFIL DEL FUTBOLISTA
              </div>
            </div>

            <div className="bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl space-y-6 max-w-2xl mx-auto w-full">
              {/* Player Avatar Preview */}
              <div className="flex flex-col items-center text-center space-y-3">
                <div
                  className="w-24 h-24 rounded-3xl p-1 shadow-2xl flex flex-col items-center justify-center text-white"
                  style={{ backgroundColor: profile.jerseyColor }}
                >
                  <span className="text-3xl">{profile.clubEmblem}</span>
                  <span className="font-arcade text-xl font-bold">#{profile.jerseyNumber}</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold font-arcade text-white">{profile.name}</h3>
                  <div className="text-xs text-emerald-400 font-medium">{profile.teamName}</div>
                </div>
              </div>

              {/* Form Controls */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Ակումբի անվանում (Nombre del Club)
                  </label>
                  <input
                    type="text"
                    value={profile.teamName}
                    onChange={(e) => {
                      const updated = { ...profile, teamName: e.target.value };
                      setProfile(updated);
                      saveProfile(updated);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Խաղաշապիկի համար (Número)
                  </label>
                  <div className="flex gap-2">
                    {[7, 8, 9, 10, 11, 14, 21].map((num) => (
                      <button
                        key={num}
                        onClick={() => {
                          const updated = { ...profile, jerseyNumber: num };
                          setProfile(updated);
                          saveProfile(updated);
                        }}
                        className={`w-10 h-10 rounded-xl font-arcade font-bold text-sm transition-all ${
                          profile.jerseyNumber === num
                            ? 'bg-amber-400 text-slate-950 scale-110 shadow-lg shadow-amber-400/30'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Համազգեստի գույն (Color de la equipación)
                  </label>
                  <div className="flex gap-3">
                    {[
                      { name: 'Verde', hex: '#16a34a' },
                      { name: 'Rojo', hex: '#dc2626' },
                      { name: 'Azul', hex: '#2563eb' },
                      { name: 'Oro', hex: '#d97706' },
                      { name: 'Negro', hex: '#1e293b' },
                    ].map((col) => (
                      <button
                        key={col.hex}
                        onClick={() => {
                          const updated = { ...profile, jerseyColor: col.hex };
                          setProfile(updated);
                          saveProfile(updated);
                        }}
                        className={`w-9 h-9 rounded-xl border-2 transition-transform ${
                          profile.jerseyColor === col.hex ? 'scale-115 border-white shadow-lg' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Ակումբի խորհրդանիշ (Emblema)
                  </label>
                  <div className="flex gap-2 text-2xl">
                    {['⚡', '⚽', '👑', '🔥', '🦁', '🦅'].map((emb) => (
                      <button
                        key={emb}
                        onClick={() => {
                          const updated = { ...profile, clubEmblem: emb };
                          setProfile(updated);
                          saveProfile(updated);
                        }}
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                          profile.clubEmblem === emb ? 'bg-amber-400/20 border-2 border-amber-400 scale-105' : 'bg-slate-800'
                        }`}
                      >
                        {emb}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer / Status Bar */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-4 py-3 text-center text-xs text-slate-500">
        ⚽ Razmik Football Speaking Club — ¡Habla español y gana! • Իսպաներենի և ֆուտբոլի ինտերակտիվ ակումբ
      </footer>
    </div>
  );
}
