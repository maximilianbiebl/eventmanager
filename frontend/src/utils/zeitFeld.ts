/*
 * Zeit- und Datumsfelder, die sich beim Antippen auch oeffnen.
 *
 * Auf dem Handy passiert beim Tippen INS Feld sonst nichts: die Auswahl
 * kommt nur ueber das kleine Uhr- bzw. Kalendersymbol am Rand. Das ist ein
 * winziges Ziel und niemand vermutet es dort.
 *
 * showPicker() oeffnet die native Auswahl. Der Browser laesst das nur als
 * Reaktion auf eine echte Nutzeraktion zu und wirft sonst - deshalb der
 * Fangarm. Fehlt die Methode (aeltere Browser), bleibt alles beim Alten,
 * das Feld ist ja weiterhin normal bedienbar.
 */
import React from 'react';

const oeffne = (el: HTMLInputElement | null) => {
  if (!el) return;
  const mitPicker = el as HTMLInputElement & { showPicker?: () => void };
  if (typeof mitPicker.showPicker !== 'function') return;
  try {
    mitPicker.showPicker();
  } catch {
    // Kein Nutzergestus oder vom Browser nicht erlaubt - dann eben nicht.
  }
};

/**
 * Auf `<input type="time">` und `<input type="date">` verteilen:
 * `<input type="time" {...zeitFeldProps} ... />`
 */
export const zeitFeldProps = {
  /*
   * Nur beim Antippen mit dem Finger, nicht beim Mausklick.
   *
   * Am PC klickt man ins Feld, um die Uhrzeit zu tippen. Ging dabei die
   * Auswahl auf, landeten die Tasten dort statt im Feld - die Uhrzeit liess
   * sich per Tastatur nicht mehr eingeben (gemeldet bei den Aufgaben-
   * gruppen, betraf aber jedes Feld mit dieser Hilfe). Mit der Maus gibt es
   * ja das Uhrsymbol, und am Handy fehlt die Tastatur ohnehin.
   */
  onClick: (e: React.MouseEvent<HTMLInputElement>) => {
    const art = (e.nativeEvent as PointerEvent).pointerType;
    if (art === 'mouse' || art === 'pen') return;
    oeffne(e.currentTarget);
  },
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ') oeffne(e.currentTarget);
  },
};
