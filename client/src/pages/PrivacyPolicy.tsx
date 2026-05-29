import { Link, useNavigate } from 'react-router-dom'
import styles from './PrivacyPolicy.module.css'
import SiteFooter from '../SiteFooter'
import PaperNote from '../PaperNote'

const OWNER_LABEL = 'osoba prywatna'
const CONTACT_PATH = '/contact'
const LAST_UPDATED = '27 maja 2026'

const gameData = [
  {
    name: 'Nazwa gracza',
    desc: 'Może być używana do pokazania gracza w lobby, rozgrywce, historii prób i podsumowaniu.',
  },
  {
    name: 'Kod lobby',
    desc: 'Służy do tworzenia pokoju gry i dołączania do istniejącej rozgrywki.',
  },
  {
    name: 'Sekretny kod i próby',
    desc: 'Są potrzebne do działania gry, liczenia podpowiedzi, historii strzałów i sprawdzania zwycięstwa.',
  },
]

const technicalData = [
  'identyfikator połączenia Socket.IO potrzebny do obsługi połączenia z serwerem,',
  'informacje o lobby, graczach, botach, trybie gry i aktualnej fazie rozgrywki,',
  'ustawienia gry, takie jak długość kodu, limit czasu, kolejność graczy i typ podpowiedzi,',
  'stan gry, historia prób, informacja o odgadniętych celach oraz dane potrzebne do podsumowania.',
]

const purposeRules = [
  'tworzenia lobby i dołączania do gry kodem,',
  'synchronizowania rozgrywki między graczami online,',
  'obsługi trybów gry, botów i hot-seat,',
  'sprawdzania prób, liczenia podpowiedzi i kończenia gry,',
  'wyświetlania historii prób oraz podsumowania po zakończeniu rozgrywki.',
]

const storageRules = [
  'Dane lobby i rozgrywki są co do zasady potrzebne tymczasowo, żeby gra mogła działać.',
  'Podsumowanie gry może być zapisane po stronie przeglądarki w sessionStorage, żeby pokazać ekran wyników po zakończeniu gry.',
  'Dane zapisane w sessionStorage zwykle znikają po zamknięciu karty lub sesji przeglądarki.',
  'Jeśli w przyszłości zostanie dodana baza danych, konta użytkowników, ranking globalny albo analityka, ta polityka powinna zostać uzupełniona.',
]

const userRights = [
  'zapytać, jakie dane są używane przez aplikację,',
  'zgłosić problem dotyczący prywatności,',
  'poprosić o usunięcie danych, jeśli są przechowywane poza samą tymczasową rozgrywką,',
  'zgłosić błąd lub nieprawidłowe działanie związane z lobby, rozgrywką albo podsumowaniem.',
]

function PrivacyPolicy() {
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
          title="Opuść politykę prywatności"
        >
          {leaveBtnText}
        </button>
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>PRYWATNOŚĆ</h1>
          <p className={styles.subtitle}>Jakie dane mogą być używane podczas gry w Guess The Code</p>
        </header>

        <main className={styles.main}>
          <section className={styles.section}>
            <div className={styles.step}>1</div>

            <div className={styles.sectionBody}>
              <h2>Informacje ogólne</h2>

              <p className={styles.lead}>
                Ta polityka prywatności opisuje, jakie dane mogą być przetwarzane podczas korzystania z gry <strong>Guess The Code</strong>. Projekt jest prowadzony przez właściciela jako {OWNER_LABEL}.
              </p>

              <PaperNote color="blue">
                <strong>Kontakt w sprawach prywatności</strong>
                <p>
                  W sprawach dotyczących danych lub prywatności możesz skorzystać ze strony{' '}
                  <Link className={styles.inlineLink} to={CONTACT_PATH}>Kontakt</Link>.
                </p>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>2</div>

            <div className={styles.sectionBody}>
              <h2>Dane wpisywane w grze</h2>

              <p className={styles.lead}>
                Podczas gry możesz wpisywać dane potrzebne do działania lobby i rozgrywki. Nie musisz zakładać konta, żeby stworzyć lobby albo dołączyć kodem.
              </p>

              <div className={styles.cardGrid}>
                {gameData.map((item) => (
                  <article key={item.name} className={styles.infoCard}>
                    <h3>{item.name}</h3>
                    <p>{item.desc}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>3</div>

            <div className={styles.sectionBody}>
              <h2>Dane techniczne</h2>

              <p className={styles.lead}>
                Aplikacja może używać danych technicznych potrzebnych do utrzymania połączenia i synchronizacji gry między klientem a serwerem.
              </p>

              <ul className={styles.ruleList}>
                {technicalData.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>4</div>

            <div className={styles.sectionBody}>
              <h2>Cel używania danych</h2>

              <p className={styles.lead}>
                Dane są używane po to, żeby gra mogła działać poprawnie i żeby gracze widzieli aktualny stan rozgrywki.
              </p>

              <ul className={styles.ruleList}>
                {purposeRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>5</div>

            <div className={styles.sectionBody}>
              <h2>Przechowywanie danych</h2>

              <ul className={styles.ruleList}>
                {storageRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>

              <PaperNote color="red">
                <strong>Ważne</strong>
                <p>
                  Gra nie powinna prosić o hasła do kont, dane płatnicze ani inne wrażliwe informacje. Nie wpisuj takich danych w nazwie gracza, kodzie lobby ani innych polach gry.
                </p>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>6</div>

            <div className={styles.sectionBody}>
              <h2>Cookies, analityka i usługi zewnętrzne</h2>

              <p className={styles.paragraph}>
                Jeśli aplikacja nie korzysta z cookies, reklam ani narzędzi analitycznych, ta część ma charakter informacyjny. Jeśli w przyszłości dodasz takie narzędzia, politykę prywatności trzeba uzupełnić o ich nazwy, cel działania i zakres zbieranych danych.
              </p>

            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>7</div>

            <div className={styles.sectionBody}>
              <h2>Twoje możliwości</h2>

              <p className={styles.lead}>
                Jeśli masz pytanie dotyczące prywatności lub działania aplikacji, możesz skontaktować się z właścicielem projektu.
              </p>

              <ul className={styles.ruleList}>
                {userRights.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>8</div>

            <div className={styles.sectionBody}>
              <h2>Zmiany polityki prywatności</h2>

              <p className={styles.paragraph}>
                Ta polityka może zostać zaktualizowana, jeśli zmieni się sposób działania gry, hosting, formularz kontaktowy, analityka, logi lub inne funkcje związane z danymi.
              </p>

              <PaperNote color="yellow">
                <strong>Ostatnia aktualizacja:</strong>
                <p>{LAST_UPDATED}</p>
              </PaperNote>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}

export default PrivacyPolicy
