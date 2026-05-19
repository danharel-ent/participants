"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ApiResponse,
  BuildMeta,
  EventColors,
  FutureBlocklist,
  FutureFreeTicket,
  Participant,
  RedeemRecord,
  RedeemsSnapshot,
} from "@/lib/types";
import { participantKey } from "@/lib/keys";
import {
  buildFutureBlocklistIndex,
  buildLookupIndex,
  lookupScan,
  type ScanOutcome,
} from "@/lib/lookup";

const SYNC_INTERVAL_MS = 2500;

type Props = {
  participants: Participant[];
  preScanned: Record<string, boolean>;
  futureFreeTickets: FutureFreeTicket[];
  futureBlocklist: FutureBlocklist;
  eventColors: EventColors;
  pipeline: BuildMeta["pipeline"];
  generatedAt: string;
};

type TabId = "scan" | "eligible" | "activity" | "system";

function timeAgo(iso: string | null): string {
  if (!iso) return "טרם סונכרן";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 4000) return "סונכרן עכשיו";
  if (ms < 60_000) return `${Math.floor(ms / 1000)} שניות`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} דקות`;
  return `${Math.floor(ms / 3_600_000)} שעות`;
}

function EventBreakdown({ byEvent }: { byEvent?: Record<string, number> }) {
  if (!byEvent) return null;
  return (
    <ul className="pipeline-events">
      {Object.entries(byEvent).map(([ev, n]) => (
        <li key={ev}>
          {ev}: <strong>{n}</strong>
        </li>
      ))}
    </ul>
  );
}

function ScanResultCard({
  outcome,
  onRedeem,
}: {
  outcome: ScanOutcome;
  onRedeem: (p: Participant) => void;
}) {
  if (outcome.status === "empty") return null;

  if (outcome.status === "eligible") {
    const p = outcome.matches[0];
    return (
      <div className="scan-result scan-ok" role="status" aria-live="polite">
        <div className="scan-verdict">זכאי</div>
        <div className="scan-name">{p.שם}</div>
        <div className="scan-meta">{p.אירוע}</div>
        {p.טלפון ? <div className="scan-meta">{p.טלפון}</div> : null}
        <button
          type="button"
          className="cfm scan-redeem-btn"
          onClick={() => onRedeem(p)}
        >
          אישור מימוש
        </button>
      </div>
    );
  }

  if (outcome.status === "ineligible") {
    if (outcome.reason === "local") {
      const p = outcome.matches?.[0] as Participant | undefined;
      return (
        <div className="scan-result scan-warn" role="status" aria-live="polite">
          <div className="scan-verdict">כבר מומש</div>
          {p ? <div className="scan-name">{p.שם}</div> : null}
          <div className="scan-reason">המימוש כבר נשמר במערכת המשותפת</div>
        </div>
      );
    }
    if (outcome.reason === "future") {
      const r = outcome.matches?.[0] as FutureFreeTicket | undefined;
      return (
        <div className="scan-result scan-bad" role="status" aria-live="polite">
          <div className="scan-verdict">לא זכאי</div>
          <div className="scan-reason">
            כרטיס חינם — {r?.מקור || "שבועות / רוקח"}
          </div>
          {r?.שם ? <div className="scan-name">{r.שם}</div> : null}
        </div>
      );
    }
    return (
      <div className="scan-result scan-bad" role="status" aria-live="polite">
        <div className="scan-verdict">לא זכאי</div>
        <div className="scan-reason">כבר נוצל בפורים (בקובץ)</div>
      </div>
    );
  }

  if (outcome.status === "pick") {
    return (
      <div className="scan-result scan-pick" role="status" aria-live="polite">
        <div className="scan-verdict">כמה התאמות — בחרו</div>
        <ul className="scan-pick-list">
          {outcome.eligible.map((p) => (
            <li key={participantKey(p)}>
              <button
                type="button"
                className="scan-pick-btn"
                onClick={() => onRedeem(p)}
              >
                <strong>{p.שם}</strong>
                <span>{p.אירוע}</span>
                <span className="pick-action">לחץ למימוש ←</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="scan-result scan-unknown" role="status" aria-live="polite">
      <div className="scan-verdict">לא נמצא</div>
      <div className="scan-reason">אין ברשימת הזכאים</div>
    </div>
  );
}

function ParticipantCard({
  p,
  color,
  pending,
  onRedeem,
}: {
  p: Participant;
  color: { a: string };
  pending: boolean;
  onRedeem: (p: Participant) => void;
}) {
  const ini = (p.שם || "?").trim()[0];
  return (
    <div className={`p-card${pending ? " p-card-pending" : ""}`}>
      <div className="p-card-main">
        <div
          className="av"
          style={{ background: color.a }}
          aria-hidden="true"
        >
          {ini}
        </div>
        <div className="p-card-text">
          <div className="nm">{p.שם}</div>
          <div className="p-card-sub">{p.טלפון || "—"}</div>
          <span className="et">{p.אירוע}</span>
        </div>
      </div>
      <button
        type="button"
        className="cfm p-card-btn"
        onClick={() => onRedeem(p)}
        disabled={pending}
      >
        {pending ? "ממומש…" : "מימוש"}
      </button>
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "ביטול",
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal">
        <h2 id="modal-title" className="modal-title">
          {title}
        </h2>
        {description ? <p className="modal-desc">{description}</p> : null}
        <div className="modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="modal-btn modal-btn-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`modal-btn ${
              destructive ? "modal-btn-danger" : "modal-btn-confirm"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TicketManager({
  participants,
  preScanned,
  futureFreeTickets,
  futureBlocklist,
  eventColors,
  pipeline,
  generatedAt,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("scan");
  const [scanInput, setScanInput] = useState("");
  const [outcome, setOutcome] = useState<ScanOutcome>({ status: "empty" });
  const [syncedScanned, setSyncedScanned] = useState<Set<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [records, setRecords] = useState<RedeemRecord[]>([]);
  const [syncStore, setSyncStore] = useState<
    "github" | "redis" | "memory" | "unknown"
  >("unknown");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(true);
  const [, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("הכל");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1000), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const refreshRedeems = useCallback(async () => {
    try {
      const res = await fetch("/api/redeems", { cache: "no-store" });
      const data = (await res.json()) as ApiResponse<RedeemsSnapshot>;
      if (!res.ok || !data.ok) {
        setOnline(false);
        return;
      }
      setSyncedScanned(new Set(data.data.keys));
      setRecords(data.data.records);
      setSyncStore(data.data.store);
      setLastSyncAt(data.meta.updatedAt);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refreshRedeems();
    const id = setInterval(refreshRedeems, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshRedeems]);

  const s3 = pipeline.step3_afterFutureMatch;
  const s4 = pipeline.step4_finalEligible;
  const sRedeemFile = pipeline.step4_afterRedeemedXlsx;

  const remaining = useMemo(
    () => participants.filter((p) => !syncedScanned.has(participantKey(p))),
    [participants, syncedScanned]
  );

  const futureBl = useMemo(
    () => buildFutureBlocklistIndex(futureBlocklist),
    [futureBlocklist]
  );

  const index = useMemo(
    () =>
      buildLookupIndex(remaining, preScanned, futureFreeTickets, syncedScanned),
    [remaining, preScanned, futureFreeTickets, syncedScanned]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const redeem = useCallback(
    (p: Participant) => {
      const key = participantKey(p);
      if (syncedScanned.has(key)) {
        setOutcome({ status: "ineligible", reason: "local", matches: [p] });
        return;
      }
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setSyncedScanned((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setOutcome({ status: "empty" });
      setScanInput("");
      showToast(`מומש: ${p.שם}`);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(40);
      }
      requestAnimationFrame(() => scanRef.current?.focus());

      void (async () => {
        try {
          const res = await fetch("/api/redeems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key,
              שם: p.שם,
              אירוע: p.אירוע,
              order_id: p.order_id,
            }),
          });
          const data = (await res.json()) as ApiResponse<
            RedeemsSnapshot & {
              status?: "created" | "exists";
              record?: RedeemRecord;
            }
          >;
          if (!res.ok || !data.ok) {
            setSyncedScanned((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
            showToast(
              data.ok === false ? data.error.message : "שגיאה במימוש — נסו שוב"
            );
            return;
          }
          setSyncedScanned(new Set(data.data.keys));
          setRecords(data.data.records);
          setSyncStore(data.data.store);
          setLastSyncAt(data.meta.updatedAt);
          setOnline(true);
          if (data.data.status === "exists") {
            showToast(`כבר מומש: ${p.שם}`);
          }
        } catch {
          setSyncedScanned((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          setOnline(false);
          showToast("שגיאת רשת — נסו שוב");
        } finally {
          setPendingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      })();
    },
    [syncedScanned, showToast]
  );

  const undoRedeem = useCallback(
    async (key: string) => {
      try {
        const res = await fetch("/api/redeems", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        const data = (await res.json()) as ApiResponse<RedeemsSnapshot>;
        if (!res.ok || !data.ok) {
          showToast("שגיאה בביטול מימוש");
          return;
        }
        setSyncedScanned(new Set(data.data.keys));
        setRecords(data.data.records);
        setSyncStore(data.data.store);
        setLastSyncAt(data.meta.updatedAt);
        showToast("המימוש בוטל");
      } catch {
        showToast("שגיאת רשת — נסו שוב");
      }
    },
    [showToast]
  );

  const runScan = useCallback(
    (value?: string) => {
      const q = (value ?? scanInput).trim();
      if (!q) {
        setOutcome({ status: "empty" });
        return;
      }
      setScanInput(q);
      setOutcome(lookupScan(q, participants, index, futureBl, syncedScanned));
    },
    [scanInput, participants, index, futureBl, syncedScanned]
  );

  const onScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (outcome.status === "eligible" && outcome.matches.length === 1) {
      redeem(outcome.matches[0]);
      return;
    }
    runScan();
  };

  const logout = useCallback(async () => {
    setLogoutBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  const events = useMemo(
    () => ["הכל", ...Array.from(new Set(remaining.map((p) => p.אירוע)))],
    [remaining]
  );

  const filtered = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return remaining.filter((p) => {
      const matchEvent = eventFilter === "הכל" || p.אירוע === eventFilter;
      const matchQuery =
        !q ||
        p.שם.toLowerCase().includes(q) ||
        p.טלפון.includes(q) ||
        p.order_id.toLowerCase().includes(q);
      return matchEvent && matchQuery;
    });
  }, [remaining, listQuery, eventFilter]);

  const colorFor = (event: string) =>
    eventColors[event] ?? eventColors["הרצליה זיגו"];

  const sessionCount = syncedScanned.size;
  const totalEligibleSource = participants.length;

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "scan", label: "סריקה" },
    { id: "eligible", label: "זכאים", badge: remaining.length },
    { id: "activity", label: "פעילות", badge: records.length || undefined },
    { id: "system", label: "מערכת" },
  ];

  return (
    <div className="app-shell">
      {toast ? (
        <div className="ntf" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      {syncStore === "memory" ? (
        <div className="storage-warning" role="alert">
          <svg
            className="storage-warning-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <div className="storage-warning-text">
            <strong>אחסון זמני בלבד</strong>
            <span>
              חסר GITHUB_TOKEN/REPO — מימושים יאבדו ב־deployment או cold start.
              הגדירו את המשתנים ב־Vercel כדי להפעיל persistence קבועה.
            </span>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={confirmReset}
        title="לאפס את כל המימושים?"
        description={`הפעולה תבטל ${sessionCount} מימושים גלובליים עבור כל השותפים. לא ניתן לבטל.`}
        confirmLabel="אפס הכל"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          try {
            const res = await fetch("/api/redeems", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ all: true }),
            });
            const data = (await res.json()) as ApiResponse<RedeemsSnapshot>;
            if (!res.ok || !data.ok) {
              showToast("איפוס נכשל — נסו שוב");
              return;
            }
            setSyncedScanned(new Set(data.data.keys));
            setRecords(data.data.records);
            setSyncStore(data.data.store);
            setLastSyncAt(data.meta.updatedAt);
            setOutcome({ status: "empty" });
            showToast("המערכת אופסה");
          } catch {
            showToast("שגיאת רשת — נסו שוב");
          }
        }}
      />

      <header className="topbar topbar-sticky">
        <div className="topbar-row">
          <div className="brand">
            <span className="brand-dot" aria-hidden="true" />
            <div className="brand-text">
              <div className="brand-title">סריקת מימוש</div>
              <div className="brand-sub">Ticket Ops · WineNot</div>
            </div>
          </div>
          <button
            type="button"
            className="rbtn rbtn-touch logout-btn"
            onClick={logout}
            disabled={logoutBusy}
          >
            {logoutBusy ? "מתנתק…" : "התנתקות"}
          </button>
        </div>

        <div className="stat-row" role="group" aria-label="סטטיסטיקה">
          <div className="stat">
            <div className="stat-value">{remaining.length}</div>
            <div className="stat-label">נותרו</div>
          </div>
          <div className="stat">
            <div className="stat-value">{sessionCount}</div>
            <div className="stat-label">מומשו</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totalEligibleSource}</div>
            <div className="stat-label">בסך הכל</div>
          </div>
          <div
            className={`sync-pill ${
              online ? "sync-online" : "sync-offline"
            }`}
            aria-live="polite"
          >
            <span className="sync-dot" aria-hidden="true" />
            <span>
              {online ? "מסונכרן" : "לא מקוון"} · {timeAgo(lastSyncAt)}
            </span>
          </div>
        </div>

        <nav className="bottom-nav" aria-label="ניווט ראשי">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`nav-btn${tab === t.id ? " nav-btn-active" : ""}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <span>{t.label}</span>
              {t.badge !== undefined && t.badge > 0 ? (
                <span className="nav-badge">{t.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <main id="main-content" className="tab-content">
        {tab === "scan" ? (
          <section className="tab-pane tab-pane-center scan-panel scan-panel-focus">
            <h2 className="section-headline">סריקה ומימוש</h2>
            <p className="section-sub">
              סרקו QR · הקלידו שם · טלפון · מספר הזמנה
            </p>
            <div className="scan-row">
              <input
                id="scan-input"
                name="scanQuery"
                ref={scanRef}
                className="scan-input"
                type="search"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                enterKeyHint="go"
                placeholder="סרקו או הקלידו…"
                aria-label="שדה חיפוש משתתף לסריקה"
                value={scanInput}
                onChange={(e) => {
                  setScanInput(e.target.value);
                  if (outcome.status !== "empty") setOutcome({ status: "empty" });
                }}
                onKeyDown={onScanKeyDown}
              />
              {scanInput ? (
                <button
                  type="button"
                  className="scan-clear"
                  aria-label="נקה חיפוש"
                  onClick={() => {
                    setScanInput("");
                    setOutcome({ status: "empty" });
                    scanRef.current?.focus();
                  }}
                >
                  ×
                </button>
              ) : null}
              <button
                type="button"
                className="scan-go"
                onClick={() => runScan()}
              >
                חפש
              </button>
            </div>
            <p className="scan-hint">
              Enter ראשון · חיפוש. Enter שני · אישור מימוש.
            </p>
            <ScanResultCard outcome={outcome} onRedeem={redeem} />
          </section>
        ) : null}

        {tab === "eligible" ? (
          <section className="tab-pane tab-pane-center eligible-section">
            <h2 className="section-headline">רשימת זכאים</h2>
            <p className="section-sub">
              {filtered.length} מתוך {remaining.length} זכאים נותרים
            </p>
            <div className="sw">
              <input
                className="srch"
                type="search"
                name="eligibleSearch"
                autoComplete="off"
                spellCheck={false}
                aria-label="חיפוש זכאים"
                placeholder="חיפוש שם · טלפון · הזמנה…"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
              />
            </div>
            <div className="filters filters-scroll" role="group" aria-label="פילטר אירועים">
              {events.map((ev) => {
                const count =
                  ev === "הכל"
                    ? remaining.length
                    : remaining.filter((p) => p.אירוע === ev).length;
                return (
                  <button
                    key={ev}
                    type="button"
                    className={`fb fb-touch${eventFilter === ev ? " act" : ""}`}
                    onClick={() => setEventFilter(ev)}
                    aria-pressed={eventFilter === ev}
                  >
                    <span className="fb-label">{ev}</span>
                    <span className="fc">{count}</span>
                  </button>
                );
              })}
            </div>
            {filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-title">אין זכאים להצגה</div>
                <div className="empty-sub">
                  נקו את החיפוש או החליפו אירוע
                </div>
              </div>
            ) : (
              <div className="card-list">
                {filtered.map((p) => (
                  <ParticipantCard
                    key={participantKey(p)}
                    p={p}
                    color={colorFor(p.אירוע)}
                    pending={pendingKeys.has(participantKey(p))}
                    onRedeem={(x) => {
                      redeem(x);
                      setTab("scan");
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === "activity" ? (
          <section className="tab-pane tab-pane-center activity-section">
            <h2 className="section-headline">לוג מימושים</h2>
            <p className="section-sub">
              סנכרון בין כל המכשירים · כל מימוש נרשם עם שעה
            </p>
            {sessionCount > 0 ? (
              <div className="activity-controls">
                <button
                  type="button"
                  className="rbtn rbtn-danger rbtn-touch"
                  onClick={() => setConfirmReset(true)}
                >
                  איפוס כל המימושים
                </button>
              </div>
            ) : null}
            {records.length === 0 ? (
              <div className="empty">
                <div className="empty-title">עדיין אין מימושים</div>
                <div className="empty-sub">
                  כל מימוש שיתבצע בכל מכשיר יופיע כאן.
                </div>
              </div>
            ) : (
              <ul className="log-list">
                {records.map((r) => {
                  const date = new Date(r.createdAt);
                  return (
                    <li className="log-item" key={r.key}>
                      <div className="log-main">
                        <div className="log-name">{r.שם || "—"}</div>
                        <div className="log-meta">
                          {r.אירוע || "אירוע לא ידוע"}
                          {r.order_id ? ` · ${r.order_id}` : ""}
                        </div>
                        <div className="log-time">
                          {date.toLocaleString("he-IL")}
                          {r.byHash ? ` · מכשיר ${r.byHash.slice(0, 6)}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rbtn rbtn-touch"
                        onClick={() => undoRedeem(r.key)}
                      >
                        בטל מימוש
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "system" ? (
          <section className="tab-pane tab-pane-center stats-tab">
            <h2 className="section-headline">סטטוס מערכת</h2>
            <div className="system-grid">
              <div className="info-card">
                <div className="info-label">חנות סנכרון</div>
                <div
                  className={`info-value ${
                    syncStore === "memory"
                      ? "warn"
                      : syncStore === "unknown"
                      ? ""
                      : "ok"
                  }`}
                >
                  {syncStore === "unknown"
                    ? "טוען…"
                    : syncStore === "github"
                    ? "GitHub"
                    : syncStore === "redis"
                    ? "Redis"
                    : "Memory"}
                </div>
                <div className="info-sub">
                  {syncStore === "github"
                    ? "נשמר בריפוזיטורי · עמיד בין deployments"
                    : syncStore === "redis"
                    ? "Upstash Redis · מסונכרן בין instances"
                    : syncStore === "memory"
                    ? "זיכרון נדיף · יאופס בכל cold start"
                    : "—"}
                </div>
              </div>
              <div className="info-card">
                <div className="info-label">סטטוס חיבור</div>
                <div className={`info-value ${online ? "ok" : "danger"}`}>
                  {online ? "מקוון" : "לא מקוון"}
                </div>
                <div className="info-sub">סנכרון אחרון: {timeAgo(lastSyncAt)}</div>
              </div>
              <div className="info-card">
                <div className="info-label">זכאים פעילים</div>
                <div className="info-value">{remaining.length}</div>
                <div className="info-sub">
                  מתוך {totalEligibleSource} זכאים בקובץ
                </div>
              </div>
              <div className="info-card">
                <div className="info-label">בנייה אחרונה</div>
                <div className="info-value">
                  {new Date(generatedAt).toLocaleDateString("he-IL")}
                </div>
                <div className="info-sub">
                  {new Date(generatedAt).toLocaleTimeString("he-IL")}
                </div>
              </div>
            </div>

            <div className="pipeline">
              <div className="pipeline-step pipeline-step-final">
                <span className="step-num" aria-hidden="true">✓</span>
                <div>
                  <p className="step-head">
                    זכאים בקובץ: <strong>{s4?.total ?? 0}</strong>
                  </p>
                  <EventBreakdown byEvent={s4?.byEvent} />
                </div>
              </div>
              <div className="pipeline-step">
                <span className="step-num" aria-hidden="true">−</span>
                <div>
                  <p className="step-head">
                    הוסרו (חינם שבועות·רוקח):{" "}
                    <strong>{s3?.totalRemoved ?? 0}</strong>
                  </p>
                  <p className="step-desc">{s3?.description}</p>
                </div>
              </div>
              {sRedeemFile ? (
                <div className="pipeline-step">
                  <span className="step-num" aria-hidden="true">−</span>
                  <div>
                    <p className="step-head">
                      הוסרו (קובץ מימושים חיצוני):{" "}
                      <strong>{sRedeemFile.totalRemoved ?? 0}</strong>
                    </p>
                    <p className="step-desc">{sRedeemFile.description}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <details className="stats-details">
              <summary>רשימת הוסרו מקבצי future</summary>
              <ul className="log-list compact">
                {futureFreeTickets.slice(0, 200).map((r) => (
                  <li
                    className="log-item"
                    key={`${r.מקור}-${r.order_id}-${r.שם}`}
                  >
                    <div className="log-main">
                      <div className="log-name">{r.שם}</div>
                      <div className="log-meta">
                        {r.טלפון || "—"} · {r.מקור}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {futureFreeTickets.length > 200 ? (
                <p className="ri">מציג 200 ראשונים מתוך {futureFreeTickets.length}</p>
              ) : null}
            </details>

            <details className="stats-details">
              <summary>פירוט שלבי הפייפליין</summary>
              <div className="pipeline" style={{ marginTop: 12 }}>
                <div className="pipeline-step">
                  <span className="step-num" aria-hidden="true">1</span>
                  <div>
                    <p className="step-head">
                      purim בתשלום:{" "}
                      <strong>{pipeline.step1_purimPaid.total ?? 0}</strong>
                    </p>
                  </div>
                </div>
                <div className="pipeline-step">
                  <span className="step-num" aria-hidden="true">2</span>
                  <div>
                    <p className="step-head">
                      אחרי סריקות purim:{" "}
                      <strong>{pipeline.step2_afterPurimScans.total ?? 0}</strong>
                    </p>
                  </div>
                </div>
                <div className="pipeline-step">
                  <span className="step-num" aria-hidden="true">3</span>
                  <div>
                    <p className="step-head">
                      future חינם: <strong>{s3?.totalRemoved ?? 0}</strong>
                    </p>
                  </div>
                </div>
                {sRedeemFile ? (
                  <div className="pipeline-step">
                    <span className="step-num" aria-hidden="true">4</span>
                    <div>
                      <p className="step-head">
                        קובץ מימושים:{" "}
                        <strong>{sRedeemFile.totalRemoved ?? 0}</strong>
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          </section>
        ) : null}
      </main>

      <footer className="app-footer">
        <p>
          סנכרון חי בין כל המכשירים · כל מימוש מתעדכן מיידית. דוחות בנייה
          ב-<code>npm run build:data</code>.
        </p>
      </footer>
    </div>
  );
}
