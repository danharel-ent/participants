"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BuildMeta,
  EventColors,
  FutureBlocklist,
  FutureFreeTicket,
  Participant,
} from "@/lib/types";
import { participantKey } from "@/lib/keys";
import {
  buildFutureBlocklistIndex,
  buildLookupIndex,
  lookupScan,
  type ScanOutcome,
} from "@/lib/lookup";
import { clearLocalScans, loadLocalScans, saveLocalScans } from "@/lib/session-scans";

type Props = {
  participants: Participant[];
  preScanned: Record<string, boolean>;
  futureFreeTickets: FutureFreeTicket[];
  futureBlocklist: FutureBlocklist;
  eventColors: EventColors;
  pipeline: BuildMeta["pipeline"];
  generatedAt: string;
};

type TabId = "scan" | "eligible" | "removed" | "stats";

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
      <div className="scan-result scan-ok">
        <div className="scan-verdict">✅ זכאי</div>
        <div className="scan-name">{p.שם}</div>
        <div className="scan-meta">{p.אירוע}</div>
        {p.טלפון ? <div className="scan-meta">{p.טלפון}</div> : null}
        <button type="button" className="cfm scan-redeem-btn" onClick={() => onRedeem(p)}>
          ✓ אישור מימוש
        </button>
      </div>
    );
  }

  if (outcome.status === "ineligible") {
    if (outcome.reason === "local") {
      const p = outcome.matches?.[0] as Participant | undefined;
      return (
        <div className="scan-result scan-warn">
          <div className="scan-verdict">⚠ כבר מומש</div>
          {p ? <div className="scan-name">{p.שם}</div> : null}
          <div className="scan-reason">הוסר מהרשימה בסשן הזה</div>
        </div>
      );
    }
    if (outcome.reason === "future") {
      const r = outcome.matches?.[0] as FutureFreeTicket | undefined;
      return (
        <div className="scan-result scan-bad">
          <div className="scan-verdict">❌ לא זכאי</div>
          <div className="scan-reason">כרטיס חינם — {r?.מקור || "שבועות / רוקח"}</div>
          {r?.שם ? <div className="scan-name">{r.שם}</div> : null}
        </div>
      );
    }
    return (
      <div className="scan-result scan-bad">
        <div className="scan-verdict">❌ לא זכאי</div>
        <div className="scan-reason">כבר נוצל בפורים (בקובץ)</div>
      </div>
    );
  }

  if (outcome.status === "pick") {
    return (
      <div className="scan-result scan-pick">
        <div className="scan-verdict">כמה התאמות — בחרו</div>
        <ul className="scan-pick-list">
          {outcome.eligible.map((p) => (
            <li key={participantKey(p)}>
              <button type="button" className="scan-pick-btn" onClick={() => onRedeem(p)}>
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
    <div className="scan-result scan-unknown">
      <div className="scan-verdict">לא נמצא</div>
      <div className="scan-reason">אין ברשימת הזכאים</div>
    </div>
  );
}

function ParticipantCard({
  p,
  color,
  onRedeem,
}: {
  p: Participant;
  color: { a: string };
  onRedeem: (p: Participant) => void;
}) {
  const ini = (p.שם || "?").trim()[0];
  return (
    <div className="p-card">
      <div className="p-card-main">
        <div className="av" style={{ background: color.a }}>
          {ini}
        </div>
        <div className="p-card-text">
          <div className="nm">{p.שם}</div>
          <div className="p-card-sub">{p.טלפון || "—"}</div>
          <span className="et">{p.אירוע}</span>
        </div>
      </div>
      <button type="button" className="cfm p-card-btn" onClick={() => onRedeem(p)}>
        מימוש
      </button>
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
  const [tab, setTab] = useState<TabId>("scan");
  const [scanInput, setScanInput] = useState("");
  const [outcome, setOutcome] = useState<ScanOutcome>({ status: "empty" });
  const [localScanned, setLocalScanned] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [freeQuery, setFreeQuery] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("הכל");
  const scanRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalScanned(loadLocalScans());
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const s3 = pipeline.step3_afterFutureMatch;
  const s4 = pipeline.step4_finalEligible;

  const remaining = useMemo(
    () => participants.filter((p) => !localScanned.has(participantKey(p))),
    [participants, localScanned]
  );

  const futureBl = useMemo(
    () => buildFutureBlocklistIndex(futureBlocklist),
    [futureBlocklist]
  );

  const index = useMemo(
    () => buildLookupIndex(remaining, preScanned, futureFreeTickets, localScanned),
    [remaining, preScanned, futureFreeTickets, localScanned]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const redeem = useCallback(
    (p: Participant) => {
      const key = participantKey(p);
      if (localScanned.has(key)) {
        setOutcome({ status: "ineligible", reason: "local", matches: [p] });
        return;
      }
      const next = new Set(localScanned);
      next.add(key);
      setLocalScanned(next);
      saveLocalScans(next);
      setOutcome({ status: "empty" });
      setScanInput("");
      showToast(`✓ ${p.שם}`);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(40);
      }
      requestAnimationFrame(() => scanRef.current?.focus());
    },
    [localScanned, showToast]
  );

  const runScan = useCallback(
    (value?: string) => {
      const q = (value ?? scanInput).trim();
      if (!q) {
        setOutcome({ status: "empty" });
        return;
      }
      setScanInput(q);
      setOutcome(lookupScan(q, participants, index, futureBl, localScanned));
    },
    [scanInput, participants, index, futureBl, localScanned]
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

  const filteredFree = useMemo(() => {
    const q = freeQuery.trim().toLowerCase();
    if (!q) return futureFreeTickets;
    return futureFreeTickets.filter(
      (r) =>
        r.שם.toLowerCase().includes(q) ||
        r.טלפון.includes(q) ||
        r.מקור.toLowerCase().includes(q)
    );
  }, [futureFreeTickets, freeQuery]);

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

  const sessionCount = localScanned.size;

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "scan", label: "סריקה" },
    { id: "eligible", label: "זכאים", badge: remaining.length },
    { id: "removed", label: "הוסרו", badge: futureFreeTickets.length },
    { id: "stats", label: "סיכום" },
  ];

  return (
    <div className="app-shell">
      {toast ? (
        <div className="ntf" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      <header className="hdr hdr-sticky">
        <div>
          <h1 className="title">סריקת מימוש</h1>
          <p className="sub">
            <span className="bdg bdg-green">{remaining.length}</span>
            <span>נותרו</span>
            {sessionCount > 0 ? (
              <span className="sub-muted"> · {sessionCount} מומשו בסשן</span>
            ) : null}
          </p>
        </div>
        {sessionCount > 0 ? (
          <button
            type="button"
            className="rbtn rbtn-touch"
            onClick={() => {
              if (!confirm(`לאפס ${sessionCount} מימושים בסשן הזה?`)) return;
              clearLocalScans();
              setLocalScanned(new Set());
              setOutcome({ status: "empty" });
              showToast("מימושי הסשן אופסו");
            }}
          >
            אפס סשן
          </button>
        ) : null}
      </header>

      <nav className="bottom-nav" aria-label="ניווט ראשי">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`nav-btn${tab === t.id ? " nav-btn-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            {t.badge !== undefined ? <span className="nav-badge">{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {tab === "scan" ? (
          <section className="scan-panel scan-panel-focus">
            <label className="scan-label" htmlFor="scan-input">
              QR · טלפון · שם · מספר הזמנה
            </label>
            <div className="scan-row">
              <input
                id="scan-input"
                ref={scanRef}
                className="scan-input"
                type="search"
                inputMode="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                enterKeyHint="go"
                placeholder="סריקה או הקלדה..."
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
                  aria-label="נקה"
                  onClick={() => {
                    setScanInput("");
                    setOutcome({ status: "empty" });
                    scanRef.current?.focus();
                  }}
                >
                  ×
                </button>
              ) : null}
              <button type="button" className="scan-go" onClick={() => runScan()}>
                חפש
              </button>
            </div>
            <p className="scan-hint">Enter פעם אחת = חיפוש · Enter שוב (אם זכאי) = מימוש</p>
            <ScanResultCard outcome={outcome} onRedeem={redeem} />
          </section>
        ) : null}

        {tab === "eligible" ? (
          <section className="eligible-section">
            <div className="sw">
              <input
                className="srch"
                type="search"
                placeholder="חיפוש שם / טלפון..."
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
              />
            </div>
            <div className="filters filters-scroll">
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
                  >
                    <span className="fb-label">{ev}</span>
                    <span className="fc">{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="ri">מציג {filtered.length} מתוך {remaining.length}</p>
            {filtered.length === 0 ? (
              <p className="er">אין זכאים להצגה</p>
            ) : (
              <div className="card-list">
                {filtered.map((p) => (
                  <ParticipantCard
                    key={participantKey(p)}
                    p={p}
                    color={colorFor(p.אירוע)}
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

        {tab === "removed" ? (
          <section className="redemptions-section">
            <p className="step-desc section-intro">
              מי שקיבל כרטיס חינם בשבועות או רוקח — לא זכאים ל-purim (ללא קשר לסריקה שם).
            </p>
            <div className="sw">
              <input
                className="srch"
                type="search"
                placeholder="חיפוש..."
                value={freeQuery}
                onChange={(e) => setFreeQuery(e.target.value)}
              />
            </div>
            <p className="ri">{filteredFree.length} רשומות</p>
            <div className="card-list card-list-compact">
              {filteredFree.slice(0, 150).map((r) => (
                <div className="p-card p-card-mini" key={`${r.מקור}-${r.order_id}-${r.שם}`}>
                  <div className="p-card-text">
                    <div className="nm">{r.שם}</div>
                    <div className="p-card-sub">
                      {r.טלפון || "—"} · {r.מקור}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredFree.length > 150 ? (
              <p className="ri">מוצגים 150 ראשונים</p>
            ) : null}
          </section>
        ) : null}

        {tab === "stats" ? (
          <section className="stats-bottom stats-tab">
            <p className="meta-note">
              נתונים מקבצי CSV. לעדכון: הריצו <code>npm run build:data</code> בפרויקט.
              <br />
              מימושים בסשן נשמרים רק בדפדפן הזה (כל שותף רואה את הסשן שלו).
            </p>
            <p className="meta-note">
              עודכן: {new Date(generatedAt).toLocaleString("he-IL")}
            </p>
            <div className="pipeline">
              <div className="pipeline-step pipeline-step-final">
                <span className="step-num">✓</span>
                <div>
                  <p className="step-head">
                    זכאים בקובץ: <strong>{s4?.total ?? 0}</strong>
                  </p>
                  <EventBreakdown byEvent={s4?.byEvent} />
                </div>
              </div>
              <div className="pipeline-step">
                <span className="step-num">−</span>
                <div>
                  <p className="step-head">
                    הוסרו (חינם שבועות·רוקח): <strong>{s3?.totalRemoved ?? 0}</strong>
                  </p>
                  <p className="step-desc">{s3?.description}</p>
                </div>
              </div>
            </div>
            <details className="stats-details">
              <summary>פירוט מלא (4 שלבים)</summary>
              <div className="pipeline" style={{ marginTop: 12 }}>
                <div className="pipeline-step">
                  <span className="step-num">1</span>
                  <div>
                    <p className="step-head">
                      purim בתשלום: <strong>{pipeline.step1_purimPaid.total ?? 0}</strong>
                    </p>
                  </div>
                </div>
                <div className="pipeline-step">
                  <span className="step-num">2</span>
                  <div>
                    <p className="step-head">
                      אחרי סריקות purim:{" "}
                      <strong>{pipeline.step2_afterPurimScans.total ?? 0}</strong>
                    </p>
                  </div>
                </div>
                <div className="pipeline-step">
                  <span className="step-num">3</span>
                  <div>
                    <p className="step-head">
                      הוסרו future: <strong>{s3?.totalRemoved ?? 0}</strong>
                    </p>
                  </div>
                </div>
              </div>
            </details>
          </section>
        ) : null}
      </main>

      <footer className="app-footer">
        <p>שיתוף עם שותפים: אותו קישור · כל אחד מממש במכשיר שלו</p>
      </footer>
    </div>
  );
}
