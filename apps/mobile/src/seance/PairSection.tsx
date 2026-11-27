import { household } from '@afterglow/core';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { HouseholdStore } from '../household/store';
import { Sources } from '../night-shell/components';
import { Button, Notice, Section, TextField } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import { href } from '../router';
import { MAX_NAME, type PairOffer, getMyName, pairLink, parsePair, setMyName } from './pairing';

/** The QR code as SVG squares: dark modules on the mode's brightest red, so it scans
 * without white light (contrast about 5:1 against black). */
function QrCode({ text, label }: { text: string; label: string }): ReactNode {
  const [modules, setModules] = useState<{ size: number; data: Uint8Array } | null>(null);
  useEffect(() => {
    let live = true;
    void import('qrcode').then((QR) => {
      const q = QR.create(text, { errorCorrectionLevel: 'M' });
      if (live) setModules({ size: q.modules.size, data: q.modules.data });
    });
    return () => {
      live = false;
    };
  }, [text]);
  if (!modules) return null;
  const { size, data } = modules;
  const quiet = 3;
  const dim = size + quiet * 2;
  const rects: ReactNode[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) {
        rects.push(
          <rect key={`${x}.${y}`} x={x + quiet} y={y + quiet} width={1.02} height={1.02} />,
        );
      }
    }
  }
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${dim} ${dim}`}
      style={{ width: '100%', maxWidth: 280, alignSelf: 'center', borderRadius: 12 }}
      shapeRendering="crispEdges"
    >
      <rect width={dim} height={dim} fill={token('text.emphasis')} />
      <g fill={token('bg')}>{rects}</g>
    </svg>
  );
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

function detectorClass(): (new (o: { formats: string[] }) => Detector) | null {
  const w = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
  return w.BarcodeDetector ?? null;
}

/** Scan with the browser's barcode detector, where there is one. */
function Scanner({
  onFound,
  onClose,
}: { onFound: (o: PairOffer) => void; onClose: () => void }): ReactNode {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [note, setNote] = useState('Point the camera at their Afterglow code.');
  useEffect(() => {
    const Det = detectorClass();
    if (!Det) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let live = true;
    const det = new Det({ formats: ['qr_code'] });
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (!live) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        stream = s;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = s;
        void v.play();
        timer = window.setInterval(() => {
          if (v.readyState < 2) return;
          void det.detect(v).then((codes) => {
            for (const c of codes) {
              const offer = parsePair(c.rawValue);
              if (offer && live) {
                live = false;
                onFound(offer);
                return;
              }
              if (c.rawValue) setNote('That code is not an Afterglow pairing code.');
            }
          });
        }, 300);
      })
      .catch(() =>
        setNote('The camera could not be opened. Allow it for Afterglow and try again.'),
      );
    return () => {
      live = false;
      window.clearInterval(timer);
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [onFound]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: '100%', borderRadius: 12, background: token('bg'), filter: 'grayscale(1)' }}
      />
      <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
        {note}
      </span>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Stop scanning
      </Button>
    </div>
  );
}

/** "Add this person?" for an offer that arrived by link or scan. */
export function PairConfirm({
  offer,
  store,
  onDone,
}: {
  offer: PairOffer;
  store: HouseholdStore;
  onDone: (note: string) => void;
}): ReactNode {
  const view = store.getState().view;
  const taken = view.roster.find((m) => m.slot === offer.slot);
  const same = taken && taken.name === offer.name;
  return (
    <Section title="Add this person?">
      <Notice>
        {same
          ? `${offer.name} is already on your list as No. ${offer.slot}.`
          : taken
            ? `${offer.name} uses No. ${offer.slot}, but ${taken.name} already has that number on your list. Ask ${offer.name} to pick another number, or remove ${taken.name} first.`
            : `${offer.name} will be on your list as No. ${offer.slot}. When they send a code by light or sound, you will know it is them.`}
      </Notice>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!taken ? (
          <Button
            variant="primary"
            onClick={() => {
              store.addPerson(offer.name, offer.slot);
              onDone(`${offer.name} is on your list. Show them your code so they can add you too.`);
            }}
          >
            Add {offer.name}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => onDone(same ? '' : 'Not added.')}>
          {taken ? 'Close' : 'Not now'}
        </Button>
      </div>
    </Section>
  );
}

export function PairSection({
  mySlot,
  store,
}: { mySlot: number; store: HouseholdStore }): ReactNode {
  const [name, setName] = useState(getMyName);
  const [showing, setShowing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [offer, setOffer] = useState<PairOffer | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const link = name ? pairLink({ slot: mySlot, name }) : null;
  const canScan = detectorClass() !== null;
  const free = household.freeSlot(store.getState().view);

  const share = async (): Promise<void> => {
    if (!link) return;
    const text = `Add me to your Afterglow list, so you know when I signal by light or sound: ${link}`;
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ text }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(link).catch(() => {});
    setNote('The invitation link is copied. Send it in any message.');
  };

  if (offer) {
    return (
      <PairConfirm
        offer={offer}
        store={store}
        onDone={(n) => {
          setOffer(null);
          setNote(n || null);
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Notice>
        Face to face: each of you shows a code and the other scans it. Nothing goes through a
        server; the number is only between the two of you.
      </Notice>
      <TextField
        label="What they call you"
        value={name}
        onChange={(v) => {
          const n = v.slice(0, MAX_NAME);
          setName(n);
          setMyName(n);
        }}
      />
      {showing && link ? (
        <>
          <QrCode text={link} label={`Pairing code for ${name}, No. ${mySlot}`} />
          <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
            You are No. {mySlot}. They can scan this with Afterglow or with their camera app.
          </span>
        </>
      ) : null}
      {scanning ? (
        <Scanner
          onFound={(o) => {
            setScanning(false);
            setOffer(o);
          }}
          onClose={() => setScanning(false)}
        />
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant="primary" disabled={!link} onClick={() => setShowing((s) => !s)}>
          {showing ? 'Hide my code' : 'Show my code'}
        </Button>
        {canScan && !scanning ? (
          <Button size="sm" onClick={() => setScanning(true)} disabled={free === null}>
            Scan their code
          </Button>
        ) : null}
        <Button size="sm" disabled={!link} onClick={() => void share()}>
          Send an invitation
        </Button>
      </div>
      {!canScan ? (
        <Notice>
          This browser cannot scan codes itself: scan theirs with your camera app, and it opens
          here.
        </Notice>
      ) : null}
      {note ? <Notice>{note}</Notice> : null}
      <Sources labels={['your number and name only', 'no server']}>
        The code holds your number on their list and the name you typed. Opening one never adds
        anyone by itself: the person who opens it is asked first.
      </Sources>
    </div>
  );
}

/** An offer in the current address (an opened invitation or a camera-app scan). */
export function useOfferFromHash(): [PairOffer | null, () => void] {
  const [offer, setOffer] = useState<PairOffer | null>(() => parsePair(window.location.hash));
  useEffect(() => {
    const on = (): void => setOffer(parsePair(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const clear = (): void => {
    setOffer(null);
    if (parsePair(window.location.hash)) history.replaceState(null, '', href('/app/seance'));
  };
  return [offer, clear];
}
