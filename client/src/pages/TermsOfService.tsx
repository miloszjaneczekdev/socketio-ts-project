import { Link, useNavigate } from 'react-router-dom'
import styles from './TermsOfService.module.css'
import SiteFooter from '../SiteFooter'
import PaperNote from '../PaperNote'

const OWNER_LABEL = 'osoba prywatna'
const CONTACT_PATH = '/contact'
const LAST_UPDATED = '27 maja 2026'

const userRules = [
  'Korzystaj z gry w sposób uczciwy i zgodny z jej przeznaczeniem.',
  'Nie obrażaj, nie nękaj i nie spamuj innych graczy.',
  'Nie próbuj celowo przeciążać serwera, psuć lobby ani zakłócać połączeń innych graczy.',
  'Nie wykorzystuj błędów gry do psucia rozgrywki lub zdobywania nieuczciwej przewagi.',
]

const serviceRules = [
  {
    name: 'Lobby i rozgrywka',
    desc: 'Gra pozwala tworzyć lobby, dołączać kodem oraz grać w wybranych trybach dostępnych w aplikacji.',
  },
  {
    name: 'Tryby gry',
    desc: 'Dostępne tryby, takie jak solo, standard, turbo, każdy każdego i wspólne zgadywanie, mogą mieć różne zasady działania.',
  },
  {
    name: 'Boty i hot-seat',
    desc: 'Niektóre ustawienia pozwalają grać z botami albo lokalnie na jednym ekranie w trybie hot-seat.',
  },
]

const availabilityRules = [
  'Gra może być czasowo niedostępna z powodu aktualizacji, błędów technicznych, prac serwisowych lub problemów z hostingiem.',
  'Właściciel może zmieniać, dodawać albo usuwać funkcje gry, jeśli wymaga tego rozwój projektu.',
  'Nie ma gwarancji, że każda rozgrywka, lobby, historia prób albo wynik zostaną zachowane na stałe.',
]

const responsibilityRules = [
  'Gra jest udostępniana jako projekt rozrywkowy.',
  'Właściciel nie gwarantuje nieprzerwanego i bezbłędnego działania aplikacji.',
  'Użytkownik korzysta z gry na własną odpowiedzialność.',
  'Właściciel nie odpowiada za szkody wynikające z przerw w działaniu gry, błędów technicznych albo nieprawidłowego działania urządzenia użytkownika.',
]

const reportRules = [
  'opisać, co próbowałeś zrobić,',
  'podać tryb gry i ustawienia lobby, jeśli są ważne,',
  'napisać, czy grałeś online, z botami czy hot-seat,',
  'dołączyć komunikat błędu albo opisać, co pojawiło się na ekranie,',
  'podać przeglądarkę i urządzenie, jeśli problem wygląda technicznie.',
]

function TermsOfService() {
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
          title="Opuść regulamin"
        >
          {leaveBtnText}
        </button>
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>REGULAMIN</h1>
          <p className={styles.subtitle}>Podstawowe zasady korzystania z gry <strong>Zgadnij Kod</strong></p>
        </header>

        <main className={styles.main}>
          <section className={styles.section}>
            <div className={styles.step}>1</div>

            <div className={styles.sectionBody}>
              <h2>Informacje ogólne</h2>

              <p className={styles.lead}>
                Ten regulamin opisuje podstawowe zasady korzystania z gry <strong>Zgadnij Kod</strong>. Gra jest projektem rozrywkowym prowadzonym przez właściciela jako {OWNER_LABEL}.
              </p>

              <PaperNote color="blue">
                <strong>Kontakt z właścicielem</strong>
                <p>
                  W sprawach dotyczących gry, błędów, pomysłów lub regulaminu możesz skorzystać ze strony{' '}
                  <Link className={styles.inlineLink} to={CONTACT_PATH}>Kontakt</Link>.
                </p>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>2</div>

            <div className={styles.sectionBody}>
              <h2>Korzystanie z gry</h2>

              <p className={styles.lead}>
                Gra służy do zabawy, rywalizacji i wspólnego zgadywania kodów. Korzystając z niej, zgadzasz się grać uczciwie i nie przeszkadzać innym użytkownikom.
              </p>

              <ul className={styles.ruleList}>
                {userRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>3</div>

            <div className={styles.sectionBody}>
              <h2>Funkcje gry</h2>

              <p className={styles.lead}>
                Guess The Code może zawierać różne funkcje zależne od wybranego trybu, ustawień lobby i aktualnej wersji aplikacji.
              </p>

              <div className={styles.cardGrid}>
                {serviceRules.map((item) => (
                  <article key={item.name} className={styles.infoCard}>
                    <h3>{item.name}</h3>
                    <p>{item.desc}</p>
                  </article>
                ))}
              </div>

              <PaperNote color="green">
                <strong>Gdzie sprawdzić zasady rozgrywki?</strong>
                <span>
                  {' '}Szczegółowe działanie trybów i ekranów gry znajdziesz w zakładce{' '}
                  <Link className={styles.inlineLink} to="/howtoplay">Jak grać?</Link> oraz w{' '}
                  <Link className={styles.inlineLink} to="/rules">Regułach gry</Link>.
                </span>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>4</div>

            <div className={styles.sectionBody}>
              <h2>Zachowanie użytkowników</h2>

              <p className={styles.lead}>
                Podczas korzystania z gry zabronione jest działanie na szkodę innych graczy, właściciela projektu lub samej aplikacji.
              </p>

              <PaperNote color="red">
                <strong>Zabronione działania</strong>
                <p>
                  Nie używaj gry do obrażania, nękania, spamowania, obchodzenia mechanik, automatyzowania akcji albo celowego zakłócania działania lobby i serwera.
                </p>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>5</div>

            <div className={styles.sectionBody}>
              <h2>Dostępność usługi</h2>

              <ul className={styles.ruleList}>
                {availabilityRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>6</div>

            <div className={styles.sectionBody}>
              <h2>Odpowiedzialność</h2>

              <ul className={styles.ruleList}>
                {responsibilityRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>7</div>

            <div className={styles.sectionBody}>
              <h2>Zgłaszanie błędów</h2>

              <p className={styles.lead}>
                Jeśli znajdziesz błąd albo gra nie działa poprawnie, możesz zgłosić problem przez stronę kontaktową.
              </p>

              <ul className={styles.ruleList}>
                {reportRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>8</div>

            <div className={styles.sectionBody}>
              <h2>Zmiany regulaminu</h2>

              <p className={styles.paragraph}>
                Regulamin może zostać zaktualizowany, jeśli zmienią się funkcje gry, sposób działania aplikacji albo zasady korzystania z projektu.
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

export default TermsOfService
