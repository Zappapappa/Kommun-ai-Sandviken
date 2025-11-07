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
  const [language, setLanguage] = useState('sv'); // Always default to Swedish
  const [debugInfo, setDebugInfo] = useState([]); // Debug messages
  // Keep a reference to any currently used Audio object
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

  // Persist language + translate already-fetched answers when switching language
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('ai_lang', language); } catch {}
    }
    
    if (chatHistory.length > 0) {
      if (language === 'en') {
        console.log('Language switched to EN, translating existing answers...');
        translateAnswers();
      } else if (language === 'sv') {
        console.log('Language switched to SV, clearing translations...');
        // Clear translations when switching back to Swedish
        const updatedHistory = chatHistory.map((item) => {
          if (item.type === 'answer' && item.translatedText) {
            const { translatedText, ...rest } = item;
            return rest;
          }
          return item;
        });
        setChatHistory(updatedHistory);
      }
    }
  }, [language]);

  const translateAnswers = async () => {
    console.log('translateAnswers called, chatHistory length:', chatHistory.length);
    const updatedHistory = await Promise.all(
      chatHistory.map(async (item) => {
        if (item.type === 'answer' && !item.translatedText) {
          console.log('Translating existing answer...');
          try {
            const res = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: item.text, targetLang: 'en' }),
            });
            if (!res.ok) {
              const errorText = await res.text();
              console.error('Translation API error:', errorText);
              throw new Error('Translation failed');
            }
            const data = await res.json();
            console.log('Translation successful for existing answer');
            return { ...item, translatedText: data.translatedText };
          } catch (err) {
            console.error('Translation error:', err);
            return item;
          }
        }
        return item;
      })
    );
    setChatHistory(updatedHistory);
  };

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
      // Om språket är engelska, översätt frågan till svenska först
      let questionToSearch = userQuestion;
      if (language === 'en') {
        console.log('User language is EN, translating question to SV...');
        try {
          const translateRes = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: userQuestion, targetLang: 'sv' }),
          });
          console.log('Question translation response status:', translateRes.status);
          if (translateRes.ok) {
            const translateData = await translateRes.json();
            questionToSearch = translateData.translatedText || userQuestion;
            console.log('Question translated to:', questionToSearch);
          } else {
            const errorText = await translateRes.text();
            console.error('Question translation failed:', errorText);
          }
        } catch (translateErr) {
          console.error('Translation request failed:', translateErr);
        }
      }

      // Skicka med chat-historik till backend (max 5 senaste)
      const recentHistory = chatHistory.slice(-5);
      const historyParam = encodeURIComponent(JSON.stringify(recentHistory));
      
      const res = await fetch(`${apiUrl}?q=${encodeURIComponent(questionToSearch)}&history=${historyParam}`, {
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
      
      // If English is selected, translate the answer immediately so follow-ups stay in EN
      let translatedText = null;
      if (language === 'en' && safeAnswer) {
        console.log('Translating answer to English...');
        try {
          const tRes = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: safeAnswer, targetLang: 'en' }),
          });
          console.log('Translation response status:', tRes.status);
          if (tRes.ok) {
            const tData = await tRes.json();
            translatedText = tData.translatedText || null;
            console.log('Translation successful:', translatedText ? 'Yes' : 'No');
          } else {
            const errorText = await tRes.text();
            console.error('Translation API error:', errorText);
          }
        } catch (e) {
          console.error('Failed to translate answer to EN:', e);
        }
      }

      // Lägg till svaret i chatten (inkl. översättning om finns)
      setChatHistory((prev) => [
        ...prev,
        { type: 'answer', text: safeAnswer, translatedText, sources: safeSources },
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
    const addDebug = (msg) => {
      setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
      console.log(msg);
    };
    
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
    addDebug('Starting TTS request...');

    try {
      addDebug(`Fetching TTS for language: ${language}`);
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language }),
      });

      addDebug(`TTS Response status: ${res.status}`);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        addDebug(`TTS API error: ${JSON.stringify(errorData)}`);
        alert(`TTS fel: ${errorData.error || 'Okänt fel'}`);
        setPlayingIndex(null);
        return;
      }

      const data = await res.json();
      
      if (!data.audio) {
        addDebug('No audio data in response');
        throw new Error('No audio data received');
      }
      
      addDebug('TTS audio received, creating Audio object...');
      
      // Create audio element and play immediately (within user gesture)
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = `data:audio/mp3;base64,${data.audio}`;
      audioRef.current = audio;
      
      audio.onended = () => {
        addDebug('Audio playback ended');
        setPlayingIndex(null);
        audioRef.current = null;
      };
      
      audio.onerror = (e) => {
        addDebug(`Audio playback error: ${e.type}`);
        setPlayingIndex(null);
        audioRef.current = null;
      };
      
      // Play must happen synchronously in the click handler for mobile
      addDebug('Starting audio.play()...');
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            addDebug('✓ Audio playing successfully!');
          })
          .catch((err) => {
            addDebug(`✗ Play blocked: ${err.message}`);
            alert(`Ljud blockerades: ${err.message}`);
            setPlayingIndex(null);
          });
      }
    } catch (err) {
      addDebug(`✗ Error: ${err.message}`);
      alert(`Fel: ${err.message}`);
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
          
          @keyframes bounce {
            0%, 80%, 100% {
              transform: scale(0);
              opacity: 0.5;
            }
            40% {
              transform: scale(1);
              opacity: 1;
            }
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
          <div style={styles.modal} className="ai-mobile-fullscreen">
            {/* Modal header */}
            <div style={styles.modalHeader} className="ai-modal-header">
              <h2 id="modal-title" style={styles.modalTitle} className="ai-modal-title">
                {title}
              </h2>
              
              {/* Language selector */}
              <div style={styles.languageSelector} className="ai-lang-selector">
                <span style={styles.languageLabel}>Välj språk:</span>
                <button
                  onClick={() => setLanguage('sv')}
                  style={{
                    ...styles.languageButton,
                    ...(language === 'sv' ? styles.languageButtonActive : {})
                  }}
                  title="Svenska"
                >
                  <span style={styles.flagIcon}>🇸🇪</span>
                  <span style={styles.languageText} className="ai-lang-text">Svenska</span>
                </button>
                <button
                  onClick={() => setLanguage('en')}
                  style={{
                    ...styles.languageButton,
                    ...(language === 'en' ? styles.languageButtonActive : {})
                  }}
                  title="English"
                >
                  <span style={styles.flagIcon}>🇬🇧</span>
                  <span style={styles.languageText} className="ai-lang-text">English</span>
                </button>
              </div>

              <button
                onClick={() => {
                  setOpen(false);
                  setChatHistory([]);
                  setError('');
                }}
                aria-label="Stäng"
                style={styles.closeButton}
                ref={closeButtonRef}
                className="ai-close"
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div style={styles.modalBody} className="ai-modal-body">
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
                          <p style={styles.answerText}>
                            {language === 'en' && item.translatedText ? item.translatedText : item.text}
                          </p>
                          <button
                            onClick={() => handlePlayAudio(
                              language === 'en' && item.translatedText ? item.translatedText : item.text,
                              index
                            )}
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
                  <div style={styles.loadingBubble}>
                    <div style={styles.loadingSpinner}>
                      <div style={{...styles.spinnerDot, animationDelay: '0s'}}></div>
                      <div style={{...styles.spinnerDot, animationDelay: '0.16s'}}></div>
                      <div style={{...styles.spinnerDot, animationDelay: '0.32s'}}></div>
                    </div>
                    <p style={styles.loadingText}>Söker...</p>
                  </div>
                )}

                {error && (
                  <div style={styles.errorBubble}>
                    <p style={styles.errorText}>{error}</p>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
              
              {/* Debug panel - visar TTS fel */}
              {debugInfo.length > 0 && (
                <div style={styles.debugPanel}>
                  <h4 style={styles.debugTitle}>Debug Log (TTS):</h4>
                  {debugInfo.slice(-10).map((msg, i) => (
                    <div key={i} style={styles.debugMessage}>{msg}</div>
                  ))}
                  <button 
                    onClick={() => setDebugInfo([])}
                    style={styles.debugClear}
                  >
                    Rensa
                  </button>
                </div>
              )}
            </div>

            {/* Modal footer - fast i botten */}
            <div style={styles.modalFooter} className="ai-modal-footer">
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
    flex: 1,
  },
  languageSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginLeft: 'auto',
    marginRight: '16px',
    padding: '8px 16px',
    background: '#f8fafc',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
  },
  languageLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748b',
    marginRight: '4px',
  },
  languageButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: '#fff',
    border: '2px solid #e2e8f0',
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: '8px',
    transition: 'all 0.2s',
    fontSize: '14px',
    fontWeight: '500',
    color: '#64748b',
  },
  languageButtonActive: {
    borderColor: '#216c9e',
    background: '#f0f9ff',
    color: '#216c9e',
    boxShadow: '0 0 0 3px rgba(33, 108, 158, 0.1)',
  },
  flagIcon: {
    fontSize: '18px',
  },
  languageText: {
    fontSize: '13px',
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
  loadingBubble: {
    alignSelf: 'flex-start',
    maxWidth: '200px',
    background: '#f0f4f8',
    padding: '20px 24px',
    borderRadius: '18px 18px 18px 4px',
    marginBottom: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    position: 'relative',
    zIndex: 10,
  },
  loadingSpinner: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#216c9e',
    animation: 'bounce 1.4s infinite ease-in-out both',
  },
  loadingText: {
    fontSize: '14px',
    color: '#64748b',
    fontWeight: '500',
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
  debugPanel: {
    marginTop: '16px',
    padding: '12px',
    background: '#fff3cd',
    borderRadius: '8px',
    border: '1px solid #ffc107',
    maxHeight: '200px',
    overflow: 'auto',
  },
  debugTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#856404',
    marginTop: 0,
    marginBottom: '8px',
  },
  debugMessage: {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#856404',
    marginBottom: '4px',
    wordBreak: 'break-all',
  },
  debugClear: {
    marginTop: '8px',
    padding: '4px 8px',
    fontSize: '11px',
    background: '#ffc107',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
