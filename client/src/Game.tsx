import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
  useCallback,
  type JSX,
} from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { SocketContext } from './SocketProvider';
import styles from './Game.module.css';
import StickyStack from './StickyStack';
import NotesGrid from './NotesGrid';
import type { SummaryPayload, SummaryRow } from '../../shared/types';


/* ========= Typy zgodne z serwerem ========= */

type GameMode = 'solo' | 'standard' | 'turbo' | 'ffa' | 'coop';
type GamePhase =
  | 'lobby'
  | 'codeSetupAll'
  | 'codeSetupReady'
  | 'codeSetupInput'
  | 'guessReady'
  | 'guessing'
  | 'summary';

interface Settings {
  mode: GameMode;
  len: string; // na serwerze string
  timer: string; // "0" | "15" | "30" | "60"
  showHistory?: boolean;
  hints?: 'standard' | 'hitsOnly' | 'none';
  hotSeat?: boolean;
  onTimeout?: 'empty' | 'random'; // ⬅ nowa opcja z serwera
}

interface Player {
  playerId: string;
  name: string;
  avatar?: string | null;
  ready: boolean;
  secretCode?: string;
  attempts: number;
  solved: boolean;
  solvedAt: number | null;
  totalTurnTimeMs: number;
  isBot?: boolean;
  botSkill?: 'easy' | 'normal' | 'hard' | 'insane';
  winText?: string;
  guessTargets?: string[];
}

interface HintResult {
  correct: number;
  misplaced: number;
}

interface GuessRow {
  ts: number;
  guess: string;
  result: HintResult;
  targetId: string | null;
  roundId: number | null;
  guesserId: string;
}

interface WinInfo {
  playerId: string;
  name: string;
}

interface LobbyPayload {
  code: string;
  name: string;
  isPrivate: boolean;
  state: 'lobby' | 'game' | 'summary';
  hostId: string | null;
  settings: Settings;
  order: string[];
  players: Player[];

  activePlayerId: string | null;
  activeTargetId?: string | null;
  currentActorId?: string | null;
  phase?: GamePhase;
  standardTurnId: number;
  roundId: number;
  roundStartTs: number | null;
  roundEndTs: number | null;
  coopTargetId: string | null;

  isCoopGuesser: boolean;
  myTurboTurnEndTs: number | null;
  myTargetId: string | null;
  myActiveTargets: string[];
  canGuess?: boolean;
  privacyMode?: boolean;

  guesses: GuessRow[];
  codeSetupDeadlineMs?: number | null;
}

interface MiniSocket {
  on: (event: string, cb: (...args: any[]) => void) => void;
  off: (event: string, cb: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => void;
}

/* ========= Helpers ========= */

function randomCode(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function isNonEmpty<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

function padTimePart(n: number | string, l = 2) {
  return String(n).padStart(l, '0');
}

function formatTimerMs(ms: number) {
  const total = Math.max(0, Math.floor(ms));
  const sec = Math.floor(total / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const cs = Math.floor((total % 1000) / 10);
  return `${padTimePart(m)}:${padTimePart(s)}.${padTimePart(cs)}`;
}

function TimerText({ deadline }: { deadline: number | null }) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let frameId = 0;

    const render = () => {
      if (ref.current) {
        const left = deadline ? Math.max(0, deadline - Date.now()) : 0;
        ref.current.textContent = formatTimerMs(left);
      }

      if (deadline && deadline > Date.now()) {
        frameId = window.requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [deadline]);

  return <span ref={ref}>{formatTimerMs(deadline ? deadline - Date.now() : 0)}</span>;
}

/* ========= Komponent ========= */

function Game(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const socketFromCtx = useContext<MiniSocket | null>(
    SocketContext as unknown as React.Context<MiniSocket | null>,
  );

  const search = new URLSearchParams(location.search);
  const lobbyCode = search.get('code') || '';

  /* --- moje playerId --- */
  const [playerId, setPlayerId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('playerId') : null,
  );
  useEffect(() => {
    if (!playerId) {
      const demoId = 'p1';
      try {
        localStorage.setItem('playerId', demoId);
      } catch {
        /* ignore */
      }
      setPlayerId(demoId);
    }
  }, [playerId]);

  /* --- stan lobby i gry --- */
  const [lobbyState, setLobbyState] =
    useState<'lobby' | 'game' | 'summary'>('lobby');
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);

  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [currentActorId, setCurrentActorId] = useState<string | null>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>('lobby');
  const [serverCanGuess, setServerCanGuess] = useState(false);
  const [standardTurnId, setStandardTurnId] = useState(0);

  const [roundId, setRoundId] = useState(0);
  const [roundStartTs, setRoundStartTs] = useState<number | null>(null);
  const [roundEndTs, setRoundEndTs] = useState<number | null>(null);
  const [coopTargetId, setCoopTargetId] = useState<string | null>(null);
  const [isCoopGuesser, setIsCoopGuesser] = useState(false);
  const [myTurboEndTs, setMyTurboEndTs] = useState<number | null>(null);
  const [myTargetId, setMyTargetId] = useState<string | null>(null);
  const [myActiveTargets, setMyActiveTargets] = useState<string[]>([]);
  const [guesses, setGuesses] = useState<GuessRow[]>([]);

  /* --- UI --- */
  const [input, setInput] = useState<string[]>([]);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [historyView, setHistoryView] = useState<'single' | 'all'>('single');
  const [autoFollow, setAutoFollow] = useState(true);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const [winInfo, setWinInfo] = useState<WinInfo | null>(null);
  const [summaryPending, setSummaryPending] = useState(false);
  const [summaryCountdown, setSummaryCountdown] = useState(5);

  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [waitingForAuto, setWaitingForAuto] = useState(false);

  const myTurnStartRef = useRef<number | null>(null);
  const roundStartByIdRef = useRef<Record<number, number>>({});
  const [guessDurations, setGuessDurations] = useState<Record<number, number>>(
    {},
  );
  const [codeSetupDeadline, setCodeSetupDeadline] = useState<number | null>(null);
  const prevGuessesRef = useRef<GuessRow[]>([]);

  // SOLO – start gry i ostatni strzał
  const soloGameStartRef = useRef<number | null>(null);
  const lastSoloGuessTsRef = useRef<number | null>(null);

  // hot-seat
  const [hotSeatReady, setHotSeatReady] = useState(false);
  const [hotSeatReadyDeadline, setHotSeatReadyDeadline] = useState<
    number | null
  >(null);

  const [leftOpen, setLeftOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('leftOpen') !== '0';
    } catch {
      return true;
    }
  });
  const [rightOpen, setRightOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('rightOpen') !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('leftOpen', leftOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [leftOpen]);
  useEffect(() => {
    try {
      localStorage.setItem('rightOpen', rightOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [rightOpen]);

  /* ========= parametry z settings (MUSZĄ być wysoko) ========= */
  const mode: GameMode = (settings?.mode as GameMode) ?? 'solo';
  const codeLen = Number(settings?.len ?? '4') || 4;
  const timerSec = Number(settings?.timer ?? '0') || 0;
  const showHistoryFlag = settings?.showHistory !== false;
  const hintMode = settings?.hints ?? 'standard';
  const isHotSeat = !!settings?.hotSeat;
  const onTimeout = settings?.onTimeout ?? 'random'; // ⬅️ domyślnie random

  // inicjalizacja inputów przy zmianie długości kodu
  useEffect(() => {
    setInput(Array(codeLen).fill(''));
    inputRefs.current = Array(codeLen).fill(null);
  }, [codeLen]);

  /* ========= "ja" ========= */
  const me = useMemo(
    () =>
      playerId
        ? players.find((p) => p.playerId === playerId) || null
        : null,
    [players, playerId],
  );
  const activeActor = useMemo(
    () =>
      currentActorId
        ? players.find((p) => p.playerId === currentActorId) || null
        : null,
    [players, currentActorId],
  );
  const effectiveMe = isHotSeat && mode !== 'turbo' && activeActor ? activeActor : me;

  const myCodeMissing =
    mode !== 'solo' &&
    (!effectiveMe?.secretCode || effectiveMe.secretCode.length !== codeLen);


  /* ========= cele dla mnie ========= */
  const targetsForTabs = useMemo(() => {
    if (mode === 'solo') return [] as Player[];
    const ids = (myActiveTargets && myActiveTargets.length
      ? myActiveTargets
      : myTargetId
        ? [myTargetId]
        : []
    ).filter(isNonEmpty);

    return ids
      .map((id) => players.find((p) => p.playerId === id))
      .filter(isNonEmpty);
  }, [players, myActiveTargets, myTargetId, mode]);

  const firstTargetId = targetsForTabs[0]?.playerId ?? null;

  /* ========= socket: win + summary ========= */
  useEffect(() => {
    const socket = socketFromCtx;
    if (!socket) return;

    const onWin = (d: WinInfo) => setWinInfo(d);
    const onSummary = (payload: SummaryPayload | { summary: SummaryRow[] }) => {
      const summaryPayload: SummaryPayload = {
        summary: payload.summary,
        meta: 'meta' in payload
          ? payload.meta
          : {
              code: lobbyCode,
              name: 'Lobby',
              mode,
              len: String(codeLen),
              timer: String(timerSec),
              createdAt: Date.now(),
            },
      };

      if (lobbyCode) {
        sessionStorage.setItem(`summary:${lobbyCode}`, JSON.stringify(summaryPayload));
      }
      setSummaryCountdown(5);
      setSummaryPending(true);
    };

    socket.on('youWon', onWin);
    socket.on('gameSummary', onSummary);

    return () => {
      socket.off('youWon', onWin);
      socket.off('gameSummary', onSummary);
    };
  }, [socketFromCtx, lobbyCode, mode, codeLen, timerSec]);

  /* ========= socket: lobbyData ========= */
  useEffect(() => {
    const socket = socketFromCtx;
    if (!socket || !lobbyCode) return;

    const handleLobbyData = (lobby: LobbyPayload) => {
      setLobbyState(lobby.state);
      setSettings(lobby.settings ?? null);
      setPlayers(Array.isArray(lobby.players) ? lobby.players : []);
      setHostId(lobby.hostId ?? null);

      setActivePlayerId(lobby.activePlayerId ?? null);
      setActiveTargetId(lobby.activeTargetId ?? null);
      setCurrentActorId(lobby.currentActorId ?? lobby.activePlayerId ?? null);
      setGamePhase(lobby.phase ?? (lobby.state === 'game' ? 'guessing' : lobby.state));
      setServerCanGuess(!!lobby.canGuess);
      setStandardTurnId(Number(lobby.standardTurnId ?? 0) || 0);

      setRoundId(Number(lobby.roundId ?? 0) || 0);
      setRoundStartTs(
        typeof lobby.roundStartTs === 'number' ? lobby.roundStartTs : null,
      );
      setRoundEndTs(
        typeof lobby.roundEndTs === 'number' ? lobby.roundEndTs : null,
      );
      setCoopTargetId(lobby.coopTargetId ?? null);
      setIsCoopGuesser(!!lobby.isCoopGuesser);
      setMyTurboEndTs(
        typeof lobby.myTurboTurnEndTs === 'number'
          ? lobby.myTurboTurnEndTs
          : null,
      );
      setMyTargetId(lobby.myTargetId ?? null);
      setMyActiveTargets(
        Array.isArray(lobby.myActiveTargets) ? lobby.myActiveTargets : [],
      );

      const allGuesses = Array.isArray(lobby.guesses) ? lobby.guesses : [];
      const visibleGuesserId =
        lobby.privacyMode && lobby.currentActorId ? lobby.currentActorId : playerId;
      setGuesses(
        visibleGuesserId
          ? allGuesses.filter((g) => g.guesserId === visibleGuesserId).reverse()
          : [],
      );

      if (Number(lobby.roundId) && Number(lobby.roundStartTs)) {
        roundStartByIdRef.current = {
          ...roundStartByIdRef.current,
          [Number(lobby.roundId)]: Number(lobby.roundStartTs),
        };
      }
      setCodeSetupDeadline(
        typeof lobby.codeSetupDeadlineMs === 'number'
          ? lobby.codeSetupDeadlineMs
          : null,
      );
    };

    socket.on('lobbyData', handleLobbyData);
    socket.emit('getLobby', { code: lobbyCode });

    return () => {
      socket.off('lobbyData', handleLobbyData);
    };
  }, [socketFromCtx, lobbyCode, playerId]);

  /* ========= SOLO – auto READY w lobby ========= */
  useEffect(() => {
    const socket = socketFromCtx;
    if (!socket || !lobbyCode || !playerId) return;
    if (mode !== 'solo') return;
    if (lobbyState !== 'lobby') return;

    const mePlayer = players.find((p) => p.playerId === playerId);
    if (!mePlayer || mePlayer.ready) return;

    socket.emit('updateReady', {
      code: lobbyCode,
      ready: true,
    });
  }, [socketFromCtx, lobbyCode, lobbyState, mode, players, playerId]);

  /* ========= SOLO – wykrycie odgadnięcia ========= */
  const hasSolvedSolo = useMemo(() => {
    if (mode !== 'solo') return false;
    if (!guesses.length) return false;
    const len = codeLen;
    return guesses.some((g) => g.result?.correct === len);
  }, [mode, guesses, codeLen]);

  /* ========= STANDARD – start mojej tury ========= */
  useEffect(() => {
    if (mode !== 'standard') return;
    if (!playerId) return;
    if (activePlayerId === playerId && lobbyState === 'game') {
      myTurnStartRef.current = Date.now();
    } else {
      myTurnStartRef.current = null;
    }
  }, [mode, activePlayerId, playerId, standardTurnId, lobbyState]);

  /* ========= COOP / FFA – start rundy ========= */
  useEffect(() => {
    if (!(mode === 'coop' || mode === 'ffa')) return;
    if (roundId && roundStartTs) {
      roundStartByIdRef.current[roundId] = roundStartTs;
    }
  }, [mode, roundId, roundStartTs]);

  /* ========= SOLO – start gry i reset ========= */
  useEffect(() => {
    if (mode === 'solo' && lobbyState === 'game') {
      if (!soloGameStartRef.current) {
        soloGameStartRef.current = Date.now();
        lastSoloGuessTsRef.current = null;
      }
    } else {
      soloGameStartRef.current = null;
      lastSoloGuessTsRef.current = null;
    }
  }, [mode, lobbyState]);

  /* ========= czasy poszczególnych strzałów (historia) ========= */
  useEffect(() => {
    const prev = prevGuessesRef.current;
    const prevSet = new Set(prev.map((g) => g.ts));
    const newly = guesses.filter((g) => !prevSet.has(g.ts));

    if (newly.length) {
      setGuessDurations((curr) => {
        const next = { ...curr } as Record<number, number>;

        newly.forEach((g) => {
          if (mode === 'solo') {
            // SOLO: pierwszy strzał od startu gry, kolejne od poprzedniego strzału
            const base =
              lastSoloGuessTsRef.current ??
              soloGameStartRef.current ??
              g.ts;
            const dt = Math.max(0, g.ts - base);
            next[g.ts] = dt;
            lastSoloGuessTsRef.current = g.ts;
            return;
          }

          let dt = 0;
          if ((mode === 'coop' || mode === 'ffa') && g.roundId) {
            const rs = roundStartByIdRef.current[g.roundId];
            if (rs) dt = Math.max(0, g.ts - rs);
          } else if (myTurnStartRef.current) {
            dt = Math.max(0, g.ts - myTurnStartRef.current);
          }
          next[g.ts] = dt;
        });

        return next;
      });
    }

    prevGuessesRef.current = guesses;
  }, [guesses, mode]);

  /* ========= SOLO – po odgadnięciu wyłącz timer / autoGuess ========= */
  useEffect(() => {
    if (mode === 'solo' && hasSolvedSolo) {
      setTurnDeadline(null);
      setWaitingForAuto(false);
    }
  }, [mode, hasSolvedSolo]);

  useEffect(() => {
    if (!summaryPending || !lobbyCode) return;

    setSummaryCountdown(5);

    const startedAt = Date.now();
    const tick = () => {
      const left = Math.max(0, 5 - Math.floor((Date.now() - startedAt) / 1000));
      setSummaryCountdown((current) => (current === left ? current : left));

      if (left <= 0) {
        window.clearInterval(intervalId);
        navigate(`/summary?code=${lobbyCode}`, { replace: true });
      }
    };

    const intervalId = window.setInterval(tick, 1000) as unknown as number;

    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [summaryPending, lobbyCode, navigate]);

  /* ========= strzelałem w tej rundzie? (turbo/ffa/coop) ========= */
  const hasGuessedThisRound = useMemo(() => {
    if (!(mode === 'turbo' || mode === 'ffa' || mode === 'coop')) return false;
    if (!roundId || !playerId) return false;
    return guesses.some(
      (g) => g.guesserId === playerId && g.roundId === roundId,
    );
  }, [mode, guesses, playerId, roundId]);

  const hasSolvedThisFFATarget = useMemo(() => {
    if (!(mode === 'ffa' || mode === 'turbo')) return false;
    if (!playerId) return false;

    const currentTargetId =
      mode === 'ffa'
        ? firstTargetId
        : myTargetId || firstTargetId || null;

    if (!currentTargetId) return false;
    const len = codeLen;

    return guesses.some(
      (g) =>
        g.guesserId === playerId &&
        g.targetId === currentTargetId &&
        g.result?.correct === len,
    );
  }, [mode, guesses, playerId, firstTargetId, myTargetId, codeLen]);

  const hasSolvedThisCoopTarget = useMemo(() => {
    if (mode !== 'coop') return false;
    if (!playerId || !coopTargetId) return false;
    const len = codeLen;

    return guesses.some(
      (g) =>
        g.guesserId === playerId &&
        g.targetId === coopTargetId &&
        g.result?.correct === len,
    );
  }, [mode, guesses, playerId, coopTargetId, codeLen]);

  /* ========= czy mogę teraz pisać / oddać strzał ========= */
  const canType = (): boolean => {
    // na początku gry (multi) – jeśli nie masz jeszcze kodu, najpierw go ustawiasz
    if (
      mode !== 'solo' &&
      myCodeMissing &&
      lobbyState === 'game' &&
      (gamePhase === 'codeSetupAll' || gamePhase === 'codeSetupInput')
    ) {
      return true;
    }

    let allowed = false;

    if (serverCanGuess) {
      allowed = true;
    } else if (mode === 'coop') {
      const amITarget = playerId && playerId === coopTargetId;
      allowed = !!isCoopGuesser && !amITarget && lobbyState === 'game';
    } else if (mode === 'ffa') {
      allowed = lobbyState === 'game';
    } else if (mode === 'turbo') {
      allowed = lobbyState === 'game' && !hasGuessedThisRound;
    } else if (mode === 'solo') {
      // SOLO: strzelasz tylko gdy gra trwa i jeszcze nie odgadłeś
      allowed = lobbyState === 'game' && !hasSolvedSolo;
    } else {
      // standard
      allowed =
        lobbyState === 'game' && activePlayerId === playerId;
    }

    if (isHotSeat && mode !== 'turbo' && mode !== 'solo') {
      if (!hotSeatReady) return false;
    }

    return allowed;
  };


  const isFullGuess = useMemo(
    () => input.filter((c) => !!c).length === codeLen,
    [input, codeLen],
  );
  const hasAnyInput = useMemo(() => input.some((c) => !!c), [input]);
  const canSubmitNow = canType();
  const disabledSubmit = !canSubmitNow || !isFullGuess;

  /* ========= input refs ========= */
  const setInputRef = useCallback((el: HTMLInputElement | null, idx: number) => {
    inputRefs.current[idx] = el;
  }, []);

  const focusFirstInput = () => {
    const el = inputRefs.current[0];
    if (!el) return;
    try {
      el.focus();
      if (typeof el.select === 'function') el.select();
    } catch {
      /* ignore */
    }
  };

  const handleInput = (d: string) => {
    setInput((prev) => {
      const u = [...prev];
      const i = u.findIndex((c) => !c);
      if (i === -1) return u;
      u[i] = d;
      if (i + 1 < inputRefs.current.length) inputRefs.current[i + 1]?.focus();
      return u;
    });
  };

  const handleBackspace = () => {
    setInput((prev) => {
      const u = [...prev];
      const ri = [...u].reverse().findIndex((c) => c);
      if (ri === -1) return u;
      const i = u.length - 1 - ri;
      u[i] = '';
      inputRefs.current[i]?.focus();
      return u;
    });
  };

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const idx = Number(e.currentTarget.getAttribute('data-idx'));
    const v = e.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 1);
    setInput((prev) => {
      const u = [...prev];
      if (Number.isFinite(idx) && idx >= 0 && idx < u.length) {
        u[idx] = v || '';
      }
      return u;
    });
    if (v && Number.isFinite(idx) && idx < inputRefs.current.length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    const idx = Number(
      (e.currentTarget as HTMLInputElement).getAttribute('data-idx'),
    );
    if (e.key === 'Backspace') {
      e.preventDefault();
      setInput((prev) => {
        const u = [...prev];
        if (Number.isFinite(idx) && idx >= 0 && idx < u.length) {
          if (u[idx]) {
            u[idx] = '';
            return u;
          }
          if (idx > 0) {
            inputRefs.current[idx - 1]?.focus();
            u[idx - 1] = '';
          }
        }
        return u;
      });
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
      requestAnimationFrame(() => {
        focusFirstInput();
      });
    }
  };

  /* ========= wysyłanie na socket ========= */
  const socketEmit = (event: string, payload: any) => {
    if (!socketFromCtx) return;
    socketFromCtx.emit(event, payload);
  };

  const handleSubmit = () => {
    const guess = (input.join('') || '').slice(0, codeLen);
    if (guess.length !== codeLen) {
      const firstEmpty = input.findIndex((c) => !c);
      if (firstEmpty >= 0) inputRefs.current[firstEmpty]?.focus();
      return;
    }

    setWaitingForAuto(false);
    setTurnDeadline(null);
    if (!socketFromCtx) return;

    const isCodeSetupPhase =
      mode !== 'solo' && myCodeMissing;

    if (isCodeSetupPhase) {
      // ustawiamy tajny kod + READY już w widoku gry
      socketEmit('updateReady', {
        code: lobbyCode,
        secretCode: guess,
        ready: true,
      });
    } else {
      // normalny strzał (w tym SOLO)
      socketEmit('submitGuess', {
        code: lobbyCode,
        guess,
      });
    }


    setInput(Array(codeLen).fill(''));

    if (isHotSeat && mode !== 'turbo' && mode !== 'solo') {
      setHotSeatReady(false);
      setHotSeatReadyDeadline(null);
    }

    requestAnimationFrame(() => {
      focusFirstInput();
    });
  };

  /* ========= autoGuess przy timeout ========= */
  const autoGuess = useCallback(() => {
    if (!waitingForAuto) return;
    if (!socketFromCtx) return;

    // czy ma być pusty strzał czy losowy?
    const shouldBeEmpty = onTimeout === 'empty';

    const valueForTimeout = shouldBeEmpty ? '' : randomCode(codeLen);

    setWaitingForAuto(false);
    setTurnDeadline(null);

    const isCodeSetupPhase =
      mode !== 'solo' && myCodeMissing;

    if (isCodeSetupPhase) {
      // auto-ustawienie tajnego kodu po czasie
      socketEmit('updateReady', {
        code: lobbyCode,
        secretCode: valueForTimeout,
        ready: true,
      });
    } else {
      // normalny strzał (w tym SOLO)
      socketEmit('submitGuess', {
        code: lobbyCode,
        guess: valueForTimeout,
      });
    }
  }, [
    waitingForAuto,
    onTimeout,
    codeLen,
    lobbyState,
    mode,
    lobbyCode,
    socketFromCtx,
    myCodeMissing,
  ]);

  /* ========= logika timera (deadline + autoGuess) ========= */
  useEffect(() => {
    // brak limitu → brak auto-strzału, ale SOLO i tak liczy czasy w historii
    if (!timerSec || timerSec <= 0) {
      setTurnDeadline(null);
      setWaitingForAuto(false);
      return;
    }

    const now = Date.now();
    let needTimer = false;
    let serverDeadline: number | null = null;

    if (mode !== 'solo' && myCodeMissing) {
      // faza ustawiania kodu – używamy serwerowego deadline'u z serwera
      needTimer = true;
      serverDeadline = codeSetupDeadline ?? null;
    } else if (lobbyState === 'game') {
      if (mode === 'solo') {
        if (!hasSolvedSolo) {
          needTimer = true;
          serverDeadline = roundEndTs ?? null;
        }
      } else if (mode === 'standard') {
        if (playerId && activePlayerId === playerId) {
          needTimer = true;
          // STANDARD: też mamy serwerowy deadline (roundEndTs)
          serverDeadline = roundEndTs ?? null;
        }
      } else if (mode === 'turbo') {

        if (!hasGuessedThisRound) {
          needTimer = true;
          // TURBO — deadline rundy z serwera
          serverDeadline = myTurboEndTs ?? null;
        }
      } else if (mode === 'ffa') {
        if (!hasGuessedThisRound) {
          needTimer = true;
          // FFA — deadline rundy z serwera
          serverDeadline = roundEndTs ?? null;
        }
      } else if (mode === 'coop') {
        const amITarget = playerId && playerId === coopTargetId;
        if (isCoopGuesser && !amITarget && !hasGuessedThisRound) {
          needTimer = true;
          // COOP — deadline rundy z serwera
          serverDeadline = roundEndTs ?? null;
        }
      }
    }

    if (!needTimer) {
      setTurnDeadline(null);
      setWaitingForAuto(false);
      return;
    }

    // jeśli już mamy deadline, a serwer mówi coś innego, to przytnij do serwerowego
    if (turnDeadline && serverDeadline && turnDeadline !== serverDeadline) {
      setTurnDeadline(serverDeadline);
      return;
    }

    // pierwszy raz ustawiamy deadline
    if (!turnDeadline) {
      // ⬇ W LOBBY (multi) NIE robimy fallbacku do lokalnego czasu,
      // czekamy aż serwer wyśle codeSetupDeadlineMs
      if (lobbyState === 'lobby' && mode !== 'solo' && !serverDeadline) {
        setTurnDeadline(null);
        setWaitingForAuto(false);
        return;
      }

      const dl = serverDeadline ?? (now + timerSec * 1000);

      if (serverDeadline) {
        // gdy mamy timestamp z serwera (turbo/ffa/coop/solo/lobby setup)
        myTurnStartRef.current = serverDeadline - timerSec * 1000;
      } else {
        // tryby bez serwerowego deadline’u (np. standard)
        myTurnStartRef.current = now;
      }

      setTurnDeadline(dl);
      setWaitingForAuto(true);
    }
  }, [
    timerSec,
    lobbyState,
    mode,
    me,
    codeLen,
    hasSolvedSolo,
    activePlayerId,
    playerId,
    hasGuessedThisRound,
    isCoopGuesser,
    coopTargetId,
    turnDeadline,
    myTurboEndTs,
    roundEndTs,
    codeSetupDeadline, // ⬅ ważne
    myCodeMissing,
  ]);



  // reakcja na upłynięcie deadline
  useEffect(() => {
    if (!turnDeadline || !waitingForAuto) return;
    const timeoutMs = Math.max(0, turnDeadline - Date.now());
    const id = window.setTimeout(autoGuess, timeoutMs);
    return () => window.clearTimeout(id);
  }, [turnDeadline, waitingForAuto, autoGuess]);

  /* ========= HUD – ms do końca ========= */
  /* ========= hot-seat overlay ========= */
  const shouldShowHotSeatOverlay =
    isHotSeat &&
    mode !== 'turbo' &&
    mode !== 'solo' &&
    lobbyState === 'game' &&
    !hotSeatReady &&
    canType();

  useEffect(() => {
    if (shouldShowHotSeatOverlay && !hotSeatReadyDeadline) {
      setHotSeatReadyDeadline(Date.now() + 10_000);
    }
    if (!shouldShowHotSeatOverlay) {
      setHotSeatReadyDeadline(null);
    }
  }, [shouldShowHotSeatOverlay, hotSeatReadyDeadline]);

  useEffect(() => {
    if (!hotSeatReadyDeadline || !shouldShowHotSeatOverlay) return;
    const timeoutMs = Math.max(0, hotSeatReadyDeadline - Date.now());
    const id = window.setTimeout(() => {
      setHotSeatReady(true);
      setHotSeatReadyDeadline(null);
    }, timeoutMs);
    return () => window.clearTimeout(id);
  }, [hotSeatReadyDeadline, shouldShowHotSeatOverlay]);

  useEffect(() => {
    if (!isHotSeat) {
      setHotSeatReady(false);
      setHotSeatReadyDeadline(null);
    }
  }, [isHotSeat]);

  /* ========= autofocus ========= */
  useEffect(() => {
    if (canType()) {
      requestAnimationFrame(() => {
        focusFirstInput();
      });
    }
  }, [mode, lobbyState, activePlayerId, isCoopGuesser, coopTargetId]);

  /* ========= formaty czasu ========= */
  const pad = (n: number | string, l = 2) => String(n).padStart(l, '0');
  const formatMsShort = (ms: number) => {
    const total = Math.max(0, Math.floor(ms));
    const s = Math.floor(total / 1000);
    const cs = Math.floor((total % 1000) / 10);
    return `${pad(s)}.${pad(cs)}`;
  };

  const hudDeadline =
    turnDeadline ??
    (mode === 'turbo'
      ? myTurboEndTs
      : (mode === 'coop' || mode === 'ffa' || mode === 'standard' || mode === 'solo')
        ? roundEndTs
        : null);

  /* ========= opis podpowiedzi ========= */
  const renderHintText = (
    r: HintResult | undefined,
    timeoutEmpty = false,
  ) => {
    // specjalne wyświetlanie dla pustego strzału (timeout empty)
    if (timeoutEmpty) {
      switch (hintMode) {
        case 'standard':
          // tu kreski zamiast 0
          return '🐂- 🐄-';
        case 'hitsOnly':
          return '🐂-';
        case 'none':
        default:
          return '❓ brak podpowiedzi';
      }
    }

    const rr = r || { correct: 0, misplaced: 0 };
    switch (hintMode) {
      case 'standard':
        return `🐂${rr.correct} 🐄${rr.misplaced}`;
      case 'hitsOnly':
        return `🐂${rr.correct}`;
      case 'none':
      default:
        return '❓ brak podpowiedzi';
    }
  };

  /* ========= helpery do renderu ========= */
  const displayPlayers = useMemo(() => {
    if (mode === 'solo') {
      const self =
        (playerId && players.find((p) => p.playerId === playerId)) ||
        players[0];
      return self ? [self] : [];
    }
    return players;
  }, [mode, players, playerId]);

  const currentMyTargetId =
    mode === 'coop'
      ? coopTargetId
      : firstTargetId ?? activeTargetId;

  /* ========= opis tury ========= */
  const turnInfoText = (() => {
    if (summaryPending) {
      return `✅ Odgadnięte! Przejście do podsumowania za ${summaryCountdown}s.`;
    }

    const missingMyCode =
      mode !== 'solo' &&
      (!effectiveMe?.secretCode || effectiveMe.secretCode.length !== codeLen);

    // faza przed startem gry (lobby / czekanie na start)
    if (lobbyState !== 'game') {
      if (mode === 'solo') {
        return '⏳ Startuje tryb solo: serwer generuje kod, za chwilę zaczniesz zgadywać.';
      }

      return '⏳ Czekasz w lobby, aż gra wystartuje.';
    }

    // początek gry (multi) – każdy ustawia swój kod
    if (mode !== 'solo' && missingMyCode) {
      if (timerSec > 0) {
        return '🔐 Ustaw teraz swój tajny kod, który inni będą zgadywać. Masz ograniczony czas – po jego upływie kod ustawi się automatycznie.';
      }
      return '🔐 Ustaw teraz swój tajny kod, który inni będą zgadywać.';
    }

    // faza przed startem gry (lobby / czekanie na start)
    if (lobbyState !== 'game') {
      if (mode === 'solo') {
        return '⏳ Startuje tryb solo: serwer generuje kod, za chwilę zaczniesz zgadywać.';
      }

      const hasCode = !!effectiveMe?.secretCode && effectiveMe.secretCode.length === codeLen;

      // tu już WIEMY, że mode !== 'solo', bo wyżej był return dla solo
      if (!hasCode) {
        return '🔐 Ustaw teraz swój tajny kod w polach poniżej i zatwierdź OK. Po czasie ustawi się losowy.';
      }

      return '⏳ Czekasz aż pozostali ustawią swoje kody i gra wystartuje...';
    }

    // SOLO
    if (mode === 'solo') {
      if (hasSolvedSolo) {
        return '✅ Zgadłeś kod komputera! Zobacz podsumowanie.';
      }
      return timerSec
        ? '🎯 Zgaduj kod komputera. Jeśli nie zdążysz, gra odda losowy strzał.'
        : '🎯 Zgaduj kod komputera. Brak limitu – w historii zobaczysz, ile trwał każdy strzał.';
    }

    // STANDARD
    if (mode === 'standard') {
      if (activePlayerId === playerId) {
        return isHotSeat
          ? '🎯 Twoja tura (HOT SEAT) – kliknij „Gotowy”, potem zgaduj.'
          : '🎯 Twoja tura – zgaduj, czas leci!';
      }
      return isHotSeat
        ? '⏳ Czekasz na swoją kolej (HOT SEAT).'
        : '⏳ Czekasz na swoją turę...';
    }

    // TURBO
    if (mode === 'turbo') {
      if (hasSolvedThisFFATarget) {
        return '✅ Już zgadłeś swój cel – czekasz na kolejną rundę.';
      }
      if (!hasGuessedThisRound) {
        return '⚡ Turbo: zgaduj teraz! Po czasie gra odda losowy strzał.';
      }
      return '⏳ Czekaj aż wszyscy zakończą rundę...';
    }

    // FFA
    if (mode === 'ffa') {
      if (hasSolvedThisFFATarget) {
        return '✅ Masz już odgadnięty ten cel – kolejne strzały są tylko treningowe.';
      }
      if (!hasGuessedThisRound) {
        return isHotSeat
          ? '🎯 FFA + HOT SEAT: kliknij „Gotowy”, potem zgaduj.'
          : '🎯 FFA: zgaduj teraz!';
      }
      return '⏳ Czekaj na kolejną rundę...';
    }

    // COOP
    if (mode === 'coop') {
      if (playerId && playerId === coopTargetId) {
        return '🐄 Twój kod jest zgadywany – czekaj.';
      }
      if (isCoopGuesser) {
        if (hasSolvedThisCoopTarget) {
          return '✅ Już zgadłeś kod tej osoby – poczekaj na kolejną.';
        }
        if (!hasGuessedThisRound) {
          return isHotSeat
            ? '🎯 COOP + HOT SEAT: kliknij „Gotowy”, potem zgaduj.'
            : '🎯 COOP: zgaduj ten kod!';
        }
        return '⏳ Czekaj na innych...';
      }
      return '⏳ Czekaj na zakończenie rundy...';
    }

    return '⏳ Czekaj...';
  })();


  const lastGuessForNotes =
  guesses.length > 0
    ? {
        ts: guesses[0].ts,
        guess: guesses[0].guess || '',
        correct: guesses[0].result?.correct ?? 0,
      }
    : null;

  /* ========= RENDER ========= */
  return (
    <>
      {/* overlay zwycięstwa */}
      {winInfo && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>🎉 Wygrałeś!</h2>
            <p>Zwycięzca: {winInfo.name}</p>
            <button type="button" onClick={() => setWinInfo(null)}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* overlay HOT SEAT */}
      {shouldShowHotSeatOverlay && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2>🎮 Tryb HOT SEAT</h2>
            <p>
              Teraz kolej gracza:{' '}
              <strong>{effectiveMe?.name || 'Ty'}</strong>
            </p>
            <p>Masz 10 sekund na kliknięcie „Gotowy”.</p>
            <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>
              ❗ Nie podglądać inni gracze!
            </p>
            <button
              type="button"
              onClick={() => {
                setHotSeatReady(true);
                setHotSeatReadyDeadline(null);
              }}
            >
              ✅ Jestem gotowy
            </button>
          </div>
        </div>
      )}

      <div className={`${styles.container} container`}>
        {/* lewy toggle */}
        <div
          style={{
            position: 'fixed',
            top: '1rem',
            left: '1rem',
            zIndex: 1000,
            display: 'flex',
            gap: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => setLeftOpen((v) => !v)}
            style={{
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.4rem 0.7rem',
              cursor: 'pointer',
              boxShadow: '0 8px 18px rgba(0,0,0,.25)',
              fontSize: '0.9rem',
            }}
          >
            {leftOpen ? '⟨ Gracze' : 'Gracze ⟩'}
          </button>
        </div>

        {/* prawy toggle */}
        <div
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            zIndex: 1000,
            display: 'flex',
            gap: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => setRightOpen((v) => !v)}
            style={{
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.4rem 0.7rem',
              cursor: 'pointer',
              boxShadow: '0 8px 18px rgba(0,0,0,.25)',
              fontSize: '0.9rem',
            }}
          >
            {rightOpen ? 'Historia ⟩' : '⟨ Historia'}
          </button>
        </div>

        {/* LEFT sidebar */}
        {leftOpen && (
          <div className={styles.sidebarLeft}>
            <div className={styles.logo}>
              <Link className={styles.logoLogo} to="/">
                ZGADNIJ&nbsp;<span>KOD</span>
              </Link>
            </div>

            <div className={styles.hud}>
              <div className={styles.hudItem}>
                Tryb:{' '}
                <strong>
                  {mode === 'solo'
                    ? '🧍 Solo'
                    : mode === 'standard'
                      ? '🎯 Standard'
                      : mode === 'turbo'
                        ? '🚀 Turbo'
                        : mode === 'ffa'
                          ? '🧨 FFA'
                          : '🤝 COOP'}
                  {isHotSeat && mode !== 'turbo' && mode !== 'solo'
                    ? ' (HOT SEAT)'
                    : ''}
                </strong>
              </div>
              {String(settings?.timer) !== '0' && (
                <div className={styles.hudItem}>
                  Limit: <strong>{settings?.timer}s</strong>
                </div>
              )}
            </div>

            <div className={styles.playersList}>
              <div className={styles.playersListText}>Gracze</div>
              {displayPlayers.map((p) => {
                const isMe = p.playerId === (playerId || '');
                const isSolo = mode === 'solo';

                const stdTurboId = targetsForTabs[0]?.playerId ?? null;
                const isStdTurboTarget =
                  (mode === 'standard' || mode === 'turbo') &&
                  !!stdTurboId &&
                  p.playerId === stdTurboId &&
                  !isMe;

                const isCurrentlyGuessedCoop =
                  mode === 'coop' && !!coopTargetId && p.playerId === coopTargetId;

                const isCurrentlyGuessedFfa =
                  mode === 'ffa' &&
                  !!currentMyTargetId &&
                  p.playerId === currentMyTargetId;

                const isActiveStd =
                  mode === 'standard' && p.playerId === activePlayerId;

                const isTarget =
                  !isSolo &&
                  (isStdTurboTarget ||
                    (mode === 'ffa' && !isMe) ||
                    (mode === 'coop' && !isMe));

                return (
                  <div
                    key={p.playerId}
                    className={[
                      styles.players,
                      isTarget ? styles.isTarget : '',
                      isCurrentlyGuessedCoop ? styles.currentCoopTarget : '',
                      isCurrentlyGuessedFfa ? styles.currentCoopTarget : '',
                      isActiveStd ? styles.activeStd : '',
                    ].join(' ')}
                  >
                    <img src="./avatars/avatar1.jpg" alt="avatar" />
                    <span className={styles.playersTitle}>
                      {p.isBot ? 'BOT' : 'MISTRZ'}
                    </span>
                    {p.playerId === hostId && (
                      <span className={styles.playersHostCrown}>👑</span>
                    )}
                    <span className={styles.playersName}>{p.name}</span>
                    <span className={styles.playerPoints}>
                      {p.attempts || 0} strz.
                    </span>

                    <div className={styles.tags}>
                      {mode === 'solo' && p.playerId === playerId && (
                        <span className={styles.tagsRound}>🔎 Zgadujesz kod</span>
                      )}
                      {mode !== 'solo' && isTarget && (
                        <span className={styles.tagsTarget}>🎯 Cel</span>
                      )}
                      {isActiveStd && (
                        <span className={styles.tagsRound}>🏹 Tura</span>
                      )}
                      {isCurrentlyGuessedCoop && (
                        <span className={styles.tagsRound}>🏹 Zgadujemy</span>
                      )}
                      {isCurrentlyGuessedFfa && (
                        <span className={styles.tagsRound}>🏹 Zgadujesz</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.centerLeft}>
          <div className={styles.turnInfo}>{turnInfoText}</div>

          <div>
            {timerSec ? (
              <>
                Pozostało:{' '}
                <strong><TimerText deadline={hudDeadline} /></strong>
              </>
            ) : (
              <>Brak limitu czasu</>
            )}
          </div>

          <div className={styles.infoBar}>
            {effectiveMe?.secretCode && mode !== 'solo' && (
              <div className={styles.myCodeBox} title="Twój tajny kod">
                🔐 Twój kod:{' '}
                <strong className={styles.myCodeDigits}>
                  {isHotSeat && mode !== 'turbo' && effectiveMe.isBot ? '••••' : effectiveMe.secretCode}
                </strong>
              </div>
            )}

            <div className={styles.targetBanner}>
              {lobbyState === 'lobby' && mode !== 'solo' ? (
                <>🧩 Faza ustawiania kodów</>
              ) : mode === 'solo' ? (
                <>
                  🧩 Zgadujesz <strong>kod komputera</strong>
                </>
              ) : mode === 'coop' ? (
                coopTargetId ? (
                  <>
                    🎯 Zgadujemy:{' '}
                    <strong>
                      {players.find((p) => p.playerId === coopTargetId)?.name ||
                        '-'}
                    </strong>
                  </>
                ) : (
                  '—'
                )
              ) : targetsForTabs.length ? (
                <>
                  🎯 Twój cel:{' '}
                  <strong>{targetsForTabs[0]?.name}</strong>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>

          <div className={styles.codeDisplay}>
            {Array.from({ length: codeLen }).map((_, i) => (
              <input
                key={i}
                ref={(el) => setInputRef(el, i)}
                maxLength={1}
                value={input[i] || ''}
                data-idx={i}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                inputMode="numeric"
                pattern="[0-9]"
                className={[
                  styles.codeInput,
                  input[i] ? styles.codeInputFilled : '',
                  input[i] && canSubmitNow ? styles.codeInputReady : '',
                ].filter(Boolean).join(' ')}
              />
            ))}
          </div>

          <div className={styles.keyboard}>
            {[...'1234567890'].map((n) => (
              <button
                key={n}
                type="button"
                className={styles.numbersButton}
                onClick={() => handleInput(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className={styles.backSpaceButton}
              onClick={handleBackspace}
            >
              ←
            </button>
            <button
              type="button"
              className={[
                styles.submitButton,
                hasAnyInput && canSubmitNow ? styles.submitButtonReady : '',
              ].filter(Boolean).join(' ')}
              onClick={handleSubmit}
              disabled={disabledSubmit}
            >
              OK
            </button>
          </div>
        </div>

        {/* CENTER RIGHT – zeszyt cyfr */}
        <div className={styles.centerRight}>
          <NotesGrid codeLen={codeLen} lastGuess={lastGuessForNotes} />
        </div>


        {/* RIGHT – historia */}
        {rightOpen && (
          <div className={styles.sidebarRight}>
            <h3>Historia prób</h3>

            {(() => {
              const myId = playerId || '';
              const panelTargets =
                mode === 'ffa' || mode === 'coop'
                  ? players.filter((p) => p.playerId !== myId)
                  : mode === 'standard' || mode === 'turbo'
                    ? targetsForTabs[0]
                      ? [targetsForTabs[0]]
                      : []
                    : [];

              const renderHistoryControls = () =>
                (mode === 'ffa' || mode === 'coop') && (
                  <div className={styles.historyControls}>
                    <label>
                      <input
                        type="radio"
                        checked={historyView === 'single'}
                        onChange={() => setHistoryView('single')}
                      />{' '}
                      Pojedyncza
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={historyView === 'all'}
                        onChange={() => setHistoryView('all')}
                      />{' '}
                      Wszystkie
                    </label>
                    {historyView === 'single' && (
                      <label className={styles.autoFollow}>
                        <input
                          type="checkbox"
                          checked={autoFollow}
                          onChange={(e) => setAutoFollow(e.target.checked)}
                        />
                        Auto-przełączaj na bieżący cel
                      </label>
                    )}
                  </div>
                );

              // SOLO / STANDARD / TURBO – jedna kolumna
              if (mode === 'solo' || mode === 'standard' || mode === 'turbo') {
                const headerName =
                  (mode === 'standard' || mode === 'turbo') && panelTargets[0]
                    ? panelTargets[0].name
                    : null;

                const singleList =
                  mode === 'solo'
                    ? guesses.filter((g) => g.guesserId === myId)
                    : guesses.filter((g) => {
                      const tid = panelTargets[0]?.playerId ?? null;
                      return tid ? g.targetId === tid : true;
                    });

                return (
                  <div className={styles.historyBlock}>
                    {headerName && (
                      <div className={styles.historyColHeader}>
                        🎯 {headerName}
                      </div>
                    )}

                    <div
                      className={styles.guessHistory}
                      data-hidden={!showHistoryFlag}
                    >
                      <StickyStack
                        items={singleList}
                        getId={(g) => g.ts}
                        renderItem={(g, i, arr) => {
                          const isSoloHit =
                            mode === 'solo' &&
                            g.result?.correct === codeLen;

                          const timeoutEmpty =
                            !g.guess || g.guess.trim() === '';

                          const displayGuess =
                            g.guess && g.guess.trim() !== ''
                              ? g.guess
                              : '- '.repeat(codeLen).trim();

                          return (
                            <div
                              className={
                                isSoloHit ? styles.soloHitCard : ''
                              }
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  fontSize: '4rem',
                                  bottom: '-35px',
                                  left: '-2px',
                                  opacity: 0.5,
                                  color: 'white',
                                  zIndex: -1,
                                }}
                              >
                                {arr.length - i}
                              </span>
                              <strong>{displayGuess}</strong>
                              <br />
                              {showHistoryFlag && (
                                <>
                                  <span className={styles.hintText}>
                                    {renderHintText(
                                      g.result,
                                      timeoutEmpty,
                                    )}
                                  </span>
                                  {(() => {
                                    const rawMs =
                                      guessDurations[g.ts];
                                    if (rawMs == null) return null;
                                    const ms =
                                      timerSec > 0
                                        ? Math.min(
                                          rawMs,
                                          timerSec * 1000,
                                        )
                                        : rawMs;
                                    return (
                                      <span
                                        className={
                                          styles.guessTime
                                        }
                                      >
                                        {' '}
                                        ⏱
                                        {formatMsShort(ms)}
                                      </span>
                                    );
                                  })()}
                                </>
                              )}

                              {isSoloHit && (
                                <>
                                  <div className={styles.soloHitLabel}>
                                    ✅ Odgadnięto!
                                  </div>
                                  <div className={styles.confetti} />
                                </>
                              )}
                            </div>
                          );
                        }}
                      />
                    </div>
                  </div>
                );
              }

              // FFA / COOP – taby / grid
              return (
                <>
                  {renderHistoryControls()}

                  {historyView === 'single' ? (
                    <>
                      <div className={styles.targetsTabs}>
                        {panelTargets.length === 0 ? (
                          <div className={styles.tabEmpty}>Brak celów</div>
                        ) : (
                          panelTargets.map((t) => (
                            <button
                              key={t.playerId}
                              type="button"
                              className={`${styles.tab} ${selectedTargetId === t.playerId
                                ? styles.tabActive
                                : ''
                                }`}
                              onClick={() => {
                                setSelectedTargetId(t.playerId);
                                setAutoFollow(false);
                              }}
                            >
                              🎯 {t.name}
                            </button>
                          ))
                        )}
                      </div>

                      <div
                        className={styles.guessHistory}
                        data-hidden={!showHistoryFlag}
                      >
                        <StickyStack
                          items={
                            selectedTargetId
                              ? guesses.filter(
                                (g) =>
                                  g.targetId === selectedTargetId,
                              )
                              : []
                          }
                          getId={(g) => g.ts}
                          renderItem={(g) => {
                            const timeoutEmpty =
                              !g.guess || g.guess.trim() === '';

                            const displayGuess =
                              g.guess && g.guess.trim() !== ''
                                ? g.guess
                                : '- '.repeat(codeLen).trim();

                            return (
                              <div>
                                <strong>{displayGuess}</strong>
                                {showHistoryFlag && (
                                  <>
                                    {' — '}
                                    <span className={styles.hintText}>
                                      {renderHintText(
                                        g.result,
                                        timeoutEmpty,
                                      )}
                                    </span>
                                    {(() => {
                                      const rawMs =
                                        guessDurations[g.ts];
                                      if (rawMs == null) return null;
                                      const ms =
                                        timerSec > 0
                                          ? Math.min(
                                            rawMs,
                                            timerSec * 1000,
                                          )
                                          : rawMs;
                                      return (
                                        <span
                                          className={
                                            styles.guessTime
                                          }
                                        >
                                          {' '}
                                          • ⏱{' '}
                                          {formatMsShort(ms)}
                                        </span>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            );
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className={styles.historyGrid}>
                      {panelTargets.map((t) => {
                        const listForT = guesses.filter(
                          (g) => g.targetId === t.playerId,
                        );
                        return (
                          <div key={t.playerId} className={styles.historyCol}>
                            <div className={styles.historyColHeader}>
                              🎯 {t.name}
                            </div>
                            <div
                              className={styles.guessHistory}
                              data-hidden={!showHistoryFlag}
                            >
                              <StickyStack
                                items={listForT}
                                getId={(g) => g.ts}
                                renderItem={(g) => {
                                  const timeoutEmpty =
                                    !g.guess ||
                                    g.guess.trim() === '';

                                  const displayGuess =
                                    g.guess &&
                                      g.guess.trim() !== ''
                                      ? g.guess
                                      : '- '
                                        .repeat(codeLen)
                                        .trim();

                                  return (
                                    <div>
                                      <strong>{displayGuess}</strong>
                                      {showHistoryFlag && (
                                        <>
                                          {' — '}
                                          <span
                                            className={
                                              styles.hintText
                                            }
                                          >
                                            {renderHintText(
                                              g.result,
                                              timeoutEmpty,
                                            )}
                                          </span>
                                          {(() => {
                                            const rawMs =
                                              guessDurations[g.ts];
                                            if (rawMs == null)
                                              return null;
                                            const ms =
                                              timerSec > 0
                                                ? Math.min(
                                                  rawMs,
                                                  timerSec *
                                                  1000,
                                                )
                                                : rawMs;
                                            return (
                                              <span
                                                className={
                                                  styles.guessTime
                                                }
                                              >
                                                {' '}
                                                • ⏱{' '}
                                                {formatMsShort(
                                                  ms,
                                                )}
                                              </span>
                                            );
                                          })()}
                                        </>
                                      )}
                                    </div>
                                  );
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </>
  );
}

export default Game;
