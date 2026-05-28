import { Link, useNavigate } from 'react-router-dom'
import styles from './FAQ.module.css'
import SiteFooter from '../SiteFooter'

const generalQuestions = [
  {
    question: 'Czy gra jest darmowa?',
    answer: 'Tak. Podstawowa rozgrywka jest darmowa — możesz stworzyć lobby albo dołączyć do znajomych kodem.',
  },
  {
    question: 'Czy muszę mieć konto?',
    answer: 'Nie. Do gry wystarczy utworzyć lobby albo wpisać kod lobby otrzymany od znajomego.',
  },
  {
    question: 'Czy mogę grać samemu?',
    answer: 'Tak. Do tego służy tryb Solo, w którym zgadujesz kod przygotowany przez grę.',
  },
]

const lobbyQuestions = [
  {
    question: 'Nie mogę dołączyć do lobby. Co zrobić?',
    answer: 'Sprawdź, czy kod ma 6 znaków, czy lobby nadal istnieje oraz czy masz stabilne połączenie z internetem.',
  },
  {
    question: 'Kod lobby nie działa — dlaczego?',
    answer: 'Kod mógł zostać wpisany z błędem, lobby mogło zostać zamknięte albo host mógł rozpocząć lub zakończyć rozgrywkę.',
  },
  {
    question: 'Czy mogę zmienić ustawienia po stworzeniu lobby?',
    answer: 'Tak, ale tylko przed rozpoczęciem gry. Po starcie rozgrywki ustawienia powinny zostać takie same dla wszystkich graczy.',
  },
]

const gameplayQuestions = [
  {
    question: 'Czym różni się Standard od Turbo?',
    answer: 'Standard jest bardziej klasyczny i turowy, a Turbo stawia na szybsze tempo oraz równoczesne działania graczy.',
  },
  {
    question: 'Czy mogę grać z botami?',
    answer: 'Tak, jeśli wybrany tryb i ustawienia lobby na to pozwalają. Bot może ustawiać kod i oddawać próby automatycznie.',
  },
  {
    question: 'Co oznaczają podpowiedzi po strzale?',
    answer: 'Zależy to od ustawień lobby. Najczęściej gra pokazuje dobre miejsca, dobre znaki albo ogólną liczbę trafień.',
  },
]

const technicalQuestions = [
  {
    question: 'Gra się zawiesiła. Co teraz?',
    answer: 'Odśwież stronę i spróbuj ponownie wejść do lobby. Jeśli problem wraca, zgłoś go przez stronę Kontakt.',
  },
  {
    question: 'Czy po odświeżeniu strony wrócę do gry?',
    answer: 'Jeśli lobby nadal istnieje i połączenie działa poprawnie, zwykle możesz spróbować wrócić tym samym kodem lobby.',
  },
  {
    question: 'Na telefonie coś wygląda inaczej. Czy to błąd?',
    answer: 'Nie zawsze. Układ strony dopasowuje się do szerokości ekranu, więc niektóre elementy mogą ustawiać się jeden pod drugim.',
  },
]

function FAQ() {
  const navigate = useNavigate()
  const leaveBtnText = '← Wróć'

  const onLeaveIntent = () => {
    navigate('/')
  }

  return (
    <div className={`${styles.page} container`}>
      <div className={styles.logo}>
        <Link
          className={styles.logoLogo}
          to="/"
          onClick={(e) => {
            e.preventDefault()
            onLeaveIntent()
          }}
        >
          ZGADNIJ&nbsp;<span>KOD</span>
        </Link>

        <button
          type="button"
          className={styles.leaveBtn}
          onClick={onLeaveIntent}
          title="Opuść FAQ"
        >
          {leaveBtnText}
        </button>
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>FAQ</h1>
          <p className={styles.subtitle}>Najczęstsze pytania dotyczące Guess The Code</p>
        </header>

        <main className={styles.main}>
          <section className={styles.section}>
            <div className={styles.step}>1</div>

            <div className={styles.sectionBody}>
              <h2>Ogólne pytania</h2>

              <p className={styles.lead}>
                Tutaj znajdziesz szybkie odpowiedzi dla osób, które dopiero pierwszy raz wchodzą do gry.
              </p>

              <div className={styles.questionList}>
                {generalQuestions.map((item) => (
                  <article key={item.question} className={styles.questionCard}>
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>2</div>

            <div className={styles.sectionBody}>
              <h2>Lobby i kod gry</h2>

              <p className={styles.lead}>
                Te pytania dotyczą tworzenia pokoju, wpisywania kodu oraz problemów z dołączaniem do znajomych.
              </p>

              <div className={styles.questionList}>
                {lobbyQuestions.map((item) => (
                  <article key={item.question} className={styles.questionCard}>
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>3</div>

            <div className={styles.sectionBody}>
              <h2>Rozgrywka</h2>

              <p className={styles.lead}>
                Jeśli chcesz poznać pełne działanie trybów, ekranów i tur, zajrzyj też do poradnika{' '}
                <Link className={styles.inlineLink} to="/howtoplay">Jak grać?</Link>.
              </p>

              <div className={styles.questionList}>
                {gameplayQuestions.map((item) => (
                  <article key={item.question} className={styles.questionCard}>
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>4</div>

            <div className={styles.sectionBody}>
              <h2>Problemy techniczne</h2>

              <p className={styles.lead}>
                Co zrobić, jeśli coś nie działa, połączenie z lobby zrywa się albo strona zachowuje się inaczej niż zwykle.
              </p>

              <div className={styles.questionList}>
                {technicalQuestions.map((item) => (
                  <article key={item.question} className={styles.questionCard}>
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </article>
                ))}
              </div>

              <div className={styles.warningBox}>
                <strong>Nadal masz problem?</strong>
                <p>
                  Opisz, co się stało, jaki tryb był wybrany i czy pojawił się komunikat błędu. Potem przejdź do strony{' '}
                  <Link className={styles.inlineLink} to="/contact">Kontakt</Link>.
                </p>
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}

export default FAQ
