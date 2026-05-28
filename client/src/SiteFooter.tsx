import { Link } from 'react-router-dom'
import styles from './SiteFooter.module.css'

const footerLinks = [
  { to: '/howtoplay', label: 'Jak grać?' },
  { to: '/rules', label: 'Reguły gry' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Kontakt' },
  { to: '/termsofservice', label: 'Regulamin' },
  { to: '/privacypolicy', label: 'Prywatność' },
]

function SiteFooter() {
  return (
    <>
      <nav className={styles.bottomNav} aria-label="Linki pomocnicze">
        <ul>
          {footerLinks.map((link) => (
            <li key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <footer className={styles.footer}>
        © 2025 GuessTheCode — made by{' '}
        <a href="http://justonemoreif.com">JUST ONE MORE IF</a>
      </footer>
    </>
  )
}

export default SiteFooter
