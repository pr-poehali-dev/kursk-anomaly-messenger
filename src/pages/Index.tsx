import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { api, setSessionId, removeSession } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "home" | "chats" | "anomalies" | "profile" | "rating" | "map" | "admin";
type AnomalyStatus = "possible" | "confirmed" | "denied" | "under_review";
type AnomalyCategory = "electromagnetic" | "gravitational" | "biological" | "acoustic" | "visual" | "chemical";
type UserLevel = "seeker" | "observer" | "hunter" | "stalker" | "tester" | "x_tester";
type UserRole = "user" | "moderator" | "admin";

interface User {
  id: number;
  username: string;
  role: UserRole;
  level: UserLevel;
  xp: number;
  is_banned?: boolean;
}

interface ApiAnomaly {
  id: number; code: string; title: string; category: AnomalyCategory;
  status: AnomalyStatus; location: string; description: string;
  coords_x: number; coords_y: number; reporter_name: string;
  reviewed_by_name: string | null; reviewed_at: string | null;
  review_comment: string | null; evidence_count: number; created_at: string;
}

interface ApiMessage {
  id: number; user_id: number; username: string; level: UserLevel;
  role: UserRole; text: string; time: string;
}

interface ApiChat {
  id: number; name: string; slug: string; type: string;
  description: string; min_level: UserLevel; message_count: number;
}

interface AdminUser {
  id: number; username: string; role: UserRole; level: UserLevel;
  xp: number; is_banned: boolean; created_at: string; last_seen: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVELS: Record<UserLevel, { label: string; color: string; xp: number }> = {
  seeker:   { label: "ИСКАТЕЛЬ",    color: "#4a7a56",  xp: 0 },
  observer: { label: "НАБЛЮДАТЕЛЬ", color: "#00cc52",  xp: 500 },
  hunter:   { label: "ОХОТНИК",     color: "#00ff6a",  xp: 1500 },
  stalker:  { label: "СТАЛКЕР",     color: "#ffb300",  xp: 4000 },
  tester:   { label: "ИСПЫТАТЕЛЬ",  color: "#00e5ff",  xp: 10000 },
  x_tester: { label: "X TESTER",    color: "#ff2244",  xp: 25000 },
};

const CATEGORIES: Record<AnomalyCategory, { label: string; icon: string }> = {
  electromagnetic: { label: "Электромагнитная", icon: "Zap" },
  gravitational:   { label: "Гравитационная",   icon: "Circle" },
  biological:      { label: "Биологическая",    icon: "Leaf" },
  acoustic:        { label: "Акустическая",     icon: "Volume2" },
  visual:          { label: "Визуальная",        icon: "Eye" },
  chemical:        { label: "Химическая",        icon: "FlaskConical" },
};

const STATUS_CONFIG: Record<AnomalyStatus, { label: string; color: string }> = {
  possible:     { label: "ВОЗМОЖНАЯ",    color: "#ffb300" },
  confirmed:    { label: "ПОДТВЕРЖДЕНА", color: "#00ff6a" },
  denied:       { label: "ОПРОВЕРГНУТА", color: "#ff2244" },
  under_review: { label: "НА ПРОВЕРКЕ",  color: "#00e5ff" },
};

const LEVEL_ORDER: UserLevel[] = ["seeker", "observer", "hunter", "stalker", "tester", "x_tester"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LevelBadge({ level, size = "sm" }: { level: UserLevel; size?: "sm" | "md" | "lg" }) {
  const cfg = LEVELS[level] ?? LEVELS.seeker;
  const sizes = { sm: "text-[9px] px-1.5 py-0.5", md: "text-[10px] px-2 py-0.5", lg: "text-xs px-3 py-1" };
  return (
    <span className={`font-terminal tracking-widest border ${sizes[size]} rounded-sm`}
      style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}15` }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: AnomalyStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.possible;
  return (
    <span className="font-terminal text-[9px] tracking-widest px-2 py-0.5 border rounded-sm"
      style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}15` }}>
      {cfg.label}
    </span>
  );
}

function RadarDot({ x, y, status, id }: { x: number; y: number; status: AnomalyStatus; id: string }) {
  const color = STATUS_CONFIG[status]?.color ?? "#ffb300";
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
      <div className="relative">
        <div className="w-3 h-3 rounded-full border-2 cursor-pointer hover:scale-150 transition-transform z-10 relative"
          style={{ backgroundColor: color, borderColor: color, boxShadow: `0 0 10px ${color}` }} title={id} />
        <div className="absolute inset-0 rounded-full animate-radar"
          style={{ background: `radial-gradient(circle, ${color}44 0%, transparent 70%)` }} />
      </div>
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────

function AuthScreen({ onLogin }: { onLogin: (user: User, sid: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ERRORS: Record<string, string> = {
    wrong_credentials: "Неверный позывной или пароль",
    username_taken: "Позывной уже занят",
    username_length: "Позывной: 3–50 символов",
    password_too_short: "Пароль минимум 6 символов",
    empty_fields: "Заполните все поля",
    banned: "Доступ закрыт",
  };

  async function submit() {
    setError("");
    setLoading(true);
    const fn = mode === "login"
      ? api.auth.login(username, password)
      : api.auth.register(username, password);
    const { status, data } = await fn;
    setLoading(false);
    if (status === 200 && data && typeof data === "object" && "session_id" in data) {
      const d = data as { session_id: string; user: User };
      setSessionId(d.session_id);
      onLogin(d.user, d.session_id);
    } else {
      const errCode = (data as Record<string, string>)?.error ?? "unknown";
      setError(ERRORS[errCode] ?? `Ошибка: ${errCode}`);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--xta-bg)" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-display text-4xl font-bold tracking-widest" style={{ color: "var(--xta-green)", textShadow: "var(--xta-glow-strong)" }}>
            X TEST
          </div>
          <div className="font-terminal text-[10px] tracking-[0.5em] mt-1" style={{ color: "var(--xta-text-dim)" }}>
            ANOMALIES // KURSK
          </div>
          <div className="mt-3 font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>
            <span className="animate-blink">▮</span> ИДЕНТИФИКАЦИЯ СТАЛКЕРА
          </div>
        </div>

        <div className="xta-panel corner-tl corner-br p-6 space-y-4">
          {/* Mode tabs */}
          <div className="flex border rounded-sm overflow-hidden" style={{ borderColor: "var(--xta-border)" }}>
            {(["login", "register"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                className="flex-1 py-2 font-terminal text-[10px] tracking-widest transition-all"
                style={{
                  background: mode === m ? "var(--xta-green)" : "transparent",
                  color: mode === m ? "var(--xta-bg)" : "var(--xta-text-dim)",
                }}>
                {m === "login" ? "ВХОД" : "РЕГИСТРАЦИЯ"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="font-terminal text-[9px] tracking-widest mb-1 block" style={{ color: "var(--xta-text-dim)" }}>
                ПОЗЫВНОЙ
              </label>
              <input
                className="xta-input w-full px-3 py-2 text-sm rounded-sm"
                placeholder="Призрак_51"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="font-terminal text-[9px] tracking-widest mb-1 block" style={{ color: "var(--xta-text-dim)" }}>
                ПАРОЛЬ
              </label>
              <input
                type="password"
                className="xta-input w-full px-3 py-2 text-sm rounded-sm"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
          </div>

          {error && (
            <div className="font-terminal text-[10px] px-3 py-2 border rounded-sm" style={{ color: "var(--xta-red)", borderColor: "var(--xta-red)", background: "rgba(255,34,68,0.1)" }}>
              ⚠ {error}
            </div>
          )}

          <button onClick={submit} disabled={loading}
            className="xta-btn w-full py-3 text-sm tracking-widest"
            style={{ opacity: loading ? 0.6 : 1 }}>
            {loading ? "ПОДКЛЮЧЕНИЕ..." : mode === "login" ? "ВОЙТИ В СЕТЬ" : "СОЗДАТЬ АККАУНТ"}
          </button>

          {mode === "register" && (
            <p className="font-terminal text-[8px] text-center" style={{ color: "var(--xta-text-dim)" }}>
              Уровень ИСКАТЕЛЬ. Повышается за активность и одобренные аномалии.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

function AdminPanel({ currentUser }: { currentUser: User }) {
  const [tab, setTab] = useState<"stats" | "users" | "anomalies">("stats");
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [anomalies, setAnomalies] = useState<ApiAnomaly[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    if (tab === "stats") {
      const { data } = await api.admin.stats();
      if (data && typeof data === "object") setStats(data as Record<string, number>);
    } else if (tab === "users") {
      const { data } = await api.admin.users();
      if (Array.isArray(data)) setUsers(data as AdminUser[]);
    } else {
      const { data } = await api.anomalies.list();
      if (Array.isArray(data)) setAnomalies(data as ApiAnomaly[]);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function setRole(user_id: number, role: string) {
    await api.admin.setRole(user_id, role);
    setMsg("Роль обновлена"); load();
  }
  async function setLevel(user_id: number, level: string) {
    await api.admin.setLevel(user_id, level);
    setMsg("Уровень обновлён"); load();
  }
  async function toggleBan(user_id: number, banned: boolean) {
    await api.admin.ban(user_id, !banned);
    setMsg(banned ? "Разбанен" : "Забанен"); load();
  }
  async function reviewAnomaly(id: number, status: string, comment = "") {
    await api.anomalies.review(id, status, comment);
    setMsg(`Статус: ${status}`); load();
  }

  const TABS = [
    { key: "stats" as const, label: "СТАТИСТИКА" },
    { key: "users" as const, label: "СТАЛКЕРЫ" },
    { key: "anomalies" as const, label: "АНОМАЛИИ" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="font-terminal text-[10px] tracking-widest" style={{ color: "var(--xta-red)" }}>
          ⬛ ПАНЕЛЬ УПРАВЛЕНИЯ X TEST
        </div>
        <span className="font-terminal text-[9px] px-2 py-0.5 border rounded-sm" style={{ color: "var(--xta-red)", borderColor: "var(--xta-red)" }}>
          {currentUser.role.toUpperCase()}
        </span>
      </div>

      {msg && (
        <div className="font-terminal text-[10px] px-3 py-2 border rounded-sm" style={{ color: "var(--xta-green)", borderColor: "var(--xta-green)", background: "rgba(0,255,106,0.05)" }}
          onClick={() => setMsg("")}>
          ✓ {msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="font-terminal text-[9px] px-3 py-1.5 border rounded-sm transition-all"
            style={{
              color: tab === t.key ? "var(--xta-bg)" : "var(--xta-text-dim)",
              borderColor: "var(--xta-red)",
              background: tab === t.key ? "var(--xta-red)" : "transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="font-terminal text-[10px] animate-blink" style={{ color: "var(--xta-text-dim)" }}>ЗАГРУЗКА...</div>}

      {/* Stats */}
      {tab === "stats" && stats && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Всего участников",  val: stats.total_users,        color: "var(--xta-green)" },
            { label: "Аномалий в базе",   val: stats.total_anomalies,    color: "var(--xta-cyan)" },
            { label: "Подтверждено",      val: stats.confirmed_anomalies, color: "var(--xta-amber)" },
            { label: "На проверке",       val: stats.pending_anomalies,  color: "var(--xta-red)" },
            { label: "Сообщений",         val: stats.total_messages,     color: "var(--xta-text-dim)" },
          ].map((s, i) => (
            <div key={i} className="xta-panel p-4">
              <div className="font-terminal text-2xl font-bold" style={{ color: s.color }}>{s.val ?? 0}</div>
              <div className="font-terminal text-[9px] mt-1" style={{ color: "var(--xta-text-dim)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Users */}
      {tab === "users" && (
        <div className="space-y-2">
          {users.length === 0 && !loading && (
            <div className="font-terminal text-[10px]" style={{ color: "var(--xta-text-dim)" }}>Нет участников</div>
          )}
          {users.map(u => (
            <div key={u.id} className="xta-panel p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-terminal text-sm font-bold" style={{ color: u.is_banned ? "var(--xta-red)" : LEVELS[u.level]?.color }}>
                    {u.username}
                  </span>
                  <LevelBadge level={u.level} />
                  {u.role !== "user" && (
                    <span className="font-terminal text-[8px] px-1.5 py-0.5 border rounded-sm" style={{ color: "var(--xta-red)", borderColor: "var(--xta-red)" }}>
                      {u.role.toUpperCase()}
                    </span>
                  )}
                  {u.is_banned && (
                    <span className="font-terminal text-[8px] px-1.5 py-0.5 border rounded-sm" style={{ color: "var(--xta-red)", borderColor: "var(--xta-red)", background: "rgba(255,34,68,0.1)" }}>БАН</span>
                  )}
                </div>
                <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{u.xp} XP</span>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap gap-2">
                {/* Level select */}
                <select
                  className="xta-input text-[9px] px-2 py-1 rounded-sm font-terminal"
                  value={u.level}
                  onChange={e => setLevel(u.id, e.target.value)}
                  style={{ background: "var(--xta-panel)" }}
                >
                  {LEVEL_ORDER.map(lv => (
                    <option key={lv} value={lv}>{LEVELS[lv].label}</option>
                  ))}
                </select>

                {/* Role (только admin) */}
                {currentUser.role === "admin" && (
                  <select
                    className="xta-input text-[9px] px-2 py-1 rounded-sm font-terminal"
                    value={u.role}
                    onChange={e => setRole(u.id, e.target.value)}
                    style={{ background: "var(--xta-panel)" }}
                  >
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                )}

                {/* Ban (только admin) */}
                {currentUser.role === "admin" && u.id !== currentUser.id && (
                  <button
                    onClick={() => toggleBan(u.id, u.is_banned)}
                    className="font-terminal text-[9px] px-2 py-1 border rounded-sm transition-all"
                    style={{ color: u.is_banned ? "var(--xta-green)" : "var(--xta-red)", borderColor: u.is_banned ? "var(--xta-green)" : "var(--xta-red)" }}>
                    {u.is_banned ? "РАЗБАНИТЬ" : "БАН"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Anomalies moderation */}
      {tab === "anomalies" && (
        <div className="space-y-3">
          {anomalies.length === 0 && !loading && (
            <div className="font-terminal text-[10px]" style={{ color: "var(--xta-text-dim)" }}>Аномалий нет</div>
          )}
          {anomalies.map(a => (
            <div key={a.id} className="xta-panel p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{a.code}</span>
                  <div className="font-display text-sm font-medium mt-0.5" style={{ color: "var(--xta-text)" }}>{a.title}</div>
                  <div className="font-terminal text-[9px] mt-0.5" style={{ color: "var(--xta-text-dim)" }}>
                    Репортёр: <span style={{ color: "var(--xta-green)" }}>{a.reporter_name}</span>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <div className="font-mono text-[10px]" style={{ color: "var(--xta-text-dim)" }}>{a.description}</div>

              {/* Verdict buttons */}
              <div className="flex gap-2 flex-wrap pt-1">
                <button onClick={() => reviewAnomaly(a.id, "confirmed")}
                  className="font-terminal text-[9px] px-3 py-1.5 border rounded-sm transition-all"
                  style={{ color: "var(--xta-bg)", borderColor: "var(--xta-green)", background: "var(--xta-green)" }}>
                  ✓ ПОДТВЕРДИТЬ
                </button>
                <button onClick={() => reviewAnomaly(a.id, "under_review")}
                  className="font-terminal text-[9px] px-3 py-1.5 border rounded-sm transition-all"
                  style={{ color: "var(--xta-cyan)", borderColor: "var(--xta-cyan)" }}>
                  ⟳ НА ПРОВЕРКУ
                </button>
                <button onClick={() => reviewAnomaly(a.id, "denied")}
                  className="font-terminal text-[9px] px-3 py-1.5 border rounded-sm transition-all"
                  style={{ color: "var(--xta-red)", borderColor: "var(--xta-red)" }}>
                  ✕ ОПРОВЕРГНУТЬ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Home Section ─────────────────────────────────────────────────────────────

function HomeSection({ user }: { user: User }) {
  const stats = [
    { label: "Аномалий в базе",   value: "—",  color: "var(--xta-green)" },
    { label: "Участников",        value: "—",  color: "var(--xta-amber)" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="xta-panel corner-tl corner-br p-6 relative overflow-hidden">
        <div className="absolute right-6 top-4 opacity-10 pointer-events-none select-none font-terminal" style={{ fontSize: 120, lineHeight: 1 }}>X</div>
        <div className="relative z-10">
          <div className="font-terminal text-[10px] tracking-[0.4em] mb-2" style={{ color: "var(--xta-text-dim)" }}>
            KURSK ANOMALY RESEARCH NETWORK // v2.1
          </div>
          <h1 className="font-display text-3xl font-bold tracking-widest mb-1" style={{ color: "var(--xta-green)", textShadow: "var(--xta-glow)" }}>
            X TEST ANOMALIES
          </h1>
          <div className="font-terminal text-xs mb-1" style={{ color: "var(--xta-text-dim)" }}>
            Курская область — активный сектор наблюдения
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="font-terminal text-[10px]" style={{ color: "var(--xta-text-dim)" }}>Вы в сети:</span>
            <span className="font-terminal text-[10px] font-bold" style={{ color: LEVELS[user.level]?.color }}>{user.username}</span>
            <LevelBadge level={user.level} />
          </div>
          <div className="flex gap-3 flex-wrap">
            <button className="xta-btn text-xs px-4 py-2 flex items-center gap-2">
              <Icon name="Plus" size={14} /> Сообщить об аномалии
            </button>
            <button className="xta-btn text-xs px-4 py-2 flex items-center gap-2" style={{ borderColor: "var(--xta-cyan)", color: "var(--xta-cyan)" }}>
              <Icon name="Map" size={14} /> Открыть карту
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <div key={i} className="xta-panel p-4">
            <div className="font-terminal text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="font-terminal text-[10px] mt-1" style={{ color: "var(--xta-text)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="xta-panel p-4">
        <div className="font-terminal text-[10px] tracking-widest mb-4" style={{ color: "var(--xta-text-dim)" }}>
          ИЕРАРХИЯ СТАЛКЕРОВ
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(LEVELS) as [UserLevel, typeof LEVELS[UserLevel]][]).map(([key, val]) => {
            const isMe = key === user.level;
            return (
              <div key={key} className="text-center p-2 border rounded-sm" style={{ borderColor: isMe ? val.color : `${val.color}33` }}>
                <div className="font-terminal text-[9px] tracking-widest" style={{ color: val.color }}>{val.label}</div>
                <div className="font-terminal text-[8px] mt-1" style={{ color: "var(--xta-text-dim)" }}>{val.xp.toLocaleString()} XP</div>
                {isMe && <div className="font-terminal text-[7px] mt-0.5" style={{ color: val.color }}>← ВЫ</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Chats Section ────────────────────────────────────────────────────────────

function ChatsSection({ user }: { user: User }) {
  const [chats, setChats] = useState<ApiChat[]>([]);
  const [activeChat, setActiveChat] = useState<ApiChat | null>(null);
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.chats.list().then(({ data }) => { if (Array.isArray(data)) setChats(data as ApiChat[]); });
  }, []);

  async function openChat(chat: ApiChat) {
    setActiveChat(chat);
    setLoading(true);
    const { data } = await api.chats.messages(chat.id);
    if (Array.isArray(data)) setMessages(data as ApiMessage[]);
    setLoading(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function sendMsg() {
    if (!msgInput.trim() || !activeChat) return;
    const text = msgInput;
    setMsgInput("");
    await api.chats.send(activeChat.id, text);
    const { data } = await api.chats.messages(activeChat.id);
    if (Array.isArray(data)) setMessages(data as ApiMessage[]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  const typeIcons: Record<string, string> = { team: "⚑", field: "§", general: "#" };

  if (activeChat) {
    return (
      <div className="flex flex-col animate-fade-in" style={{ height: "calc(100vh - 140px)" }}>
        <div className="xta-panel p-3 flex items-center gap-3 mb-3">
          <button onClick={() => setActiveChat(null)} className="xta-btn p-1.5 rounded-sm">
            <Icon name="ChevronLeft" size={16} />
          </button>
          <div className="flex-1">
            <div className="font-terminal text-sm" style={{ color: "var(--xta-green)" }}>
              {typeIcons[activeChat.type]} {activeChat.name}
            </div>
            <div className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{activeChat.description}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
          {loading && <div className="font-terminal text-[10px] animate-blink text-center" style={{ color: "var(--xta-text-dim)" }}>ЗАГРУЗКА ЭФИРА...</div>}
          {messages.length === 0 && !loading && (
            <div className="font-terminal text-[10px] text-center" style={{ color: "var(--xta-text-dim)" }}>Канал пуст. Будь первым.</div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-2 animate-fade-in">
              <div className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 font-terminal text-xs font-bold border"
                style={{ background: "var(--xta-green-dark)", borderColor: "var(--xta-border)", color: "var(--xta-green)" }}>
                {(msg.username ?? "?")[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-terminal text-[10px] font-bold" style={{ color: LEVELS[msg.level]?.color ?? "var(--xta-green)" }}>{msg.username}</span>
                  <LevelBadge level={msg.level ?? "seeker"} />
                  {msg.role !== "user" && (
                    <span className="font-terminal text-[8px] px-1.5 py-0.5 border rounded-sm" style={{ color: "var(--xta-red)", borderColor: "var(--xta-red)" }}>
                      {msg.role.toUpperCase()}
                    </span>
                  )}
                  <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>
                    {new Date(msg.time).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="font-mono text-xs leading-relaxed" style={{ color: "var(--xta-text)" }}>{msg.text}</div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="xta-panel p-2 flex gap-2 items-center">
          <input
            className="xta-input flex-1 text-xs px-3 py-2 rounded-sm"
            placeholder="Сообщение в эфир..."
            value={msgInput}
            onChange={e => setMsgInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMsg()}
          />
          <button onClick={sendMsg} className="xta-btn p-2 rounded-sm">
            <Icon name="Send" size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="font-terminal text-[10px] tracking-widest mb-4" style={{ color: "var(--xta-text-dim)" }}>
        АКТИВНЫЕ КАНАЛЫ СВЯЗИ
      </div>
      {chats.map(chat => {
        const levelRank = LEVEL_ORDER.indexOf(chat.min_level);
        const userRank = LEVEL_ORDER.indexOf(user.level);
        const hasAccess = userRank >= levelRank || user.role === "admin" || user.role === "moderator";
        return (
          <button key={chat.id} onClick={() => hasAccess && openChat(chat)}
            className="xta-panel w-full p-4 flex gap-3 items-center text-left transition-colors"
            style={{ opacity: hasAccess ? 1 : 0.4 }}>
            <div className="w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0 font-terminal text-lg border"
              style={{ background: "var(--xta-green-dark)", borderColor: "var(--xta-border)", color: "var(--xta-green)" }}>
              {typeIcons[chat.type] ?? "#"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-terminal text-sm" style={{ color: "var(--xta-green)" }}>{typeIcons[chat.type]} {chat.name}</div>
              <div className="font-mono text-[11px] truncate mt-0.5" style={{ color: "var(--xta-text-dim)" }}>{chat.description}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <LevelBadge level={chat.min_level} />
              {!hasAccess && <span className="font-terminal text-[8px]" style={{ color: "var(--xta-red)" }}>🔒</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Anomalies Section ────────────────────────────────────────────────────────

function AnomaliesSection({ user }: { user: User }) {
  const [anomalies, setAnomalies] = useState<ApiAnomaly[]>([]);
  const [selected, setSelected] = useState<ApiAnomaly | null>(null);
  const [filter, setFilter] = useState<AnomalyStatus | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", category: "electromagnetic" as AnomalyCategory, location: "", description: "" });
  const [sending, setSending] = useState(false);
  const [resultMsg, setResultMsg] = useState("");

  const loadAnomalies = useCallback(async () => {
    const { data } = await api.anomalies.list(filter);
    if (Array.isArray(data)) setAnomalies(data as ApiAnomaly[]);
  }, [filter]);

  useEffect(() => { loadAnomalies(); }, [loadAnomalies]);

  async function submit() {
    if (!form.title || !form.location) { setResultMsg("Заполните название и местоположение"); return; }
    setSending(true);
    const { status } = await api.anomalies.create(form);
    setSending(false);
    if (status === 200) {
      setResultMsg("Аномалия подана на рассмотрение! +100 XP");
      setShowForm(false);
      setForm({ title: "", category: "electromagnetic", location: "", description: "" });
      loadAnomalies();
    } else {
      setResultMsg("Ошибка. Попробуйте снова.");
    }
  }

  const filtered = filter === "all" ? anomalies : anomalies.filter(a => a.status === filter);

  if (selected) {
    const catCfg = CATEGORIES[selected.category] ?? CATEGORIES.electromagnetic;
    const isAdmin = user.role === "admin" || user.role === "moderator";
    return (
      <div className="animate-fade-in space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="xta-btn p-1.5 rounded-sm"><Icon name="ChevronLeft" size={16} /></button>
          <div className="font-terminal text-[10px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>ID: {selected.code}</div>
        </div>
        <div className="xta-panel corner-tl corner-br p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-semibold leading-tight" style={{ color: "var(--xta-text)" }}>{selected.title}</h2>
            <StatusBadge status={selected.status} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="font-terminal text-[9px] tracking-widest mb-1" style={{ color: "var(--xta-text-dim)" }}>КАТЕГОРИЯ</div>
              <div className="flex items-center gap-1.5 font-terminal text-xs" style={{ color: "var(--xta-text)" }}>
                <Icon name={catCfg.icon} fallback="Zap" size={12} style={{ color: "var(--xta-cyan)" }} /> {catCfg.label}
              </div>
            </div>
            <div><div className="font-terminal text-[9px] tracking-widest mb-1" style={{ color: "var(--xta-text-dim)" }}>ДОКАЗАТЕЛЬСТВА</div>
              <div className="flex gap-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="w-4 h-4 border rounded-sm" style={{ background: i < selected.evidence_count ? "var(--xta-green)" : "transparent", borderColor: i < selected.evidence_count ? "var(--xta-green)" : "var(--xta-border)" }} />
                ))}
              </div>
            </div>
          </div>
          <div className="border-t pt-3" style={{ borderColor: "var(--xta-border)" }}>
            <div className="font-terminal text-[9px] tracking-widest mb-1" style={{ color: "var(--xta-text-dim)" }}>МЕСТОПОЛОЖЕНИЕ</div>
            <div className="font-mono text-xs flex items-start gap-1.5" style={{ color: "var(--xta-text)" }}>
              <Icon name="MapPin" size={12} style={{ color: "var(--xta-amber)" }} className="mt-0.5 flex-shrink-0" />
              {selected.location}
            </div>
          </div>
          <div className="border-t pt-3" style={{ borderColor: "var(--xta-border)" }}>
            <div className="font-terminal text-[9px] tracking-widest mb-2" style={{ color: "var(--xta-text-dim)" }}>ОПИСАНИЕ</div>
            <p className="font-mono text-xs leading-relaxed" style={{ color: "var(--xta-text)" }}>{selected.description}</p>
          </div>
          <div className="border-t pt-3 flex justify-between items-center" style={{ borderColor: "var(--xta-border)" }}>
            <div>
              <div className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>Репортёр: <span style={{ color: "var(--xta-green)" }}>{selected.reporter_name}</span></div>
              <div className="font-terminal text-[9px] mt-1" style={{ color: "var(--xta-text-dim)" }}>
                {new Date(selected.created_at).toLocaleDateString("ru")}
              </div>
            </div>
            {selected.review_comment && (
              <div className="font-terminal text-[9px] text-right max-w-[140px]" style={{ color: "var(--xta-cyan)" }}>
                {selected.review_comment}
              </div>
            )}
          </div>
        </div>

        {/* Быстрая верификация прямо из карточки */}
        {isAdmin && (
          <div className="xta-panel p-3 space-y-2">
            <div className="font-terminal text-[9px] tracking-widest" style={{ color: "var(--xta-red)" }}>ВЕРДИКТ КОМАНДЫ X TEST</div>
            <div className="flex gap-2 flex-wrap">
              {[
                { s: "confirmed",    label: "✓ ПОДТВЕРДИТЬ",   color: "var(--xta-green)" },
                { s: "under_review", label: "⟳ НА ПРОВЕРКУ",   color: "var(--xta-cyan)" },
                { s: "denied",       label: "✕ ОПРОВЕРГНУТЬ",  color: "var(--xta-red)" },
              ].map(btn => (
                <button key={btn.s}
                  onClick={async () => {
                    await api.anomalies.review(selected.id, btn.s);
                    const { data } = await api.anomalies.get(selected.id);
                    if (data && typeof data === "object" && "id" in data) setSelected(data as ApiAnomaly);
                    loadAnomalies();
                  }}
                  className="font-terminal text-[9px] px-3 py-1.5 border rounded-sm transition-all"
                  style={{ color: btn.color, borderColor: btn.color }}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="font-terminal text-[10px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>
        РЕЕСТР АНОМАЛИЙ — КУРСКИЙ СЕКТОР
      </div>

      {resultMsg && (
        <div className="font-terminal text-[10px] px-3 py-2 border rounded-sm" style={{ color: "var(--xta-green)", borderColor: "var(--xta-green)", background: "rgba(0,255,106,0.05)" }}
          onClick={() => setResultMsg("")}>{resultMsg}</div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([["all", "ВСЕ", "var(--xta-text-dim)"], ["possible", "ВОЗМОЖНЫЕ", "var(--xta-amber)"], ["confirmed", "РЕАЛЬНЫЕ", "var(--xta-green)"], ["under_review", "ПРОВЕРКА", "var(--xta-cyan)"], ["denied", "ОПРОВЕРГНУТЫ", "var(--xta-red)"]] as const).map(([key, label, color]) => (
          <button key={key} onClick={() => setFilter(key)}
            className="font-terminal text-[9px] px-3 py-1.5 border rounded-sm whitespace-nowrap transition-all"
            style={{ color: filter === key ? "var(--xta-bg)" : color, borderColor: color, background: filter === key ? color : "transparent" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="xta-panel p-4 space-y-3 border" style={{ borderColor: "var(--xta-green)" }}>
          <div className="font-terminal text-[9px] tracking-widest" style={{ color: "var(--xta-green)" }}>НОВАЯ АНОМАЛИЯ</div>
          <input className="xta-input w-full px-3 py-2 text-xs rounded-sm" placeholder="Название аномалии" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <select className="xta-input w-full px-3 py-2 text-xs rounded-sm font-terminal" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as AnomalyCategory }))} style={{ background: "var(--xta-panel)" }}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input className="xta-input w-full px-3 py-2 text-xs rounded-sm" placeholder="Местоположение" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          <textarea className="xta-input w-full px-3 py-2 text-xs rounded-sm resize-none" rows={3} placeholder="Описание (что наблюдали, когда, показания приборов)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="flex gap-2">
            <button onClick={submit} disabled={sending} className="xta-btn flex-1 py-2 text-xs">{sending ? "ОТПРАВКА..." : "ПОДАТЬ СИГНАЛ"}</button>
            <button onClick={() => setShowForm(false)} className="xta-btn px-4 py-2 text-xs" style={{ borderColor: "var(--xta-red)", color: "var(--xta-red)" }}>✕</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="font-terminal text-[10px] text-center py-8" style={{ color: "var(--xta-text-dim)" }}>
            Аномалий не зафиксировано в этой категории
          </div>
        )}
        {filtered.map(anomaly => {
          const catCfg = CATEGORIES[anomaly.category] ?? CATEGORIES.electromagnetic;
          return (
            <button key={anomaly.id} onClick={() => setSelected(anomaly)} className="xta-panel w-full p-4 text-left space-y-2 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{anomaly.code}</span>
                  <Icon name={catCfg.icon} fallback="Zap" size={12} style={{ color: "var(--xta-cyan)" }} />
                </div>
                <StatusBadge status={anomaly.status} />
              </div>
              <div className="font-display text-sm font-medium" style={{ color: "var(--xta-text)" }}>{anomaly.title}</div>
              <div className="font-mono text-[10px] line-clamp-2" style={{ color: "var(--xta-text-dim)" }}>{anomaly.description}</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>
                  <Icon name="MapPin" size={10} /><span className="truncate max-w-[180px]">{anomaly.location.split(",")[0]}</span>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-sm" style={{ background: i < anomaly.evidence_count ? "var(--xta-green)" : "var(--xta-border)" }} />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="xta-btn w-full py-3 text-xs flex items-center justify-center gap-2">
          <Icon name="Plus" size={14} /> Сообщить о новой аномалии
        </button>
      )}
    </div>
  );
}

// ─── Profile Section ──────────────────────────────────────────────────────────

function ProfileSection({ user, onLogout }: { user: User; onLogout: () => void }) {
  const levelKeys = LEVEL_ORDER;
  const curIdx = levelKeys.indexOf(user.level);
  const nextLevel = levelKeys[curIdx + 1];
  const nextXP = nextLevel ? LEVELS[nextLevel].xp : LEVELS[user.level].xp;
  const progress = nextLevel ? Math.min((user.xp / nextXP) * 100, 100) : 100;

  const achievements = [
    { icon: "🔭", name: "Первый сигнал",   desc: "Сообщил о первой аномалии", unlocked: true },
    { icon: "🌑", name: "Ночной дозор",    desc: "5 ночных вылазок",           unlocked: false },
    { icon: "⚡", name: "Электрик",        desc: "3 EM-аномалии подтверждены", unlocked: false },
    { icon: "🗺️", name: "Следопыт",       desc: "10+ уникальных локаций",     unlocked: false },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="xta-panel corner-tl corner-br p-5">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-sm border-2 flex items-center justify-center font-display text-3xl font-bold flex-shrink-0"
            style={{ background: "var(--xta-green-dark)", borderColor: "var(--xta-green)", color: "var(--xta-green)", textShadow: "var(--xta-glow)" }}>
            {user.username[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-display text-xl font-bold tracking-wider mb-1" style={{ color: "var(--xta-text)" }}>{user.username}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <LevelBadge level={user.level} size="md" />
              {user.role !== "user" && (
                <span className="font-terminal text-[9px] px-2 py-0.5 border rounded-sm" style={{ color: "var(--xta-red)", borderColor: "var(--xta-red)" }}>
                  {user.role.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>ПРОГРЕСС</span>
            <span className="font-terminal text-[9px]" style={{ color: "var(--xta-green)" }}>
              {user.xp.toLocaleString()} XP {nextLevel && `/ ${nextXP.toLocaleString()}`}
            </span>
          </div>
          <div className="w-full h-2 rounded-sm border" style={{ borderColor: "var(--xta-border)", background: "var(--xta-bg)" }}>
            <div className="h-full rounded-sm" style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--xta-green-dark), var(--xta-green))", boxShadow: "var(--xta-glow)" }} />
          </div>
          {nextLevel && (
            <div className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>
              До <span style={{ color: LEVELS[nextLevel].color }}>{LEVELS[nextLevel].label}</span>: {(nextXP - user.xp).toLocaleString()} XP
            </div>
          )}
        </div>
      </div>

      <div className="xta-panel p-4">
        <div className="font-terminal text-[9px] tracking-widest mb-3" style={{ color: "var(--xta-text-dim)" }}>ПУТЬ СТАЛКЕРА</div>
        <div className="space-y-2">
          {levelKeys.map((key, i) => {
            const val = LEVELS[key];
            const isActive = key === user.level;
            const isPast = i < curIdx;
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full border flex-shrink-0" style={{ background: isPast || isActive ? val.color : "transparent", borderColor: val.color, boxShadow: isActive ? `0 0 10px ${val.color}` : "none" }} />
                <div className="flex-1 h-px" style={{ background: isPast ? val.color : "var(--xta-border)" }} />
                <span className="font-terminal text-[9px] w-32 text-right" style={{ color: isActive ? val.color : isPast ? `${val.color}88` : "var(--xta-text-dim)" }}>
                  {val.label} {isActive && <span className="animate-blink">◂</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="xta-panel p-4">
        <div className="font-terminal text-[9px] tracking-widest mb-3" style={{ color: "var(--xta-text-dim)" }}>ДОСТИЖЕНИЯ</div>
        <div className="grid grid-cols-2 gap-2">
          {achievements.map((a, i) => (
            <div key={i} className="flex gap-2 items-start p-2 border rounded-sm" style={{ borderColor: "var(--xta-border)", opacity: a.unlocked ? 1 : 0.4 }}>
              <span className="text-lg leading-none">{a.icon}</span>
              <div>
                <div className="font-terminal text-[10px]" style={{ color: "var(--xta-text)" }}>{a.name}</div>
                <div className="font-terminal text-[8px] mt-0.5" style={{ color: "var(--xta-text-dim)" }}>{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onLogout} className="xta-btn w-full py-3 text-xs flex items-center justify-center gap-2" style={{ borderColor: "var(--xta-red)", color: "var(--xta-red)" }}>
        <Icon name="LogOut" size={14} /> Выйти из сети
      </button>
    </div>
  );
}

// ─── Rating Section ───────────────────────────────────────────────────────────

function RatingSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    api.admin.users().then(({ data }) => { if (Array.isArray(data)) setUsers(data as AdminUser[]); });
  }, []);

  const sorted = [...users].sort((a, b) => b.xp - a.xp).slice(0, 20);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="font-terminal text-[10px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>
        РЕЙТИНГ ИССЛЕДОВАТЕЛЕЙ — СЕЗОН 2026
      </div>

      {sorted.length === 0 && (
        <div className="font-terminal text-[10px] text-center py-8" style={{ color: "var(--xta-text-dim)" }}>
          Пока никто не зарегистрирован
        </div>
      )}

      {sorted.length >= 3 && (
        <div className="xta-panel p-4">
          <div className="flex items-end justify-center gap-4 h-32">
            {[sorted[1], sorted[0], sorted[2]].filter(Boolean).map((u, i) => {
              const heights = ["h-20", "h-32", "h-16"];
              const positions = ["#2", "#1", "#3"];
              const colors = ["var(--xta-text-dim)", "var(--xta-amber)", "var(--xta-text-dim)"];
              return (
                <div key={u.id} className="flex flex-col items-center gap-1">
                  <LevelBadge level={u.level} />
                  <div className="font-terminal text-[10px]" style={{ color: LEVELS[u.level]?.color }}>{u.username}</div>
                  <div className={`${heights[i]} w-14 flex items-center justify-center font-display text-2xl font-bold border`}
                    style={{ background: "var(--xta-panel)", borderColor: colors[i], color: colors[i] }}>
                    {positions[i]}
                  </div>
                  <div className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{u.xp.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="xta-panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--xta-border)" }}>
              {["#", "Сталкер", "Уровень", "XP"].map(h => (
                <th key={h} className="font-terminal text-[9px] tracking-widest text-left px-3 py-2" style={{ color: "var(--xta-text-dim)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((u, i) => (
              <tr key={u.id} className="border-b" style={{ borderColor: "var(--xta-border)", background: i % 2 === 0 ? "rgba(0,255,106,0.02)" : "transparent" }}>
                <td className="font-terminal text-[10px] px-3 py-2.5" style={{ color: i < 3 ? "var(--xta-amber)" : "var(--xta-text-dim)" }}>
                  {i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}
                </td>
                <td className="font-terminal text-[10px] px-3 py-2.5 font-bold" style={{ color: LEVELS[u.level]?.color }}>{u.username}</td>
                <td className="px-3 py-2.5"><LevelBadge level={u.level} /></td>
                <td className="font-terminal text-[10px] px-3 py-2.5" style={{ color: "var(--xta-text)" }}>{u.xp.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Map Section ──────────────────────────────────────────────────────────────

function MapSection() {
  const [anomalies, setAnomalies] = useState<ApiAnomaly[]>([]);

  useEffect(() => {
    api.anomalies.list().then(({ data }) => { if (Array.isArray(data)) setAnomalies(data as ApiAnomaly[]); });
  }, []);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="font-terminal text-[10px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>
        КАРТА АНОМАЛИЙ — КУРСКАЯ ОБЛАСТЬ
      </div>
      <div className="xta-panel p-3 flex flex-wrap gap-4">
        {(Object.entries(STATUS_CONFIG) as [AnomalyStatus, typeof STATUS_CONFIG[AnomalyStatus]][]).map(([key, val]) => (
          <div key={key} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: val.color, boxShadow: `0 0 6px ${val.color}` }} />
            <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{val.label}</span>
          </div>
        ))}
      </div>
      <div className="xta-panel scanlines relative overflow-hidden" style={{ height: 380 }}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(0,255,106,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,106,0.05) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="absolute left-0 right-0 h-0.5 z-20 pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, var(--xta-green), transparent)", opacity: 0.5, animation: "scan-line 4s linear infinite" }} />
        <div className="absolute" style={{ inset: "10%", background: "rgba(0, 53, 21, 0.15)", borderRadius: "30% 40% 35% 45% / 40% 30% 45% 35%", border: "1px solid rgba(0,255,106,0.1)" }} />
        <div className="absolute font-terminal text-[9px] opacity-20" style={{ left: "45%", top: "44%", transform: "translate(-50%,-50%)", color: "var(--xta-green)" }}>КУРСК</div>
        {anomalies.filter(a => a.coords_x && a.coords_y).map(a => (
          <RadarDot key={a.id} x={a.coords_x} y={a.coords_y} status={a.status} id={a.code} />
        ))}
        {anomalies.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-terminal text-[10px]" style={{ color: "var(--xta-text-dim)" }}>Нет данных о координатах</span>
          </div>
        )}
        <div className="absolute bottom-2 left-3 font-terminal text-[8px]" style={{ color: "var(--xta-text-dim)" }}>51°44'N 36°11'E</div>
        <div className="absolute bottom-2 right-3 font-terminal text-[8px]" style={{ color: "var(--xta-text-dim)" }}>МАСШТАБ 1:500 000</div>
        <div className="absolute top-2 right-3 font-terminal text-[8px] animate-blink" style={{ color: "var(--xta-green)" }}>● ПРЯМОЙ ЭФИР</div>
      </div>
      <div className="space-y-2">
        {anomalies.map(a => (
          <div key={a.id} className="xta-panel p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_CONFIG[a.status]?.color, boxShadow: `0 0 8px ${STATUS_CONFIG[a.status]?.color}` }} />
            <div className="flex-1 min-w-0">
              <div className="font-terminal text-[10px] font-bold" style={{ color: "var(--xta-text)" }}>{a.code}</div>
              <div className="font-mono text-[10px] truncate" style={{ color: "var(--xta-text-dim)" }}>{a.title}</div>
            </div>
            <StatusBadge status={a.status} />
          </div>
        ))}
        {anomalies.length === 0 && <div className="font-terminal text-[10px] text-center" style={{ color: "var(--xta-text-dim)" }}>Аномалий пока нет</div>}
      </div>
    </div>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function getNavItems(user: User): { key: Section; icon: string; label: string }[] {
  const base = [
    { key: "home" as Section,      icon: "Radio",         label: "Главная" },
    { key: "chats" as Section,     icon: "MessageSquare", label: "Чаты" },
    { key: "anomalies" as Section, icon: "AlertTriangle", label: "Аномалии" },
    { key: "map" as Section,       icon: "Map",           label: "Карта" },
    { key: "rating" as Section,    icon: "Trophy",        label: "Рейтинг" },
    { key: "profile" as Section,   icon: "User",          label: "Профиль" },
  ];
  if (user.role === "admin" || user.role === "moderator") {
    base.push({ key: "admin" as Section, icon: "ShieldAlert", label: "Центр" });
  }
  return base;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function Index() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [section, setSection] = useState<Section>("home");

  useEffect(() => {
    const saved = localStorage.getItem("xta_user");
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch { /* ok */ }
    }
    api.auth.me().then(({ status, data }) => {
      if (status === 200 && data && typeof data === "object" && "user" in data) {
        const u = (data as { user: User }).user;
        setUser(u);
        localStorage.setItem("xta_user", JSON.stringify(u));
      } else {
        removeSession();
        setUser(null);
        localStorage.removeItem("xta_user");
      }
      setAuthChecked(true);
    });
  }, []);

  function handleLogin(u: User, _sid: string) {
    setUser(u);
    localStorage.setItem("xta_user", JSON.stringify(u));
  }

  async function handleLogout() {
    await api.auth.logout();
    removeSession();
    setUser(null);
    localStorage.removeItem("xta_user");
    setSection("home");
  }

  if (!authChecked && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--xta-bg)" }}>
        <div className="font-terminal text-sm animate-blink" style={{ color: "var(--xta-green)" }}>
          ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ...
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen onLogin={handleLogin} />;

  const navItems = getNavItems(user);

  const renderSection = () => {
    switch (section) {
      case "home":      return <HomeSection user={user} />;
      case "chats":     return <ChatsSection user={user} />;
      case "anomalies": return <AnomaliesSection user={user} />;
      case "map":       return <MapSection />;
      case "rating":    return <RatingSection />;
      case "profile":   return <ProfileSection user={user} onLogout={handleLogout} />;
      case "admin":     return (user.role === "admin" || user.role === "moderator") ? <AdminPanel currentUser={user} /> : null;
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--xta-bg)" }}>
      <div className="sticky top-0 z-50 border-b" style={{ background: "rgba(3,10,5,0.95)", borderColor: "var(--xta-border)", backdropFilter: "blur(10px)" }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-bold tracking-widest leading-none" style={{ color: "var(--xta-green)", textShadow: "var(--xta-glow)" }}>X TEST</div>
            <div className="font-terminal text-[8px] tracking-[0.3em]" style={{ color: "var(--xta-text-dim)" }}>ANOMALIES</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-terminal text-[8px] flex items-center gap-1.5" style={{ color: "var(--xta-text-dim)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: "var(--xta-green)" }} />
              {user.username}
            </div>
            <div className="flex items-center gap-1.5">
              <LevelBadge level={user.level} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        {renderSection()}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t" style={{ background: "rgba(3,10,5,0.97)", borderColor: "var(--xta-border)", backdropFilter: "blur(10px)" }}>
        <div className="max-w-lg mx-auto flex">
          {navItems.map(item => {
            const isActive = section === item.key;
            const isAdmin = item.key === "admin";
            return (
              <button key={item.key} onClick={() => setSection(item.key)}
                className="flex-1 flex flex-col items-center py-3 gap-1 transition-all"
                style={{
                  color: isActive ? (isAdmin ? "var(--xta-red)" : "var(--xta-green)") : "var(--xta-text-dim)",
                  borderTop: isActive ? `2px solid ${isAdmin ? "var(--xta-red)" : "var(--xta-green)"}` : "2px solid transparent",
                  background: isActive ? (isAdmin ? "rgba(255,34,68,0.03)" : "rgba(0,255,106,0.03)") : "transparent",
                }}>
                <Icon name={item.icon} fallback="Circle" size={18} />
                <span className="font-terminal text-[8px] tracking-wider">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
