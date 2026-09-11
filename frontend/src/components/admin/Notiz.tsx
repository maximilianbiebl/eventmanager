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
   * Wo das Fenster steht.
   *
   * Am Schreibtisch haengt es RECHTSBUENDIG unter seinem Knopf - immer,
   * nicht nur wenn der Platz knapp wird. Alle Notizknoepfe sitzen am
   * rechten Ende ihrer Zeile; mal links- und mal rechtsbuendig zu oeffnen
   * sah aus wie zwei verschiedene Fenster.
   *
   * Am Handy hilft das nicht: dort ist das Fenster fast so breit wie das
   * Bild, und sobald die Tastatur aufgeht, bleibt nur die obere Haelfte
   * uebrig. Deshalb steht es dort OBEN im sichtbaren Bereich - dort, wo
   * die Tastatur es nicht verdecken kann. window.visualViewport meldet
   * genau diesen Bereich, samt Verschiebung beim Scrollen.
   */
  useLayoutEffect(() => {
    const setzen = () => {
      const sicht = window.visualViewport;
      const breite = sicht?.width ?? window.innerWidth;
      const hoehe = kasten.current?.offsetHeight ?? 220;
      const schmal = breite <= 640;

      const klemme = (wert: number, hoechstens: number) =>
        Math.max(8, Math.min(wert, Math.max(8, hoechstens)));

      if (schmal) {
        setPos({
          top: (sicht?.offsetTop ?? 0) + 8,
          left: (sicht?.offsetLeft ?? 0) + 8,
        });
        return;
      }

      const sichtHoehe = sicht?.height ?? window.innerHeight;
      const untenPasst = anker.bottom + 6 + hoehe <= sichtHoehe - 8;
      setPos({
        top: klemme(untenPasst ? anker.bottom + 6 : anker.top - hoehe - 6, sichtHoehe - hoehe - 8),
        // Die Tabelle rollt waagerecht: ihr Knopf kann rechts ausserhalb
        // des Bildes stehen. Die Klemme haelt das Fenster trotzdem drin.
        left: klemme(anker.right - FENSTER_BREITE, breite - FENSTER_BREITE - 8),
      });
    };

    setzen();
    // Tastatur auf oder zu, Geraet gedreht: neu setzen.
    const sicht = window.visualViewport;
    sicht?.addEventListener('resize', setzen);
    sicht?.addEventListener('scroll', setzen);
    return () => {
      sicht?.removeEventListener('resize', setzen);
      sicht?.removeEventListener('scroll', setzen);
    };
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
        // Am Handy so breit wie das Bild hergibt, sonst die feste Breite.
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
        Notiz zu „{titel}“
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
  /**
   * Beschriftung statt des Zeichens - z.B. "Bearbeiten" unter der
   * aufgeklappten Notiz der Veranstaltung, wo ein zweites ✎ neben dem
   * gelben Kasten nur noch raten liesse, was es tut.
   */
  beschriftung?: string;
}

/**
 * Das ✎ in der Zeile. Gelb, sobald eine Notiz dransteht - so sieht man
 * beim Ueberfliegen, wo etwas vermerkt ist.
 */
export const NotizKnopf: React.FC<KnopfProps> = ({
  titel, notiz, speichern, zahl, klein, className, stil, beschriftung,
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
        title={beschriftung ? 'Notiz bearbeiten' : hat ? `Notiz: ${notiz}` : 'Notiz hinzufügen'}
        aria-label={hat ? 'Notiz bearbeiten' : 'Notiz hinzufügen'}
        /*
         * Kein Fokus durch die Maus.
         *
         * Sonst bleibt der Knopf nach dem Klick fokussiert, und weil das
         * Schreibfenster den Fokus uebernimmt und beim Schliessen wieder
         * abgibt, wertet der Browser das als Tastaturfokus: der Ring blieb
         * stehen, bis man die Seite neu lud. Per Tastatur bekommt der Knopf
         * weiterhin Fokus und Ring.
         */
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setAnker(anker ? null : (e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
        // Mit Beschriftung traegt der Knopf das Wort - dann faerbt ihn das
        // Gelb nicht mit ein, er steht ohnehin am gelben Kasten.
        style={{ ...(className ? {} : stil ?? grundform), ...(beschriftung ? {} : gelb) }}
      >
        {beschriftung || '✎'}
        {zahl ? <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{zahl}</span> : null}
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
  /**
   * Auf- und Zuklappen von aussen steuern. Gebraucht in der Kopfzeile der
   * Veranstaltung: dort ist die Notiz erst gar nicht da, sondern wird
   * ueber ihre Plakette geoeffnet - und das Zuklappen muss dieselbe
   * Plakette zurueckbringen. Ohne diese beiden fuehrt der Text seinen
   * Zustand selbst, wie in Liste und Karten.
   */
  offen?: boolean;
  onUmschalten?: () => void;
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
export const NotizText: React.FC<TextProps> = ({ notiz, style, offen: vonAussen, onUmschalten }) => {
  const [selbst, setSelbst] = useState(false);
  const offen = vonAussen ?? selbst;
  const umschalten = () => (onUmschalten ? onUmschalten() : setSelbst((o) => !o));
  if (!notiz || !notiz.trim()) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      title={offen ? 'Zuklappen' : 'Ganze Notiz anzeigen'}
      onClick={(e) => { e.stopPropagation(); umschalten(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); umschalten(); }
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
      <span
        style={offen ? {
          // Auch aufgeklappt in der Box bleiben: ohne minWidth 0 wehrt sich
          // ein Flex-Kind gegen das Schrumpfen, und ohne overflowWrap
          // laeuft ein langes Wort (oder eine lange URL) rechts hinaus.
          minWidth: 0,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        } : {
          minWidth: 0,
          display: '-webkit-box',
          /*
           * EINE Zeile im Ruhezustand. Bei zwei Zeilen landete das "…"
           * gern allein in der zweiten - und eine Notiz soll die Liste
           * ohnehin nur anreissen, nicht erzaehlen.
           */
          WebkitLineClamp: 1,
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

interface VorschauProps {
  notiz: string;
  oeffnen: () => void;
  /**
   * Platz in der Zeile - das entscheidet die Ansicht, nicht die Notiz.
   * In der Kopfzeile der Veranstaltung steht die Plakette breit neben dem
   * Namen und rutscht am Handy in eine eigene Zeile (siehe
   * EventDetail.module.css).
   */
  className?: string;
}

/**
 * Der Anfang der Notiz an der Stelle, an der sonst das ✎ steht.
 *
 * Gedacht fuer die Kopfzeile der Veranstaltung: dort ist kein Platz fuer
 * Knopf UND Text, und von beidem ist der Text das Wichtigere. Gibt es
 * keine Notiz, steht dort weiter das ✎; sobald eine da ist, tritt es
 * zurueck und kommt beim Aufklappen als "Bearbeiten" wieder.
 *
 * Einzeilig mit "…" am Ende: die Kopfzeile soll nicht umbrechen. Wie viel
 * zu sehen ist, entscheidet der Platz neben Name und Knoepfen - am Handy
 * sind das ein paar Woerter, und auf einem sehr schmalen Geraet bleibt am
 * Ende nur das ✎ stehen. Es tut dann dasselbe wie der Text: aufklappen.
 *
 * Gezeigt wird die ERSTE ZEILE der Notiz, nicht ihr Anfang ueber alle
 * Zeilen hinweg. Wer eine Liste schreibt, setzt das Wichtigste nach oben;
 * mehrere Zeilen zu einer zusammenzuziehen ergaebe Saetze, die so nie
 * dastanden.
 */
const ersteZeile = (text: string): string => {
  const zeilen = text.split('\n').map((z) => z.trim()).filter((z) => z !== '');
  const erste = zeilen[0] ?? '';
  // "…" nur, wenn wirklich mehr kommt - sonst verspricht es einen zweiten
  // Teil, den es nicht gibt. Kuerzung innerhalb der Zeile macht CSS.
  return zeilen.length > 1 ? `${erste} …` : erste;
};
export const NotizVorschau: React.FC<VorschauProps> = ({ notiz, oeffnen, className }) => (
  <button
    type="button"
    className={className}
    // Kein Fokus durch die Maus - siehe NotizKnopf.
    onMouseDown={(e) => e.preventDefault()}
    onClick={(e) => { e.stopPropagation(); oeffnen(); }}
    title={`Notiz: ${notiz}`}
    aria-label="Notiz anzeigen"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      // Links anfangen: die globale Knopfregel zentriert sonst, und der
      // Anriss stuende mitten in einer breiten Plakette.
      justifyContent: 'flex-start',
      gap: '0.3rem',
      minHeight: 'auto',
      padding: '0.2rem 0.5rem',
      borderRadius: 6,
      border: '1px solid var(--c-warning)',
      backgroundColor: GELB_HINTERGRUND,
      color: GELB_TEXT,
      fontSize: '0.75rem',
      lineHeight: 1.3,
      cursor: 'pointer',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    }}
  >
    {/*
      Text ODER Zeichen, nie beides - welches von beidem, entscheidet der
      Platz (styles/notiz.css). Ein ✎ neben zwei Buchstaben Text waere das
      Schlechteste aus beiden Welten.
    */}
    <span className="notiz-anriss-zeichen" aria-hidden style={{ flexShrink: 0 }}>✎</span>
    <span className="notiz-anriss-text" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {ersteZeile(notiz)}
    </span>
  </button>
);
