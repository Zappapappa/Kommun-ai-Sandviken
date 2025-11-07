import { useState, useEffect, useRef } from 'react';

/**
 * SearchWidget – Återanvändbar sök-modal för kommuner.
 *
 * Viktiga props:
 *   - apiUrl: endpoint för sök-API (default "/search").
 *   - title: titel i modalen (default "Kommun-sök (demo)").
 *   - heading: rubrik i widgetens header (default samma som title).
 *   - initialQuery: förifylld fråga.
 *   - logo/badge: React-noder för att byta ut standardbadgen.
 *   - requestOptions: extra fetch-options (headers, metod, etc.).
 *   - onResult: callback som körs när ett svar har hämtats.
 */
export default function SearchWidget({
  apiUrl = '/search',
  title = 'Kommun-sök (demo)',
  heading = null,
  placeholder = 'Skriv din fråga här...',
  initialQuery = 'Hur lång tid tar bygglov i Sandviken?',
  logo = null,
  badge = null,
  requestOptions,
  onResult,
}) {
  // State
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState('');
  const [playingIndex, setPlayingIndex] = useState(null);
  const audioRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedElementRef = useRef(null);
  const chatEndRef = useRef(null);
  const modalInputRef = useRef(null);
  const headingText = heading ?? title;

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  // ESC-lyssnare för att stänga modalen
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!open) {
      return;
    }
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setChatHistory([]);
        setError('');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open]);

  // Hantera fokus in/ut ur dialogen för tillgänglighet
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    if (open) {
      previouslyFocusedElementRef.current = document.activeElement;
      modalInputRef.current?.focus();
    } else if (
      previouslyFocusedElementRef.current &&
      previouslyFocusedElementRef.current instanceof HTMLElement
    ) {
      previouslyFocusedElementRef.current.focus();
    }
  }, [open]);

  // Auto-scroll till botten när nytt meddelande läggs till
  useEffect(() => {
    if (chatEndRef.current && chatHistory.length > 0) {
      // Vänta lite så att DOM hinner uppdateras med det nya meddelandet
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [chatHistory]);

  // Sök-funktion
  const handleSearch = async () => {
    if (loading) {
      return;
    }
    if (!q.trim()) {
      setError('Ange en fråga först.');
      setOpen(true);
      return;
    }

    const userQuestion = q.trim();
    setLoading(true);
    setError('');
    setOpen(true);

    // Lägg till användarens fråga i chatten
    setChatHistory((prev) => [...prev, { type: 'question', text: userQuestion }]);
    setQ(''); // Rensa inputfältet

    try {
      // Skicka med chat-historik till backend (max 5 senaste)
      const recentHistory = chatHistory.slice(-5);
      const historyParam = encodeURIComponent(JSON.stringify(recentHistory));
      
      const res = await fetch(`${apiUrl}?q=${encodeURIComponent(userQuestion)}&history=${historyParam}`, {
        method: 'GET',
        ...(requestOptions ?? {}),
      });
      if (!res.ok) {
        throw new Error(`Fel ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const safeAnswer = (data.answer || '').trim();
      const safeSources = Array.isArray(data.sources) ? data.sources : [];
      
      console.log('API Response:', data);
      console.log('Sources:', safeSources);
      
      // Lägg till svaret i chatten
      setChatHistory((prev) => [
        ...prev,
        { type: 'answer', text: safeAnswer, sources: safeSources },
      ]);

      if (typeof onResult === 'function') {
        onResult({
          query: userQuestion,
          answer: safeAnswer,
          sources: safeSources,
        });
      }
    } catch (err) {
      if (err.name === 'TypeError') {
        setError('Fel: Kunde inte nå servern. Kontrollera anslutningen.');
      } else {
        setError(`Fel: ${err.message}`);
      }
      // Ta bort användarens fråga om det blir fel
      setChatHistory((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  // TTS - Spela upp text
  const handlePlayAudio = async (text, index) => {
    try {
      // Stop currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      if (playingIndex === index) {
        setPlayingIndex(null);
        return;
      }

      setPlayingIndex(index);

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error('TTS failed');

      const data = await res.json();
      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingIndex(null);
        audioRef.current = null;
      };

      audio.play();
    } catch (err) {
      console.error('Audio error:', err);
      setPlayingIndex(null);
    }
  };

  // Klick utanför modalen stänger den
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      setOpen(false);
      // Rensa chatten när modalen stängs
      setChatHistory([]);
      setError('');
    }
  };

  // Default logotyper
  const defaultLogo = (
    <div style={styles.defaultLogo}>
      <span style={styles.defaultLogoText}>S</span>
    </div>
  );

  const defaultBadge = (
    <div style={styles.defaultBadge}>
      <span style={styles.defaultBadgeText}>S</span>
    </div>
  );

  const searchButtonStyle = loading
    ? { ...styles.searchButton, ...styles.searchButtonDisabled }
    : styles.searchButton;

  return (
    <div style={styles.container}>
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
              max-height: 0;
              overflow: hidden;
            }
            to {
              opacity: 1;
              max-height: 2000px;
              overflow: visible;
            }
          }
          
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.4;
            }
          }
          
          .loading-dot {
            animation: pulse 1.4s ease-in-out infinite;
          }
          
          .loading-dot:nth-child(2) {
            animation-delay: 0.2s;
          }
          
          .loading-dot:nth-child(3) {
            animation-delay: 0.4s;
          }
        `}
      </style>
      
      {/* Header med logga - visa endast om heading finns */}
      {headingText && (
        <div style={styles.header}>
          {logo || defaultLogo}
          <h1 style={styles.headerTitle}>{headingText}</h1>
        </div>
      )}

      {/* Sökfält och knapp */}
      <div style={styles.searchBox}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={placeholder}
          aria-label="Sökfråga"
          style={styles.input}
        />
        <button
          onClick={handleSearch}
          aria-label="Sök"
          style={searchButtonStyle}
          disabled={loading}
          aria-disabled={loading}
        >
          {badge || defaultBadge}
          <span style={styles.searchButtonText}>Sök</span>
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div
          style={styles.overlay}
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div style={styles.modal}>
            {/* Modal header */}
            <div style={styles.modalHeader}>
              <h2 id="modal-title" style={styles.modalTitle}>
                {title}
              </h2>
              <button
                onClick={() => {
                  setOpen(false);
                  setChatHistory([]);
                  setError('');
                }}
                aria-label="Stäng"
                style={styles.closeButton}
                ref={closeButtonRef}
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div style={styles.modalBody}>
              {/* Chat historik */}
              <div style={styles.chatContainer}>
                {chatHistory.map((item, index) => (
                  <div key={index}>
                    {item.type === 'question' && (
                      <div style={styles.questionBubble}>
                        <p style={styles.questionText}>{item.text}</p>
                      </div>
                    )}
                    {item.type === 'answer' && (
                      <div style={styles.answerBubble}>
                        <div style={styles.answerHeader}>
                          <p style={styles.answerText}>{item.text}</p>
                          <button
                            onClick={() => handlePlayAudio(item.text, index)}
                            style={styles.playButton}
                            title="Lyssna på svaret"
                            aria-label="Spela upp svar"
                          >
                            {playingIndex === index ? '⏸️' : '🔊'}
                          </button>
                        </div>
                        {console.log('Rendering sources for answer:', item.sources)}
                        {item.sources && item.sources.length > 0 && (
                          <div style={styles.sourcesBox}>
                            <h4 style={styles.sourcesHeading}>Källor:</h4>
                            <ul style={styles.sourcesList}>
                              {item.sources.map((src, i) => {
                                console.log('Source item:', src);
                                return (
                                  <li key={i} style={styles.sourceItem}>
                                    <a
                                      href={src.url || src}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={styles.sourceLink}
                                    >
                                      {src.title || src.url || src}
                                    </a>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div style={styles.answerBubble}>
                    <p style={styles.loadingText}>
                      Söker
                      <span className="loading-dot">.</span>
                      <span className="loading-dot">.</span>
                      <span className="loading-dot">.</span>
                    </p>
                  </div>
                )}

                {error && (
                  <div style={styles.errorBubble}>
                    <p style={styles.errorText}>{error}</p>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Modal footer - fast i botten */}
            <div style={styles.modalFooter}>
              <input
                ref={modalInputRef}
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Ställ en följdfråga..."
                aria-label="Följdfråga"
                style={styles.modalInput}
                disabled={loading}
              />
              <button
                onClick={handleSearch}
                aria-label="Skicka"
                style={loading ? { ...styles.modalSendButton, ...styles.searchButtonDisabled } : styles.modalSendButton}
                disabled={loading}
                aria-disabled={loading}
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline styles – minimal, ren design
const styles = {
  container: {
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  defaultLogo: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultLogoText: {
    color: '#fff',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a202c',
    margin: 0,
  },
  searchBox: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  input: {
    flex: 1,
    padding: '18px 16px', // Högre fält
    fontSize: '16px',
    border: '1px solid #d6dee6',
    borderRadius: '10px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  searchButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '18px 20px', // Samma höjd som input
    fontSize: '15px',
    fontWeight: '600',
    color: '#fff',
    background: '#216c9e',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  searchButtonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  searchButtonText: {
    color: '#fff',
  },
  defaultBadge: {
    width: '20px',
    height: '20px',
    borderRadius: '6px',
    background: 'rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultBadgeText: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: '12px',
    maxWidth: '800px',
    width: '100%',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a202c',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#718096',
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
    transition: 'color 0.2s',
  },
  modalBody: {
    padding: '24px',
    flex: 1,
    overflow: 'auto',
  },
  chatContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  questionBubble: {
    alignSelf: 'flex-end',
    maxWidth: '75%',
    background: '#216c9e',
    color: '#fff',
    padding: '12px 16px',
    borderRadius: '18px 18px 4px 18px',
    marginBottom: '8px',
    animation: 'fadeIn 0.6s ease-out',
  },
  questionText: {
    margin: 0,
    fontSize: '15px',
    lineHeight: '1.5',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  answerBubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    background: '#f0f4f8',
    padding: '16px 18px',
    borderRadius: '18px 18px 18px 4px',
    marginBottom: '8px',
    animation: 'fadeIn 0.8s ease-out',
  },
  answerHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  answerText: {
    flex: 1,
    margin: 0,
    fontSize: '15px',
    lineHeight: '1.7',
    color: '#1a202c',
    fontWeight: '500',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  playButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    transition: 'transform 0.2s, background 0.2s',
    flexShrink: 0,
  },
  errorBubble: {
    alignSelf: 'center',
    background: '#fee',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #fcc',
  },
  modalFooter: {
    display: 'flex',
    gap: '8px',
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
    background: '#fff',
    borderRadius: '0 0 12px 12px',
  },
  modalInput: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '15px',
    border: '1px solid #cbd5e0',
    borderRadius: '24px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  modalSendButton: {
    width: '44px',
    height: '44px',
    background: '#216c9e',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  },
  loadingText: {
    fontSize: '15px',
    color: '#718096',
    textAlign: 'center',
    margin: 0,
  },
  errorText: {
    fontSize: '15px',
    color: '#e53e3e',
    margin: 0,
  },
  fallbackText: {
    fontSize: '15px',
    color: '#4a5568',
    margin: 0,
    textAlign: 'center',
  },
  sourcesBox: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #e2e8f0',
  },
  sourcesHeading: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4a5568',
    marginBottom: '8px',
    marginTop: 0,
  },
  sourcesList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  sourceItem: {
    marginBottom: '8px',
  },
  sourceLink: {
    fontSize: '13px',
    color: '#216c9e',
    textDecoration: 'none',
    wordBreak: 'break-all',
    transition: 'color 0.2s',
  },
};
