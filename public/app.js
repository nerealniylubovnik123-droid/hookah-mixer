const { useState, useEffect } = React;

let tg = window.Telegram?.WebApp || null;
let CURRENT_USER_ID = 0, CURRENT_USERNAME = "", CURRENT_USER_NAME = "Гость";
const ADMIN_USERNAMES = ["tutenhaman", "brgmnstrr"];
const ADMIN_IDS = [504348666, 2015942051];

try {
  if (tg && tg.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    CURRENT_USER_ID = u.id;
    CURRENT_USERNAME = (u.username || "").toLowerCase();
    CURRENT_USER_NAME = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Гость";
  }
} catch {}
const IS_ADMIN = ADMIN_USERNAMES.includes(CURRENT_USERNAME) || ADMIN_IDS.includes(CURRENT_USER_ID);

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const TASTE_COLORS = {
  "сладкий": "#f5a623",
  "кислый": "#f56d6d",
  "свежий": "#4fc3f7",
  "десертный": "#d18df0",
  "пряный": "#ff8c00",
  "чайный": "#c1b684",
  "алкогольный": "#a970ff",
  "гастрономический": "#90a955",
  "травяной": "#6ab04c"
};
const tasteColor = t => TASTE_COLORS[(t || "").toLowerCase()] || "#ccc";

function App() {
  const [tab, setTab] = useState("community");
  const [brands, setBrands] = useState([]);
  const [mixes, setMixes] = useState([]);
  const [likes, setLikes] = useState({});
  const [banned, setBanned] = useState([]);
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then(setBrands).catch(console.error);
    fetch("/api/mixes").then(r => r.json()).then(setMixes).catch(console.error);
    try { setBanned(JSON.parse(localStorage.getItem("bannedWords") || "[]")); } catch {}
  }, []);

  const reloadMixes = () => fetch("/api/mixes").then(r => r.json()).then(setMixes);

  const toggleLike = async (id) => {
    const already = !!likes[id];
    const delta = already ? -1 : 1;
    const r = await fetch(`/api/mixes/${id}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta })
    });
    const j = await r.json();
    if (j.success) {
      setMixes(ms => ms.map(m => m.id === id ? { ...m, likes: j.mix.likes } : m));
      setLikes(s => { const n = { ...s }; if (already) delete n[id]; else n[id] = 1; return n; });
    }
  };

  const deleteMix = async (id) => {
    if (!confirm("Удалить этот микс?")) return;
    const r = await fetch(`/api/mixes/${id}`, {
      method: "DELETE",
      headers: { "x-admin-id": CURRENT_USER_ID || "" }
    });
    const j = await r.json().catch(() => ({}));
    if (j.success) reloadMixes();
    else alert("⚠️ Ошибка удаления");
  };

  // === BUILDER ===
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState("");
  const total = parts.reduce((a, b) => a + b.percent, 0);
  const avg = parts.length && total > 0 ? Math.round(parts.reduce((a, p) => a + p.percent * p.strength, 0) / total) : 0;
  const remaining = Math.max(0, 100 - total);

  let tasteTotals = {};
  for (const p of parts) {
    if (!p.taste) continue;
    const t = p.taste.trim().toLowerCase();
    tasteTotals[t] = (tasteTotals[t] || 0) + p.percent;
  }
  let finalTaste = "—";
  if (Object.keys(tasteTotals).length) {
    const [mainTaste] = Object.entries(tasteTotals).sort((a, b) => b[1] - a[1])[0];
    finalTaste = mainTaste;
  }

  const addFlavor = (brandId, fl) => {
    if (remaining <= 0) return;
    const key = `${brandId}:${fl.id}`;
    setParts(p => p.some(x => x.key === key)
      ? p
      : [...p, { key, brandId, flavorId: fl.id, name: fl.name, taste: fl.taste, strength: fl.strength, percent: Math.min(20, remaining) }]
    );
  };

  const updatePct = (key, val) => {
    setParts(prev => {
      const sumOthers = prev.reduce((a, b) => a + (b.key === key ? 0 : b.percent), 0);
      const allowed = Math.max(0, 100 - sumOthers);
      const clamped = clamp(val, 0, allowed);
      return prev.map(x => x.key === key ? { ...x, percent: clamped } : x);
    });
  };

  const removePart = key => setParts(p => p.filter(x => x.key !== key));

  const saveMix = async () => {
    if (total !== 100) return alert("Сумма процентов должна быть 100%");
    const title = prompt("Введите название микса:");
    if (!title) return;
    const bad = banned.find(w => title.toLowerCase().includes(String(w).toLowerCase()));
    if (bad) return alert(`❌ Запрещённое слово: "${bad}"`);
    const mix = { name: title.trim(), author: CURRENT_USER_NAME, flavors: parts, avgStrength: avg, finalTaste };
    const r = await fetch("/api/mixes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mix) });
    const j = await r.json();
    if (j.success) { alert("✅ Микс сохранён"); setParts([]); reloadMixes(); }
  };

  // === COMMUNITY ===
  const tasteCategories = Array.from(new Set(mixes.map(m => (m.finalTaste || "").toLowerCase()).filter(Boolean)));
  const [pref, setPref] = useState("all");
  const [strength, setStrength] = useState(5);
  const filteredMixes = mixes
    .filter(m => pref === "all" || (m.finalTaste || "").toLowerCase().includes(pref))
    .filter(m => Math.abs((m.avgStrength || 0) - strength) <= 1);

  return (
    <div className="container">
      <header className="title">Кальянный Миксер</header>
      <div className="tabs">
        <button className={"tab-btn" + (tab === 'community' ? ' active' : '')} onClick={() => setTab('community')}>Миксы</button>
        <button className={"tab-btn" + (tab === 'builder' ? ' active' : '')} onClick={() => setTab('builder')}>Конструктор</button>
        {IS_ADMIN && <button className={"tab-btn" + (tab === 'admin' ? ' active' : '')} onClick={() => setTab('admin')}>Админ</button>}
      </div>

      {/* === COMMUNITY === */}
      {tab === 'community' && (
        <div className="card">
          <div className="hd"><h3>Рекомендации</h3><p className="desc">Выберите настроение и крепость</p></div>
          <div className="bd">
            <div className="grid-2">
              <button className={"btn " + (pref === 'all' ? 'accent' : '')} onClick={() => setPref('all')}>Все</button>
              {tasteCategories.map(t => (
                <button key={t} className={"btn " + (pref === t ? 'accent' : '')} onClick={() => setPref(t)}>{t}</button>
              ))}
            </div>
            <div className="sep"></div>
            <div>Крепость: <b>{strength}</b></div>
            <input type="range" min="1" max="10" value={strength} onChange={e => setStrength(+e.target.value)} />
            <div className="sep"></div>
            <div className="grid">
              {filteredMixes.map(m => (
                <div key={m.id} className="mix-card">
                  <div className="row between">
                    <div>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      <div className="tiny muted">от {m.author}</div>
                    </div>
                    <div className="row">
                      <button className={"btn small " + (likes[m.id] ? 'accent' : '')} onClick={() => toggleLike(m.id)}>❤ {m.likes}</button>
                      {IS_ADMIN && <button className="btn small danger" onClick={() => deleteMix(m.id)}>✕</button>}
                    </div>
                  </div>
                  <div className="tiny">Крепость: <b>{m.avgStrength}</b></div>
                  <div className="row" style={{ flexWrap: "wrap", gap: "6px", margin: "6px 0" }}>
                    <span className="badge" style={{ background: tasteColor(m.finalTaste), color: "#000", border: "none" }}>{m.finalTaste}</span>
                  </div>
                  <div className="tiny muted">Состав: {m.flavors.map(p => `${p.name} ${p.percent}%`).join(' + ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === BUILDER === */}
      {tab === "builder" && (
        <>
          <div className="card">
            <div className="hd"><h3>Бренды</h3></div>
            <div className="bd builder-brands">
              {brands.filter(b => !b.hidden).map(b => (
                <div
                  key={b.id}
                  className={"brand-card" + (collapsed[b.id] ? " open" : "")}
                  onClick={() => setCollapsed(c => ({ ...c, [b.id]: !c[b.id] }))}
                >
                  <div className="row between">
                    <h4>{b.name}</h4>
                    <span className={`arrow ${collapsed[b.id] ? "open" : ""}`}>▾</span>
                  </div>
                  {!collapsed[b.id] && (
                    <div className="flavor-list">
                      {b.flavors.filter(f => !f.hidden).map(f => (
                        <div key={f.id} className="flavor-item">
                          <div><b>{f.name}</b> <div className="tiny muted">{f.type} — {f.taste}</div></div>
                          <button className="btn" onClick={() => addFlavor(b.id, f)}>+ в микс</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="hd"><h3>Ваш микс</h3></div>
            <div className="bd grid">
              {parts.map(p => (
                <div key={p.key} className="mix-card">
                  <div className="row between">
                    <div><b>{p.name}</b><div className="tiny muted">{p.taste}</div></div>
                    <button className="btn small" onClick={() => removePart(p.key)}>×</button>
                  </div>
                  <input type="range" min="0" max="100" step="5" value={p.percent} onChange={e => updatePct(p.key, +e.target.value)} />
                  <div className="tiny muted">{p.percent}%</div>
                </div>
              ))}
              <div className="tiny muted">
                Итого: {total}% (осталось {100 - total}%) • Крепость {avg} • Вкус: {finalTaste}
              </div>
              <button className={"btn " + (total === 100 ? 'accent' : '')} onClick={saveMix} disabled={total !== 100}>Сохранить</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
