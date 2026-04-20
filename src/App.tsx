import { FormEvent, SVGProps, useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  ClockIcon,
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

type WaterDrop = {
  left: string;
  delay: string;
  duration: string;
  height: string;
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

function BackgroundScene() {
  const drops: WaterDrop[] = [
    { left: '8%', delay: '0s', duration: '5.6s', height: '4.25rem' },
    { left: '15%', delay: '1.4s', duration: '6.4s', height: '3rem' },
    { left: '24%', delay: '2.8s', duration: '5.9s', height: '4.75rem' },
    { left: '34%', delay: '0.8s', duration: '6.8s', height: '3.5rem' },
    { left: '45%', delay: '3.3s', duration: '5.7s', height: '4rem' },
    { left: '56%', delay: '1.9s', duration: '6.6s', height: '3.25rem' },
    { left: '67%', delay: '0.4s', duration: '6.1s', height: '4.5rem' },
    { left: '76%', delay: '3.9s', duration: '5.8s', height: '3.75rem' },
    { left: '84%', delay: '2.2s', duration: '6.9s', height: '4.25rem' },
    { left: '93%', delay: '1.1s', duration: '6.2s', height: '3rem' },
    { left: '5%', delay: '4.4s', duration: '5.4s', height: '2.75rem' },
    { left: '31%', delay: '5.1s', duration: '6.3s', height: '3.75rem' },
    { left: '61%', delay: '4.7s', duration: '5.5s', height: '2.9rem' },
    { left: '88%', delay: '5.6s', duration: '6.7s', height: '3.6rem' },
  ];

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden bg-[#101114]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#15171c_0%,#101114_42%,#0b0d10_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_34%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03),transparent_24%,transparent_76%,rgba(255,255,255,0.025))]" />
      <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(115deg,transparent_0%,transparent_48%,white_48%,white_48.4%,transparent_48.4%,transparent_100%)] [background-size:18rem_18rem]" />
      <div className="absolute inset-0 opacity-85">
        {drops.map((drop) => (
          <span
            className="water-drop absolute top-[-6rem] w-[2px] rounded-full bg-gradient-to-b from-sky-300/0 via-sky-400/85 to-cyan-200/0 shadow-[0_0_12px_rgba(56,189,248,0.32)]"
            key={`${drop.left}-${drop.delay}`}
            style={{
              animationDelay: drop.delay,
              animationDuration: drop.duration,
              height: drop.height,
              left: drop.left,
            }}
          />
        ))}
      </div>
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

  return (
    <main className="min-h-screen overflow-hidden bg-[#0d1017] text-white">
      <section className="relative isolate flex min-h-screen items-center px-5 py-8 sm:px-8 lg:px-12">
        <BackgroundScene />

        <div className="mx-auto flex w-full max-w-md items-center justify-center">
          <div className="w-full rounded-lg border border-white/10 bg-white/[0.08] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur md:p-7">
            <form onSubmit={startDiscordLogin}>
                <div className="flex items-center gap-4">
                  <img
                    className="h-16 w-16 rounded-md border border-white/10 bg-slate-950 object-cover shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
                    src={previewHeadUrl}
                    alt={`${MINECRAFT_NAME_PATTERN.test(previewName) ? previewName : DEFAULT_MINECRAFT_NAME} Minecraft head`}
                  />
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-normal text-venox-200">
                      Start koppelen
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-white">Account Link</h2>
                  </div>
                </div>

                <div className="mt-7 rounded-md border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">
                  <h3 className="text-base font-bold text-venox-200">Hoe te verifieren:</h3>
                  <ol className="mt-3 space-y-2 font-semibold">
                    <li>1. Vul je Minecraft naam in.</li>
                    <li>2. Klik op Link met Discord.</li>
                    <li>3. Login met je Discord account.</li>
                    <li>
                      4. Gebruik{' '}
                      <code className="rounded bg-slate-950 px-2 py-1 text-venox-100">/link &lt;code&gt;</code>{' '}
                      op de server.
                    </li>
                  </ol>
                </div>

                <label className="mt-7 block text-sm font-semibold text-slate-100" htmlFor="minecraftName">
                  Minecraft naam
                </label>
                <input
                  className="mt-2 w-full rounded-md border border-white/10 bg-slate-950/80 px-4 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-venox-300 focus:ring-2 focus:ring-venox-300/30"
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
                  <p className="mt-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                    {error}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">
                    Gebruik je username waarmee je bent ingelogd op de server.
                  </p>
                )}

                <button
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-venox-500 px-5 py-4 font-bold text-white transition hover:bg-venox-400 focus:outline-none focus:ring-2 focus:ring-venox-200 disabled:cursor-not-allowed disabled:bg-slate-600"
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

                <div className="my-5 flex items-center gap-4 text-sm font-semibold uppercase tracking-normal text-slate-500">
                  <span className="h-px flex-1 bg-white/10" />
                  Of
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <a
                  className="inline-flex w-full items-center justify-center gap-3 rounded-md bg-[#5865F2] px-5 py-4 font-bold text-white transition hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-[#B5BDFF]"
                  href={DISCORD_INVITE_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <DiscordIcon className="h-5 w-5" />
                  Join onze Discord server
                </a>

            </form>
          </div>
        </div>

        {linkResult && !isExpired ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 py-8 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-lg border border-venox-300/35 bg-[#0c111d] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)] md:p-7">
              <div className="flex items-center gap-4">
                <img
                  className="h-16 w-16 rounded-md border border-white/10 bg-slate-950 object-cover shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
                  src={linkedHeadUrl}
                  alt={`${linkResult.minecraftName} Minecraft head`}
                />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-normal text-venox-200">
                    Code klaar
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-white">{linkResult.minecraftName}</h2>
                  <p className="text-sm text-slate-300">Discord: {linkResult.discordTag}</p>
                </div>
              </div>

              <div className="mt-6 rounded-md border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300">
                Join de VenoxMC server:
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-950 px-3 py-2">
                    <span className="block text-xs font-semibold uppercase tracking-normal text-slate-500">IP</span>
                    <span className="font-mono font-bold text-white">play.venoxmc.com</span>
                  </div>
                  <div className="rounded-md bg-slate-950 px-3 py-2">
                    <span className="block text-xs font-semibold uppercase tracking-normal text-slate-500">Versie</span>
                    <span className="font-mono font-bold text-white">26.1.2</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-md border border-venox-300/30 bg-slate-950/70 p-5">
                <p className="text-sm font-semibold text-slate-300">Gebruik deze command op de server</p>
                <div className="mt-3 flex items-stretch rounded-md border border-white/10 bg-black/30">
                  <div className="min-w-0 flex-1 px-4 py-4 text-center font-mono text-2xl font-extrabold tracking-normal text-venox-100">
                    /link {linkResult.code}
                  </div>
                  <button
                    className="inline-flex w-14 shrink-0 items-center justify-center border-l border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-venox-200"
                    aria-label={copied ? 'Command gekopieerd' : 'Kopieer command'}
                    type="button"
                    onClick={copyCode}
                  >
                    <ClipboardDocumentIcon className="h-5 w-5" />
                  </button>
                </div>
                <p className="mt-2 text-right text-xs font-semibold text-slate-400">
                  {copied ? 'Command gekopieerd' : 'Klik op het icoon om te kopieren'}
                </p>
                <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                  <ClockIcon className="h-5 w-5 text-venox-300" />
                  Verloopt over {formatTimeLeft(timeLeft)}
                </p>
              </div>

              <button
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/15 px-5 py-3 font-semibold text-slate-100 transition hover:border-venox-300 hover:text-white"
                type="button"
                onClick={resetFlow}
              >
                <ArrowPathIcon className="h-5 w-5" />
                Sluit en maak nieuwe code
              </button>
            </div>
          </div>
        ) : null}

        <footer className="absolute bottom-5 left-0 right-0 px-5 text-center text-sm text-slate-500">
          Made with <span className="text-red-400">❤</span> by{' '}
          <a
            className="font-semibold text-slate-300 transition hover:text-white"
            href={GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            Sundeep
          </a>
        </footer>

        {showCookiePopup ? (
          <div
            className={`cookie-popup fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-md rounded-lg border border-white/10 bg-[#111827]/70 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-md ${
              isCookieLeaving ? 'cookie-popup-leave' : ''
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="font-bold text-white">Cookies</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  We bewaren je keuze zodat deze melding niet steeds opnieuw verschijnt.
                </p>
              </div>
              <button
                className="rounded-md bg-venox-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-venox-400 focus:outline-none focus:ring-2 focus:ring-venox-200"
                type="button"
                onClick={acceptCookies}
              >
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
