import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = "home" | "chats" | "anomalies" | "profile" | "rating" | "map";
type AnomalyStatus = "possible" | "confirmed" | "denied" | "under_review";
type AnomalyCategory = "electromagnetic" | "gravitational" | "biological" | "acoustic" | "visual" | "chemical";
type UserLevel = "seeker" | "observer" | "hunter" | "stalker" | "tester" | "x_tester";

interface Message {
  id: number;
  author: string;
  level: UserLevel;
  text: string;
  time: string;
  isSystem?: boolean;
}

interface Chat {
  id: number;
  name: string;
  lastMsg: string;
  time: string;
  unread: number;
  type: "general" | "team" | "field";
}

interface Anomaly {
  id: string;
  title: string;
  category: AnomalyCategory;
  status: AnomalyStatus;
  location: string;
  reporter: string;
  date: string;
  description: string;
  evidence: number;
  coords: { x: number; y: number };
}

interface RankUser {
  rank: number;
  name: string;
  level: UserLevel;
  points: number;
  anomalies: number;
  badge?: string;
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
  possible:     { label: "ВОЗМОЖНАЯ",      color: "#ffb300" },
  confirmed:    { label: "ПОДТВЕРЖДЕНА",   color: "#00ff6a" },
  denied:       { label: "ОПРОВЕРГНУТА",   color: "#ff2244" },
  under_review: { label: "НА ПРОВЕРКЕ",    color: "#00e5ff" },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CHATS: Chat[] = [
  { id: 1, name: "# общий_эфир",      lastMsg: "Сегодня ночью в районе Сейма зафиксировали...", time: "23:41", unread: 7, type: "general" },
  { id: 2, name: "⚑ x_test_команда",  lastMsg: "Экспедиция подтверждена. Выезд в 05:00", time: "22:15", unread: 2, type: "team" },
  { id: 3, name: "§ полевой_отчёт",   lastMsg: "Образцы отправлены в лабораторию", time: "20:08", unread: 0, type: "field" },
  { id: 4, name: "# аномалии_курск",  lastMsg: "Новые координаты: 51.7°N 36.2°E", time: "18:33", unread: 12, type: "general" },
  { id: 5, name: "# байки_зоны",      lastMsg: "Дед Митрич рассказал про болото у Золотухино", time: "15:00", unread: 0, type: "general" },
];

const MOCK_MESSAGES: Message[] = [
  { id: 1, author: "SYSTEM",       level: "x_tester", text: "// ЗАЩИЩЁННЫЙ КАНАЛ АКТИВИРОВАН // ДОБРО ПОЖАЛОВАТЬ В ЭФИР //", time: "00:00", isSystem: true },
  { id: 2, author: "Призрак_51",   level: "stalker",  text: "Был на точке у Сейма. Компас вёл себя странно — стрелка крутилась по часовой. Записал всё на видео.", time: "22:47" },
  { id: 3, author: "NovaTester",   level: "x_tester", text: "Принято. Это классический электромагнитный всплеск. Отправь координаты, внесём в базу как возможную.", time: "22:51" },
  { id: 4, author: "Лис_Курский",  level: "hunter",   text: "У меня аналогичный случай был в апреле. Там ещё птицы не летели над этим местом.", time: "22:53" },
  { id: 5, author: "ZeroPoint",    level: "observer",  text: "Жду апдейт по аномалии #KRS-047. Что с анализом грунта?", time: "23:01" },
  { id: 6, author: "NovaTester",   level: "x_tester", text: "Лаборатория даст ответ через 48ч. Пока статус — на проверке.", time: "23:05" },
  { id: 7, author: "Призрак_51",   level: "stalker",  text: "Координаты в личку скинул. Туда лучше ночью не соваться в одиночку.", time: "23:12" },
  { id: 8, author: "МолчаливыйМ",  level: "seeker",   text: "Принял. Записался в следующую экспедицию.", time: "23:18" },
  { id: 9, author: "Лис_Курский",  level: "hunter",   text: "Хорошее решение. Новичкам — только в группе. Правила зоны.", time: "23:20" },
  { id: 10, author: "NovaTester",  level: "x_tester", text: "Аномалия #KRS-051 подтверждена командой X Test. Добавлена в официальный реестр. Координаты открыты для участников уровня ОХОТНИК и выше.", time: "23:40" },
];

const MOCK_ANOMALIES: Anomaly[] = [
  {
    id: "KRS-047",
    title: "Магнитная аномалия у р. Сейм",
    category: "electromagnetic",
    status: "under_review",
    location: "Курский р-н, р. Сейм, 3.2км от с. Полевое",
    reporter: "Призрак_51",
    date: "14.03.2026",
    description: "Компасное отклонение до 180°. Птицы избегают зону. Радиус аномальной зоны ~40м. Зафиксированы помехи в диапазоне 150-400МГц.",
    evidence: 3,
    coords: { x: 62, y: 35 },
  },
  {
    id: "KRS-051",
    title: "Акустический феномен «Золотухино»",
    category: "acoustic",
    status: "confirmed",
    location: "Золотухинский р-н, 7км северо-восток от пос.",
    reporter: "Лис_Курский",
    date: "08.03.2026",
    description: "Инфразвуковые колебания 8-12Гц. Наблюдатели отмечают тревогу и дезориентацию. Источник не установлен. Подтверждена командой X Test.",
    evidence: 6,
    coords: { x: 75, y: 28 },
  },
  {
    id: "KRS-038",
    title: "Биолюминесцентное поле «Марьина Роща»",
    category: "biological",
    status: "possible",
    location: "Кореневский р-н, урочище Марьина Роща",
    reporter: "ZeroPoint",
    date: "01.03.2026",
    description: "Ночное свечение почвы голубовато-зелёного оттенка. Диаметр ≈200м. Возможно — биолюминесцентные микроорганизмы или радиационный след.",
    evidence: 2,
    coords: { x: 30, y: 55 },
  },
  {
    id: "KRS-044",
    title: "Гравитационный сдвиг «Стрелецкое»",
    category: "gravitational",
    status: "denied",
    location: "г. Курск, Стрелецкое шоссе, км 14",
    reporter: "МолчаливыйМ",
    date: "22.02.2026",
    description: "Сообщения о «наклонённом» ощущении при движении по трассе. После проверки командой — объяснено оптической иллюзией рельефа.",
    evidence: 1,
    coords: { x: 50, y: 48 },
  },
  {
    id: "KRS-055",
    title: "Электростатическое поле «Тускарь»",
    category: "electromagnetic",
    status: "possible",
    location: "г. Курск, поймы р. Тускарь",
    reporter: "Призрак_51",
    date: "13.03.2026",
    description: "Статические разряды на металлических предметах. Волосы электризуются. Время проявления — рассвет и закат. Цикличность 24ч.",
    evidence: 4,
    coords: { x: 55, y: 60 },
  },
];

const MOCK_RATING: RankUser[] = [
  { rank: 1, name: "NovaTester",   level: "x_tester", points: 38450, anomalies: 27, badge: "⬛" },
  { rank: 2, name: "Призрак_51",   level: "stalker",  points: 12100, anomalies: 15 },
  { rank: 3, name: "Лис_Курский",  level: "stalker",  points: 9870,  anomalies: 12 },
  { rank: 4, name: "ZeroPoint",    level: "hunter",   points: 6200,  anomalies: 8 },
  { rank: 5, name: "Sentinel_X",   level: "hunter",   points: 5410,  anomalies: 7 },
  { rank: 6, name: "МолчаливыйМ",  level: "observer", points: 2100,  anomalies: 3 },
  { rank: 7, name: "К0Р0ЛЁВ",      level: "observer", points: 1850,  anomalies: 2 },
  { rank: 8, name: "Вела",         level: "seeker",   points: 800,   anomalies: 1 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LevelBadge({ level, size = "sm" }: { level: UserLevel; size?: "sm" | "md" | "lg" }) {
  const cfg = LEVELS[level];
  const sizes = { sm: "text-[9px] px-1.5 py-0.5", md: "text-[10px] px-2 py-0.5", lg: "text-xs px-3 py-1" };
  return (
    <span
      className={`font-terminal tracking-widest border ${sizes[size]} rounded-sm`}
      style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}15` }}
    >
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: AnomalyStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="font-terminal text-[9px] tracking-widest px-2 py-0.5 border rounded-sm"
      style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}15` }}
    >
      {cfg.label}
    </span>
  );
}

function RadarDot({ x, y, status, id }: { x: number; y: number; status: AnomalyStatus; id: string }) {
  const colors: Record<AnomalyStatus, string> = {
    confirmed: "#00ff6a", possible: "#ffb300", denied: "#ff2244", under_review: "#00e5ff"
  };
  const color = colors[status];
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
      <div className="relative">
        <div
          className="w-3 h-3 rounded-full border-2 cursor-pointer hover:scale-150 transition-transform z-10 relative"
          style={{ backgroundColor: color, borderColor: color, boxShadow: `0 0 10px ${color}` }}
          title={id}
        />
        <div
          className="absolute inset-0 rounded-full animate-radar"
          style={{ background: `radial-gradient(circle, ${color}44 0%, transparent 70%)` }}
        />
      </div>
    </div>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function HomeSection() {
  const stats = [
    { label: "Аномалий в базе",   value: "87",  sub: "+5 за неделю",   color: "var(--xta-green)" },
    { label: "Подтверждено",      value: "34",  sub: "командой X Test", color: "var(--xta-cyan)" },
    { label: "Участников",        value: "241", sub: "в сети 12",       color: "var(--xta-amber)" },
    { label: "Экспедиций",        value: "19",  sub: "в этом сезоне",   color: "var(--xta-green-dim)" },
  ];

  const news = [
    { tag: "ПОДТВЕРЖДЕНО",   title: "Акустический феномен «Золотухино» верифицирован", time: "8 марта",  color: "var(--xta-green)" },
    { tag: "ЭКСПЕДИЦИЯ",     title: "Выезд на р. Сейм запланирован на 20 марта",        time: "12 марта", color: "var(--xta-cyan)" },
    { tag: "НА ПРОВЕРКЕ",    title: "Новая аномалия #KRS-055 — Электростатика Тускаря", time: "13 марта", color: "var(--xta-amber)" },
    { tag: "ПРЕДУПРЕЖДЕНИЕ", title: "Зона #KRS-047 временно закрыта для одиночек",      time: "14 марта", color: "var(--xta-red)" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="xta-panel corner-tl corner-br p-6 relative overflow-hidden" style={{ minHeight: 180 }}>
        <div className="absolute right-6 top-4 opacity-10 pointer-events-none select-none" style={{ fontSize: 120, lineHeight: 1, fontFamily: "'Share Tech Mono'" }}>X</div>
        <div className="relative z-10">
          <div className="font-terminal text-[10px] tracking-[0.4em] mb-2" style={{ color: "var(--xta-text-dim)" }}>
            KURSK ANOMALY RESEARCH NETWORK // v2.1
          </div>
          <h1 className="font-display text-3xl font-bold tracking-widest mb-1" style={{ color: "var(--xta-green)", textShadow: "var(--xta-glow)" }}>
            X TEST ANOMALIES
          </h1>
          <div className="font-terminal text-xs mb-4" style={{ color: "var(--xta-text-dim)" }}>
            Курская область — активный сектор наблюдения
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
            <div className="font-terminal text-2xl font-bold" style={{ color: s.color, textShadow: `0 0 20px ${s.color}88` }}>
              {s.value}
            </div>
            <div className="font-terminal text-[10px] mt-1" style={{ color: "var(--xta-text)" }}>{s.label}</div>
            <div className="font-terminal text-[9px] mt-0.5" style={{ color: "var(--xta-text-dim)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="xta-panel p-4">
        <div className="font-terminal text-[10px] tracking-widest mb-4 pb-2 border-b flex items-center gap-2" style={{ color: "var(--xta-text-dim)", borderColor: "var(--xta-border)" }}>
          <Icon name="Radio" size={12} style={{ color: "var(--xta-green)" }} />
          ВХОДЯЩИЙ СИГНАЛ — ОПЕРАТИВНАЯ ЛЕНТА
        </div>
        <div className="space-y-3">
          {news.map((n, i) => (
            <div key={i} className="flex gap-3 items-start cursor-pointer">
              <div className="font-terminal text-[8px] px-1.5 py-0.5 border mt-0.5 whitespace-nowrap" style={{ color: n.color, borderColor: n.color }}>
                {n.tag}
              </div>
              <div>
                <div className="font-mono text-xs" style={{ color: "var(--xta-text)" }}>{n.title}</div>
                <div className="font-terminal text-[9px] mt-0.5" style={{ color: "var(--xta-text-dim)" }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="xta-panel p-4">
        <div className="font-terminal text-[10px] tracking-widest mb-4" style={{ color: "var(--xta-text-dim)" }}>
          ИЕРАРХИЯ СТАЛКЕРОВ — КУРСКОГО КРАЯ
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(LEVELS) as [UserLevel, typeof LEVELS[UserLevel]][]).map(([key, val]) => (
            <div key={key} className="text-center p-2 border rounded-sm" style={{ borderColor: `${val.color}33` }}>
              <div className="font-terminal text-[9px] tracking-widest" style={{ color: val.color }}>{val.label}</div>
              <div className="font-terminal text-[8px] mt-1" style={{ color: "var(--xta-text-dim)" }}>{val.xp.toLocaleString()} XP</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatsSection() {
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [msgInput, setMsgInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeChat) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [activeChat]);

  if (activeChat) {
    return (
      <div className="flex flex-col animate-fade-in" style={{ height: "calc(100vh - 140px)" }}>
        <div className="xta-panel p-3 flex items-center gap-3 mb-3">
          <button onClick={() => setActiveChat(null)} className="xta-btn p-1.5 rounded-sm">
            <Icon name="ChevronLeft" size={16} />
          </button>
          <div className="flex-1">
            <div className="font-terminal text-sm" style={{ color: "var(--xta-green)" }}>{activeChat.name}</div>
            <div className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>247 участников • 12 онлайн</div>
          </div>
          <Icon name="MoreVertical" size={16} style={{ color: "var(--xta-text-dim)" }} />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
          {MOCK_MESSAGES.map((msg) => (
            <div key={msg.id} className={msg.isSystem ? "text-center" : "animate-fade-in"}>
              {msg.isSystem ? (
                <span className="font-terminal text-[9px] tracking-widest px-3 py-1 border rounded-sm" style={{ color: "var(--xta-text-dim)", borderColor: "var(--xta-border)" }}>
                  {msg.text}
                </span>
              ) : (
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 font-terminal text-xs font-bold border" style={{ background: "var(--xta-green-dark)", borderColor: "var(--xta-border)", color: "var(--xta-green)" }}>
                    {msg.author[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-terminal text-[10px] font-bold" style={{ color: LEVELS[msg.level].color }}>{msg.author}</span>
                      <LevelBadge level={msg.level} />
                      <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{msg.time}</span>
                    </div>
                    <div className="font-mono text-xs leading-relaxed" style={{ color: "var(--xta-text)" }}>{msg.text}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="xta-panel p-2 flex gap-2 items-center">
          <input
            className="xta-input flex-1 text-xs px-3 py-2 rounded-sm"
            placeholder="Сообщение в эфир..."
            value={msgInput}
            onChange={(e) => setMsgInput(e.target.value)}
          />
          <button className="xta-btn p-2 rounded-sm">
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

      <div className="xta-panel p-3 flex gap-3 items-center mb-4">
        <Icon name="Search" size={14} style={{ color: "var(--xta-text-dim)" }} />
        <input className="xta-input flex-1 bg-transparent border-none text-xs outline-none" placeholder="Поиск каналов..." />
      </div>

      {MOCK_CHATS.map((chat) => (
        <button
          key={chat.id}
          onClick={() => setActiveChat(chat)}
          className="xta-panel w-full p-4 flex gap-3 items-center text-left transition-colors"
        >
          <div className="w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0 font-terminal text-lg border" style={{ background: "var(--xta-green-dark)", borderColor: "var(--xta-border)", color: "var(--xta-green)" }}>
            {chat.type === "team" ? "⚑" : chat.type === "field" ? "§" : "#"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-terminal text-sm" style={{ color: "var(--xta-green)" }}>{chat.name}</div>
            <div className="font-mono text-[11px] truncate mt-0.5" style={{ color: "var(--xta-text-dim)" }}>{chat.lastMsg}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{chat.time}</span>
            {chat.unread > 0 && (
              <span className="font-terminal text-[9px] px-1.5 py-0.5 rounded-sm min-w-[20px] text-center" style={{ background: "var(--xta-green)", color: "var(--xta-bg)" }}>
                {chat.unread}
              </span>
            )}
          </div>
        </button>
      ))}

      <button className="xta-btn w-full py-3 text-xs flex items-center justify-center gap-2 mt-4">
        <Icon name="Plus" size={14} /> Создать канал
      </button>
    </div>
  );
}

function AnomaliesSection() {
  const [selected, setSelected] = useState<Anomaly | null>(null);
  const [filter, setFilter] = useState<AnomalyStatus | "all">("all");

  const filtered = filter === "all" ? MOCK_ANOMALIES : MOCK_ANOMALIES.filter(a => a.status === filter);

  if (selected) {
    const catCfg = CATEGORIES[selected.category];
    return (
      <div className="animate-fade-in space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="xta-btn p-1.5 rounded-sm">
            <Icon name="ChevronLeft" size={16} />
          </button>
          <div className="font-terminal text-[10px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>
            ID: {selected.id}
          </div>
        </div>

        <div className="xta-panel corner-tl corner-br p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-semibold leading-tight" style={{ color: "var(--xta-text)" }}>{selected.title}</h2>
            <StatusBadge status={selected.status} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="font-terminal text-[9px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>КАТЕГОРИЯ</div>
              <div className="flex items-center gap-1.5 font-terminal text-xs" style={{ color: "var(--xta-text)" }}>
                <Icon name={catCfg.icon} fallback="Zap" size={12} style={{ color: "var(--xta-cyan)" }} />
                {catCfg.label}
              </div>
            </div>
            <div className="space-y-1">
              <div className="font-terminal text-[9px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>ДОКАЗАТЕЛЬСТВА</div>
              <div className="flex gap-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="w-4 h-4 border rounded-sm" style={{ background: i < selected.evidence ? "var(--xta-green)" : "transparent", borderColor: i < selected.evidence ? "var(--xta-green)" : "var(--xta-border)" }} />
                ))}
              </div>
            </div>
          </div>

          <div className="border-t pt-3 space-y-1" style={{ borderColor: "var(--xta-border)" }}>
            <div className="font-terminal text-[9px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>МЕСТОПОЛОЖЕНИЕ</div>
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
              <div className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>Репортёр: <span style={{ color: "var(--xta-green)" }}>{selected.reporter}</span></div>
              <div className="font-terminal text-[9px] mt-1" style={{ color: "var(--xta-text-dim)" }}>Дата: {selected.date}</div>
            </div>
            {selected.status === "under_review" && (
              <div className="font-terminal text-[9px] text-right" style={{ color: "var(--xta-cyan)" }}>
                Проверяется<br />командой X Test
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button className="xta-btn py-2 text-xs flex items-center justify-center gap-2">
            <Icon name="Upload" size={13} /> Добавить доказательство
          </button>
          <button className="xta-btn py-2 text-xs flex items-center justify-center gap-2" style={{ borderColor: "var(--xta-amber)", color: "var(--xta-amber)" }}>
            <Icon name="MapPin" size={13} /> На карте
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="font-terminal text-[10px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>
        РЕЕСТР АНОМАЛИЙ — КУРСКИЙ СЕКТОР
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["all",          "ВСЕ",           "var(--xta-text-dim)"],
            ["possible",     "ВОЗМОЖНЫЕ",     "var(--xta-amber)"],
            ["confirmed",    "РЕАЛЬНЫЕ",      "var(--xta-green)"],
            ["under_review", "ПРОВЕРКА",      "var(--xta-cyan)"],
            ["denied",       "ОПРОВЕРГНУТЫ",  "var(--xta-red)"],
          ] as const
        ).map(([key, label, color]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="font-terminal text-[9px] px-3 py-1.5 border rounded-sm whitespace-nowrap transition-all"
            style={{
              color: filter === key ? "var(--xta-bg)" : color,
              borderColor: color,
              background: filter === key ? color : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((anomaly) => {
          const catCfg = CATEGORIES[anomaly.category];
          return (
            <button
              key={anomaly.id}
              onClick={() => setSelected(anomaly)}
              className="xta-panel w-full p-4 text-left space-y-2 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{anomaly.id}</span>
                  <Icon name={catCfg.icon} fallback="Zap" size={12} style={{ color: "var(--xta-cyan)" }} />
                </div>
                <StatusBadge status={anomaly.status} />
              </div>
              <div className="font-display text-sm font-medium" style={{ color: "var(--xta-text)" }}>{anomaly.title}</div>
              <div className="font-mono text-[10px] line-clamp-2" style={{ color: "var(--xta-text-dim)" }}>{anomaly.description}</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>
                  <Icon name="MapPin" size={10} />
                  <span className="truncate max-w-[180px]">{anomaly.location.split(",")[0]}</span>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-sm" style={{ background: i < anomaly.evidence ? "var(--xta-green)" : "var(--xta-border)" }} />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button className="xta-btn w-full py-3 text-xs flex items-center justify-center gap-2">
        <Icon name="Plus" size={14} /> Сообщить о новой аномалии
      </button>
    </div>
  );
}

function ProfileSection() {
  const user = { name: "Призрак_51", level: "stalker" as UserLevel, xp: 12100, nextXp: 25000, anomalies: 15, expeditions: 8, joined: "Февраль 2025" };
  const progress = (user.xp / user.nextXp) * 100;
  const levelKeys = Object.keys(LEVELS) as UserLevel[];

  const achievements = [
    { icon: "🔭", name: "Первый сигнал",  desc: "Сообщил о первой аномалии" },
    { icon: "🌑", name: "Ночной дозор",   desc: "5 ночных вылазок" },
    { icon: "⚡", name: "Электрик",       desc: "3 EM-аномалии подтверждены" },
    { icon: "🗺️", name: "Следопыт",      desc: "10+ уникальных локаций" },
    { icon: "👁️", name: "Хранитель зоны", desc: "Участие в 5 экспедициях" },
    { icon: "🧪", name: "Лаборант",       desc: "Сдал 3 образца на анализ" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="xta-panel corner-tl corner-br p-5">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-sm border-2 flex items-center justify-center font-display text-3xl font-bold flex-shrink-0" style={{ background: "var(--xta-green-dark)", borderColor: "var(--xta-green)", color: "var(--xta-green)", textShadow: "var(--xta-glow)" }}>
            П
          </div>
          <div className="flex-1">
            <div className="font-display text-xl font-bold tracking-wider mb-1" style={{ color: "var(--xta-text)" }}>{user.name}</div>
            <LevelBadge level={user.level} size="md" />
            <div className="font-terminal text-[9px] mt-2" style={{ color: "var(--xta-text-dim)" }}>
              С нами с {user.joined}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <span className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>ПРОГРЕСС</span>
            <span className="font-terminal text-[9px]" style={{ color: "var(--xta-green)" }}>{user.xp.toLocaleString()} / {user.nextXp.toLocaleString()} XP</span>
          </div>
          <div className="w-full h-2 rounded-sm border" style={{ borderColor: "var(--xta-border)", background: "var(--xta-bg)" }}>
            <div className="h-full rounded-sm transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--xta-green-dark), var(--xta-green))", boxShadow: "var(--xta-glow)" }} />
          </div>
          <div className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>
            Следующий уровень: <span style={{ color: "var(--xta-cyan)" }}>СТАЛКЕР → ИСПЫТАТЕЛЬ</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { val: user.anomalies,  label: "Аномалий",   color: "var(--xta-green)" },
          { val: user.expeditions, label: "Экспедиций", color: "var(--xta-cyan)" },
          { val: 6,               label: "Достижений", color: "var(--xta-amber)" },
        ].map((s, i) => (
          <div key={i} className="xta-panel p-3 text-center">
            <div className="font-terminal text-xl font-bold" style={{ color: s.color }}>{s.val}</div>
            <div className="font-terminal text-[9px] mt-1" style={{ color: "var(--xta-text-dim)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="xta-panel p-4">
        <div className="font-terminal text-[9px] tracking-widest mb-3" style={{ color: "var(--xta-text-dim)" }}>ПУТЬ СТАЛКЕРА</div>
        <div className="space-y-2">
          {(Object.entries(LEVELS) as [UserLevel, typeof LEVELS[UserLevel]][]).map(([key, val], i) => {
            const isActive = key === user.level;
            const isPast = i < levelKeys.indexOf(user.level);
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full border flex-shrink-0" style={{
                  background: isPast || isActive ? val.color : "transparent",
                  borderColor: val.color,
                  boxShadow: isActive ? `0 0 10px ${val.color}` : "none"
                }} />
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
            <div key={i} className="flex gap-2 items-start p-2 border rounded-sm" style={{ borderColor: "var(--xta-border)" }}>
              <span className="text-lg leading-none">{a.icon}</span>
              <div>
                <div className="font-terminal text-[10px]" style={{ color: "var(--xta-text)" }}>{a.name}</div>
                <div className="font-terminal text-[8px] mt-0.5" style={{ color: "var(--xta-text-dim)" }}>{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RatingSection() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="font-terminal text-[10px] tracking-widest" style={{ color: "var(--xta-text-dim)" }}>
        РЕЙТИНГ ИССЛЕДОВАТЕЛЕЙ — СЕЗОН 2026
      </div>

      <div className="xta-panel p-4">
        <div className="flex items-end justify-center gap-4 h-32">
          {[MOCK_RATING[1], MOCK_RATING[0], MOCK_RATING[2]].map((u, i) => {
            const heights = ["h-20", "h-32", "h-16"];
            const positions = ["#2", "#1", "#3"];
            const colors = ["var(--xta-text-dim)", "var(--xta-amber)", "var(--xta-text-dim)"];
            return (
              <div key={u.rank} className="flex flex-col items-center gap-1">
                <LevelBadge level={u.level} />
                <div className="font-terminal text-[10px]" style={{ color: LEVELS[u.level].color }}>{u.name}</div>
                <div className={`${heights[i]} w-14 flex items-center justify-center font-display text-2xl font-bold border`}
                  style={{ background: "var(--xta-panel)", borderColor: colors[i], color: colors[i] }}>
                  {positions[i]}
                </div>
                <div className="font-terminal text-[9px]" style={{ color: "var(--xta-text-dim)" }}>{u.points.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="xta-panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--xta-border)" }}>
              {["#", "Сталкер", "Уровень", "XP", "Ан."].map((h) => (
                <th key={h} className="font-terminal text-[9px] tracking-widest text-left px-3 py-2" style={{ color: "var(--xta-text-dim)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_RATING.map((u, i) => (
              <tr key={u.rank} className="border-b transition-colors" style={{ borderColor: "var(--xta-border)", background: i % 2 === 0 ? "rgba(0,255,106,0.02)" : "transparent" }}>
                <td className="font-terminal text-[10px] px-3 py-2.5" style={{ color: u.rank <= 3 ? "var(--xta-amber)" : "var(--xta-text-dim)" }}>
                  {u.rank <= 3 ? ["🥇","🥈","🥉"][u.rank - 1] : u.rank}
                </td>
                <td className="font-terminal text-[10px] px-3 py-2.5 font-bold" style={{ color: LEVELS[u.level].color }}>
                  {u.name} {u.badge ?? ""}
                </td>
                <td className="px-3 py-2.5"><LevelBadge level={u.level} /></td>
                <td className="font-terminal text-[10px] px-3 py-2.5" style={{ color: "var(--xta-text)" }}>{u.points.toLocaleString()}</td>
                <td className="font-terminal text-[10px] px-3 py-2.5" style={{ color: "var(--xta-text-dim)" }}>{u.anomalies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapSection() {
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
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,106,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,106,0.05) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px"
        }} />

        <div className="absolute left-0 right-0 h-0.5 z-20 pointer-events-none" style={{
          background: "linear-gradient(90deg, transparent, var(--xta-green), transparent)",
          opacity: 0.5,
          animation: "scan-line 4s linear infinite",
        }} />

        <div className="absolute" style={{
          inset: "10%",
          background: "rgba(0, 53, 21, 0.15)",
          borderRadius: "30% 40% 35% 45% / 40% 30% 45% 35%",
          border: "1px solid rgba(0,255,106,0.1)"
        }} />

        <div className="absolute font-terminal text-[9px] opacity-20" style={{ left: "45%", top: "44%", transform: "translate(-50%,-50%)", color: "var(--xta-green)" }}>
          КУРСК
        </div>

        {MOCK_ANOMALIES.map((a) => (
          <RadarDot key={a.id} x={a.coords.x} y={a.coords.y} status={a.status} id={a.id} />
        ))}

        <div className="absolute bottom-2 left-3 font-terminal text-[8px]" style={{ color: "var(--xta-text-dim)" }}>
          51°44'N 36°11'E
        </div>
        <div className="absolute bottom-2 right-3 font-terminal text-[8px]" style={{ color: "var(--xta-text-dim)" }}>
          МАСШТАБ 1:500 000
        </div>
        <div className="absolute top-2 right-3 font-terminal text-[8px] animate-blink" style={{ color: "var(--xta-green)" }}>
          ● ПРЯМОЙ ЭФИР
        </div>
      </div>

      <div className="space-y-2">
        {MOCK_ANOMALIES.map((a) => (
          <div key={a.id} className="xta-panel p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_CONFIG[a.status].color, boxShadow: `0 0 8px ${STATUS_CONFIG[a.status].color}` }} />
            <div className="flex-1 min-w-0">
              <div className="font-terminal text-[10px] font-bold" style={{ color: "var(--xta-text)" }}>{a.id}</div>
              <div className="font-mono text-[10px] truncate" style={{ color: "var(--xta-text-dim)" }}>{a.title}</div>
            </div>
            <StatusBadge status={a.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_ITEMS: { key: Section; icon: string; label: string }[] = [
  { key: "home",      icon: "Radio",          label: "Главная" },
  { key: "chats",     icon: "MessageSquare",  label: "Чаты" },
  { key: "anomalies", icon: "AlertTriangle",  label: "Аномалии" },
  { key: "map",       icon: "Map",            label: "Карта" },
  { key: "rating",    icon: "Trophy",         label: "Рейтинг" },
  { key: "profile",   icon: "User",           label: "Профиль" },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function Index() {
  const [section, setSection] = useState<Section>("home");

  const renderSection = () => {
    switch (section) {
      case "home":      return <HomeSection />;
      case "chats":     return <ChatsSection />;
      case "anomalies": return <AnomaliesSection />;
      case "map":       return <MapSection />;
      case "rating":    return <RatingSection />;
      case "profile":   return <ProfileSection />;
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--xta-bg)" }}>
      <div
        className="sticky top-0 z-50 border-b"
        style={{ background: "rgba(3,10,5,0.95)", borderColor: "var(--xta-border)", backdropFilter: "blur(10px)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-bold tracking-widest leading-none" style={{ color: "var(--xta-green)", textShadow: "var(--xta-glow)" }}>
              X TEST
            </div>
            <div className="font-terminal text-[8px] tracking-[0.3em]" style={{ color: "var(--xta-text-dim)" }}>
              ANOMALIES
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-terminal text-[8px] flex items-center gap-1.5" style={{ color: "var(--xta-text-dim)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: "var(--xta-green)" }} />
              КУРСК
            </div>
            <button className="w-7 h-7 flex items-center justify-center border rounded-sm relative" style={{ borderColor: "var(--xta-border)" }}>
              <Icon name="Bell" size={14} style={{ color: "var(--xta-text-dim)" }} />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full text-[7px] flex items-center justify-center font-terminal" style={{ background: "var(--xta-green)", color: "var(--xta-bg)" }}>9</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        {renderSection()}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t"
        style={{ background: "rgba(3,10,5,0.97)", borderColor: "var(--xta-border)", backdropFilter: "blur(10px)" }}
      >
        <div className="max-w-lg mx-auto flex">
          {NAV_ITEMS.map((item) => {
            const isActive = section === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className="flex-1 flex flex-col items-center py-3 gap-1 transition-all"
                style={{
                  color: isActive ? "var(--xta-green)" : "var(--xta-text-dim)",
                  borderTop: isActive ? "2px solid var(--xta-green)" : "2px solid transparent",
                  background: isActive ? "rgba(0,255,106,0.03)" : "transparent",
                }}
              >
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