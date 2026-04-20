import { FormEvent, SVGProps, useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const DISCORD_CLIENT_ID = process.env.REACT_APP_DISCORD_CLIENT_ID || '';
const DISCORD_REDIRECT_URI =
  process.env.REACT_APP_DISCORD_REDIRECT_URI ||
  (typeof window !== 'undefined'
    ? `${window.location.origin}/callback`
    : '');
const DISCORD_INVITE_URL = 'https://discord.gg/FJP7K3rx7j';
const GITHUB_URL = 'http://github.com/sundeep2005/';

const PENDING_KEY = 'venoxmc-link-pending';
const RESULT_KEY = 'venoxmc-link-result';
const CODE_TTL_MS = 5 * 60 * 1000;
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

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
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

function createRandomCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomValues = new Uint32Array(4);
  crypto.getRandomValues(randomValues);

  return `VMC-${Array.from(randomValues)
    .map((value) => alphabet[value % alphabet.length])
    .join('')}`;
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

function MinecraftBlockIcon({ className }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M12 1.5 2.5 6v12L12 22.5 21.5 18V6L12 1.5Zm0 2.236 7.4 3.505L12 10.747 4.6 7.241 12 3.736ZM3.75 8.48 11.375 12v8.33L3.75 16.81V8.48Zm8.875 11.85V12l7.625-3.52v8.33l-7.625 3.52Z"
      />
    </svg>
  );
}

function BackgroundScene() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden bg-[#07090f]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(7,152,242,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(88,101,242,0.14),transparent_55%)]" />
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
      <div className="absolute inset-0 opacity-40 [background:radial-gradient(1px_1px_at_20%_30%,#fff_50%,transparent_50%),radial-gradient(1px_1px_at_70%_20%,#fff_50%,transparent_50%),radial-gradient(1.5px_1.5px_at_40%_80%,#fff_50%,transparent_50%),radial-gradient(1px_1px_at_85%_65%,#fff_50%,transparent_50%),radial-gradient(1px_1px_at_10%_75%,#fff_50%,transparent_50%),radial-gradient(1.5px_1.5px_at_55%_45%,#fff_50%,transparent_50%)] animate-[twinkle_4s_ease-in-out_infinite]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
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
  const displayName = isNameValid ? previewName : DEFAULT_MINECRAFT_NAME;
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

    fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Discord profiel kon niet worden opgehaald.');
        }
        return response.json();
      })
      .then((discordUser: DiscordUser) => {
        const result = {
          code: createRandomCode(),
          expiresAt: Date.now() + CODE_TTL_MS,
          minecraftName: activePending.minecraftName,
          minecraftUuid: activePending.minecraftUuid || DEFAULT_MINECRAFT_UUID,
          discordTag: discordUser.global_name || discordUser.username,
          discordId: discordUser.id,
        };

        localStorage.setItem(RESULT_KEY, JSON.stringify(result));
        localStorage.removeItem(PENDING_KEY);
        setMinecraftName(activePending.minecraftName);
        setLinkResult(result);
        setError('');
        setStatus('complete');
      })
      .catch(() => {
        setError('Discord authenticatie is niet gelukt. Probeer opnieuw.');
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

  const isBusy = status === 'resolving' || status === 'authenticating';

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07090f] text-white">
      <BackgroundScene />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <section className="flex w-full flex-col items-center">
          <div className="flex flex-col items-center text-center">
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
              Koppel je{' '}
              <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                Minecraft
              </span>{' '}
              aan{' '}
              <span className="bg-gradient-to-r from-[#8a94ff] via-[#5865F2] to-[#7a86ff] bg-clip-text text-transparent">
                Discord
              </span>
            </h1>
          </div>

          <div className="relative mt-8 w-full max-w-xl">
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-venox-400/50 via-white/5 to-[#5865F2]/40 opacity-60 blur-[2px]" />
            <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-8">
              <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

              <div className="flex items-center gap-4">
                <div className="relative">
                  <div
                    className={`absolute -inset-1 rounded-xl bg-gradient-to-br from-emerald-400/40 to-venox-400/30 blur-md transition-opacity duration-500 ${
                      isNameValid ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <img
                    className="relative h-16 w-16 rounded-xl border border-white/15 bg-slate-950 object-cover shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
                    src={previewHeadUrl}
                    alt={`${displayName} Minecraft head`}
                  />
                  <span
                    className={`absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0b0e15] transition ${
                      isNameValid
                        ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.65)]'
                        : 'bg-slate-600'
                    }`}
                  >
                    {isNameValid ? (
                      <CheckCircleIcon className="h-3.5 w-3.5 text-[#0b0e15]" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    )}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-venox-300">
                    Speler voorbeeld
                  </p>
                  <p className="mt-0.5 truncate text-xl font-bold text-white">{displayName}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                    {isNameValid ? minecraftUuid : 'vul je naam in om te bevestigen'}
                  </p>
                </div>
              </div>

              <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { n: 1, label: 'Naam' },
                  { n: 2, label: 'Discord' },
                  { n: 3, label: 'Code' },
                  { n: 4, label: '/link' },
                ].map((step) => (
                  <li
                    key={step.n}
                    className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-venox-500/20 text-[11px] font-bold text-venox-200 ring-1 ring-venox-400/30">
                      {step.n}
                    </span>
                    <span className="truncate text-xs font-semibold text-slate-300">
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>

              <form onSubmit={startDiscordLogin} className="mt-6">
                <label
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
                  htmlFor="minecraftName"
                >
                  Minecraft gebruikersnaam
                </label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-500">
                    <MinecraftBlockIcon className="h-4 w-4" />
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-4 pl-11 pr-24 text-white outline-none transition placeholder:text-slate-500 focus:border-venox-400 focus:bg-black/60 focus:ring-4 focus:ring-venox-500/20"
                    id="minecraftName"
                    maxLength={16}
                    minLength={3}
                    onChange={(event) => {
                      setMinecraftName(event.target.value);
                      setError('');
                    }}
                    placeholder="Bijvoorbeeld TheBathDuck"
                    value={minecraftName}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span
                    className={`absolute inset-y-0 right-3 flex items-center text-[11px] font-semibold ${
                      isNameValid ? 'text-emerald-300' : 'text-slate-500'
                    }`}
                  >
                    {isNameValid ? 'Geldig' : `${previewName.length}/16`}
                  </span>
                </div>

                {error ? (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                    <XMarkIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                    <span>{error}</span>
                  </p>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheckIcon className="h-4 w-4 text-venox-400" />
                    Gebruik je username waarmee je bent ingelogd op de server.
                  </p>
                )}

                <button
                  className="group relative mt-6 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-venox-500 via-venox-400 to-[#5865F2] px-5 py-4 font-bold text-white shadow-[0_12px_30px_-8px_rgba(7,152,242,0.5)] transition hover:shadow-[0_16px_40px_-10px_rgba(7,152,242,0.65)] focus:outline-none focus:ring-2 focus:ring-venox-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                  disabled={isBusy}
                  type="submit"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  {isBusy ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  ) : (
                    <LinkIcon className="h-5 w-5" />
                  )}
                  {status === 'resolving'
                    ? 'Minecraft controleren...'
                    : status === 'authenticating'
                      ? 'Discord controleren...'
                      : 'Link met Discord'}
                </button>

                <div className="my-5 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <span className="h-px flex-1 bg-white/10" />
                  Of
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <a
                  className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/10 px-5 py-3.5 font-bold text-white transition hover:border-[#5865F2]/60 hover:bg-[#5865F2]/20 focus:outline-none focus:ring-2 focus:ring-[#B5BDFF]"
                  href={DISCORD_INVITE_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <DiscordIcon className="h-5 w-5 text-[#b5bdff]" />
                  Join onze Discord server
                </a>
              </form>
            </div>
          </div>

          <footer className="mt-6 text-center text-xs text-slate-500">
            Made with <span className="text-red-400">&#10084;</span> by{' '}
            <a
              className="font-semibold text-slate-300 transition hover:text-white"
              href={GITHUB_URL}
              rel="noreferrer"
              target="_blank"
            >
              Sundeep
            </a>
          </footer>
        </section>
      </div>

      {linkResult && !isExpired ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5 py-8 backdrop-blur-md">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e15] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.7)] sm:p-8">
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
            <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 -bottom-16 h-40 w-40 rounded-full bg-venox-500/20 blur-3xl" />

            <div className="relative flex items-center gap-4">
              <div className="relative">
                <div className="absolute -inset-1 rounded-xl bg-emerald-400/40 blur-md" />
                <img
                  className="relative h-16 w-16 rounded-xl border border-white/15 bg-slate-950 object-cover shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                  src={linkedHeadUrl}
                  alt={`${linkResult.minecraftName} Minecraft head`}
                />
                <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0b0e15] bg-emerald-400">
                  <CheckCircleIcon className="h-3.5 w-3.5 text-[#0b0e15]" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  Code klaar
                </p>
                <h2 className="mt-1.5 truncate text-2xl font-extrabold text-white">
                  {linkResult.minecraftName}
                </h2>
                <p className="truncate text-sm text-slate-400">
                  Discord:{' '}
                  <span className="font-semibold text-slate-200">{linkResult.discordTag}</span>
                </p>
              </div>
            </div>

            <div className="relative mt-6 rounded-xl border border-white/10 bg-black/40 p-4 text-sm leading-6 text-slate-300">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Join de VenoxMC server
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    IP
                  </span>
                  <span className="font-mono font-bold text-white">play.venoxmc.com</span>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Versie
                  </span>
                  <span className="font-mono font-bold text-white">26.1.2</span>
                </div>
              </div>
            </div>

            <div className="relative mt-5 overflow-hidden rounded-xl border border-venox-400/30 bg-gradient-to-br from-venox-500/10 via-slate-950/60 to-[#5865F2]/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-venox-200">
                Gebruik deze command op de server
              </p>
              <div className="mt-3 flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-black/50">
                <div className="min-w-0 flex-1 truncate px-4 py-4 text-center font-mono text-xl font-extrabold tracking-wide text-white sm:text-2xl">
                  <span className="text-venox-300">/link</span> {linkResult.code}
                </div>
                <button
                  className="inline-flex w-14 shrink-0 items-center justify-center border-l border-white/10 text-slate-300 transition hover:bg-venox-500/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-venox-300"
                  aria-label={copied ? 'Command gekopieerd' : 'Kopieer command'}
                  type="button"
                  onClick={copyCode}
                >
                  {copied ? (
                    <CheckCircleIcon className="h-5 w-5 text-emerald-300" />
                  ) : (
                    <ClipboardDocumentIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <p className="flex items-center gap-1.5 text-slate-400">
                  <ClockIcon className="h-4 w-4 text-venox-300" />
                  Verloopt over{' '}
                  <span className="font-mono font-bold text-white">{formatTimeLeft(timeLeft)}</span>
                </p>
                <p
                  className={`font-semibold transition ${
                    copied ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  {copied ? 'Gekopieerd!' : 'Klik op het icoon'}
                </p>
              </div>
            </div>

            <button
              className="relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 font-semibold text-slate-200 transition hover:border-venox-300/50 hover:bg-white/[0.06] hover:text-white"
              type="button"
              onClick={resetFlow}
            >
              <ArrowPathIcon className="h-5 w-5" />
              Sluit en maak nieuwe code
            </button>
          </div>
        </div>
      ) : null}

      {showCookiePopup ? (
        <div
          className={`cookie-popup fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-md rounded-xl border border-white/10 bg-[#0b0e15]/85 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
            isCookieLeaving ? 'cookie-popup-leave' : ''
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="flex items-center gap-2 font-bold text-white">
                <SparklesIcon className="h-4 w-4 text-venox-300" />
                Cookies
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                We bewaren je keuze zodat deze melding niet steeds opnieuw verschijnt.
              </p>
            </div>
            <button
              className="rounded-lg bg-gradient-to-r from-venox-500 to-venox-400 px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_-6px_rgba(7,152,242,0.5)] transition hover:shadow-[0_12px_28px_-8px_rgba(7,152,242,0.65)] focus:outline-none focus:ring-2 focus:ring-venox-200"
              type="button"
              onClick={acceptCookies}
            >
              Accepteren
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
