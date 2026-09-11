import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/*
 * Notizen der Leitung - Knopf, kleines Schreibfenster und die Anzeige.
 *
 * Gedacht fuer den Zuruf zwischendurch: "Filter der Maschine ist hin",
 * "Schluessel liegt beim Hausmeister". Deshalb ein eigenes Zeichen direkt
 * in der Zeile statt eines weiteren Feldes im Bearbeiten-Dialog - fuer zwei
 * Worte den grossen Dialog zu oeffnen, macht sie niemand.
 *
 * Sichtbar nur in der Verwaltung. Der Server liefert die Notiz im
 * Mitarbeiterbereich gar nicht erst mit (backend/src/utils/notizen.ts) -
 * hier faellt also keine Entscheidung darueber, wer sie sehen darf.
 *
 * Drei Teile:
 *   NotizKnopf  - das Zeichen, gelb sobald etwas dransteht
 *   NotizFenster- das Schreibfeld, das daran haengt
 *   NotizText   - die Anzeige in der Liste: gekuerzt, auf Klick ganz
 */

/** Mehr ist kein Zuruf mehr, sondern eine Beschreibung. */
export const NOTIZ_MAX = 500;

const GELB_HINTERGRUND = 'var(--c-warning-soft)';
const GELB_TEXT = 'var(--c-warning-strong)';

/*
 * Breite, ab der die Notiz umbricht.
 *
 * Feste Breite statt "so breit wie der Platz": Tabelle und Karten sind
 * verschieden breit, der Text braeche sonst an verschiedenen Stellen um -
 * in der Tabelle erst nach einer sehr langen Zeile. In der Tabelle reicht
 * die Zeile ohnehin nur bis zur Spalte "Status"; dieselbe Breite gilt
 * jetzt auch auf der Karte, damit beide Ansichten gleich lesen.
 */
const NOTIZ_BREITE = '52rem';

/*
 * Das Fenster haengt mit position:fixed am Knopf statt im Fluss der Zeile:
 * in der Tabelle sitzt der Knopf in einer Zelle, und die Tabelle scrollt
 * waagerecht - im Fluss wuerde das Fenster am Rand abgeschnitten.
 */
const FENSTER_BREITE = 320;

interface FensterProps {
  /** Ueberschrift: "Notiz zu ..." - der Titel der Zeile. */
  titel: string;
  wert: string;
  anker: DOMRect;
  speichern: (text: string) => Promise<void> | void;
  schliessen: () => void;
}

const NotizFenster: React.FC<FensterProps> = ({ titel, wert, anker, speichern, schliessen }) => {
  const [text, setText] = useState(wert);
  const [laeuft, setLaeuft] = useState(false);
  const kasten = useRef<HTMLDivElement>(null);
  const feld = useRef<HTMLTextAreaElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: anker.bottom + 6,
    left: anker.left,
  });

  useEffect(() => {
    feld.current?.focus();
    feld.current?.setSelectionRange(text.length, text.length);
    // Absichtlich nur beim Oeffnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Ins Bild ruecken: am rechten Rand wuerde das Fenster sonst hinausragen,
   * am unteren Rand unter die Kante rutschen. Dann klappt es nach oben.
   */
  useLayoutEffect(() => {
    const hoehe = kasten.current?.offsetHeight ?? 220;
    /*
     * Passt es nach rechts nicht mehr, wird es NICHT einfach an den Rand
     * geschoben, sondern rechtsbuendig unter den Knopf gehaengt - sonst
     * stuende es bei einem Knopf am rechten Rand (Notiz zur Veranstaltung
     * in der Kopfzeile) irgendwo weit links daneben, waehrend es in der
     * Tabelle sauber am Knopf klebt.
     */
    const links = anker.left + FENSTER_BREITE <= window.innerWidth - 8
      ? anker.left
      : Math.max(8, anker.right - FENSTER_BREITE);
    const untenPasst = anker.bottom + 6 + hoehe <= window.innerHeight - 8;
    setPos({
      top: untenPasst ? anker.bottom + 6 : Math.max(8, anker.top - hoehe - 6),
      left: links,
    });
  }, [anker]);

  // Klick daneben schliesst - wie bei den anderen kleinen Menues.
  useEffect(() => {
    const ab = (e: MouseEvent) => {
      if (kasten.current && !kasten.current.contains(e.target as Node)) schliessen();
    };
    document.addEventListener('mousedown', ab);
    return () => document.removeEventListener('mousedown', ab);
  }, [schliessen]);

  const sichern = async (neu: string) => {
    if (laeuft) return;
    setLaeuft(true);
    try {
      await speichern(neu);
      schliessen();
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div
      ref={kasten}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: FENSTER_BREITE,
        maxWidth: 'calc(100vw - 16px)',
        zIndex: 1200,
        backgroundColor: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.18))',
        padding: '0.75rem',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{
        fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text)',
        marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        ✎ Notiz zu „{titel}“
      </div>

      <textarea
        ref={feld}
        value={text}
        maxLength={NOTIZ_MAX}
        rows={4}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Ohne Hinweiszeile, aber beides tut, was man erwartet.
          if (e.key === 'Escape') { e.preventDefault(); schliessen(); }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void sichern(text); }
        }}
        placeholder="Kurzer Hinweis für die Leitung…"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          fontSize: '0.875rem',
          lineHeight: 1.45,
          padding: '0.5rem',
          borderRadius: 6,
          border: '1px solid var(--c-border)',
          backgroundColor: 'var(--c-surface)',
          color: 'var(--c-text)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
        {wert.trim() !== '' && (
          <button
            type="button"
            onClick={() => void sichern('')}
            disabled={laeuft}
            style={{
              padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: 6,
              border: '1px solid var(--c-border)', backgroundColor: 'transparent',
              color: 'var(--c-danger-text, #B91C1C)', cursor: 'pointer', minHeight: 'auto',
            }}
          >
            Löschen
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={schliessen}
            disabled={laeuft}
            style={{
              padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: 6,
              border: '1px solid var(--c-border)', backgroundColor: 'transparent',
              color: 'var(--c-text-muted)', cursor: 'pointer', minHeight: 'auto',
            }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void sichern(text)}
            disabled={laeuft}
            style={{
              padding: '0.3rem 0.7rem', fontSize: '0.75rem', fontWeight: 600, borderRadius: 6,
              border: '1px solid var(--c-accent, #2563EB)',
              backgroundColor: 'var(--c-accent, #2563EB)', color: '#fff',
              cursor: 'pointer', minHeight: 'auto',
            }}
          >
            {laeuft ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface KnopfProps {
  /** Titel der Zeile - steht in der Ueberschrift des Fensters. */
  titel: string;
  notiz?: string | null;
  speichern: (text: string) => Promise<void> | void;
  /** Zahl daneben, z.B. wie viele Notizen in einer Gruppe stecken. */
  zahl?: number;
  /** Enger fuer die Tabellenzeile. */
  klein?: boolean;
  /**
   * Eigene Form statt der eingebauten - fuer die Kopfzeile, wo der Knopf
   * rund wie das "i" daneben aussehen soll. Die gelbe Kennzeichnung bleibt.
   */
  className?: string;
  /**
   * Dasselbe fuer Ansichten, die ihre Knoepfe inline stylen: hier gehoert
   * der Stil der NACHBARKNOEPFE hinein ("Zuweisen", "Bearbeiten"). Dann
   * hat das Notizzeichen dieselbe Hoehe und sitzt in einer Linie mit
   * ihnen - vorher war es sichtbar flacher.
   */
  stil?: React.CSSProperties;
}

/**
 * Das ✎ in der Zeile. Gelb, sobald eine Notiz dransteht - so sieht man
 * beim Ueberfliegen, wo etwas vermerkt ist.
 */
export const NotizKnopf: React.FC<KnopfProps> = ({
  titel, notiz, speichern, zahl, klein, className, stil,
}) => {
  const [anker, setAnker] = useState<DOMRect | null>(null);
  const hat = !!(notiz && notiz.trim());

  const gelb = hat
    ? { backgroundColor: GELB_HINTERGRUND, color: GELB_TEXT, borderColor: 'var(--c-warning)' }
    : {};

  // Eingebaute Form nur, wenn die Ansicht keine eigene vorgibt.
  const grundform: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    padding: klein ? '0.2rem 0.4rem' : '0.25rem 0.5rem',
    minHeight: 'auto',
    lineHeight: 1.2,
    fontSize: klein ? '0.75rem' : '0.8125rem',
    borderRadius: 6,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    border: '1px solid var(--c-border)',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
  };

  return (
    <>
      <button
        type="button"
        className={className}
        title={hat ? `Notiz: ${notiz}` : 'Notiz hinzufügen'}
        aria-label={hat ? 'Notiz bearbeiten' : 'Notiz hinzufügen'}
        onClick={(e) => {
          e.stopPropagation();
          setAnker(anker ? null : (e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
        style={{ ...(className ? {} : stil ?? grundform), ...gelb }}
      >
        ✎{zahl ? <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{zahl}</span> : null}
      </button>

      {anker && (
        <NotizFenster
          titel={titel}
          wert={notiz || ''}
          anker={anker}
          speichern={speichern}
          schliessen={() => setAnker(null)}
        />
      )}
    </>
  );
};

interface TextProps {
  notiz?: string | null;
  /** In der Tabelle sitzt der Text in einer eigenen Zeile ueber die ganze Breite. */
  style?: React.CSSProperties;
}

/**
 * Die Notiz in der Liste: zwei Zeilen, der Rest abgeschnitten. Ein Klick
 * klappt sie auf und zeigt alles, ein zweiter wieder zu - eine lange Notiz
 * soll die Liste nicht auseinanderziehen, aber auch nicht unlesbar sein.
 *
 * Zeilenumbrueche aus dem Schreibfenster bleiben erhalten (pre-wrap), auch
 * im gekuerzten Zustand: wer seine Notiz in Zeilen schreibt, will sie auch
 * in Zeilen wiederfinden.
 */
export const NotizText: React.FC<TextProps> = ({ notiz, style }) => {
  const [offen, setOffen] = useState(false);
  if (!notiz || !notiz.trim()) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      title={offen ? 'Zuklappen' : 'Ganze Notiz anzeigen'}
      onClick={(e) => { e.stopPropagation(); setOffen((o) => !o); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOffen((o) => !o); }
      }}
      style={{
        display: 'flex',
        gap: '0.375rem',
        alignItems: 'flex-start',
        padding: '0.3rem 0.5rem',
        borderRadius: 6,
        backgroundColor: GELB_HINTERGRUND,
        color: GELB_TEXT,
        fontSize: '0.75rem',
        lineHeight: 1.45,
        cursor: 'pointer',
        textAlign: 'left',
        maxWidth: NOTIZ_BREITE,
        ...style,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0 }}>✎</span>
      <span
        style={offen ? { whiteSpace: 'pre-wrap' } : {
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          // Zeilenumbrueche des Verfassers bleiben stehen - sie zaehlen
          // dann als die zwei sichtbaren Zeilen.
          whiteSpace: 'pre-wrap',
          // Ohne das bricht ein langes Wort nicht um und sprengt die Zeile.
          overflowWrap: 'anywhere',
        }}
      >
        {notiz}
      </span>
    </div>
  );
};
