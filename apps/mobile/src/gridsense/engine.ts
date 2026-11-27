import { cells, fusion, sensing } from '@afterglow/core';
import { fetchCells } from '../public/api';
import { sendReport } from '../public/deviceKey';

/**
 * Grid Sense in the browser (crowd-reports CR-01, CR-02, CR-07; product description 7.2).
 *
 * Senses the web can use today: the charging edge (Battery Status API, Chromium and
 * Android) and the mains hum (microphone, on request). Light flicker, the magnetometer
 * and home telemetry need the native app and are not faked here. The core's fusion
 * decides; this only gathers votes, keeps the person's cell, and sends one signed report
 * when the verdict changes.
 *
 * Kept on the device (localStorage): the mains frequency, the hum calibration, the cell
 * (never coordinates) and the charging history. Never kept: audio, position.
 */

export type MainsHz = 50 | 60;

export interface GridSenseState {
  readonly mainsHz: MainsHz;
  readonly calibration: sensing.HumCalibration | null;
  /** The person's ~1 km cell, only after they chose to share their area. */
  readonly cell: string | null;
  readonly battery: { readonly supported: boolean; readonly charging: boolean | null };
  readonly charging: sensing.ChargingState;
  readonly chargingNote: string;
  readonly hum: sensing.HumReading | null;
  readonly humAtMs: number | null;
  readonly listening: boolean;
  readonly micDenied: boolean;
  /** Distinct devices the crowd says lost power in this cell (0 below k). */
  readonly crowdAbsent: number;
  readonly crowdState: string | null;
  readonly result: fusion.FusionResult;
  readonly restoreEdge: boolean;
  /** Start and end outages in the household from the verdict. */
  readonly auto: boolean;
  readonly lastReport: {
    readonly verdict: string;
    readonly atMs: number;
    readonly sent: boolean;
  } | null;
  readonly locating: boolean;
  readonly locationError: string | null;
  /** What the person last said with "Power just went out" or "Power is back" (CR-17). */
  readonly person: 'absent' | 'present' | null;
}

/**
 * Whether the person's own outage button should become a crowd report (crowd-reports
 * CR-17). Only on a real change in the same real space: never in the demo, never when
 * the space just changed (sign-in, lock), and never when the phone's senses already
 * reported the same verdict, so one device never counts twice.
 */
export function personReportFor(x: {
  readonly wasOutage: boolean;
  readonly outage: boolean;
  readonly spaceChanged: boolean;
  readonly demo: boolean;
  readonly sensed: fusion.MainsVerdict;
}): 'absent' | 'present' | null {
  if (x.demo || x.spaceChanged || x.wasOutage === x.outage) return null;
  const said = x.outage ? 'absent' : 'present';
  return x.sensed === said ? null : said;
}

const KEY = 'afterglow.gridsense.v1';
const HUM_FRESH_MS = 15 * 60_000;
const MIN = 60_000;

/** 60 Hz grids by time zone; everywhere else is 50 Hz. The person can always change it. */
export function guessMainsHz(): MainsHz {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    // keep the default
  }
  const fifty = /Argentina|Santiago|Montevideo|Asuncion|La_Paz|Guyana|Paramaribo|Cayenne/;
  if (tz.startsWith('America/') && !fifty.test(tz)) return 60;
  if (/Asia\/(Seoul|Taipei|Manila|Riyadh)|Pacific\/(Guam|Saipan)/.test(tz)) return 60;
  return 50;
}

interface Saved {
  mainsHz?: MainsHz;
  calibration?: sensing.HumCalibration | null;
  cell?: string | null;
  charging?: sensing.ChargingState;
  auto?: boolean;
}

function load(): Saved {
  try {
    const x: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return typeof x === 'object' && x !== null ? (x as Saved) : {};
  } catch {
    return {};
  }
}

const unknownResult = fusion.fuse([]);

type Listener = () => void;

export interface OutageHooks {
  /** Called when the fused verdict changes; the shell decides what to do with the household. */
  onVerdict(verdict: fusion.MainsVerdict, restoreEdge: boolean): void;
}

function createEngine() {
  const saved = load();
  let state: GridSenseState = {
    mainsHz: saved.mainsHz === 60 || saved.mainsHz === 50 ? saved.mainsHz : guessMainsHz(),
    calibration: saved.calibration ?? null,
    cell: typeof saved.cell === 'string' && cells.isGeohash6(saved.cell) ? saved.cell : null,
    battery: { supported: false, charging: null },
    charging: saved.charging ?? sensing.INITIAL_CHARGING,
    chargingNote: 'No battery reading yet.',
    hum: null,
    humAtMs: null,
    listening: false,
    micDenied: false,
    crowdAbsent: 0,
    crowdState: null,
    result: unknownResult,
    restoreEdge: false,
    auto: saved.auto ?? true,
    lastReport: null,
    locating: false,
    locationError: null,
    person: null,
  };
  const listeners = new Set<Listener>();
  let hooks: OutageHooks | null = null;
  let started = false;
  let reportTimer: ReturnType<typeof setTimeout> | null = null;
  let crowdTimer: ReturnType<typeof setInterval> | null = null;

  const persist = (): void => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          mainsHz: state.mainsHz,
          calibration: state.calibration,
          cell: state.cell,
          charging: state.charging,
          auto: state.auto,
        }),
      );
    } catch {
      // storage full or blocked: keep working in memory
    }
  };

  const set = (patch: Partial<GridSenseState>): void => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };

  /** Re-fuse every vote we have, and act on a change. */
  const refuse = (): void => {
    const now = Date.now();
    const cv = sensing.chargingVote(state.charging, now);
    const votes: fusion.SenseVote[] = [];
    if (cv.vote) votes.push(cv.vote);
    if (state.hum && state.humAtMs !== null && now - state.humAtMs < HUM_FRESH_MS) {
      votes.push(state.hum.vote);
    }
    const result = fusion.fuse(votes, {
      neighbourAbsentReports: state.crowdAbsent,
      k: cells.K_ANONYMITY,
    });
    const changed = result.verdict !== state.result.verdict;
    set({ result, restoreEdge: cv.restoreEdge, chargingNote: cv.reason });
    if (changed) {
      if (result.verdict !== 'unknown') scheduleReport(result, cv.restoreEdge);
      hooks?.onVerdict(result.verdict, cv.restoreEdge);
    }
  };

  /** One report per change, after a random 0-120 s delay so a whole city does not report at once. */
  const scheduleReport = (result: fusion.FusionResult, restoreEdge: boolean): void => {
    if (!state.cell) return;
    if (reportTimer !== null) clearTimeout(reportTimer);
    const delay = Math.floor(Math.random() * 120_000);
    reportTimer = setTimeout(() => {
      reportTimer = null;
      const cell = state.cell;
      if (!cell) return;
      const senses = [...result.votedPositive, ...result.votedNegative];
      const report = {
        geohash6: cell,
        minute: Math.floor(Date.now() / MIN),
        verdict: result.verdict,
        confidence: result.verdict === 'unknown' ? 0 : senses.length >= 2 ? 0.9 : 0.7,
        senses: senses.length > 0 ? senses : ['reported'],
        restoreEdge,
      };
      void sendReport(report).then((sent) =>
        set({ lastReport: { verdict: result.verdict, atMs: Date.now(), sent } }),
      );
    }, delay);
  };

  /**
   * A report from what the person said, not from a sense (CR-17): the same signed,
   * jittered report with `senses: ['reported']` and a lower confidence. It is one device
   * in the cell's k >= 5 count like any other, so a lone person can never colour a cell.
   */
  const schedulePersonReport = (verdict: 'absent' | 'present'): void => {
    if (!state.cell) return;
    if (reportTimer !== null) clearTimeout(reportTimer);
    const delay = Math.floor(Math.random() * 30_000);
    reportTimer = setTimeout(() => {
      reportTimer = null;
      const cell = state.cell;
      if (!cell || state.person !== verdict) return;
      void sendReport({
        geohash6: cell,
        minute: Math.floor(Date.now() / MIN),
        verdict,
        confidence: 0.5,
        senses: ['reported'],
        restoreEdge: verdict === 'present',
      }).then((sent) => set({ lastReport: { verdict, atMs: Date.now(), sent } }));
    }, delay);
  };

  const refreshCrowd = async (): Promise<void> => {
    const cell = state.cell;
    if (!cell) return;
    const answer = await fetchCells(cell, 1, 1);
    const mine = answer?.cells.find((c) => c.geohash6 === cell);
    if (!mine) return;
    set({ crowdAbsent: mine.state === 'dark' ? mine.deviceCount : 0, crowdState: mine.state });
    refuse();
  };

  const watchBattery = async (): Promise<void> => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        charging: boolean;
        addEventListener: (t: 'chargingchange', f: () => void) => void;
      }>;
    };
    if (typeof nav.getBattery !== 'function') {
      set({ battery: { supported: false, charging: null } });
      return;
    }
    try {
      const battery = await nav.getBattery();
      const observe = (): void => {
        const charging = sensing.observeCharging(state.charging, {
          charging: battery.charging,
          atMs: Date.now(),
        });
        set({ charging, battery: { supported: true, charging: battery.charging } });
        persist();
        refuse();
        // A drop after a long charge: corroborate by ear, if the person already allowed it.
        if (!battery.charging && charging.dropAtMs !== null && !state.micDenied)
          void listenIfAllowed();
      };
      battery.addEventListener('chargingchange', observe);
      observe();
    } catch {
      set({ battery: { supported: false, charging: null } });
    }
  };

  const listenIfAllowed = async (): Promise<void> => {
    try {
      const p = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
      if (p?.state === 'granted') await engine.listen();
    } catch {
      // permissions API missing: wait for the person to ask
    }
  };

  /** Sample the room. Only the vote is kept; the audio never leaves this function. */
  async function sampleHum(
    asCalibration: 'present' | 'quiet' | null,
  ): Promise<sensing.HumReading | null> {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32768;
      source.connect(analyser);
      const readings: sensing.HumReading[] = [];
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        readings.push(
          sensing.humVerdict(
            buf,
            ctx.sampleRate,
            state.mainsHz,
            asCalibration ? null : state.calibration,
          ),
        );
        buf.fill(0);
      }
      // The clearest of the three: the highest ratio when any heard hum, else the median.
      readings.sort((a, b) => b.ratio - a.ratio);
      return (
        readings.find((r) => r.vote.direction === 'present') ?? readings[1] ?? readings[0] ?? null
      );
    } catch (e) {
      if ((e as { name?: string }).name === 'NotAllowedError') set({ micDenied: true });
      return null;
    } finally {
      for (const t of stream?.getTracks() ?? []) t.stop();
      void ctx?.close();
    }
  }

  const engine = {
    getState: (): GridSenseState => state,
    subscribe(l: Listener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    setHooks(h: OutageHooks | null): void {
      hooks = h;
    },
    start(): void {
      if (started) return;
      started = true;
      void watchBattery();
      void refreshCrowd();
      crowdTimer = setInterval(() => void refreshCrowd(), 2 * MIN);
      // Fresh evidence ages out, so look again now and then.
      setInterval(refuse, MIN);
      // Heartbeat (crowd-reports CR-16): a cell counts reports from the last 30 minutes,
      // so while this phone is sure, it says so again every 10 minutes; otherwise a long
      // outage would fade to "unknown" on the map half an hour in.
      setInterval(() => {
        const r = state.result;
        const last = state.lastReport;
        if (!state.cell || reportTimer !== null) return;
        if (r.verdict === 'unknown') {
          // No sense is sure: keep the person's own word on the map while it stands.
          const p = state.person;
          if (p === 'absent' && !(last && last.verdict === p && Date.now() - last.atMs < 9 * MIN)) {
            schedulePersonReport(p);
          }
          return;
        }
        if (last && last.verdict === r.verdict && Date.now() - last.atMs < 9 * MIN) return;
        scheduleReport(r, false);
      }, 10 * MIN);
    },
    /** The person pressed "Power just went out" or "Power is back" (CR-17). */
    reportPerson(verdict: 'absent' | 'present'): void {
      set({ person: verdict });
      schedulePersonReport(verdict);
    },
    async listen(): Promise<void> {
      if (state.listening) return;
      set({ listening: true });
      const reading = await sampleHum(null);
      set({
        listening: false,
        ...(reading ? { hum: reading, humAtMs: Date.now(), micDenied: false } : {}),
      });
      refuse();
    },
    /** Learn this phone's microphone: near a lamp that is on (present), or with mains off (quiet). */
    async calibrate(kind: 'present' | 'quiet'): Promise<boolean> {
      set({ listening: true });
      const reading = await sampleHum(kind);
      set({ listening: false });
      if (!reading || !Number.isFinite(reading.ratio)) return false;
      const prev = state.calibration;
      const calibration: sensing.HumCalibration =
        kind === 'present'
          ? {
              presentRatio: reading.ratio,
              ...(prev?.quietRatio !== undefined ? { quietRatio: prev.quietRatio } : {}),
            }
          : { presentRatio: prev?.presentRatio ?? 6, quietRatio: reading.ratio };
      set({ calibration });
      persist();
      return true;
    },
    setMainsHz(hz: MainsHz): void {
      set({ mainsHz: hz, calibration: null, hum: null, humAtMs: null });
      persist();
      refuse();
    },
    setAuto(auto: boolean): void {
      set({ auto });
      persist();
    },
    /** Ask for the position once, keep only its ~1 km cell. */
    shareArea(): Promise<boolean> {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          set({ locationError: 'This browser cannot tell where you are.' });
          resolve(false);
          return;
        }
        set({ locating: true, locationError: null });
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const cell = cells.encodeGeohash({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            set({ cell, locating: false });
            persist();
            void refreshCrowd();
            resolve(true);
          },
          (err) => {
            set({
              locating: false,
              locationError:
                err.code === err.PERMISSION_DENIED
                  ? 'Location was not allowed. The map and places need your area; everything else works without it.'
                  : 'Your position could not be found just now. Try again near a window.',
            });
            resolve(false);
          },
          { enableHighAccuracy: false, maximumAge: 10 * MIN, timeout: 15_000 },
        );
      });
    },
    forgetArea(): void {
      set({ cell: null, crowdAbsent: 0, crowdState: null });
      persist();
      refuse();
    },
    stop(): void {
      if (crowdTimer !== null) clearInterval(crowdTimer);
    },
  };
  return engine;
}

export const gridSense = createEngine();
