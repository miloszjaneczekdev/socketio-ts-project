import { Link, useNavigate } from 'react-router-dom'
import styles from './Rules.module.css'
import SiteFooter from '../SiteFooter'
import PaperNote from '../PaperNote'

const basicRules = [
  'Każdy gracz ustawia swój tajny kod, którego inni gracze nie mogą zobaczyć.',
  'W swojej turze gracz wpisuje próbę odgadnięcia kodu przeciwnika albo aktualnego celu.',
  'Po każdej próbie gra pokazuje podpowiedź zgodną z ustawieniami lobby.',
  'Historia prób pomaga analizować wcześniejsze strzały i unikać powtarzania błędów.',
  'Gra kończy się zgodnie z zasadami wybranego trybu, np. po odgadnięciu celu albo wszystkich wymaganych kodów.',
]

const codeRules = [
  {
    name: 'Tajny kod',
    desc: 'Kod powinien być ustawiony samodzielnie przez gracza i nie może być celowo pokazywany innym.',
  },
  {
    name: 'Długość kodu',
    desc: 'Liczba znaków zależy od ustawień lobby. Im dłuższy kod, tym trudniejsza rozgrywka.',
  },
  {
    name: 'Znaki w kodzie',
    desc: 'Kod składa się ze znaków dozwolonych przez grę, np. liter i cyfr, zależnie od aktualnych ustawień.',
  },
]

const hintRules = [
  {
    name: 'Byk / dobre miejsce',
    desc: 'Znak jest poprawny i znajduje się dokładnie na właściwej pozycji.',
  },
  {
    name: 'Krowa / dobry znak',
    desc: 'Znak występuje w kodzie, ale znajduje się w innym miejscu.',
  },
  {
    name: 'Brak trafienia',
    desc: 'Znak nie pasuje do kodu albo nie daje punktu według wybranego rodzaju podpowiedzi.',
  },
]


const winRules = [
  'Wygrywa gracz albo drużyna, która najlepiej spełni cel wybranego trybu gry.',
  'Mniejsza liczba prób, krótszy czas i większa skuteczność mogą poprawić wynik w podsumowaniu.',
  'Jeśli gra korzysta z limitu czasu, brak reakcji może oznaczać pusty strzał, losowy strzał albo losowy kod.',
  'Wynik końcowy powinien być oceniany na podstawie podsumowania po zakończeniu rozgrywki.',
]

const fairPlayRules = [
  'Nie podglądaj tajnych kodów innych graczy.',
  'Nie podpowiadaj innym, jeśli nie gracie w trybie współpracy.',
  'Nie odświeżaj strony specjalnie, żeby przerwać turę albo uniknąć wyniku.',
  'Nie przeszkadzaj innym podczas wpisywania kodu lub oddawania próby.',
]

function Rules() {
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
          title="Opuść reguły gry"
        >
          {leaveBtnText}
        </button>
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>REGUŁY GRY</h1>
          <p className={styles.subtitle}>Krótko i konkretnie — zasady, wynik i fair play</p>
        </header>

        <main className={styles.main}>
          <section className={styles.section}>
            <div className={styles.step}>1</div>

            <div className={styles.sectionBody}>
              <h2>Cel gry</h2>

              <p className={styles.lead}>
                Celem gry jest odgadnięcie tajnego kodu przeciwnika, komputera albo aktualnego celu szybciej i skuteczniej niż inni gracze.
              </p>

              <PaperNote color="yellow">
                <strong>Najważniejsze:</strong>
                <p>
                  Ustaw swój kod, nie pokazuj go innym, analizuj podpowiedzi i wykorzystuj historię prób, żeby znaleźć poprawne rozwiązanie.
                </p>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>2</div>

            <div className={styles.sectionBody}>
              <h2>Podstawowe zasady</h2>

              <ul className={styles.ruleList}>
                {basicRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>3</div>

            <div className={styles.sectionBody}>
              <h2>Tajny kod</h2>

              <p className={styles.lead}>
                Tajny kod jest najważniejszym elementem gry. To właśnie jego będą szukać inni gracze.
              </p>

              <div className={styles.cardGrid}>
                {codeRules.map((item) => (
                  <article key={item.name} className={styles.infoCard}>
                    <h3>{item.name}</h3>
                    <p>{item.desc}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>4</div>

            <div className={styles.sectionBody}>
              <h2>Próby i podpowiedzi</h2>

              <p className={styles.lead}>
                Po oddaniu próby gra może pokazać informacje o tym, jak blisko jesteś rozwiązania. Dokładny typ podpowiedzi zależy od ustawień lobby.
              </p>

              <div className={styles.exampleHint}>
                <p className={styles.exampleTitle}>Najczęstsze znaczenie podpowiedzi:</p>

                <div className={styles.exampleGrid}>
                  {hintRules.map((hint) => (
                    <div key={hint.name}>
                      <span className={styles.dot} />
                      <strong>{hint.name}</strong>
                      <p>{hint.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>5</div>

            <div className={styles.sectionBody}>
              <h2>Zasady zależne od trybu</h2>

              <p className={styles.lead}>
                Wybrany tryb może zmieniać kolejność tur, liczbę celów, współpracę między graczami oraz moment zakończenia rozgrywki.
              </p>

              <PaperNote color="blue">
                <strong>Nie powtarzamy tu całego poradnika.</strong>
                <p>
                  Dokładne działanie trybów, takich jak Solo, Standard, Turbo, Wspólne zgadywanie i Każdy każdego, znajdziesz w zakładce{' '}
                  <Link className={styles.inlineLink} to="/howtoplay">Jak grać?</Link>.
                </p>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>6</div>

            <div className={styles.sectionBody}>
              <h2>Limit czasu</h2>

              <p className={styles.paragraph}>
                Jeśli w lobby ustawiony jest limit czasu, gracz powinien wykonać swoją akcję przed jego końcem.
              </p>

              <PaperNote color="red">
                <strong>Po upływie czasu</strong>
                <p>
                  Gra może wykonać akcję automatycznie, np. pusty strzał, losowy strzał albo losowy kod. Zależy to od ustawień wybranych w lobby.
                </p>
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>7</div>

            <div className={styles.sectionBody}>
              <h2>Wygrana i wynik</h2>

              <ul className={styles.ruleList}>
                {winRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>

              <PaperNote color="yellow">
                <strong>Uwaga:</strong> w trybach z wieloma celami, np. Każdy każdego, wynik może zależeć od kilku osobnych historii zgadywania.
              </PaperNote>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>8</div>

            <div className={styles.sectionBody}>
              <h2>Fair play</h2>

              <ul className={styles.ruleList}>
                {fairPlayRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>

              <PaperNote color="green">
                <strong>Wskazówka:</strong>
                <span> gra jest najlepsza wtedy, kiedy wszyscy uczciwie ukrywają swoje kody i nie podglądają ekranów innych osób.</span>
              </PaperNote>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}

export default Rules
