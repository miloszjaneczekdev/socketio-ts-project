import { Link, useNavigate } from 'react-router-dom'
import styles from './Contact.module.css'
import SiteFooter from '../SiteFooter'
import PaperNote from '../PaperNote'

const CONTACT_EMAIL = 'twoj-email@example.com'

const reportItems = [
  'Co próbowałeś zrobić?',
  'Jaki tryb gry był wybrany?',
  'Czy grałeś online, z botami czy w trybie Hot Seat?',
  'Jaki komunikat błędu się pojawił?',
  'Na jakim urządzeniu i w jakiej przeglądarce wystąpił problem?',
]

const contactReasons = [
  {
    name: 'Błąd w grze',
    desc: 'Napisz, co dokładnie nie działa, kiedy problem się pojawił i czy da się go powtórzyć.',
  },
  {
    name: 'Pomysł na zmianę',
    desc: 'Opisz, co chcesz poprawić albo dodać, np. nowy tryb, opcję lobby albo zmianę wyglądu.',
  },
  {
    name: 'Pytanie o zasady',
    desc: 'Jeśli coś nie jest jasne, napisz, którego fragmentu gry albo reguł dotyczy pytanie.',
  },
]

function Contact() {
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
          title="Opuść kontakt"
        >
          {leaveBtnText}
        </button>
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>KONTAKT</h1>
          <p className={styles.subtitle}>Masz pytanie, pomysł albo znalazłeś błąd? Napisz wiadomość.</p>
        </header>

        <main className={styles.main}>
          <section className={styles.section}>
            <div className={styles.step}>1</div>

            <div className={styles.sectionBody}>
              <h2>Napisz do nas</h2>

              <p className={styles.lead}>
                Najprościej skontaktować się przez email. Opisz krótko, czego dotyczy sprawa, a jeśli zgłaszasz błąd, dodaj jak najwięcej szczegółów.
              </p>

              <div className={styles.emailBox}>
                <span className={styles.emailLabel}>Email</span>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </div>

              <PaperNote color="yellow">
                <strong>Ważne:</strong>
                <p>
                  Podmień adres <span>{CONTACT_EMAIL}</span> na swój prawdziwy adres kontaktowy przed publikacją strony.
                </p>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>2</div>

            <div className={styles.sectionBody}>
              <h2>W jakiej sprawie możesz napisać?</h2>

              <div className={styles.cardGrid}>
                {contactReasons.map((item) => (
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
              <h2>Co warto podać w zgłoszeniu?</h2>

              <p className={styles.lead}>
                Im dokładniejszy opis, tym łatwiej znaleźć przyczynę problemu i szybciej go poprawić.
              </p>

              <ul className={styles.reportList}>
                {reportItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>4</div>

            <div className={styles.sectionBody}>
              <h2>Zanim napiszesz</h2>

              <p className={styles.lead}>
                Część odpowiedzi możesz znaleźć szybciej w poradniku i FAQ.
              </p>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}

export default Contact
