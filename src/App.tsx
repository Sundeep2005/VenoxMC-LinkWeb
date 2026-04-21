import { FormEvent, SVGProps, useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  LinkIcon,
  CheckIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const DISCORD_CLIENT_ID = process.env.REACT_APP_DISCORD_CLIENT_ID || '';
const DISCORD_REDIRECT_URI =
  process.env.REACT_APP_DISCORD_REDIRECT_URI ||
  (typeof window !== 'undefined' ? `${window.location.origin}/callback` : '');
const DISCORD_INVITE_URL = 'https://discord.gg/FJP7K3rx7j';
const GITHUB_URL = 'http://github.com/sundeep2005/';

const PENDING_KEY = 'venoxmc-link-pending';
const RESULT_KEY = 'venoxmc-link-result';
const MINECRAFT_NAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;
const DEFAULT_MINECRAFT_NAME = 'Steve';
const DEFAULT_MINECRAFT_UUID = '8667ba71b85a4004af54457a9734eed7';
const COOKIE_NAME = 'VenoxmcLinking';
const COOKIE_RESET_PARAM = 'resetCookies';

type Status = 'idle' | 'resolving' | 'authenticating' | 'complete';

type MinecraftProfile = {
  name: string;
  uuid: string;
};

type PlayerDbResponse = {
  success?: boolean;
  data?: {
    player?: {
      raw_id?: string;
      username?: string;
    };
  };
};

type LinkResult = {
  code: string;
  expiresAt: number;
  minecraftName: string;
  minecraftUuid: string;
  discordTag: string;
  discordId: string;
};

type PendingLink = {
  minecraftName: string;
  minecraftUuid: string;
  state: string;
  createdAt: number;
};

type CreateLinkResponse =
  | (LinkResult & {
      success: true;
    })
  | {
      success: false;
      error?: string;
    };

function isLinkResult(value: Partial<LinkResult> | null): value is LinkResult {
  return Boolean(
    value &&
      typeof value.code === 'string' &&
      typeof value.expiresAt === 'number' &&
      typeof value.minecraftName === 'string' &&
      typeof value.minecraftUuid === 'string' &&
      typeof value.discordTag === 'string' &&
      typeof value.discordId === 'string'
  );
}

function getPlayerHeadUrl(uuid: string) {
  return `https://api.mineatar.io/face/${uuid || DEFAULT_MINECRAFT_UUID}`;
}

async function resolveMinecraftProfile(name: string): Promise<MinecraftProfile> {
  const response = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error('Minecraft profiel kon niet worden opgehaald.');
  }

  const data = (await response.json()) as PlayerDbResponse;
  const player = data?.data?.player;
  if (!data.success || !player?.raw_id) {
    throw new Error('Minecraft speler niet gevonden.');
  }

  return {
    name: player.username || name,
    uuid: player.raw_id,
  };
}

function createStateToken() {
  const randomValues = new Uint32Array(4);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => value.toString(16)).join('');
}

function formatTimeLeft(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function DiscordIcon({ className }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 127.14 96.36"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M107.7 8.1A105.1 105.1 0 0 0 81.5 0a72.3 72.3 0 0 0-3.4 7.1 97.7 97.7 0 0 0-29.1 0A72.3 72.3 0 0 0 45.6 0a105.9 105.9 0 0 0-26.3 8.1C2.7 32.7-1.8 56.7.4 80.4a105.7 105.7 0 0 0 32.2 16 77.8 77.8 0 0 0 6.9-11.2 68.4 68.4 0 0 1-10.8-5.2c.9-.7 1.8-1.4 2.7-2.1a75.6 75.6 0 0 0 64.4 0c.9.8 1.8 1.5 2.7 2.1a68.7 68.7 0 0 1-10.9 5.2 77.8 77.8 0 0 0 6.9 11.2 105.3 105.3 0 0 0 32.2-16c2.6-27.5-4.5-51.3-19-72.3ZM42.5 65.8c-6.3 0-11.5-5.8-11.5-12.9S36.1 40 42.5 40 54.1 45.8 54 52.9s-5.1 12.9-11.5 12.9Zm42.1 0c-6.3 0-11.5-5.8-11.5-12.9S78.2 40 84.6 40s11.6 5.8 11.5 12.9-5.1 12.9-11.5 12.9Z" />
    </svg>
  );
}

function PixelBlock({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="pixel-cube">
        <span className="pixel-cube-top" />
        <span className="pixel-cube-left" />
        <span className="pixel-cube-right" />
      </div>
    </div>
  );
}

function LogoBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden bg-[#09111d]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#101a2b_0%,#0a1322_52%,#070d18_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(120,203,255,0.06),transparent_28%,transparent_72%,rgba(120,203,255,0.04))]" />
      <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(115deg,transparent_0%,transparent_48%,white_48%,white_48.4%,transparent_48.4%,transparent_100%)] [background-size:20rem_20rem]" />
      <PixelBlock className="absolute left-[5%] top-[28%] hidden sm:block" />
      <PixelBlock className="absolute bottom-[16%] right-[6%] hidden sm:block scale-125" />
      <PixelBlock className="absolute bottom-[10%] left-[17%] hidden lg:block scale-90" />
    </div>
  );
}

function readStoredResult(): LinkResult | null {
  try {
    const result = JSON.parse(localStorage.getItem(RESULT_KEY) ?? 'null') as Partial<LinkResult> | null;
    if (!isLinkResult(result) || result.expiresAt <= Date.now()) {
      localStorage.removeItem(RESULT_KEY);
      return null;
    }
    return result;
  } catch {
    localStorage.removeItem(RESULT_KEY);
    return null;
  }
}

function hasCookie(name: string) {
  return document.cookie
    .split(';')
    .some((cookie) => cookie.trim().startsWith(`${name}=`));
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function shouldResetCookies() {
  return new URLSearchParams(window.location.search).has(COOKIE_RESET_PARAM);
}

async function createLinkCode(
  accessToken: string,
  pending: PendingLink
): Promise<LinkResult> {
  const response = await fetch('/api/link/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accessToken,
      minecraftName: pending.minecraftName,
      minecraftUuid: pending.minecraftUuid,
    }),
  });

  const data = (await response.json()) as CreateLinkResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.success ? 'Linkcode kon niet worden aangemaakt.' : data.error || 'Linkcode kon niet worden aangemaakt.');
  }

  return data;
}

function App() {
  const [minecraftName, setMinecraftName] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [linkResult, setLinkResult] = useState<LinkResult | null>(() => readStoredResult());
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [minecraftUuid, setMinecraftUuid] = useState(DEFAULT_MINECRAFT_UUID);
  const [showCookiePopup, setShowCookiePopup] = useState(() => {
    if (shouldResetCookies()) {
      deleteCookie(COOKIE_NAME);
      return true;
    }

    return !hasCookie(COOKIE_NAME);
  });
  const [isCookieLeaving, setIsCookieLeaving] = useState(false);
  const callbackHandled = useRef(false);

  const isConfigured = Boolean(DISCORD_CLIENT_ID);
  const timeLeft = linkResult ? linkResult.expiresAt - now : 0;
  const isExpired = Boolean(linkResult && timeLeft <= 0);
  const previewName = minecraftName.trim();
  const isNameValid = MINECRAFT_NAME_PATTERN.test(previewName);
  const previewHeadUrl = getPlayerHeadUrl(minecraftUuid);
  const linkedHeadUrl = getPlayerHeadUrl(linkResult?.minecraftUuid || DEFAULT_MINECRAFT_UUID);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!shouldResetCookies()) {
      return;
    }

    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', cleanUrl);
  }, []);

  useEffect(() => {
    if (isExpired) {
      localStorage.removeItem(RESULT_KEY);
    }
  }, [isExpired]);

  useEffect(() => {
    const cleanName = minecraftName.trim();
    if (!MINECRAFT_NAME_PATTERN.test(cleanName)) {
      setMinecraftUuid(DEFAULT_MINECRAFT_UUID);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(cleanName)}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          const uuid = data?.data?.player?.raw_id;
          if (uuid) {
            setMinecraftUuid(uuid);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setMinecraftUuid(DEFAULT_MINECRAFT_UUID);
          }
        });
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [minecraftName]);

  useEffect(() => {
    if (callbackHandled.current) {
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get('access_token');
    const returnedState = hashParams.get('state');

    if (!accessToken) {
      return;
    }

    callbackHandled.current = true;
    setStatus('authenticating');
    window.history.replaceState(null, '', '/');

    let pending: PendingLink | null = null;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingLink | null;
    } catch {
      pending = null;
    }

    if (!pending || pending.state !== returnedState) {
      setError('Discord sessie verlopen. Probeer opnieuw.');
      setStatus('idle');
      localStorage.removeItem(PENDING_KEY);
      return;
    }

    const activePending = pending;

    createLinkCode(accessToken, activePending)
      .then((result) => {
        localStorage.setItem(RESULT_KEY, JSON.stringify(result));
        localStorage.removeItem(PENDING_KEY);
        setMinecraftName(result.minecraftName);
        setMinecraftUuid(result.minecraftUuid || DEFAULT_MINECRAFT_UUID);
        setLinkResult(result);
        setError('');
        setStatus('complete');
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : 'Discord authenticatie is niet gelukt. Probeer opnieuw.');
        setStatus('idle');
      });
  }, []);

  async function startDiscordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCopied(false);

    const cleanName = minecraftName.trim();
    if (!MINECRAFT_NAME_PATTERN.test(cleanName)) {
      setError('Gebruik je Minecraft naam: 3-16 tekens, letters, cijfers of underscore.');
      return;
    }

    if (!isConfigured) {
      setError('Voeg REACT_APP_DISCORD_CLIENT_ID toe aan je .env bestand.');
      return;
    }

    setStatus('resolving');
    let profile = null;
    try {
      profile = await resolveMinecraftProfile(cleanName);
      setMinecraftUuid(profile.uuid);
    } catch {
      setStatus('idle');
      setError('Deze Minecraft naam kon niet gevonden worden.');
      return;
    }

    const state = createStateToken();
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        minecraftName: profile.name,
        minecraftUuid: profile.uuid,
        state,
        createdAt: Date.now(),
      })
    );

    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: 'token',
      scope: 'identify',
      state,
      prompt: 'consent',
    });

    window.location.assign(`https://discord.com/oauth2/authorize?${params.toString()}`);
  }

  function resetFlow() {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(RESULT_KEY);
    setLinkResult(null);
    setError('');
    setStatus('idle');
    setCopied(false);
  }

  function copyCode() {
    if (!linkResult?.code) {
      return;
    }

    navigator.clipboard.writeText(`/link ${linkResult.code}`).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  function acceptCookies() {
    setCookie(COOKIE_NAME, 'accepted', 60 * 60 * 24 * 365);
    setIsCookieLeaving(true);
    window.setTimeout(() => {
      setShowCookiePopup(false);
      setIsCookieLeaving(false);
    }, 220);
  }

  const steps = [
    { n: 1, label: 'Naam' },
    { n: 2, label: 'Discord' },
    { n: 3, label: 'Code' },
    { n: 4, label: '/link' },
  ];

  const activeStep =
    status === 'authenticating' ? 2 : status === 'complete' || linkResult ? 3 : isNameValid ? 1 : 0;

  return (
    <main className="min-h-screen overflow-hidden bg-[#fcf2dc] text-[#52230b]">
      <section className="relative isolate flex min-h-screen flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-10 lg:py-6">
        <LogoBackdrop />

        <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <section className="relative order-2 lg:order-1">
            <div className="max-w-2xl">
              <div className="inline-flex rotate-[-3deg] items-center gap-2 rounded-md border-2 border-[#0f4674] bg-[#78cbff] px-3 py-1 font-black uppercase tracking-[0.16em] text-[#08111f] shadow-[4px_4px_0_#0f4674]">
                <SparklesIcon className="h-4 w-4" />
                VenoxMC Link
              </div>

              <h1 className="mt-6 text-5xl font-black uppercase leading-[0.88] tracking-tight text-white sm:text-6xl lg:text-7xl">
                <span className="graffiti-title block text-[#32b0fe]">Minecraft</span>
                <span className="graffiti-title block text-white">met Discord</span>
              </h1>

              <p className="mt-5 max-w-xl text-lg font-medium leading-8 text-[#d7e8f8]">
                Vul je Minecraft naam in, login met Discord en pak direct je linkcode voor op de server.
              </p>

              <ol className="mt-8 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:gap-3">
                {steps.map((step, index) => {
                  const isActive = step.n === activeStep;
                  const isDone = step.n < activeStep;
                  return (
                    <li className="flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-3" key={step.n}>
                      <div className={`duck-step ${isDone ? 'duck-step-done' : isActive ? 'duck-step-active' : ''}`}>
                        {isDone ? <CheckIcon className="h-4 w-4" strokeWidth={3} /> : step.n}
                      </div>
                      <span className="text-xs font-black uppercase tracking-[0.22em] text-[#9fc8ea]">
                        {step.label}
                      </span>
                      {index < steps.length - 1 ? <span className="duck-step-line" /> : null}
                    </li>
                  );
                })}
              </ol>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="spray-card">
                  <span className="spray-card-number">1</span>
                  <p>Vul je Minecraft naam in.</p>
                </div>
                <div className="spray-card">
                  <span className="spray-card-number">2</span>
                  <p>Login met je Discord account.</p>
                </div>
                <div className="spray-card">
                  <span className="spray-card-number">3</span>
                  <p>Gebruik daarna je <code>/link</code> code.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="order-1 lg:order-2">
            <div className="link-panel mx-auto max-w-xl">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-[#78cbff]">Start koppelen</p>
                  <h2 className="mt-1 text-3xl font-black uppercase text-white">Account Link</h2>
                </div>
                <img
                  alt={`${isNameValid ? previewName : DEFAULT_MINECRAFT_NAME} Minecraft head`}
                  className="h-16 w-16 rounded-md border-2 border-white/10 bg-[#07101d] object-cover shadow-[4px_4px_0_rgba(0,0,0,0.22)]"
                  src={previewHeadUrl}
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>

              <form className="mt-6" onSubmit={startDiscordLogin}>
                <label className="block text-sm font-black uppercase tracking-[0.18em] text-[#9fc8ea]" htmlFor="minecraftName">
                  Minecraft naam
                </label>
                <input
                  className="duck-input mt-3 w-full"
                  id="minecraftName"
                  maxLength={16}
                  minLength={3}
                  onChange={(event) => {
                    setMinecraftName(event.target.value);
                    setError('');
                  }}
                  placeholder="Bijvoorbeeld TheBathDuck"
                  value={minecraftName}
                />

                {error ? (
                  <p className="mt-3 rounded-md border-2 border-[#ef4444]/35 bg-[#fff1ef] px-3 py-2 text-sm font-semibold text-[#9f1239]">
                    {error}
                  </p>
                ) : (
                  <p className="mt-3 text-sm font-medium leading-6 text-[#a8c5df]">
                    Gebruik je username waarmee je bent ingelogd op de server.
                  </p>
                )}

                <button
                  className="duck-button mt-6 inline-flex w-full items-center justify-center gap-2"
                  disabled={status !== 'idle'}
                  type="submit"
                >
                  <LinkIcon className="h-5 w-5" />
                  {status === 'resolving'
                    ? 'Minecraft controleren...'
                    : status === 'authenticating'
                      ? 'Discord controleren...'
                      : 'Link met Discord'}
                </button>

                <div className="my-5 flex items-center gap-3 text-xs font-black uppercase tracking-[0.24em] text-[#88afcf]">
                  <span className="h-[2px] flex-1 bg-white/15" />
                  Of
                  <span className="h-[2px] flex-1 bg-white/15" />
                </div>

                <a
                  className="duck-discord inline-flex w-full items-center justify-center gap-3"
                  href={DISCORD_INVITE_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <DiscordIcon className="h-5 w-5" />
                  Join onze Discord server
                </a>
              </form>

              <div className="mt-6 rounded-lg border-2 border-white/10 bg-[#0b1525] px-4 py-4">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#78cbff]">Server</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border-2 border-white/10 bg-[#07101d] px-3 py-3">
                    <span className="block text-xs font-black uppercase tracking-[0.2em] text-[#7ea8cb]">IP</span>
                    <span className="mt-1 block font-mono font-bold text-white">play.venoxmc.com</span>
                  </div>
                  <div className="rounded-md border-2 border-white/10 bg-[#07101d] px-3 py-3">
                    <span className="block text-xs font-black uppercase tracking-[0.2em] text-[#7ea8cb]">Versie</span>
                    <span className="mt-1 block font-mono font-bold text-white">26.1.2</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {linkResult && !isExpired ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(70,27,4,0.48)] px-4 py-6 backdrop-blur-sm">
            <div className="link-panel w-full max-w-2xl">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                  <img
                    alt={`${linkResult.minecraftName} Minecraft head`}
                    className="h-16 w-16 rounded-md border-2 border-white/10 bg-[#07101d] object-cover shadow-[4px_4px_0_rgba(0,0,0,0.22)]"
                    src={linkedHeadUrl}
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-[#78cbff]">Code klaar</p>
                    <h2 className="mt-1 text-3xl font-black uppercase text-white">{linkResult.minecraftName}</h2>
                    <p className="text-sm font-medium text-[#a8c5df]">Discord: {linkResult.discordTag}</p>
                  </div>
                </div>

                <button className="duck-ghost inline-flex items-center justify-center gap-2" onClick={resetFlow} type="button">
                  <ArrowPathIcon className="h-5 w-5" />
                  Nieuwe code
                </button>
              </div>

              <div className="mt-5 rounded-lg border-2 border-white/10 bg-[#0b1525] p-4">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#78cbff]">Gebruik deze command op de server</p>
                <div className="mt-3 flex items-stretch overflow-hidden rounded-md border-2 border-white/10 bg-[#07101d]">
                  <div className="min-w-0 flex-1 px-4 py-4 text-center font-mono text-2xl font-black text-white sm:text-3xl">
                    /link {linkResult.code}
                  </div>
                  <button
                    aria-label={copied ? 'Command gekopieerd' : 'Kopieer command'}
                    className="inline-flex w-14 shrink-0 items-center justify-center border-l-2 border-white/10 text-[#9fc8ea] transition hover:bg-white/10 hover:text-white"
                    type="button"
                    onClick={copyCode}
                  >
                    <ClipboardDocumentIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 flex flex-col gap-2 text-sm font-semibold text-[#a8c5df] sm:flex-row sm:items-center sm:justify-between">
                  <p>{copied ? 'Command gekopieerd' : 'Klik op het icoon om te kopieren'}</p>
                  <p className="inline-flex items-center gap-2">
                    <ClockIcon className="h-4 w-4 text-[#78cbff]" />
                    Verloopt over {formatTimeLeft(timeLeft)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <footer className="mx-auto mt-2 max-w-6xl px-2 text-center text-sm font-semibold text-[#8ea8c4]">
          Made with <span className="text-[#f97316]">&#10084;</span> by{' '}
          <a className="text-white transition hover:text-[#78cbff]" href={GITHUB_URL} rel="noreferrer" target="_blank">
            Sundeep
          </a>
        </footer>

        {showCookiePopup ? (
          <div
            className={`cookie-popup fixed bottom-5 right-5 z-50 w-[calc(100%-2rem)] max-w-md rounded-lg border-2 border-white/10 bg-[#0b1525]/95 p-4 shadow-[8px_8px_0_rgba(7,120,212,0.16)] ${
              isCookieLeaving ? 'cookie-popup-leave' : ''
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="text-base font-black uppercase tracking-[0.18em] text-white">Cookies</p>
                <p className="mt-1 text-sm leading-6 text-[#a8c5df]">
                  We bewaren je keuze zodat deze melding niet steeds opnieuw verschijnt.
                </p>
              </div>
              <button className="duck-button inline-flex items-center justify-center" type="button" onClick={acceptCookies}>
                Accepteren
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default App;
