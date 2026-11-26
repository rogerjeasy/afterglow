import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { download, printReport } from '../history/export';
import { Sources } from '../night-shell/components';
import { Button, ChoiceChip, Fold, Notice, Section, TextField } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import { type LogEntry, type Site, consoleApi } from './api';
import { coldChainReport, generatorSummary, summariseFridges } from './coldchain';

/**
 * Afterglow Business (product description 7.14, consoles BC-01..BC-05): a pharmacy,
 * clinic, shop or shelter keeps its sites, logs fridge readings and the generator,
 * publishes whether it is open and powered, and prints a cold-chain report.
 */

const KINDS = ['pharmacy', 'clinic', 'shop', 'shelter', 'community', 'other'] as const;
const KIND_WORD: Record<string, string> = {
  pharmacy: 'Pharmacy',
  clinic: 'Clinic',
  shop: 'Shop',
  shelter: 'Shelter',
  community: 'Community centre',
  other: 'Other',
};
const POWER_WORD = { mains: 'Mains power', backup: 'Backup power', none: 'No power' } as const;

const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const num = (s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

const small = { fontSize: 'var(--type-caption)', color: token('text.secondary') } as const;

function NewSite({ onCreated }: { onCreated: (s: Site) => void }): ReactNode {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('pharmacy');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const locate = (): void => {
    if (!navigator.geolocation) {
      setNote('This browser cannot find a position. Type it instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(5));
        setLng(p.coords.longitude.toFixed(5));
      },
      () => setNote('Could not get the position. Type it instead.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  const create = async (): Promise<void> => {
    const la = num(lat);
    const ln = num(lng);
    if (!name.trim() || la === null || ln === null) {
      setNote('A name and the site’s position are needed.');
      return;
    }
    setBusy(true);
    const r = await consoleApi.putSite(newId(), {
      name: name.trim(),
      kind,
      lat: la,
      lng: ln,
      fridges: [{ id: newId(), name: 'Fridge', minC: 2, maxC: 8 }],
    });
    setBusy(false);
    if (r.ok) {
      setName('');
      onCreated(r.value.site);
    } else setNote(r.message);
  };
  return (
    <Fold label="Add a site">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField label="Name, as the public will see it" value={name} onChange={setName} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <ChoiceChip
              key={k}
              label={KIND_WORD[k] ?? k}
              selected={kind === k}
              onClick={() => setKind(k)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TextField label="Latitude" value={lat} onChange={setLat} />
          <TextField label="Longitude" value={lng} onChange={setLng} />
        </div>
        <Button size="sm" onClick={locate}>
          Use this device’s position
        </Button>
        <span style={small}>
          The site’s position is public: people look for open places by it. It starts with one
          fridge at 2–8 °C, the WHO range for vaccines; edit fridges below.
        </span>
        <Button variant="primary" disabled={busy} onClick={() => void create()}>
          Add site
        </Button>
        {note ? <Notice>{note}</Notice> : null}
      </div>
    </Fold>
  );
}

function SiteCard({
  site,
  onChange,
  onDeleted,
}: { site: Site; onChange: (s: Site) => void; onDeleted: () => void }): ReactNode {
  const [open, setOpen] = useState(site.status?.open ?? true);
  const [power, setPower] = useState<'mains' | 'backup' | 'none'>(site.status?.power ?? 'mains');
  const [statusNote, setStatusNote] = useState(site.status?.note ?? '');
  const [fridgeId, setFridgeId] = useState(site.fridges[0]?.id ?? '');
  const [temp, setTemp] = useState('');
  const [litres, setLitres] = useState('');
  const [days, setDays] = useState(7);
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newFridge, setNewFridge] = useState({ name: '', min: '2', max: '8' });

  const load = useCallback(async () => {
    const r = await consoleApi.logSince(site.siteId, days);
    if (r.ok) setEntries(r.value.entries);
    else setMsg(r.message);
  }, [site.siteId, days]);
  useEffect(() => {
    void load();
  }, [load]);

  const publish = async (): Promise<void> => {
    const r = await consoleApi.setStatus(site.siteId, { open, power, note: statusNote.trim() });
    if (r.ok) {
      onChange(r.value.site);
      setMsg(
        'Published. People nearby see it on their map for 24 hours; publish again to renew it.',
      );
    } else setMsg(r.message);
  };
  const logReading = async (): Promise<void> => {
    const t = num(temp);
    if (t === null || !fridgeId) {
      setMsg('Choose a fridge and type the temperature.');
      return;
    }
    const r = await consoleApi.log(site.siteId, { kind: 'reading', fridgeId, tempC: t });
    if (r.ok) {
      setTemp('');
      setMsg(null);
      void load();
    } else setMsg(r.message);
  };
  const logGenerator = async (event: 'start' | 'stop' | 'refuel'): Promise<void> => {
    const l = event === 'refuel' ? num(litres) : null;
    if (event === 'refuel' && (l === null || l <= 0)) {
      setMsg('Type how many litres were added.');
      return;
    }
    const r = await consoleApi.log(site.siteId, { kind: 'generator', event, litres: l });
    if (r.ok) {
      setLitres('');
      void load();
    } else setMsg(r.message);
  };
  const addFridge = async (): Promise<void> => {
    const mn = num(newFridge.min);
    const mx = num(newFridge.max);
    if (!newFridge.name.trim() || mn === null || mx === null || mn >= mx) {
      setMsg('A fridge needs a name and a range with the lower number first.');
      return;
    }
    const r = await consoleApi.putSite(site.siteId, {
      name: site.name,
      kind: site.kind,
      lat: site.lat,
      lng: site.lng,
      fridges: [...site.fridges, { id: newId(), name: newFridge.name.trim(), minC: mn, maxC: mx }],
    });
    if (r.ok) {
      onChange(r.value.site);
      setNewFridge({ name: '', min: '2', max: '8' });
    } else setMsg(r.message);
  };

  const summaries = entries ? summariseFridges(site, entries) : [];
  const gen = entries ? generatorSummary(entries) : null;
  const report = entries ? coldChainReport(site, entries, days, Date.now()) : '';

  return (
    <Section title={site.name}>
      <span style={small}>
        {KIND_WORD[site.kind] ?? site.kind} · area {site.geohash6}
        {site.status
          ? ` · public: ${site.status.open ? 'open' : 'closed'}, ${POWER_WORD[site.status.power].toLowerCase()}, since ${new Date(site.status.updatedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : ' · nothing published yet'}
      </span>

      <Fold label="Tell people whether you are open" defaultOpen={!site.status}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ChoiceChip label="Open" selected={open} onClick={() => setOpen(true)} />
            <ChoiceChip label="Closed" selected={!open} onClick={() => setOpen(false)} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['mains', 'backup', 'none'] as const).map((p) => (
              <ChoiceChip
                key={p}
                label={POWER_WORD[p]}
                selected={power === p}
                onClick={() => setPower(p)}
              />
            ))}
          </div>
          <TextField
            label="A short note (optional)"
            value={statusNote}
            onChange={setStatusNote}
            hint="For example: insulin in stock; phones charged for free"
          />
          <Button variant="primary" onClick={() => void publish()}>
            Publish to the map
          </Button>
        </div>
      </Fold>

      <Fold label="Log a fridge reading">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {site.fridges.map((f) => (
              <ChoiceChip
                key={f.id}
                label={`${f.name} (${f.minC}–${f.maxC} °C)`}
                selected={fridgeId === f.id}
                onClick={() => setFridgeId(f.id)}
              />
            ))}
          </div>
          <TextField label="Temperature now (°C)" value={temp} onChange={setTemp} />
          <Button variant="primary" onClick={() => void logReading()}>
            Log reading
          </Button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField
              label="New fridge"
              value={newFridge.name}
              onChange={(v) => setNewFridge({ ...newFridge, name: v })}
            />
            <TextField
              label="Min °C"
              value={newFridge.min}
              onChange={(v) => setNewFridge({ ...newFridge, min: v })}
            />
            <TextField
              label="Max °C"
              value={newFridge.max}
              onChange={(v) => setNewFridge({ ...newFridge, max: v })}
            />
            <Button size="sm" onClick={() => void addFridge()}>
              Add fridge
            </Button>
          </div>
        </div>
      </Fold>

      <Fold label="Generator log">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Button size="sm" onClick={() => void logGenerator('start')}>
            Started
          </Button>
          <Button size="sm" onClick={() => void logGenerator('stop')}>
            Stopped
          </Button>
          <TextField label="Litres added" value={litres} onChange={setLitres} />
          <Button size="sm" onClick={() => void logGenerator('refuel')}>
            Refuelled
          </Button>
        </div>
        {gen ? (
          <span style={small}>
            Last {days} days: {gen.starts} starts, {gen.litres} litres added.
          </span>
        ) : null}
      </Fold>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--type-body)', color: token('text.emphasis') }}>
            Cold chain
          </span>
          {[1, 7, 30].map((d) => (
            <ChoiceChip
              key={d}
              label={d === 1 ? 'Today' : `${d} days`}
              selected={days === d}
              onClick={() => setDays(d)}
            />
          ))}
        </div>
        {entries === null ? (
          <span style={small}>Loading the log…</span>
        ) : (
          summaries.map((s) => (
            <div
              key={s.fridge.id}
              style={{
                padding: 12,
                borderRadius: 'var(--radius-tile)',
                background: token('surface.2'),
                border: `${s.excursions.length ? 2 : 1}px solid ${s.excursions.length ? token('focus.ring') : token('hairline')}`,
              }}
            >
              <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
                {s.fridge.name}: {s.lastC === null ? 'no readings' : `${s.lastC} °C now`}
              </div>
              <div style={small}>
                {s.readings} readings
                {s.minC !== null ? `, ${s.minC} to ${s.maxC} °C` : ''} ·{' '}
                {s.excursions.length === 0
                  ? 'no excursions'
                  : `${s.excursions.length} excursion${s.excursions.length === 1 ? '' : 's'}${s.excursions.some((x) => x.endMs === null) ? ', one still out of range' : ''}`}
              </div>
            </div>
          ))
        )}
        {entries ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => printReport(report)}>
              Print the report
            </Button>
            <Button
              size="sm"
              onClick={() => download(`cold-chain-${site.siteId}.txt`, 'text/plain', report)}
            >
              Save as text
            </Button>
          </div>
        ) : null}
      </div>

      {msg ? <Notice>{msg}</Notice> : null}
      {confirmDelete ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              void consoleApi
                .deleteSite(site.siteId)
                .then((r) => (r.ok ? onDeleted() : setMsg(r.message)))
            }
          >
            Yes, delete {site.name} and take it off the map
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
          Delete site
        </Button>
      )}
    </Section>
  );
}

export function BusinessConsole(): ReactNode {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void consoleApi.sites().then((r) => (r.ok ? setSites(r.value.sites) : setErr(r.message)));
  }, []);
  return (
    <>
      <Section title="Afterglow Business">
        <span style={{ fontSize: 'var(--type-body)', color: token('text.secondary') }}>
          For pharmacies, clinics, shops and shelters: tell people you are open and powered, keep
          your fridges’ log, and print the cold-chain report.
        </span>
        {err ? <Notice>{err}</Notice> : null}
        {sites ? <NewSite onCreated={(s) => setSites([...sites, s])} /> : null}
        <Sources labels={['your account', 'public: name, kind, position, open and power']}>
          Your sites and logs are kept with your account (not end-to-end encrypted: they are your
          business records, backed up). Only what you publish is public.
        </Sources>
      </Section>
      {sites?.length === 0 ? <Notice>No sites yet. Add one above.</Notice> : null}
      {sites?.map((s) => (
        <SiteCard
          key={s.siteId}
          site={s}
          onChange={(n) => setSites(sites.map((x) => (x.siteId === n.siteId ? n : x)))}
          onDeleted={() => setSites(sites.filter((x) => x.siteId !== s.siteId))}
        />
      ))}
    </>
  );
}
