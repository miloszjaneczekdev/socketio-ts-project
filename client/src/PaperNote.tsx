import type { ReactNode } from 'react'
import styles from './PaperNote.module.css'

type PaperNoteColor = 'blue' | 'green' | 'yellow' | 'red'

type PaperNoteProps = {
  children: ReactNode
  color?: PaperNoteColor
}

function PaperNote({ children, color = 'yellow' }: PaperNoteProps) {
  return (
    <div className={`${styles.paperNote} ${styles[color]}`}>
      <div className={styles.paperTape} />
      {children}
      <div className={styles.paperTape} />
    </div>
  )
}

export default PaperNote
