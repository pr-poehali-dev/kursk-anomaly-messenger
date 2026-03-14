const URLS = {
  auth:      "https://functions.poehali.dev/98a54f95-3537-4f94-8046-6dc1b78ba10d",
  anomalies: "https://functions.poehali.dev/f66fe2cf-7adf-4c50-9a53-eac93a0170cb",
  chats:     "https://functions.poehali.dev/ebf329b3-0329-426e-9855-be10ad214896",
  admin:     "https://functions.poehali.dev/7dc460c8-a4f1-4d17-967f-aed8bd89c805",
};

function getSessionId(): string {
  return localStorage.getItem("xta_session") || "";
}

function setSessionId(id: string) {
  localStorage.setItem("xta_session", id);
}

function removeSession() {
  localStorage.removeItem("xta_session");
  localStorage.removeItem("xta_user");
}

async function req(base: keyof typeof URLS, path: string, opts: RequestInit = {}) {
  const sid = getSessionId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(sid ? { "X-Session-Id": sid } : {}),
    ...(opts.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${URLS[base]}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  // Если бэкенд вернул JSON-строку — парсим ещё раз
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { /* ok */ }
  }
  return { status: res.status, data };
}

// Auth
export const api = {
  auth: {
    me: () => req("auth", "/"),
    register: (username: string, password: string) =>
      req("auth", "/register", { method: "POST", body: JSON.stringify({ username, password }) }),
    login: (username: string, password: string) =>
      req("auth", "/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    logout: () => req("auth", "/logout", { method: "POST" }),
  },
  anomalies: {
    list: (status?: string) => req("anomalies", status && status !== "all" ? `/?status=${status}` : "/"),
    get: (id: number) => req("anomalies", `/?id=${id}`),
    create: (data: Record<string, unknown>) =>
      req("anomalies", "/", { method: "POST", body: JSON.stringify(data) }),
    review: (anomaly_id: number, status: string, comment?: string) =>
      req("anomalies", "/review", { method: "POST", body: JSON.stringify({ anomaly_id, status, comment }) }),
  },
  chats: {
    list: () => req("chats", "/"),
    messages: (chat_id: number) => req("chats", `/?chat_id=${chat_id}`),
    send: (chat_id: number, text: string) =>
      req("chats", "/", { method: "POST", body: JSON.stringify({ chat_id, text }) }),
  },
  admin: {
    stats: () => req("admin", "/stats"),
    users: () => req("admin", "/users"),
    setRole: (user_id: number, role: string) =>
      req("admin", "/users/role", { method: "POST", body: JSON.stringify({ user_id, role }) }),
    setLevel: (user_id: number, level: string) =>
      req("admin", "/users/level", { method: "POST", body: JSON.stringify({ user_id, level }) }),
    ban: (user_id: number, banned: boolean) =>
      req("admin", "/users/ban", { method: "POST", body: JSON.stringify({ user_id, banned }) }),
    hideMessage: (message_id: number, hide: boolean) =>
      req("admin", "/messages/hide", { method: "POST", body: JSON.stringify({ message_id, hide }) }),
  },
};

export { getSessionId, setSessionId, removeSession };
