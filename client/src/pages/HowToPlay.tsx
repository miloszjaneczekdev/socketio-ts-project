import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import styles from './HowToPlay.module.css'
import SiteFooter from '../SiteFooter'

const lobbyOptions = [
  {
    name: 'Tryb gry',
    desc: 'Wybiera, w jaki sposób chcecie grać: solo, standard, turbo, wspólne zgadywanie albo każdy każdego.',
  },
  {
    name: 'Długość kodu',
    desc: 'Określa, ile znaków będzie miał sekretny kod, np. 3, 4, 5, 6 albo 8.',
  },
  {
    name: 'Limit czasu na turę',
    desc: 'Ustawia, ile czasu ma gracz na ustawienie kodu albo oddanie strzału.',
  },
  {
    name: 'Po upływie czasu',
    desc: 'Decyduje, co stanie się po skończeniu czasu: pusty strzał, losowy strzał albo losowy kod.',
  },
  {
    name: 'Kolejność graczy',
    desc: 'Może być stała, losowa albo zmieniana co rundę. Od niej zależy, kto kogo zgaduje.',
  },
  {
    name: 'Rodzaj podpowiedzi',
    desc: 'Wybiera, jakie informacje dostaniesz po oddaniu próby.',
  },
  {
    name: 'Historia strzałów',
    desc: 'Decyduje, czy wcześniejsze próby będą widoczne podczas gry.',
  },
]

const modeDemos = [
  {
    modeName: 'Solo',
    slides: [
      {
        id: 'solo-1',
        imageSrc: '/how-to-play/solo-1.png',
        imageAlt: 'Tryb Solo: jeden gracz zgaduje kod komputera',
        durationMs: 5000,
        title: 'Grasz sam przeciwko kodowi komputera.',
        desc: 'Gra generuje sekretny kod, a Ty próbujesz go odgadnąć jak najmniejszą liczbą prób.',
      },
      {
        id: 'solo-2',
        imageSrc: '/how-to-play/solo-2.png',
        imageAlt: 'Tryb Solo: gracz wpisuje próbę i dostaje podpowiedzi',
        durationMs: 5000,
        title: 'Wpisujesz próbę i sprawdzasz podpowiedzi.',
        desc: 'Po każdym strzale widzisz, czy znaki są trafione, źle ustawione albo całkiem nietrafione.',
      },
      {
        id: 'solo-3',
        imageSrc: '/how-to-play/solo-3.png',
        imageAlt: 'Tryb Solo: gracz odgaduje kod i przechodzi do podsumowania',
        durationMs: 5000,
        title: 'Gdy odgadniesz kod, gra się kończy.',
        desc: 'W historii pojawia się „Odgadnięto!”, a potem przechodzisz do strony podsumowania.',
      },
    ],
  },
  {
    modeName: 'Standard',
    slides: [
      {
        id: 'standard-4p-1',
        imageSrc: '/how-to-play/standard-4p-1.png',
        imageAlt: 'Tryb Standard: czterech graczy, gracz 1 zgaduje kod gracza 2',
        durationMs: 5200,
        title: 'Czterech graczy gra po kolei.',
        desc: 'Najpierw gracz 1 zgaduje sekretny kod gracza 2.',
      },
      {
        id: 'standard-4p-2',
        imageSrc: '/how-to-play/standard-4p-2.png',
        imageAlt: 'Tryb Standard: gracz 2 zgaduje kod gracza 3',
        durationMs: 4700,
        title: 'Po turze pierwszego gracza kolejka przechodzi dalej.',
        desc: 'Teraz gracz 2 próbuje odgadnąć kod gracza 3.',
      },
      {
        id: 'standard-4p-3',
        imageSrc: '/how-to-play/standard-4p-3.png',
        imageAlt: 'Tryb Standard: gracz 3 zgaduje kod gracza 4',
        durationMs: 4700,
        title: 'Każdy dostaje swoją turę i swój cel.',
        desc: 'Gracz 3 zgaduje kod gracza 4, a pozostali czekają na swoją kolej.',
      },
      {
        id: 'standard-4p-4',
        imageSrc: '/how-to-play/standard-4p-4.png',
        imageAlt: 'Tryb Standard: gracz 4 zgaduje kod gracza 1',
        durationMs: 5200,
        title: 'Po ostatnim graczu kolejka wraca na początek.',
        desc: 'Gracz 4 zgaduje kod gracza 1 i runda może zacząć się od nowa.',
      },
      {
        id: 'standard-other-order-1',
        imageSrc: '/how-to-play/standard-other-order-1.png',
        imageAlt: 'Tryb Standard: przykład innej kolejności zgadywania',
        durationMs: 5600,
        title: 'Kolejność nie zawsze musi wyglądać identycznie.',
        desc: 'Jeśli w lobby ustawisz inną kolejność, gra dopasuje cele do wybranego ustawienia.',
      },
      {
        id: 'standard-other-order-2',
        imageSrc: '/how-to-play/standard-other-order-2.png',
        imageAlt: 'Tryb Standard: drugi przykład innej kolejności graczy',
        durationMs: 5400,
        title: 'Możesz grać stałą, losową albo zmienianą kolejnością.',
        desc: 'Dzięki temu Standard może być spokojny albo bardziej nieprzewidywalny.',
      },
      {
        id: 'standard-3p',
        imageSrc: '/how-to-play/standard-3p.png',
        imageAlt: 'Tryb Standard: trzech graczy',
        durationMs: 5000,
        title: 'Mniej graczy? Nie ma problemu.',
        desc: 'Przy trzech graczach kolejka dalej działa normalnie: każdy zgaduje następny cel.',
      },
      {
        id: 'standard-2p',
        imageSrc: '/how-to-play/standard-2p.png',
        imageAlt: 'Tryb Standard: dwóch graczy',
        durationMs: 5000,
        title: 'Możecie grać nawet we dwóch.',
        desc: 'Wtedy gracze zgadują swoje kody na zmianę: gracz 1 celuje w gracza 2, a potem odwrotnie.',
      },
    ],
  },
  {
    modeName: 'Turbo',
    slides: [
      {
        id: 'turbo-1',
        imageSrc: '/how-to-play/turbo-1.png',
        imageAlt: 'Tryb Turbo: szybkie tempo i krótki czas na decyzję',
        durationMs: 5000,
        title: 'W Turbo liczy się tempo.',
        desc: 'Rozgrywka jest szybsza niż w trybie standardowym. Masz mniej czasu na analizę, więc trzeba szybko podejmować decyzje i sprawnie wpisywać próby.',
      },
      {
        id: 'turbo-2',
        imageSrc: '/how-to-play/turbo-2.png',
        imageAlt: 'Tryb Turbo: wszyscy gracze zgadują równocześnie',
        durationMs: 5000,
        title: 'Wszyscy zgadują równocześnie.',
        desc: 'Nie ma klasycznej kolejki. Każdy gracz oddaje strzał w tym samym czasie, więc nikt nie czeka na swoją turę.',
      },
    ],
  },
  {
    modeName: 'Wspólne zgadywanie',
    slides: [
      {
        id: 'coop-1',
        imageSrc: '/how-to-play/coop-1.png',
        imageAlt: 'Tryb Wspólne zgadywanie: jeden gracz jest celem',
        durationMs: 5000,
        title: 'Jeden gracz jest aktualnym celem.',
        desc: 'Ten gracz czeka, a pozostali próbują razem odgadnąć jego sekretny kod.',
      },
      {
        id: 'coop-2',
        imageSrc: '/how-to-play/coop-2.png',
        imageAlt: 'Tryb Wspólne zgadywanie: kilku graczy zgaduje ten sam kod',
        durationMs: 5000,
        title: 'Reszta graczy zgaduje równocześnie.',
        desc: 'Każdy strzał daje drużynie informacje, które mogą pomóc przy kolejnych próbach.',
      },
      {
        id: 'coop-3',
        imageSrc: '/how-to-play/coop-3.png',
        imageAlt: 'Tryb Wspólne zgadywanie: gra przechodzi do kolejnego celu',
        durationMs: 5000,
        title: 'Po rozwiązaniu celu gra przechodzi dalej.',
        desc: 'Gdy kod jednego gracza zostanie odgadnięty, kolejnym celem zostaje następny gracz.',
      },
    ],
  },
  {
    modeName: 'Każdy każdego',
    slides: [
      {
        id: 'ffa-1',
        imageSrc: '/how-to-play/ffa-1.png',
        imageAlt: 'Tryb Każdy każdego: wielu graczy zgaduje różne cele',
        durationMs: 5000,
        title: 'Każdy próbuje odgadnąć każdego.',
        desc: 'Ten tryb działa dla większej liczby graczy i daje więcej celów do rozwiązania.',
      },
      {
        id: 'ffa-2',
        imageSrc: '/how-to-play/ffa-2.png',
        imageAlt: 'Tryb Każdy każdego: gracz ma kilka celów',
        durationMs: 5000,
        title: 'Masz osobną historię dla każdego celu.',
        desc: 'Możesz śledzić, które kody już rozgryzłeś, a które nadal wymagają kolejnych prób.',
      },
      {
        id: 'ffa-3',
        imageSrc: '/how-to-play/ffa-3.png',
        imageAlt: 'Tryb Każdy każdego: odgadnięty cel w historii',
        durationMs: 5000,
        title: 'Odgadnięty kod zostaje oznaczony w historii.',
        desc: 'Gdy rozwiążesz kod konkretnego gracza, przy jego historii pojawi się „Odgadnięto!”.',
      },
    ],
  },
]

const playerTypes = [
  {
    name: 'Online',
    desc: 'Każdy gracz gra na swoim urządzeniu. Kody można ustawiać równocześnie, a gra sama pilnuje kolejności tur.',
  },
  {
    name: 'Hot Seat',
    desc: 'Kilku graczy gra na jednym ekranie. Przed kodem albo strzałem pojawia się ekran gotowości, żeby inni nie podglądali.',
  },
  {
    name: 'Boty',
    desc: 'Komputer może grać razem z ludźmi. Bot sam ustawia kod i oddaje strzały, a w Hot Seat jego wpisy są ukryte.',
  },
]

const screenMessages = [
  {
    name: 'Ustaw swój kod',
    desc: 'Wpisujesz sekretny kod, którego inni gracze będą później szukać.',
  },
  {
    name: 'Teraz zgadujesz',
    desc: 'To Twoja kolej. Wpisz próbę i kliknij OK.',
  },
  {
    name: 'Czekasz na swoją turę',
    desc: 'Możesz obserwować grę, ale nie możesz zatwierdzić strzału.',
  },
  {
    name: 'Twój kod jest zgadywany',
    desc: 'Inni gracze próbują odgadnąć Twój sekretny kod.',
  },
  {
    name: 'Odgadnięto!',
    desc: 'Kod został rozwiązany i gra oznacza to w historii.',
  },
]

const timeoutRules = [
  {
    name: 'Brak kodu',
    desc: 'Jeśli gracz nie ustawi kodu na czas, gra może ustawić losowy kod automatycznie.',
  },
  {
    name: 'Brak strzału',
    desc: 'Jeśli gracz nie odda strzału na czas, gra wykona akcję wybraną w lobby: pusty albo losowy strzał.',
  },
  {
    name: 'Szybsza runda',
    desc: 'W Turbo i Wspólnym zgadywaniu runda może skończyć się wcześniej, jeśli wszyscy oddadzą strzały przed czasem.',
  },
]

const hintTypes = [
  {
    name: 'Standardowe — byki i krowy',
    desc: 'Gra pokazuje, ile znaków jest na dobrym miejscu oraz ile znaków występuje w kodzie, ale jest w innym miejscu.',
  },
  {
    name: 'Tylko poprawne miejsca',
    desc: 'Gra pokazuje tylko, ile znaków jest dokładnie na właściwych pozycjach.',
  },
  {
    name: 'Tylko liczba trafień',
    desc: 'Gra pokazuje jedynie, ile znaków jest poprawnych łącznie, bez rozróżniania miejsca.',
  },
  {
    name: 'Brak podpowiedzi',
    desc: 'Po próbie nie dostajesz żadnej informacji. To najtrudniejsza opcja.',
  },
]

const summaryItems = [
  'Historia pokazuje wcześniejsze próby, podpowiedzi i oznaczenie „Odgadnięto!”.',
  'W trybie Każdy każdego historia może być podzielona osobno dla każdego przeciwnika.',
  'Po zakończeniu gry przechodzisz do podsumowania z rankingiem, punktami, próbami, skutecznością i czasem.',
]


type StartDemoAction = 'create' | 'join' | null
type StartDemoFocus = 'create' | 'join' | number | null

const START_DEMO_EMPTY_CODE = Array(6).fill('') as string[]
const START_DEMO_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const startDemoTexts = {
  create: 'Chcesz stworzyć lobby? Kliknij zielony przycisk i utwórz nowy pokój gry.',
  join: 'Chcesz dołączyć do znajomych? Wpisz kod lobby, który Ci podali, i kliknij niebieski przycisk.',
}

function makeRandomLobbyCode() {
  return Array.from(
    { length: 6 },
    () => START_DEMO_CHARS[Math.floor(Math.random() * START_DEMO_CHARS.length)]
  )
}

function useTypewriterText(text: string, typeMs = 26, eraseMs = 12, pauseMs = 140) {
  const [displayed, setDisplayed] = useState('')
  const [target, setTarget] = useState(text)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    setTarget(text)
    setIsDeleting(true)
  }, [text])

  useEffect(() => {
    let timeoutId: number | undefined

    if (isDeleting) {
      if (displayed.length === 0) {
        timeoutId = window.setTimeout(() => setIsDeleting(false), pauseMs)
      } else {
        timeoutId = window.setTimeout(() => {
          setDisplayed((current) => current.slice(0, -1))
        }, eraseMs)
      }

      return () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      }
    }

    if (displayed !== target) {
      timeoutId = window.setTimeout(() => {
        setDisplayed(target.slice(0, displayed.length + 1))
      }, typeMs)

      return () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      }
    }
  }, [displayed, eraseMs, isDeleting, pauseMs, target, typeMs])

  return displayed
}

function ModeDemoCard({ demo }: { demo: (typeof modeDemos)[number] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeSlide = demo.slides[activeIndex]
  const typedTitle = useTypewriterText(activeSlide.title)
  const typedDesc = useTypewriterText(activeSlide.desc, 22, 10, 120)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % demo.slides.length)
    }, activeSlide.durationMs)

    return () => window.clearTimeout(timeoutId)
  }, [activeIndex, activeSlide.durationMs, demo.slides.length])

  return (
    <article className={styles.modeDemoCard}>
      <h3 className={styles.modeDemoTitle}>{demo.modeName}</h3>

      <p className={styles.modeDemoTextTop} aria-live="polite">
        {typedTitle}
      </p>

      <img
        key={activeSlide.id}
        className={styles.modeDemoImage}
        src={activeSlide.imageSrc}
        alt={activeSlide.imageAlt}
      />

      <p className={styles.modeDemoTextBottom} aria-live="polite">
        {typedDesc}
      </p>
    </article>
  )
}

function HowToPlay() {
  const navigate = useNavigate()
  const leaveBtnText = '← Wróć'

  const [startDemoText, setStartDemoText] = useState('')
  const [startDemoCode, setStartDemoCode] = useState<string[]>(START_DEMO_EMPTY_CODE)
  const [startDemoAction, setStartDemoAction] = useState<StartDemoAction>(null)
  const [startDemoFocus, setStartDemoFocus] = useState<StartDemoFocus>(null)
  const [startDemoHidden, setStartDemoHidden] = useState(false)

  const onLeaveIntent = () => {
    navigate('/')
  }

  useEffect(() => {
    let cancelled = false

    const sleep = (ms: number) => new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms)
    })

    const typeText = async (text: string) => {
      setStartDemoText('')

      for (let i = 1; i <= text.length; i += 1) {
        if (cancelled) return
        setStartDemoText(text.slice(0, i))
        await sleep(26)
      }
    }

    const eraseText = async (text: string) => {
      for (let i = text.length - 1; i >= 0; i -= 1) {
        if (cancelled) return
        setStartDemoText(text.slice(0, i))
        await sleep(12)
      }
    }

    const clearDemoFocus = async (delayMs = 240) => {
      await sleep(delayMs)
      if (cancelled) return
      setStartDemoFocus(null)
    }

    const pressDemoButton = async (button: Exclude<StartDemoAction, null>) => {
      setStartDemoFocus(button)
      await sleep(320)
      if (cancelled) return

      setStartDemoAction(button)
      await sleep(260)
      if (cancelled) return

      setStartDemoAction(null)
      await clearDemoFocus(360)
    }

    const hideStartDemo = async (options?: { clearCodeWhileHidden?: boolean }) => {
      setStartDemoFocus(null)
      setStartDemoAction(null)
      setStartDemoHidden(true)

      await sleep(260)
      if (cancelled) return

      if (options?.clearCodeWhileHidden) {
        setStartDemoCode(START_DEMO_EMPTY_CODE)
      }

      await sleep(740)
      if (cancelled) return

      setStartDemoHidden(false)
      await sleep(180)
    }

    const typeCode = async (code: string[]) => {
      setStartDemoCode(START_DEMO_EMPTY_CODE)

      for (let i = 0; i < code.length; i += 1) {
        if (cancelled) return

        setStartDemoFocus(i)
        await sleep(260)
        if (cancelled) return

        setStartDemoCode((current) => {
          const updated = [...current]
          updated[i] = code[i]
          return updated
        })

        await clearDemoFocus(260)
        await sleep(70)
      }
    }

    const runDemo = async () => {
      while (!cancelled) {
        setStartDemoCode(START_DEMO_EMPTY_CODE)

        await typeText(startDemoTexts.create)
        await sleep(650)
        if (cancelled) return
        await pressDemoButton('create')
        await sleep(1000)
        if (cancelled) return
        await Promise.all([
          hideStartDemo(),
          eraseText(startDemoTexts.create),
        ])
        await sleep(300)

        await typeText(startDemoTexts.join)
        await sleep(400)
        await typeCode(makeRandomLobbyCode())
        await sleep(500)
        if (cancelled) return
        await pressDemoButton('join')
        await sleep(1000)
        if (cancelled) return
        await Promise.all([
          hideStartDemo({ clearCodeWhileHidden: true }),
          eraseText(startDemoTexts.join),
        ])
        setStartDemoFocus(null)
        await sleep(500)
      }
    }

    runDemo()

    return () => {
      cancelled = true
    }
  }, [])

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
          title="Opuść poradnik"
        >
          {leaveBtnText}
        </button>
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            JAK GRAĆ?
          </h1>
          <p className={styles.subtitle}>Krótki poradnik krok po kroku</p>
        </header>

        <main className={styles.main}>
          <section className={styles.section}>
            <div className={styles.step}>1</div>

            <div className={styles.sectionBody}>
              <h2>Jak zacząć?</h2>

              <div className={styles.startBlock}>
                <div className={`${styles.startLeft} ${startDemoHidden ? styles.startDemoHidden : ''}`}>
                  <button
                    type="button"
                    className={`${styles.demoBtn} ${styles.greenBtn} ${startDemoAction === 'create' ? styles.demoBtnPressed : ''
                      } ${startDemoFocus === 'create' ? styles.demoFocus : ''}`}
                  >
                    Stwórz lobby
                  </button>

                  <div className={styles.codeDemo} aria-label="Przykładowy kod lobby">
                    {startDemoCode.slice(0, 3).map((char, index) => (
                      <span
                        key={`start-code-left-${index}`}
                        className={`${char ? styles.codeFilled : ''} ${startDemoFocus === index ? styles.demoFocus : ''
                          }`}
                      >
                        {char || ' '}
                      </span>
                    ))}

                    <span className={styles.dash} aria-hidden="true">-</span>

                    {startDemoCode.slice(3).map((char, index) => (
                      <span
                        key={`start-code-right-${index}`}
                        className={`${char ? styles.codeFilled : ''} ${startDemoFocus === index + 3 ? styles.demoFocus : ''
                          }`}
                      >
                        {char || ' '}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={`${styles.demoBtn} ${styles.blueBtn} ${startDemoAction === 'join' ? styles.demoBtnPressed : ''
                      } ${startDemoFocus === 'join' ? styles.demoFocus : ''}`}
                  >
                    Dołącz do lobby
                  </button>
                </div>

                <div className={styles.startRight}>
                  <p className={styles.startTypingText} aria-live="polite">
                    {startDemoText}
                    <span className={styles.typeCursor} aria-hidden="true">|</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>2</div>

            <div className={styles.sectionBody}>
              <h2>Ustaw lobby tak jak chcesz</h2>

              <p className={styles.lead}>
                Host konfiguruje lobby przed rozpoczęciem gry. Te opcje decydują o tym, jak będzie wyglądać cała
                rozgrywka.
              </p>

              <ul className={styles.infoList}>
                {lobbyOptions.map((item) => (
                  <li key={item.name} className={styles.infoRow}>
                    <span className={styles.label}>{item.name}</span>
                    <span className={styles.arrow}>→</span>
                    <span className={styles.desc}>{item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>3</div>

            <div className={styles.sectionBody}>
              <h2>Tryby gry</h2>

              <p className={styles.lead}>
                Wybierz tryb, który najlepiej pasuje do liczby graczy i stylu rozgrywki.
              </p>

              <div className={styles.modeDemoGrid} aria-label="Lista trybów gry">
                {modeDemos.map((demo) => (
                  <ModeDemoCard key={demo.modeName} demo={demo} />
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>4</div>

            <div className={styles.sectionBody}>
              <h2>Online, Hot Seat i boty</h2>

              <p className={styles.lead}>
                Ten sam tryb może wyglądać trochę inaczej w zależności od tego, czy gracie online, lokalnie na jednym
                ekranie albo z botami.
              </p>

              <div className={styles.cardGrid}>
                {playerTypes.map((item) => (
                  <article key={item.name} className={styles.infoCard}>
                    <h3>{item.name}</h3>
                    <p>{item.desc}</p>
                  </article>
                ))}
              </div>

              <div className={styles.warningBox}>
                <strong>Nie podglądaj!</strong>
                <p>
                  W Hot Seat ekran gotowości oznacza, że zaraz gra aktywny gracz. Pozostali powinni odwrócić wzrok,
                  żeby nie zobaczyć jego kodu, strzału albo historii.
                </p>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>5</div>

            <div className={styles.sectionBody}>
              <h2>Ustaw swój sekretny kod</h2>

              <p className={styles.paragraph}>
                Po rozpoczęciu gry każdy gracz podaje swój sekretny kod — <strong>oprócz trybu solo</strong>, gdzie kod
                tworzy komputer.
              </p>

              <p className={styles.paragraph}>
                W grze online gracze ustawiają kody na swoich urządzeniach. W Hot Seat każdy gracz dostaje osobny ekran
                gotowości, żeby nikt nie podglądał.
              </p>

              <p className={styles.paragraph}>
                Jeśli ktoś nie zdąży ustawić kodu przed końcem czasu, gra może ustawić losowy kod automatycznie.
              </p>

              <div className={styles.secretDemo} aria-label="Ukryty sekretny kod">
                <span>•</span>
                <span>•</span>
                <span>•</span>
                <span>•</span>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>6</div>

            <div className={styles.sectionBody}>
              <h2>Co oznaczają ekrany w grze?</h2>

              <p className={styles.lead}>
                Podczas rozgrywki gra pokazuje krótkie komunikaty, żeby każdy wiedział, co ma teraz robić.
              </p>

              <div className={styles.cardGrid}>
                {screenMessages.map((item) => (
                  <article key={item.name} className={styles.infoCard}>
                    <h3>{item.name}</h3>
                    <p>{item.desc}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>7</div>

            <div className={styles.sectionBody}>
              <h2>Jak zgadywać?</h2>

              <p className={styles.paragraph}>
                W swojej turze wpisujesz próbę i zatwierdzasz ją przyciskiem <strong>OK</strong>.
              </p>

              <p className={styles.paragraph}>
                Po każdej próbie gra może pokazać podpowiedzi — wszystko zależy od tego, jaki rodzaj podpowiedzi został
                ustawiony w lobby.
              </p>

              <p className={styles.paragraph}>
                W trybach równoczesnych kilku graczy może oddawać strzały w tym samym czasie. W trybach turowych tylko
                aktywny gracz może zatwierdzić próbę.
              </p>

              <div className={styles.guessRow} aria-label="Przykładowa próba">
                <span>A</span>
                <span>7</span>
                <span>B</span>
                <span>9</span>

                <button type="button" className={styles.okBtn}>
                  OK
                </button>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>8</div>

            <div className={styles.sectionBody}>
              <h2>Co jeśli skończy się czas?</h2>

              <p className={styles.lead}>
                Limit czasu zależy od ustawień lobby. Dzięki temu gra może być spokojna albo szybka i bardziej
                wymagająca.
              </p>

              <div className={styles.cardGrid}>
                {timeoutRules.map((item) => (
                  <article key={item.name} className={styles.infoCard}>
                    <h3>{item.name}</h3>
                    <p>{item.desc}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>9</div>

            <div className={styles.sectionBody}>
              <h2>Rodzaje podpowiedzi</h2>

              <p className={styles.lead}>
                W lobby można ustawić różne rodzaje podpowiedzi. To one decydują, ile informacji dostaniesz po próbie.
              </p>

              <ul className={styles.hintList}>
                {hintTypes.map((hint) => (
                  <li key={hint.name} className={styles.hintRow}>
                    <span className={styles.hintName}>{hint.name}</span>
                    <p className={styles.hintDesc}>{hint.desc}</p>
                  </li>
                ))}
              </ul>

              <div className={styles.exampleHint}>
                <p className={styles.exampleTitle}>Przykład standardowych podpowiedzi:</p>

                <div className={styles.exampleGrid}>
                  <div>
                    <span className={styles.greenDot} />
                    <strong>Byk / dobre miejsce</strong>
                    <p>Znak jest poprawny i stoi dokładnie tam, gdzie powinien.</p>
                  </div>

                  <div>
                    <span className={styles.blueDot} />
                    <strong>Krowa / dobry znak</strong>
                    <p>Znak występuje w kodzie, ale jest w innym miejscu.</p>
                  </div>

                  <div>
                    <span className={styles.greyDot} />
                    <strong>Brak</strong>
                    <p>Znak nie występuje w sekretnym kodzie.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>10</div>

            <div className={styles.sectionBody}>
              <h2>Historia i podsumowanie</h2>

              <p className={styles.lead}>
                Historia pomaga analizować poprzednie próby, a podsumowanie pokazuje wynik całej gry.
              </p>

              <ul className={styles.winList}>
                {summaryItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <div className={styles.noteBox}>
                <strong>Ważne:</strong> w trybach z wieloma celami, np. Każdy każdego, historia może być osobna dla
                każdego gracza, którego próbujesz odgadnąć.
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.step}>11</div>

            <div className={styles.sectionBody}>
              <h2>Jak wygrać?</h2>

              <ul className={styles.winList}>
                <li>Wygrywa gracz albo drużyna, która najlepiej odgadnie cele.</li>
                <li>Mniej prób i krótszy czas zwykle oznaczają lepszy wynik.</li>
                <li>W Solo kończysz po odgadnięciu kodu komputera.</li>
                <li>W Standardzie gra kończy się, gdy każdy gracz odgadnie swój cel.</li>
                <li>W trybach z wieloma celami liczy się rozwiązanie wszystkich wymaganych kodów.</li>
              </ul>

              <div className={styles.tipBox}>
                <strong>Wskazówka:</strong> jeśli nie znasz jeszcze trybów, najlepiej zacznij od
                <span> Standard</span>.
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}

export default HowToPlay
