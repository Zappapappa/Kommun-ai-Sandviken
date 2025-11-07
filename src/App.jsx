import SearchWidget from './components/SearchWidget';

export default function App() {
  return (
    <div style={styles.page}>
      {/* CSS för att byta bakgrundsbild på mobil */}
      <style>
        {`
          /* Ta bort default margin/padding från body och html */
          body, html {
            margin: 0 !important;
            padding: 0 !important;
            overflow-x: hidden;
          }
          
          @media (max-width: 768px) {
            .hero-mobile {
              background-image: url(/assets/mainpagebobile) !important;
            }
            .heroContent-mobile {
              left: 0 !important;
              max-width: 100% !important;
              padding: 0 16px !important;
            }
          }
        `}
      </style>
      
      {/* Hero-sektion med AI-sök */}
      <div style={styles.hero} className="hero-mobile">
        <div style={styles.heroOverlay}>
          <div style={styles.heroContent} className="heroContent-mobile">
            {/* AI-sökwidget på samma plats som vanlig sökning */}
            <div style={styles.searchContainer}>
              <SearchWidget
                apiUrl="/search"
                heading=""
                title="AI-svar från sandviken.se"
                placeholder="Ange sökord"
                initialQuery=""
                onResult={(result) => {
                  console.log('Sökresultat', result);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    margin: 0,
    padding: 0,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    minHeight: '100vh',
    background: '#f5f5f5',
  },
  header: {
    background: '#216c9e',
    color: '#fff',
    padding: '12px 0',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoIcon: {
    fontSize: '32px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: '600',
  },
  headerRight: {
    display: 'flex',
    gap: '16px',
  },
  headerButton: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: '4px',
    transition: 'background 0.2s',
  },
  nav: {
    background: '#1a5a7e',
    display: 'flex',
    justifyContent: 'center',
    gap: '0',
    padding: '0',
    flexWrap: 'wrap',
  },
  navLink: {
    color: '#fff',
    textDecoration: 'none',
    padding: '14px 18px',
    fontSize: '14px',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap',
  },
  hero: {
    position: 'relative',
    minHeight: '100vh',
    backgroundImage: 'url(/assets/mainpage.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: '#d4a574', // Fallback färg om bilden inte finns
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    maxWidth: '1200px', // Bredare sökfält
    width: '100%',
    padding: '0 20px',
    textAlign: 'center',
    position: 'relative',
    top: '0px',
    left: '-290px',
  },
  heroTitle: {
    color: '#fff',
    fontSize: '48px',
    fontWeight: '300',
    margin: '0 0 40px 0',
    textShadow: '2px 2px 8px rgba(0,0,0,0.6)',
    letterSpacing: '-0.5px',
  },
  searchContainer: {
    marginBottom: '32px',
  },
  quickLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'center',
  },
  quickButton: {
    background: '#216c9e',
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '24px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  footer: {
    background: '#e8eef2',
    padding: '40px 20px',
  },
  footerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  speaker: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
  },
  speakerIcon: {
    fontSize: '24px',
  },
  speakerLink: {
    color: '#216c9e',
    textDecoration: 'underline',
    fontSize: '16px',
  },
  sectionTitle: {
    fontSize: '32px',
    fontWeight: '400',
    color: '#1a1a1a',
    margin: '0',
  },
};
