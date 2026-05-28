import { useContext, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { SummaryMeta, SummaryPayload, SummaryRow } from '../../shared/types';
import styles from './Summary.module.css';
import lobbyStyle from './Lobby.module.css';
import StickyStack from './StickyStack';
import { SocketContext } from './SocketProvider';

const RESPONSE_TIMEOUT_MS = 5000;

const LINE_CLASSES = [
  styles.lineGreen,
  styles.lineBlue,
  styles.lineRed,
  styles.lineGray,
] as const;


const DEFAULT_AVATAR = '/avatars/avatar4.jpg';

const PODIUM_COLORS = [
  { name: 'czerwony', className: styles.red },
  { name: 'zielony', className: styles.green },
  { name: 'żółty', className: styles.yellow },
  { name: 'niebieski', className: styles.blue },
] as const;

const PODIUM_HEIGHT_CLASSES = [
  styles.podiumHeight1,
  styles.podiumHeight2,
  styles.podiumHeight3,
  styles.podiumHeight4,
  styles.podiumHeight5,
  styles.podiumHeight6,
  styles.podiumHeight7,
  styles.podiumHeight8,
] as const;

const DIGIT_HEAT_CLASSES = [
  styles.digitHeat1,
  styles.digitHeat2,
  styles.digitHeat3,
  styles.digitHeat4,
  styles.digitHeat5,
  styles.digitHeat6,
  styles.digitHeat7,
  styles.digitHeat8,
  styles.digitHeat9,
  styles.digitHeat10,
] as const;

function getPodiumHeightClass(index: number, total: number) {
  if (total <= 1) return styles.podiumHeightSolo;
  return PODIUM_HEIGHT_CLASSES[Math.min(index, PODIUM_HEIGHT_CLASSES.length - 1)];
}

function getDigitHeatClass(count: number, maxCount: number) {
  const level = Math.max(1, Math.ceil((count / Math.max(1, maxCount)) * DIGIT_HEAT_CLASSES.length));
  return DIGIT_HEAT_CLASSES[Math.min(level, DIGIT_HEAT_CLASSES.length) - 1];
}

function formatSeconds(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0.00 s';
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatClock(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getAverageMs(row: SummaryRow) {
  if (Array.isArray(row.shotTimesMs) && row.shotTimesMs.length) {
    return row.shotTimesMs.reduce((sum, ms) => sum + ms, 0) / row.shotTimesMs.length;
  }

  return row.attempts > 0 ? row.totalMs / row.attempts : 0;
}

function getShotTimes(row: SummaryRow) {
  if (Array.isArray(row.shotTimesMs) && row.shotTimesMs.length) return row.shotTimesMs;

  const attempts = Math.max(0, row.attempts);
  const avg = getAverageMs(row);

  return Array.from({ length: attempts }, (_, index) => {
    const wave = ((index % 3) - 1) * 360;
    const slowerStart = Math.max(0, attempts - index - 1) * 55;
    return Math.max(300, avg + wave + slowerStart);
  });
}

function isSolved(row: SummaryRow) {
  if (typeof row.solved === 'boolean') return row.solved;
  if (typeof row.targetsSolved === 'number') return row.targetsSolved > 0;
  return row.points > 0;
}

function getAccuracy(row: SummaryRow) {
  if (typeof row.accuracy === 'number' && Number.isFinite(row.accuracy)) {
    return Math.round(row.accuracy);
  }

  if (row.attempts > 0 && typeof row.hits === 'number') {
    return Math.min(100, Math.round((row.hits / Math.max(1, row.attempts)) * 100));
  }

  if (row.attempts > 0) {
    return Math.min(100, Math.round((row.points / Math.max(1, row.attempts)) * 100));
  }

  return 0;
}

const CHART_LEFT = 44;
const CHART_RIGHT = 620;
const CHART_TOP = 24;
const CHART_BOTTOM = 188;

function toChartNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getPerfectHitsByTurn(row: SummaryRow) {
  const dynamicRow = row as SummaryRow & Record<string, any>;

  const numericSources = [
    dynamicRow.perfectHitsByTurn,
    dynamicRow.correctByTurn,
    dynamicRow.correctHitsByTurn,
    dynamicRow.correctsByShot,
    dynamicRow.correctByShot,
    dynamicRow.shotCorrects,
    dynamicRow.hitsByTurn,
  ];

  for (const source of numericSources) {
    if (Array.isArray(source)) {
      return source.map(toChartNumber);
    }
  }

  const objectSources = [
    dynamicRow.shots,
    dynamicRow.guesses,
    dynamicRow.turns,
    dynamicRow.history,
    dynamicRow.guessHistory,
    dynamicRow.results,
  ];

  for (const source of objectSources) {
    if (Array.isArray(source)) {
      return source.map((item) =>
        toChartNumber(
          item?.result?.correct ??
          item?.correct ??
          item?.perfectHits ??
          item?.idealHits ??
          item?.hits ??
          item?.correctCount,
        ),
      );
    }
  }

  return Array.from({ length: Math.max(0, row.attempts) }, () => 0);
}

function getChartX(turnIndex: number, maxTurns: number) {
  if (maxTurns <= 1) return Math.round((CHART_LEFT + CHART_RIGHT) / 2);
  return Math.round(CHART_LEFT + (turnIndex / (maxTurns - 1)) * (CHART_RIGHT - CHART_LEFT));
}

function getChartY(value: number, maxPerfectHits: number) {
  return Math.round(
    CHART_BOTTOM -
    (Math.min(maxPerfectHits, Math.max(0, value)) / Math.max(1, maxPerfectHits)) *
    (CHART_BOTTOM - CHART_TOP),
  );
}

function getPerfectHitsLinePoints(row: SummaryRow, maxTurns: number, maxPerfectHits: number) {
  const values = getPerfectHitsByTurn(row);

  return Array.from({ length: maxTurns }, (_, index) => {
    const x = getChartX(index, maxTurns);
    const y = getChartY(values[index] ?? 0, maxPerfectHits);
    return `${x},${y}`;
  }).join(' ');
}

export function buildDots(index: number, attempts: number, solved: boolean) {
  const visible = solved
    ? Math.min(4, Math.ceil(((index + 1) / Math.max(1, attempts)) * 4))
    : Math.min(3, Math.floor(((index + 1) / Math.max(1, attempts)) * 3));

  return Array.from({ length: 4 }, (_, dotIndex) => (dotIndex < visible ? '●' : '○')).join('');
}

function formatLobbyCodeDisplay(input?: string | null) {
  const raw = (input || '').replace(/[\s-]/g, '').toUpperCase();
  if (!raw) return '-';
  return raw.match(/.{1,3}/g)?.join(' - ') || raw;
}

function getModeHitLabel(mode?: string | null) {
  const normalizedMode = (mode || '').toLowerCase();

  if (normalizedMode === 'coop') return 'Odgadnięte wspólnie';
  if (normalizedMode === 'ffa' || normalizedMode === 'turbo') return 'Odgadnięte cele';
  if (normalizedMode === 'solo') return 'Trafienia kodu';

  return 'Trafienia';
}

function getModeHitValue(row: SummaryRow, mode?: string | null) {
  const normalizedMode = (mode || '').toLowerCase();

  if (normalizedMode === 'coop' || normalizedMode === 'ffa' || normalizedMode === 'turbo') {
    return row.targetsSolved ?? (isSolved(row) ? 1 : 0);
  }

  return row.hits ?? row.targetsSolved ?? (isSolved(row) ? 1 : 0);
}


type ShotHint = {
  correct: number;
  misplaced: number;
};

function getSummaryHintMode(meta: SummaryMeta | Record<string, any>) {
  const dynamicMeta = meta as Record<string, any>;
  const raw = String(dynamicMeta.hints ?? dynamicMeta.hintMode ?? dynamicMeta.hint ?? 'standard');

  if (raw === 'hitsOnly') return 'hitsOnly';
  if (raw === 'none') return 'none';
  return 'standard';
}

function getNumberArray(...sources: unknown[]) {
  const source = sources.find(Array.isArray);
  if (!Array.isArray(source)) return null;
  return source.map(toChartNumber);
}

function getShotHintsByTurn(row: SummaryRow): ShotHint[] {
  const dynamicRow = row as SummaryRow & Record<string, any>;

  const objectSources = [
    dynamicRow.shots,
    dynamicRow.guesses,
    dynamicRow.turns,
    dynamicRow.history,
    dynamicRow.guessHistory,
    dynamicRow.results,
  ];

  for (const source of objectSources) {
    if (Array.isArray(source)) {
      return source.map((item) => ({
        correct: toChartNumber(
          item?.result?.correct ??
          item?.correct ??
          item?.perfectHits ??
          item?.idealHits ??
          item?.hits ??
          item?.correctCount,
        ),
        misplaced: toChartNumber(
          item?.result?.misplaced ??
          item?.misplaced ??
          item?.cows ??
          item?.partialHits ??
          item?.almost ??
          item?.misplacedCount,
        ),
      }));
    }
  }

  const correctValues = getNumberArray(
    dynamicRow.perfectHitsByTurn,
    dynamicRow.correctByTurn,
    dynamicRow.correctHitsByTurn,
    dynamicRow.correctsByShot,
    dynamicRow.correctByShot,
    dynamicRow.shotCorrects,
    dynamicRow.hitsByTurn,
  );

  const misplacedValues = getNumberArray(
    dynamicRow.misplacedByTurn,
    dynamicRow.misplacedHitsByTurn,
    dynamicRow.cowsByTurn,
    dynamicRow.cowHitsByTurn,
    dynamicRow.partialHitsByTurn,
    dynamicRow.almostByTurn,
  );

  if (correctValues) {
    return correctValues.map((correct, index) => ({
      correct,
      misplaced: misplacedValues?.[index] ?? 0,
    }));
  }

  return Array.from({ length: Math.max(0, row.attempts) }, () => ({
    correct: 0,
    misplaced: 0,
  }));
}

function formatShotHint(
  hint: ShotHint | undefined,
  hintMode: ReturnType<typeof getSummaryHintMode>,
  timeoutEmpty = false,
) {
  if (timeoutEmpty) {
    if (hintMode === 'standard') return '🐂- 🐄-';
    if (hintMode === 'hitsOnly') return '🐂-';
    return '❓ brak podpowiedzi';
  }

  const safeHint = hint ?? { correct: 0, misplaced: 0 };

  if (hintMode === 'none') return '❓ brak podpowiedzi';
  if (hintMode === 'hitsOnly') return `🐂${safeHint.correct}`;

  return `🐂${safeHint.correct} 🐄${safeHint.misplaced}`;
}

const pad = (n: number | string, l = 2) => String(n).padStart(l, '0');

function formatMsShort(ms: number) {
  const total = Math.max(0, Math.floor(ms));
  const s = Math.floor(total / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${pad(s)}.${pad(cs)}`;
}


type ShotHistoryItem = {
  id: string;
  turn: number;
  guess: string;
  time: number;
  hint: ShotHint;
  isBest: boolean;
  timeoutEmpty: boolean;
};

function getShotGuessesByTurn(row: SummaryRow) {
  const dynamicRow = row as SummaryRow & Record<string, any>;

  const objectSources = [
    dynamicRow.shots,
    dynamicRow.guesses,
    dynamicRow.turns,
    dynamicRow.history,
    dynamicRow.guessHistory,
    dynamicRow.results,
  ];

  for (const source of objectSources) {
    if (Array.isArray(source)) {
      return source.map((item) => {
        const rawGuess =
          item?.guess ??
          item?.code ??
          item?.value ??
          item?.input ??
          item?.shot ??
          item?.digits ??
          item?.answer ??
          '';

        if (Array.isArray(rawGuess)) return rawGuess.join('');
        if (typeof rawGuess === 'number') return String(rawGuess);
        if (typeof rawGuess === 'string') return rawGuess;
        return '';
      });
    }
  }

  const arraySources = [
    dynamicRow.guessesByTurn,
    dynamicRow.guessByTurn,
    dynamicRow.shotGuesses,
    dynamicRow.shotsByTurn,
    dynamicRow.codesByTurn,
    dynamicRow.inputsByTurn,
  ];

  for (const source of arraySources) {
    if (Array.isArray(source)) {
      return source.map((item) => {
        if (Array.isArray(item)) return item.join('');
        if (typeof item === 'number') return String(item);
        if (typeof item === 'string') return item;
        return '';
      });
    }
  }

  return Array.from({ length: Math.max(0, row.attempts) }, () => '');
}

function buildShotHistoryItems(
  row: SummaryRow,
  shotTimes: number[],
  shotHints: ShotHint[],
  bestShot: number,
): ShotHistoryItem[] {
  const guesses = getShotGuessesByTurn(row);
  const length = Math.max(row.attempts, shotTimes.length, shotHints.length, guesses.length);

  return Array.from({ length }, (_, index) => {
    const guess = (guesses[index] ?? '').trim();
    const time = shotTimes[index] ?? 0;

    return {
      id: `${row.playerId}-${index + 1}`,
      turn: index + 1,
      guess,
      time,
      hint: shotHints[index] ?? { correct: 0, misplaced: 0 },
      isBest: time > 0 && time === bestShot,
      timeoutEmpty: !guess,
    };
  }).reverse();
}

export default function Summary() {
  const location = useLocation();
  const navigate = useNavigate();
  const socket = useContext(SocketContext);
  const params = new URLSearchParams(location.search);

  const code = params.get('code')?.toUpperCase() || '';

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [createLobbyError, setCreateLobbyError] = useState('');

  const storedSummary = useMemo((): SummaryPayload => {
    const fallbackMeta: SummaryMeta = {
      code,
      name: 'Lobby',
      mode: 'standard',
      len: params.get('len') || '-',
      timer: params.get('timer') || '0',
      createdAt: Date.now(),
    };

    try {
      const parsed = JSON.parse(sessionStorage.getItem(`summary:${code}`) || '[]') as SummaryPayload | SummaryRow[];
      if (Array.isArray(parsed)) {
        return { summary: parsed, meta: fallbackMeta };
      }

      return {
        summary: Array.isArray(parsed.summary) ? parsed.summary : [],
        meta: { ...fallbackMeta, ...(parsed.meta ?? {}) },
      };
    } catch {
      return { summary: [], meta: fallbackMeta };
    }
  }, [code]);

  const summary = storedSummary.summary;
  const meta = storedSummary.meta;
  const codeLen = meta.len || '-';
  const lobbyCode = meta.code || code;
  const lobbyName = meta.name || 'Lobby';

  const orderedSummary = useMemo(
    () =>
      [...summary].sort((a, b) => {
        const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;

        if (rankA !== rankB) return rankA - rankB;
        if (b.points !== a.points) return b.points - a.points;
        if (a.attempts !== b.attempts) return a.attempts - b.attempts;
        return a.totalMs - b.totalMs;
      }),
    [summary],
  );

  const selectedPlayer =
    orderedSummary.find((row) => row.playerId === selectedPlayerId) ??
    orderedSummary[0] ??
    null;
  const winner = orderedSummary[0] ?? null;

  const chartPlayers = orderedSummary.slice(0, 4);
  const chartTurns = Math.max(
    1,
    ...chartPlayers.map((row) => Math.max(row.attempts, getPerfectHitsByTurn(row).length)),
  );
  const numericCodeLen = Number(codeLen);
  const chartMaxPerfectHits = Math.max(
    1,
    Number.isFinite(numericCodeLen) ? numericCodeLen : 0,
    ...chartPlayers.flatMap((row) => getPerfectHitsByTurn(row)),
  );
  const chartYTicks = Array.from({ length: chartMaxPerfectHits + 1 }, (_, value) => value).filter(
    (value) => chartMaxPerfectHits <= 6 || value === 0 || value === chartMaxPerfectHits || value % 2 === 0,
  );
  const chartXStep = Math.max(1, Math.ceil(chartTurns / 6));
  const chartXTicks = Array.from({ length: chartTurns }, (_, index) => index + 1).filter(
    (turn) => chartTurns <= 8 || turn === 1 || turn === chartTurns || turn % chartXStep === 0,
  );

  const digitStats = useMemo(() => {
    const counts: Record<string, number> = {};

    orderedSummary.forEach((row) => {
      Object.entries(row.guessedDigits ?? {}).forEach(([digit, value]) => {
        counts[digit] = (counts[digit] ?? 0) + value;
      });
    });

    return '0123456789'.split('').map((digit) => ({
      digit,
      count: counts[digit] ?? 0,
    }));
  }, [orderedSummary]);

  const maxDigitCount = Math.max(1, ...digitStats.map((item) => item.count));
  const shotTimes = selectedPlayer ? getShotTimes(selectedPlayer) : [];
  const shotHints = selectedPlayer ? getShotHintsByTurn(selectedPlayer) : [];
  const summaryHintMode = getSummaryHintMode(meta);
  const bestShot = shotTimes.length ? Math.min(...shotTimes) : 0;
  const shotHistoryItems = selectedPlayer
    ? buildShotHistoryItems(selectedPlayer, shotTimes, shotHints, bestShot)
    : [];

  const podium = orderedSummary;

  const handleCreateLobby = () => {
    if (isCreatingLobby) return;

    setCreateLobbyError('');
    setIsCreatingLobby(true);

    const timeoutId = window.setTimeout(() => {
      socket.off('lobbyCreated', handleCreated);
      socket.off('error', handleError);
      setCreateLobbyError('Przekroczono czas oczekiwania na utworzenie lobby.');
      setIsCreatingLobby(false);
    }, RESPONSE_TIMEOUT_MS);

    const finish = () => {
      window.clearTimeout(timeoutId);
      socket.off('lobbyCreated', handleCreated);
      socket.off('error', handleError);
      setIsCreatingLobby(false);
    };

    const handleCreated = (lobby: { code: string }) => {
      finish();
      navigate(`/lobby?code=${lobby.code}`);
    };

    const handleError = () => {
      finish();
      setCreateLobbyError('Nie udało się utworzyć lobby. Spróbuj ponownie.');
    };

    socket.once('lobbyCreated', handleCreated);
    socket.once('error', handleError);
    socket.emit('createLobby', { name: 'Host', secret: null });
  };

  const leaveToMenu = () => navigate('/');

  return (
    <main className={`${styles.container} container`}>
      <header className={styles.logo}>
        <Link
          className={styles.logoLogo}
          to="/"
          onClick={(event) => {
            event.preventDefault();
            leaveToMenu();
          }}
        >
          ZGADNIJ&nbsp;<span>KOD</span>
        </Link>

        <button type="button" className={styles.leaveBtn} onClick={leaveToMenu}>
          Menu główne
        </button>
      </header>

      <div
        className={`${lobbyStyle.lobbyNote} ${styles.summaryLobbyNote}`}
        aria-label={`Kod lobby ${lobbyCode}`}
      >
        <div className={lobbyStyle.lobbyName}>{lobbyName}</div>
        <div className={lobbyStyle.lobbyStco}>
          <span
            className={lobbyStyle.lobbyState}
            aria-hidden="true"
            title="Kod lobby"
          >
          </span>

          <span
            className={lobbyStyle.lobbyCode}
            id="finalCode"
            title="Kod lobby"
          >
            {formatLobbyCodeDisplay(lobbyCode)}
          </span>
        </div>
      </div>

      <section className={styles.page}>
        {orderedSummary.length === 0 ? (
          <section className={`${styles.card} ${styles.summaryEmpty}`}>
            <h1>Brak podsumowania</h1>
            <p>Nie znaleziono danych dla tej gry.</p>
            <Link className={`${styles.btn} ${styles.blue}`} to={code ? `/lobby?code=${code}` : '/'}>
              Wróć do lobby
            </Link>
          </section>
        ) : (
          <>
            <section className={`${styles.card} ${styles.hero}`}>
              <div>
                <p className={styles.eyebrow}>Podsumowanie rozgrywki</p>
                <h1>{winner ? `${winner.name} wygrywa` : 'Koniec gry'}</h1>
                <p>
                  {winner
                    ? `${winner.points} pkt, ${winner.attempts} prób, czas ${formatClock(winner.totalMs)}.`
                    : 'Wyniki meczu są gotowe.'}
                </p>
              </div>
            </section>

            <section className={styles.grid}>
              <section className={`${styles.card} ${styles.podium}`}>
                <div className={styles.podiumGrid}>
                  {podium.map((row, index) => {
                    const rank = row.rank ?? index + 1;
                    const color = PODIUM_COLORS[index % PODIUM_COLORS.length];
                    const heightClass = getPodiumHeightClass(index, podium.length);
                    const isSelected = selectedPlayer?.playerId === row.playerId;

                    return (
                      <article
                        key={row.playerId}
                        className={`${styles.place} ${isSelected ? styles.placeSelected : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedPlayerId(row.playerId);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedPlayerId(row.playerId);
                          }
                        }}
                      >
                        <div className={styles.podiumPlayer}>
                          <b className={styles.podiumPlayerName} title={row.name}>
                            {row.name}
                          </b>

                          <img
                            className={styles.avatar}
                            src={row.avatar || DEFAULT_AVATAR}
                            alt={`Avatar gracza ${row.name}`}
                          />
                        </div>

                        <div
                          className={`${styles.podiumBar} ${color.className} ${heightClass}`}
                          aria-label={`${rank}. miejsce, ${row.name}, kolor ${color.name}`}
                        >
                          <b>{rank}. miejsce</b>
                          <small>{row.points} pkt / {row.attempts} prób</small>
                          <div className={styles.podiumPlayerStats}>
                            <span>Śr. czas: {formatSeconds(getAverageMs(row))}</span>
                            <span>Skuteczność: {getAccuracy(row)}%</span>
                            <span>{isSolved(row) ? 'Odgadnięto' : 'Nie odgadł'}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className={`${styles.card} ${styles.result}`}>
                <h2>Historia strzałów</h2>
                {selectedPlayer && (
                  <div className={styles.inlineShotPanel} aria-live="polite">
                    <h3>{selectedPlayer.name}</h3>

                    {shotHistoryItems.length ? (
                      <div className={styles.summaryShotHistory}>
                        <StickyStack
                          items={shotHistoryItems}
                          getId={(item) => item.id}
                          cardHeight={100}
                          renderItem={(item, index, array) => {
                            const codeLenNumber = Number(codeLen);
                            const fallbackLen = Number.isFinite(codeLenNumber) && codeLenNumber > 0
                              ? codeLenNumber
                              : Math.max(1, item.guess.length);
                            const displayGuess = item.guess || '- '.repeat(fallbackLen).trim();

                            return (
                              <div className={styles.shotStackCard}>
                                <span className={styles.shotStackIndex} aria-hidden="true">
                                  {array.length - index}
                                </span>
                                <strong>{displayGuess}</strong>
                                <br />
                                <span className={styles.hintText}>
                                  {formatShotHint(item.hint, summaryHintMode, item.timeoutEmpty)}
                                </span>
                                <span className={styles.guessTime}>
                                  {' '}⏱{formatMsShort(item.time)}
                                  {item.isBest ? ' best' : ''}
                                </span>
                              </div>
                            );
                          }}
                        />
                      </div>
                    ) : (
                      <div className={styles.timeDetail}>
                        <span>Brak strzałów</span>
                        <b>-</b>
                      </div>
                    )}

                  </div>
                )}
              </section>

              <section className={`${styles.card} ${styles.chart}`}>
                <h2>Idealne trafienia na turę</h2>

                <div className={styles.graphBox}>
                  <div className={styles.chartFrame}>
                    <div className={styles.legend}>
                      {chartPlayers.map((row, index) => (
                        <span key={row.playerId} className={LINE_CLASSES[index]}>
                          {row.name}
                        </span>
                      ))}
                    </div>

                    <svg
                      className={styles.svgChart}
                      viewBox="0 0 640 230"
                      role="img"
                      aria-label="Wykres: oś X to numer tury, oś Y to liczba idealnych trafień"
                    >
                      <g className={styles.chartGrid}>
                        {chartYTicks.map((value) => {
                          const y = getChartY(value, chartMaxPerfectHits);
                          return (
                            <g key={`y-${value}`}>
                              <line x1={CHART_LEFT} y1={y} x2={CHART_RIGHT} y2={y} />
                              <text x={CHART_LEFT - 14} y={y + 4} textAnchor="end">
                                {value}
                              </text>
                            </g>
                          );
                        })}

                        {chartXTicks.map((turn) => {
                          const x = getChartX(turn - 1, chartTurns);
                          return (
                            <g key={`x-${turn}`}>
                              <line x1={x} y1={CHART_TOP} x2={x} y2={CHART_BOTTOM} />
                              <text x={x} y={CHART_BOTTOM + 22} textAnchor="middle">
                                {turn}
                              </text>
                            </g>
                          );
                        })}
                      </g>

                      <line
                        x1={CHART_LEFT}
                        y1={CHART_TOP}
                        x2={CHART_LEFT}
                        y2={CHART_BOTTOM}
                        className={styles.chartAxis}
                      />
                      <line
                        x1={CHART_LEFT}
                        y1={CHART_BOTTOM}
                        x2={CHART_RIGHT}
                        y2={CHART_BOTTOM}
                        className={styles.chartAxis}
                      />

                      <text x={CHART_LEFT} y={14} className={styles.chartAxisLabel}>
                        🎯 idealne
                      </text>

                      <text
                        x={CHART_RIGHT}
                        y={CHART_BOTTOM + 38}
                        textAnchor="end"
                        className={styles.chartAxisLabel}
                      >
                        numer tury
                      </text>

                      {chartPlayers.map((row, index) => {
                        const perfectHits = getPerfectHitsByTurn(row);

                        return (
                          <g key={row.playerId}>
                            <polyline
                              className={`${styles.chartLine} ${LINE_CLASSES[index]}`}
                              points={getPerfectHitsLinePoints(row, chartTurns, chartMaxPerfectHits)}
                            />

                            {Array.from({ length: chartTurns }, (_, turnIndex) => (
                              <circle
                                key={`${row.playerId}-turn-${turnIndex}`}
                                className={`${styles.chartDot} ${LINE_CLASSES[index]}`}
                                cx={getChartX(turnIndex, chartTurns)}
                                cy={getChartY(perfectHits[turnIndex] ?? 0, chartMaxPerfectHits)}
                                r="4"
                              />
                            ))}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </section>

              <section className={`${styles.card} ${styles.digits}`}>
                <h2>Wpisywane cyfry</h2>
                <div className={styles.digitsGrid}>
                  {digitStats.map((item) => (
                    <div key={item.digit} className={styles.digitBar}>
                      <small>{item.count}</small>
                      <i className={`${styles.digitFill} ${getDigitHeatClass(item.count, maxDigitCount)}`} />
                      <b>{item.digit}</b>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.actions}>
                {createLobbyError && (
                  <p className={styles.actionError}>{createLobbyError}</p>
                )}

                <button
                  type="button"
                  className={`${styles.btn} ${styles.green}`}
                  onClick={handleCreateLobby}
                  disabled={isCreatingLobby}
                >
                  {isCreatingLobby ? 'Tworzenie...' : 'Zagraj ponownie'}
                </button>

                <Link className={`${styles.btn} ${styles.gray}`} to="/">
                  Menu główne
                </Link>
              </section>
            </section>
          </>
        )}
      </section>

    </main>
  );
}
