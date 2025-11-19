const { useState, useEffect, memo } = React;

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

function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

// Memoized Mix Card to reduce re-renders
const MixCard = memo(({ m, likes, toggleLike, shareMix, deleteMix, addComment, isRecommendation }) => {
  const [commentText, setCommentText] = useState('');
  return (
    <div key={m.id} className="mix-card card-soft">
      <div className="row between">
        <div>
          <div className="mix-title">{m.name}</div>
          <div className="tiny muted">от {m.author}</div>
        </div>
        <div className="row">
          <button className={"btn small like " + (likes[m.id] ? 'accent' : '')} onClick={() => toggleLike(m.id)}>❤ {m.likes}</button>
          <button className="btn small" onClick={() => shareMix(m)}>📤</button>
          {IS_ADMIN && <button className="btn small danger" onClick={() => deleteMix(m.id)}>✕</button>}
        </div>
      </div>
      <div className="tiny">Крепость: <b>{m.avgStrength}</b></div>
      <div className="row tag-row">
        <span className="badge tag" style={{ background: tasteColor(m.finalTaste), color: "#000", border: "none" }}>{m.finalTaste}</span>
      </div>
      <div className="tiny muted">Состав: {m.flavors.map(p => `${p.name} ${p.percent}%`).join(' + ')}</div>
      <div className="comments">
        {(m.comments || []).slice(0, 5).map(c => <div key={c.id} className="tiny muted">{c.author}: {c.text}</div>)}
        {m.comments?.length > 5 && <div className="tiny muted">...и ещё {m.comments.length - 5}</div>}
        <input className="input small" placeholder="Добавить комментарий" value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter' && commentText.trim()) {
            addComment(m.id, commentText);
            setCommentText('');
          }
        }} />
      </div>
    </div>
  );
});

function App() {
  const [tab, setTab] = useState("community");
  const [brands, setBrands] = useState([]);
  const [mixes, setMixes] = useState([]);
  const [likes, setLikes] = useState({});
  const [banned, setBanned] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [userPrefs, setUserPrefs] = useState({}); 
  const [userFlavors, setUserFlavors] = useState([]); 
  const [recommendations, setRecommendations] = useState([]); 
  const [stats, setStats] = useState({ topMixes: [], topTastes: [] }); 

  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then(data => {
      setBrands(data);
      const init = {};
      (data || []).forEach(b => { init[b.id] = true; });
      setCollapsed(init);
    }).catch(console.error);

    fetch("/api/mixes").then(r => r.json()).then(setMixes).catch(console.error);
    try { setBanned(JSON.parse(localStorage.getItem("bannedWords") || "[]")); } catch {}
    try { setUserPrefs(JSON.parse(localStorage.getItem("userPrefs") || "{}")); } catch {}
    try { setUserFlavors(JSON.parse(localStorage.getItem("userFlavors") || "[]")); } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/recommend?prefs=" + encodeURIComponent(JSON.stringify(userPrefs))).then(r => r.json()).then(setRecommendations).catch(console.error);
    fetch("/api/stats").then(r => r.json()).then(setStats).catch(console.error);
  }, [userPrefs, mixes]);

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
      const mix = mixes.find(m => m.id === id);
      if (mix && !already) {
        const newPrefs = { taste: mix.finalTaste, strength: mix.avgStrength };
        setUserPrefs(newPrefs);
        localStorage.setItem("userPrefs", JSON.stringify(newPrefs));
      }
    }
  };

  const addComment = async (id, text) => {
    if (!text.trim()) return;
    const r = await fetch(`/api/mixes/${id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, author: CURRENT_USER_NAME })
    });
    const j = await r.json();
    if (j.success) reloadMixes();
  };

  const shareMix = (mix) => {
    if (tg) {
      tg.shareUrl(`https://t.me/hookhanmix_bot?startapp=mix_${mix.id}`, `Check out this mix: ${mix.name}`);
    } else {
      alert("Share via link: https://your-app.com/mix/" + mix.id);
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

  const tasteTotals = useMemo(() => {
    let totals = {};
    for (const p of parts) {
      if (!p.taste) continue;
      const t = p.taste.trim().toLowerCase();
      totals[t] = (totals[t] || 0) + p.percent;
    }
    return totals;
  }, [parts]);

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
    const mix = { name: title.trim(), author: CURRENT_USER_NAME, flavors: parts, avgStrength: avg, finalTaste, comments: [] };
    const r = await fetch("/api/mixes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mix) });
    const j = await r.json();
    if (j.success) { alert("✅ Микс сохранён"); setParts([]); reloadMixes(); }
  };

  const generateFromMyFlavors = () => {
    if (!userFlavors.length) return alert("Добавьте свои вкусы сначала!");
    const numParts = Math.floor(Math.random() * 3) + 2; // 2-4 вкуса
    const selected = userFlavors.sort(() => 0.5 - Math.random()).slice(0, numParts);
    let pctLeft = 100;
    const newParts = selected.map((fl, i) => {
      const pct = i === numParts - 1 ? pctLeft : Math.floor(Math.random() * (pctLeft - (numParts - i - 1) * 10)) + 10;
      pctLeft -= pct;
      return { key: fl.key, brandId: fl.brandId, flavorId: fl.flavorId, name: fl.name, taste: fl.taste, strength: fl.strength, percent: pct };
    });
    setParts(newParts);
  };

  const addUserFlavor = (brandId, fl) => {
    const key = `${brandId}:${fl.id}`;
    if (userFlavors.some(f => f.key === key)) return;
    const newFlavor = { key, brandId, flavorId: fl.id, name: fl.name, taste: fl.taste, strength: fl.strength };
    const newList = [...userFlavors, newFlavor];
    setUserFlavors(newList);
    localStorage.setItem("userFlavors", JSON.stringify(newList));
  };

  const removeUserFlavor = (key) => {
    const newList = userFlavors.filter(f => f.key !== key);
    setUserFlavors(newList);
    localStorage.setItem("userFlavors", JSON.stringify(newList));
  };

  // === ADMIN ===
  const [brandName, setBrandName] = useState("");
  const [flavorName, setFlavorName] = useState("");
  const [flavorTaste, setFlavorTaste] = useState("");
  const [flavorType, setFlavorType] = useState("");
  const [flavorStrength, setFlavorStrength] = useState(5);
  const [brandForFlavor, setBrandForFlavor] = useState("");

  const saveLibrary = async (lib) => {
    await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-id": CURRENT_USER_ID || "" }, body: JSON.stringify(lib) });
  };

  const addBrand = () => {
    const name = brandName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-");
    const newLib = [...brands, { id, name, hidden: false, flavors: [] }];
    setBrands(newLib);
    saveLibrary(newLib);
    setBrandName("");
  };

  const addFlavorAdmin = () => {
    const b = brands.find(x => x.id === brandForFlavor);
    if (!b) return;
    const name = flavorName.trim();
    if (!name) return;
    const fl = {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      type: flavorType,
      strength: flavorStrength,
      taste: flavorTaste,
      hidden: false
    };
    const newLib = brands.map(x => x.id === b.id ? { ...x, flavors: [...x.flavors, fl] } : x);
    setBrands(newLib);
    saveLibrary(newLib);
    setFlavorName(""); setFlavorType(""); setFlavorTaste("");
  };

  const toggleHidden = (bid, fid) => {
    const newLib = brands.map(b => {
      if (b.id !== bid) return b;
      if (!fid) return { ...b, hidden: !b.hidden };
      return { ...b, flavors: b.flavors.map(f => f.id === fid ? { ...f, hidden: !f.hidden } : f) };
    });
    setBrands(newLib); saveLibrary(newLib);
  };

  const delBrand = id => {
    const newLib = brands.filter(b => b.id !== id);
    setBrands(newLib);
    saveLibrary(newLib);
  };

  const deleteFlavor = (bid, fid) => {
    if (!confirm("Удалить этот вкус?")) return;
    const newLib = brands.map(b => b.id === bid ? { ...b, flavors: b.flavors.filter(f => f.id !== fid) } : b);
    setBrands(newLib);
    saveLibrary(newLib);
  };

  // === COMMUNITY (Миксы) ===
  const tasteCategories = useMemo(() => Array.from(new Set(mixes.map(m => (m.finalTaste || "").toLowerCase()).filter(Boolean))), [mixes]);
  const [pref, setPref] = useState("all");
  const [strengthFilter, setStrengthFilter] = useState(5);
  const filtered = useMemo(() => mixes
    .filter(m => pref === "all" || (m.finalTaste || "").toLowerCase().includes(pref))
    .filter(m => Math.abs((m.avgStrength || 0) - strengthFilter) <= 1)
    .sort((a, b) => (b.likes || 0) - (a.likes || 0)), [mixes, pref, strengthFilter]);

  // === TIPS (Фича 7) ===
  const tips = [
    { title: "Как забивать чашу", content: "Используйте фольгу или kalaud для равномерного жара. Не пережимайте табак, чтобы воздух проходил свободно." },
    { title: "Лучшие угли", content: "Кокосовые угли горят дольше и дают чистый жар. Разогревайте 3-4 штуки на плитке 5-7 минут." },
    { title: "Безопасность", content: "Не курите в закрытых помещениях без вентиляции. Пейте воду, чтобы избежать обезвоживания." },
    { title: "Новичкам", content: "Начните с лёгких вкусов (фрукты), крепость 3-5. Экспериментируйте с 2-3 вкусами в миксе." }
  ];

  return (
    <div className="container app-theme">
      <header className="title with-icon">Кальянный Миксер</header>

      {/* Вкладки — добавлены Trends и Tips */}
      <div className="tabs glass">
        <button className={"tab-btn" + (tab === 'community' ? ' active' : '')} onClick={() => setTab('community')}>
          <span className="ico ico-star"></span>Миксы
        </button>
        <button className={"tab-btn" + (tab === 'builder' ? ' active' : '')} onClick={() => setTab('builder')}>
          <span className="ico ico-drop"></span>Конструктор
        </button>
        <button className={"tab-btn" + (tab === 'trends' ? ' active' : '')} onClick={() => setTab('trends')}>
          <span className="ico ico-flame"></span>Тренды
        </button>
        <button className={"tab-btn" + (tab === 'tips' ? ' active' : '')} onClick={() => setTab('tips')}>
          <span className="ico ico-shield"></span>Советы
        </button>
        {IS_ADMIN && <button className={"tab-btn" + (tab === 'admin' ? ' active' : '')} onClick={() => setTab('admin')}>
          <span className="ico ico-shield"></span>Админ
        </button>}
      </div>

      {/* === COMMUNITY === */}
      {tab === 'community' && (
        <div>
          <div className="card glow">
            <div className="hd">
              <h3 className="h3 with-ico-star">Для вас</h3>
              <p className="desc">Персональные рекомендации на основе ваших лайков</p>
            </div>
            <div className="bd grid">
              {recommendations.length ? recommendations.map(m => (
                <MixCard key={m.id} m={m} likes={likes} toggleLike={toggleLike} shareMix={shareMix} deleteMix={deleteMix} addComment={addComment} isRecommendation={true} />
              )) : <p className="muted">Лайкайте миксы, чтобы получить рекомендации!</p>}
            </div>
          </div>
          <div className="card glow">
            <div className="hd">
              <h3 className="h3 with-ico-star">Рекомендации</h3>
              <p className="desc">Выберите настроение и крепость</p>
            </div>
            <div className="bd">
              <div className="grid-2">
                <button className={"btn " + (pref === 'all' ? 'accent' : '')} onClick={() => setPref('all')}>Все</button>
                {tasteCategories.map(t => (
                  <button key={t} className={"btn " + (pref === t ? 'accent' : '')} onClick={() => setPref(t)}>{t}</button>
                ))}
              </div>
              <div className="sep"></div>
              <div className="slider-row">
                <span className="control"><span className="ico ico-drop"></span>Крепость: <b>{strengthFilter}</b></span>
                <input type="range" min="1" max="10" value={strengthFilter} onChange={e => setStrengthFilter(+e.target.value)} />
              </div>
              <div className="sep"></div>
              <div className="grid">
                {filtered.map(m => (
                  <MixCard key={m.id} m={m} likes={likes} toggleLike={toggleLike} shareMix={shareMix} deleteMix={deleteMix} addComment={addComment} isRecommendation={false} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === BUILDER === */}
      {tab === "builder" && (
        <>
          <div className="card glow">
            <div className="hd"><h3 className="h3 with-ico-drop">Поиск по всем вкусам</h3></div>
            <div className="bd">
              <input className="input" placeholder="Введите вкус (малина, клубника...)" value={search} onChange={debounce(e => setSearch(e.target.value.toLowerCase()), 300)} />
              {search && (
                <div className="search-results">
                  {brands.flatMap(b =>
                    b.hidden ? [] :
                      b.flavors
                        .filter(f => !f.hidden)
                        .filter(f => {
                          const q = search.toLowerCase();
                          return (
                            (f.name || "").toLowerCase().includes(q) ||
                            (f.type || "").toLowerCase().includes(q) ||
                            (f.taste || "").toLowerCase().includes(q)
                          );
                        })
                        .map(f => (
                          <div key={`${b.id}-${f.id}`} className="flavor-item soft">
                            <div><b>{b.name}</b> — {f.name} <div className="tiny muted">{f.type} — {f.taste}</div></div>
                            <button className="btn" onClick={() => addFlavor(b.id, f)}>+ в микс</button>
                            <button className="btn small" onClick={() => addUserFlavor(b.id, f)}>В мои вкусы</button>
                          </div>
                        ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card glow">
            <div className="hd"><h3 className="h3 with-ico-flame">Бренды</h3></div>
            <div className="bd brands-grid">
              {brands.filter(b => !b.hidden).map(b => (
                <div key={b.id} className="mix-card brand-box" onClick={() => setCollapsed(c => ({ ...c, [b.id]: !c[b.id] }))}>
                  <div className="row between brand-head" style={{ cursor: "pointer" }}>
                    <b className="brand-name"><span className="ico ico-flame"></span>{b.name}</b>
                    <span className="tiny arrow">{collapsed[b.id] ? "▼" : "▲"}</span>
                  </div>
                  {!collapsed[b.id] && (
                    <div className="flavor-list">
                      {b.flavors.filter(f => !f.hidden).map(f => (
                        <div key={f.id} className="flavor-item soft">
                          <div><b>{f.name}</b> <div className="tiny muted">{f.type} — {f.taste}</div></div>
                          <button className="btn" onClick={(e) => { e.stopPropagation(); addFlavor(b.id, f); }}>+ в микс</button>
                          <button className="btn small" onClick={(e) => { e.stopPropagation(); addUserFlavor(b.id, f); }}>В мои вкусы</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card glow">
            <div className="hd"><h3 className="h3">Мои вкусы</h3></div>
            <div className="bd">
              {userFlavors.map(f => (
                <div key={f.key} className="flavor-item soft">
                  <div><b>{f.name}</b> <div className="tiny muted">{f.taste}</div></div>
                  <button className="btn small" onClick={() => removeUserFlavor(f.key)}>×</button>
                </div>
              ))}
              <button className="btn accent" onClick={generateFromMyFlavors}>Генерировать микс из моих вкусов</button>
            </div>
          </div>

          <div className="card glow">
            <div className="hd"><h3 className="h3 with-ico-star">Ваш микс</h3></div>
            <div className="bd grid">
              {parts.map(p => (
                <div key={p.key} className="mix-card soft">
                  <div className="row between">
                    <div><b>{p.name}</b><div className="tiny muted">{p.taste}</div></div>
                    <button className="btn small" onClick={() => removePart(p.key)}>×</button>
                  </div>
                  <input type="range" min="0" max="100" step="5" value={p.percent} onChange={e => updatePct(p.key, +e.target.value)} />
                  <div className="tiny muted">{p.percent}%</div>
                </div>
              ))}
              <div className="tiny muted">
                Итого: {total}% (осталось {remaining}%) • Крепость {avg} • Вкус: {finalTaste}
              </div>
              <button className={"btn accent save-btn"} onClick={saveMix} disabled={total !== 100}><span className="ico ico-star"></span>Сохранить</button>
            </div>
          </div>
        </>
      )}

      {/* === TRENDS === */}
      {tab === 'trends' && (
        <div className="card glow">
          <div className="hd">
            <h3 className="h3 with-ico-flame">Тренды</h3>
            <p className="desc">Популярные миксы и вкусы</p>
          </div>
          <div className="bd">
            <h4>Топ миксов</h4>
            <div className="grid">
              {stats.topMixes.map(m => (
                <div key={m.id} className="mix-card card-soft">
                  <div className="mix-title">{m.name}</div>
                  <div className="tiny muted">Лайки: {m.likes}</div>
                </div>
              ))}
            </div>
            <h4>Популярные вкусы</h4>
            <div className="tag-row">
              {stats.topTastes.map(([t, count]) => (
                <span key={t} className="badge tag" style={{ background: tasteColor(t) }}>{t} ({count})</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === TIPS === */}
      {tab === 'tips' && (
        <div className="card glow">
          <div className="hd">
            <h3 className="h3 with-ico-shield">Советы</h3>
            <p className="desc">Полезные гайды для кальянщиков</p>
          </div>
          <div className="bd grid">
            {tips.map((tip, i) => (
              <div key={i} className="mix-card card-soft">
                <div className="mix-title">{tip.title}</div>
                <p className="desc">{tip.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === ADMIN === */}
      {IS_ADMIN && tab === "admin" && (
        <div className="admin-panel">
          <div className="card glow">
            <div className="hd">
              <h3 className="h3 with-ico-shield">Бренды и вкусы</h3>
              <p className="desc">Добавляйте, скрывайте и удаляйте вкусы и бренды</p>
            </div>

            <div className="bd">
              {/* Добавление бренда */}
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <input className="input" placeholder="Новый бренд" value={brandName} onChange={e => setBrandName(e.target.value)} />
                <button className="btn accent" onClick={addBrand}><span className="ico ico-flame"></span>Добавить бренд</button>
              </div>

              <div className="sep"></div>

              {/* Добавление вкуса */}
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <select className="input" value={brandForFlavor} onChange={e => setBrandForFlavor(e.target.value)}>
                  <option value="">Выберите бренд</option>
                  {brands.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>

                <input className="input" placeholder="Название вкуса" value={flavorName} onChange={e => setFlavorName(e.target.value)} />
                <input className="input" placeholder="Сам вкус (малина, клубника...)" value={flavorType} onChange={e => setFlavorType(e.target.value)} />
                <input className="input" placeholder="Описание вкуса (сладкий, кислый...)" value={flavorTaste} onChange={e => setFlavorTaste(e.target.value)} />

                <label className="tiny control"><span className="ico ico-drop"></span>Крепость: {flavorStrength}</label>
                <input className="input" type="range" min="1" max="10" value={flavorStrength} onChange={e => setFlavorStrength(+e.target.value)} />

                <button className="btn accent" onClick={addFlavorAdmin}><span className="ico ico-star"></span>Добавить вкус</button>
              </div>

              <div className="sep"></div>

              {/* Список брендов */}
              <div className="grid-2">
                {brands.map(b => (
                  <div key={b.id} className="mix-card brand-box">
                    <div className="row between" style={{ cursor: "pointer" }} onClick={() => setCollapsed(c => ({ ...c, [b.id]: !c[b.id] }))}>
                      <div>
                        <div className="mix-title">{b.name}</div>
                        <div className="tiny muted">вкусов: {b.flavors.length}</div>
                        {b.hidden ? <div className="badge hidden">скрыт</div> : <div className="badge ok">доступен</div>}
                      </div>

                      <div className="grid" style={{ gap: 6, alignItems: "center" }}>
                        <button className="btn small ghost" onClick={(e) => { e.stopPropagation(); toggleHidden(b.id); }}>
                          {b.hidden ? "показать" : "скрыть"}
                        </button>

                        <button className="btn small danger" onClick={(e) => { e.stopPropagation(); delBrand(b.id); }}>
                          удалить
                        </button>

                        <span className="tiny arrow">{collapsed[b.id] ? "▼" : "▲"}</span>
                      </div>
                    </div>

                    {!collapsed[b.id] && (
                      <div className="flavor-list" style={{ marginTop: 6 }}>
                        {(b.flavors || []).map(f => (
                          <div key={f.id} className="mix-card row between soft" style={{ marginLeft: 10 }}>
                            <div>
                              <div className="mix-title">{f.name}</div>
                              {f.type && <div className="tiny muted">{f.type}</div>}
                              {f.taste && <div className="tiny">{f.taste}</div>}
                              {f.hidden ? <div className="badge hidden">скрыт</div> : <div className="badge ok">доступен</div>}
                            </div>
                            <div className="grid">
                              <button className="btn small ghost" onClick={(e) => { e.stopPropagation(); toggleHidden(b.id, f.id); }}>
                                {f.hidden ? "показать" : "скрыть"}
                              </button>

                              <button className="btn small danger" onClick={(e) => { e.stopPropagation(); deleteFlavor(b.id, f.id); }}>
                                удалить
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* === РЕЗЕРВНОЕ КОПИРОВАНИЕ === */}
          <div className="card glow">
            <div className="hd">
              <h3 className="h3 with-ico-star">📦 Резервное копирование</h3>
              <p className="desc">Сохраняйте и восстанавливайте данные миксов и вкусов</p>
            </div>

            <div className="bd grid-2">
              <button className="btn accent" onClick={async () => {
                const res = await fetch("/api/library");
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "library_backup.json";
                a.click();
              }}><span className="ico ico-flame"></span>⬇️ Скачать библиотеку</button>

              <button className="btn accent" onClick={async () => {
                const res = await fetch("/api/mixes");
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "mixes_backup.json";
                a.click();
              }}><span className="ico ico-star"></span>⬇️ Скачать миксы</button>

              <button className="btn" onClick={() => document.getElementById("uploadLibrary").click()}>⬆️ Загрузить библиотеку</button>
              <input
                type="file"
                id="uploadLibrary"
                accept=".json"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const text = await file.text();
                  try {
                    const data = JSON.parse(text);
                    await fetch("/api/library", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "x-admin-id": CURRENT_USER_ID || ""
                      },
                      body: JSON.stringify(data)
                    });
                    alert("✅ Библиотека успешно восстановлена");
                    fetch("/api/library").then(r => r.json()).then(setBrands);
                  } catch {
                    alert("⚠️ Ошибка при загрузке файла");
                  }
                }}
              />

              <button className="btn" onClick={() => document.getElementById("uploadMixes").click()}>⬆️ Загрузить миксы</button>
              <input
                type="file"
                id="uploadMixes"
                accept=".json"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const text = await file.text();
                  try {
                    const data = JSON.parse(text);
                    for (const mix of data) {
                      await fetch("/api/mixes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(mix)
                      });
                    }
                    alert("✅ Миксы успешно восстановлены");
                    fetch("/api/mixes").then(r => r.json()).then(setMixes);
                  } catch {
                    alert("⚠️ Ошибка при загрузке файла");
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
      <div className="footer muted" style={{ textAlign: 'center', padding: '10px 0', fontSize: '12px', color: '#cfc7b3' }}>
        Разработано с 🔥 для вашего TG-канала. Нужен свой мини-app? Пиши <a href="https://t.me/Tutenhaman" style={{ color: '#f0b85a', textDecoration: 'none' }}>@Tutenhaman</a>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);