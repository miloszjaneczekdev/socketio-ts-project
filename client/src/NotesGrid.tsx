// client/src/NotesGrid.tsx
import React, { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import styles from './NotesGrid.module.css';

type NotesGridProps = {
  codeLen: number;
  lastGuess: {
    ts: number;
    guess: string;
    correct: number;
  } | null;
};

type CellMeta = {
  dx: number;
  dy: number;
  angle: number;
  blobBlue: string;
  blobGreen: string;
};

const randomBlobRadius = () => {
  const a = Math.floor(Math.random() * 60) + 20;
  const b = Math.floor(Math.random() * 60) + 20;
  const c = Math.floor(Math.random() * 60) + 20;
  const d = Math.floor(Math.random() * 60) + 20;
  return `${a}% ${b}% / ${c}% ${d}%`;
};

const createCellMeta = (): CellMeta => ({
  dx: (Math.random() - 0.5) * 4,
  dy: (Math.random() - 0.5) * 4,
  angle: (Math.random() - 0.5) * 8,
  blobBlue: randomBlobRadius(),
  blobGreen: randomBlobRadius(),
});

const NotesGrid: React.FC<NotesGridProps> = ({ codeLen, lastGuess }) => {
  const ROWS = 10;
  const COLS = Math.max(1, codeLen || 1);

  // 0 – puste, 1 – X, 2 – niebieskie, 3 – zielone (ręczne)
  const [cellStates, setCellStates] = useState<number[][]>(() =>
    Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0)),
  );

  const [cellMeta] = useState<CellMeta[][]>(() =>
    Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, createCellMeta),
    ),
  );

  const [autoCross, setAutoCross] = useState(true);
  const [autoBlue, setAutoBlue] = useState(true);

  // żeby nie przeliczać tego samego strzału kilka razy
  const lastAppliedTsRef = useRef<number | null>(null);

  const cycleCellState = (row: number, col: number) => {
    setCellStates((prev) => {
      const next = prev.map((r) => [...r]);
      const current = next[row][col] ?? 0;
      // kliknięcie = ręczne przełączanie: 0 -> 1 -> 2 -> 3 -> 0
      next[row][col] = (current + 1) % 4;
      return next;
    });
  };

  const handleClick = (row: number, col: number) => {
    cycleCellState(row, col);
  };

  useEffect(() => {
    setCellStates((prev) =>
      Array.from({ length: ROWS }, (_, row) =>
        Array.from({ length: COLS }, (_, col) => prev[row]?.[col] ?? 0),
      ),
    );
  }, [COLS]);

  // ====== AUTO LOGIKA OPARTA O OSTATNI STRZAŁ ======
  useEffect(() => {
    if (!lastGuess) return;
    if (!lastGuess.guess) return;

    if (lastAppliedTsRef.current === lastGuess.ts) return;
    lastAppliedTsRef.current = lastGuess.ts;

    const guess = lastGuess.guess;
    const correct = lastGuess.correct ?? 0;

    // 1) correct === 0 → auto skreślanie
    if (correct === 0 && autoCross) {
      setCellStates((prev) => {
        const next = prev.map((r) => [...r]);
        const len = Math.min(COLS, guess.length);

        for (let i = 0; i < len; i++) {
          const d = Number(guess[i]);
          if (Number.isNaN(d) || d < 0 || d > 9) continue;
          const r = d;
          const c = i;

          const current = next[r][c] ?? 0;
          // nie ruszaj zielonego, resztę zmień na X
          if (current !== 3) {
            next[r][c] = 1;
          }
        }

        return next;
      });

      return;
    }

    // 2) correct > 0 → auto niebieskie kółka
    if (correct > 0 && autoBlue) {
      setCellStates((prev) => {
        const next = prev.map((r) => [...r]);
        const len = Math.min(COLS, guess.length);

        for (let i = 0; i < len; i++) {
          const d = Number(guess[i]);
          if (Number.isNaN(d) || d < 0 || d > 9) continue;
          const r = d;
          const c = i;

          const current = next[r][c] ?? 0;
          // nie nadpisuj X (1) ani zielonego (3)
          if (current === 0 || current === 2) {
            next[r][c] = 2;
          }
        }

        return next;
      });
    }
  }, [lastGuess, autoCross, autoBlue, COLS]);

  return (
    <div className={styles.notesRoot}>
      <div className={styles.notesWrapper}>
        <table className={styles.notesTable}>
          <tbody>
            {Array.from({ length: ROWS }).map((_, row) => (
              <tr key={row}>
                {Array.from({ length: COLS }).map((_, col) => {
                  const state = cellStates[row]?.[col] ?? 0;
                  const meta = cellMeta[row]?.[col] ?? createCellMeta();

                  const classNames = [
                    styles.notesCell,
                    state === 1 ? styles.notesCellCrossed : '',
                    state === 2 ? styles.notesCellMaybe : '',
                    state === 3 ? styles.notesCellSure : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <td
                      key={col}
                      className={classNames}
                      data-state={state}
                      onClick={() => handleClick(row, col)}
                      style={
                        {
                          transform: `translate(${meta.dx}px, ${meta.dy}px) rotate(${meta.angle}deg)`,
                          '--blob-blue': meta.blobBlue,
                          '--blob-green': meta.blobGreen,
                        } as CSSProperties
                      }
                    >
                      <span>{row}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* małe ustawienia obok/poniżej */}
      <div className={styles.notesSettings}>
        <label>
          <input
            type="checkbox"
            checked={autoCross}
            onChange={(e) => setAutoCross(e.target.checked)}
          />{' '}
          Auto-skreślanie gdy 🎯 = 0
        </label>
        <label>
          <input
            type="checkbox"
            checked={autoBlue}
            onChange={(e) => setAutoBlue(e.target.checked)}
          />{' '}
          Auto-niebieskie gdy 🎯 &gt; 0
        </label>
        <div className={styles.notesHint}>
          Zielone (✅) zaznaczasz ręcznie kliknięciem w kratkę.
        </div>
      </div>
    </div>
  );
};

export default NotesGrid;
