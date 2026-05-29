import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Socket } from 'socket.io-client'
import clsx from 'clsx'
import { SocketContext } from './SocketProvider'
import LobbyRotator from './LobbyRotator'
import Tooltip from './ToolTip'
import styles from './Index.module.css'

const RESPONSE_TIMEOUT_MS = 5000
const CODE_LENGTH = 6
const EMPTY_CODE = Array(CODE_LENGTH).fill('') as string[]
const THEME_STORAGE_KEY = 'guess-the-code-theme'

type ThemeMode = 'light' | 'dark'

const getInitialTheme = (): ThemeMode => {
    if (typeof window === 'undefined') return 'light'

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function Index() {
    const currentYear = new Date().getFullYear()
    const [code, setCode] = useState<string[]>(EMPTY_CODE)
    const [isJoining, setIsJoining] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [shake, setShake] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [ph, setPh] = useState<string[]>(EMPTY_CODE)
    const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme)

    const inputRefs = useRef<Array<HTMLInputElement | null>>([])
    const navigate = useNavigate()
    const socket = useContext(SocketContext) as Socket
    const isDarkMode = themeMode === 'dark'

    const prefersReducedMotion = useRef<boolean>(
        typeof window !== 'undefined' &&
        !!window.matchMedia &&
        (
            window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
            window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
            window.matchMedia('(max-width: 900px)').matches
        )
    )

    const setInputRef = useCallback(
        (idx: number) => (el: HTMLInputElement | null) => {
            inputRefs.current[idx] = el
        },
        []
    )

    useEffect(() => {
        const onConnect = () => console.info('[socket] connected:', socket.id)
        const onDisconnect = (reason: Socket.DisconnectReason) =>
            console.warn('[socket] disconnected:', reason)
        const onConnectError = (err: Error) =>
            console.error('[socket] connect_error:', (err as any)?.message || err)
        const onError = (err: unknown) => console.error('[socket] error:', err)

        socket.on('connect', onConnect)
        socket.on('disconnect', onDisconnect)
        socket.on('connect_error', onConnectError)
        socket.on('error', onError)

        return () => {
            socket.off('connect', onConnect)
            socket.off('disconnect', onDisconnect)
            socket.off('connect_error', onConnectError)
            socket.off('error', onError)
        }
    }, [socket])

    const focusNext = useCallback((idx: number) => inputRefs.current[idx + 1]?.focus(), [])
    const focusPrev = useCallback((idx: number) => inputRefs.current[idx - 1]?.focus(), [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const value = e.target.value
        if (!/^[A-Za-z0-9]?$/.test(value)) return

        const newCode = [...code]
        newCode[index] = value.toUpperCase()
        setCode(newCode)

        if (value && index < CODE_LENGTH - 1) focusNext(index)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            e.preventDefault()
            focusPrev(index)
            return
        }

        if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault()
            focusPrev(index)
        }

        if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
            e.preventDefault()
            focusNext(index)
        }

        if (e.key === 'Home') {
            e.preventDefault()
            inputRefs.current[0]?.focus()
        }

        if (e.key === 'End') {
            e.preventDefault()
            inputRefs.current[CODE_LENGTH - 1]?.focus()
        }

        if (e.key === 'Enter') {
            handleJoinLobby()
        }
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '')
        if (!pasted) return

        const newCode = pasted.slice(0, CODE_LENGTH).split('')
        setCode((prev) => {
            const updated = [...prev]
            newCode.forEach((c, i) => { updated[i] = c })
            return updated
        })

        const nextIndex = Math.min(newCode.length, inputRefs.current.length - 1)
        inputRefs.current[nextIndex]?.focus()
    }

    const startShake = () => {
        if (prefersReducedMotion.current) return
        setShake(true)
        setTimeout(() => setShake(false), 300)
    }

    const handleCreateLobby = () => {
        if (isCreating || isJoining) return

        setErrorMsg('')
        setIsCreating(true)
        const startedAt = Date.now()
        const timeoutId = setTimeout(() => {
            console.error(`[createLobby] timeout po ${RESPONSE_TIMEOUT_MS} ms`)
            setErrorMsg('Przekroczono czas oczekiwania na utworzenie lobby.')
            setIsCreating(false)
        }, RESPONSE_TIMEOUT_MS)

        socket.once('lobbyCreated', (lobby: { code: string }) => {
            const ms = Date.now() - startedAt
            clearTimeout(timeoutId)
            console.info(`[createLobby] OK, czas oczekiwania: ${ms} ms`)
            setIsCreating(false)
            navigate(`/lobby?code=${lobby.code}`)
        })

        socket.once('error', (msg: unknown) => {
            const ms = Date.now() - startedAt
            clearTimeout(timeoutId)
            console.error(`[createLobby] błąd serwera po ${ms} ms:`, msg)
            setErrorMsg('Nie udało się utworzyć lobby. Spróbuj ponownie.')
            setIsCreating(false)
        })

        socket.emit('createLobby', { name: 'Host', secret: null })
    }

    const handleJoinLobby = () => {
        if (isJoining || isCreating) return

        const joinedCode = code.join('').toUpperCase()

        if (joinedCode.length !== CODE_LENGTH) {
            console.error('Kod musi mieć 6 znaków')
            setErrorMsg('Kod musi mieć 6 znaków')
            startShake()
            const idx = code.findIndex((c) => !c)
            if (idx >= 0) inputRefs.current[idx]?.focus()
            return
        }

        setErrorMsg('')
        setIsJoining(true)
        const startedAt = Date.now()
        const timeoutId = setTimeout(() => {
            console.error(`[getLobby] timeout po ${RESPONSE_TIMEOUT_MS} ms (code=${joinedCode})`)
            setErrorMsg('Przekroczono czas oczekiwania. Sprawdź kod i spróbuj ponownie.')
            setIsJoining(false)
            startShake()
        }, RESPONSE_TIMEOUT_MS)

        socket.once('lobbyData', () => {
            const ms = Date.now() - startedAt
            clearTimeout(timeoutId)
            console.info(`[getLobby] lobby istnieje, czas oczekiwania: ${ms} ms (code=${joinedCode})`)
            setIsJoining(false)
            navigate(`/lobby?code=${joinedCode}`)
        })

        socket.once('lobbyNotFound', (msg: unknown) => {
            const ms = Date.now() - startedAt
            clearTimeout(timeoutId)
            console.error(`[getLobby] lobby nie istnieje po ${ms} ms (code=${joinedCode}):`, msg)
            setErrorMsg('Nie znaleziono lobby o podanym kodzie')
            setIsJoining(false)
            startShake()
        })

        socket.emit('getLobby', { code: joinedCode })
    }

    useEffect(() => {
        socket.off('lobbyData')
        socket.off('lobbyCreated')
    }, [socket])

    useEffect(() => {
        document.documentElement.dataset.theme = themeMode
        document.documentElement.style.colorScheme = themeMode
        window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
    }, [themeMode])

    const toggleTheme = () => {
        setThemeMode((current) => current === 'dark' ? 'light' : 'dark')
    }

    useEffect(() => {
        if (prefersReducedMotion.current) return

        const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        const TYPE_MS = 150
        const DELETE_MS = 100
        const HOLD_FULL_MS = 2500
        const HOLD_EMPTY_MS = 500

        let i = 0
        let dir: 'type' | 'delete' = 'type'
        let timer: number | undefined
        let fake: string[] = [...EMPTY_CODE]

        const randChar = () => CHARS[Math.floor(Math.random() * CHARS.length)]

        const tick = () => {
            if (dir === 'type') {
                if (i < CODE_LENGTH) {
                    fake[i] = randChar()
                    i++
                }

                setPh(fake.map((c, idx) => (code[idx] ? '' : c)))

                if (i === CODE_LENGTH) {
                    timer = window.setTimeout(() => {
                        dir = 'delete'
                        tick()
                    }, HOLD_FULL_MS)
                    return
                }

                timer = window.setTimeout(tick, TYPE_MS)
                return
            }

            if (i > 0) {
                fake[i - 1] = ''
                i--
            }

            setPh(fake.map((c, idx) => (code[idx] ? '' : c)))

            if (i === 0) {
                timer = window.setTimeout(() => {
                    dir = 'type'
                    fake = [...EMPTY_CODE]
                    tick()
                }, HOLD_EMPTY_MS)
                return
            }

            timer = window.setTimeout(tick, DELETE_MS)
        }

        tick()
        return () => {
            if (timer) window.clearTimeout(timer)
        }
    }, [code])

    return (
        <div className={`${styles.container} container`}>
            
            <Tooltip
                content={isDarkMode ? 'Przelacz na jasny motyw' : 'Przelacz na ciemny motyw'}
                placement="left"
            >
                <button
                    className={styles.themeToggle}
                    type="button"
                    onClick={toggleTheme}
                    aria-label={isDarkMode ? 'Przelacz na jasny motyw' : 'Przelacz na ciemny motyw'}
                    aria-pressed={isDarkMode}
                >
                    <i className={clsx('fa-solid', isDarkMode ? 'fa-sun' : 'fa-moon')} aria-hidden="true" />
                </button>
            </Tooltip>

            <main id="main" className={styles.main}>
                <h1 className={styles.logo}>
                    ZGADNIJ <span>KOD</span>
                </h1>
                <p className={styles.slogan}>Rozszyfruj rywali, zanim rozszyfrują Ciebie!</p>

                <form
                    className={styles.actions}
                    onSubmit={(e) => { e.preventDefault(); handleJoinLobby() }}
                    aria-busy={isJoining || isCreating ? 'true' : undefined}
                >
                    <p className="sr-only" role="status" aria-live="polite">
                        {isCreating ? 'Trwa tworzenie lobby' : isJoining ? 'Trwa dołączanie do lobby' : ''}
                    </p>

                    {errorMsg ? (
                        <p id="join-error" className={styles.errorMessage} role="alert">
                            Uwaga: {errorMsg}
                        </p>
                    ) : (
                        <p className={styles.errorMessage} aria-hidden="true">&nbsp;</p>
                    )}

                    <Tooltip content="Utworz nowe lobby i zostan jego hostem" placement="right">
                        <button
                        className={clsx(styles.btn, styles.green)}
                        type="button"
                        onClick={handleCreateLobby}
                        disabled={isCreating || isJoining}
                    >
                        {isCreating ? 'Tworzenie...' : 'Stwórz lobby'}
                        </button>
                    </Tooltip>

                    <fieldset className={clsx(styles.codeBox, shake && styles.shake)}>
                        <legend className="sr-only" id="code-legend">Kod lobby (6 znaków alfanumerycznych)</legend>

                        <p id="help-instructions" className="sr-only">
                            Wpisz sześć znaków. Użyj strzałek, aby przechodzić między polami. Możesz wkleić cały kod.
                        </p>

                        {code.map((char, index) => {
                            const hasFieldError = !!shake && !char
                            const describedBy = `help-instructions${hasFieldError ? ' join-error' : ''}`

                            return (
                                <React.Fragment key={index}>
                                    <Tooltip content={`Wpisz ${index + 1}. znak kodu lobby`} placement="top">
                                        <input
                                            id={`code-${index}`}
                                            ref={setInputRef(index)}
                                            maxLength={1}
                                            value={char}
                                            onChange={(e) => handleChange(e, index)}
                                            onKeyDown={(e) => handleKeyDown(e, index)}
                                            onPaste={handlePaste}
                                            placeholder={char ? '' : (ph[index] || '')}
                                            inputMode="text"
                                            autoComplete="one-time-code"
                                            autoCapitalize="characters"
                                            autoCorrect="off"
                                            spellCheck={false}
                                            pattern="[A-Za-z0-9]"
                                            aria-label={`Znak ${index + 1} z 6`}
                                            aria-invalid={hasFieldError || undefined}
                                            aria-errormessage={hasFieldError ? 'join-error' : undefined}
                                            aria-describedby={describedBy}
                                            className={clsx(
                                                styles.codeInput,
                                                char && styles.filled,
                                                hasFieldError && styles.inputError
                                            )}
                                        />
                                    </Tooltip>
                                    {index === 2 && (
                                        <span className={styles.dash} aria-hidden="true">-</span>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </fieldset>

                    <Tooltip content="Dolacz do lobby po wpisaniu 6-znakowego kodu" placement="right">
                        <button className={clsx(styles.btn, styles.blue)} type="submit" disabled={isJoining || isCreating}>
                        {isJoining ? 'Dołączanie...' : 'Dołącz do lobby'}
                        </button>
                    </Tooltip>
                </form>

                <div className={styles.lobbyPreview}>
                    <LobbyRotator intervalMs={5000} />
                </div>
            </main>

            <nav className={styles.bottom} aria-label="Linki pomocnicze">
                <ul className={styles.navLinks}>
                    <li><Tooltip content="Zobacz zasady rozgrywki krok po kroku"><Link to="/howtoplay">Jak grać?</Link></Tooltip></li>
                    <li><Tooltip content="Sprawdz pelne reguly gry"><Link to="/rules">Reguły gry</Link></Tooltip></li>
                    <li><Tooltip content="Odpowiedzi na najczestsze pytania"><Link to="/faq">FAQ</Link></Tooltip></li>
                    <li><Tooltip content="Przejdz do danych kontaktowych"><Link to="/contact">Kontakt</Link></Tooltip></li>
                    <li><Tooltip content="Przeczytaj regulamin serwisu"><Link to="/termsofservice">Regulamin</Link></Tooltip></li>
                    <li><Tooltip content="Przeczytaj informacje o prywatnosci"><Link to="/privacypolicy">Polityka Prywatność</Link></Tooltip></li>
                </ul>
            </nav>

            <footer className={styles.footer}>
                © {currentYear} GuessTheCode - made by <Tooltip content="Otworz strone autora"><Link to="http://justonemoreif.com">JUST ONE MORE IF</Link></Tooltip>
            </footer>
        </div>
    )
}

export default Index
