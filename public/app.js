const { useState, useEffect } = React;

(function initTG() {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.ready) tg.ready();
  } catch {}
})();

let tg = window.Telegram?.WebApp || null;
let CURRENT_USER_ID = 0, CURRENT_USERNAME = "", CURRENT_USER_NAME = "Гость";
const ADMIN_USERNAMES = ["tutenhaman", "brgmnstrr"];     // при желании убери
const ADMIN_IDS = [504348666, 2015942051];              // реальные TG id админов

try {
  if (tg && tg.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    CURRENT_USER_ID = u.id;
    CURRENT_USERNAME = (u.username || "").toLowerCase();
    CURRENT_USER_NAME = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Гость";
  }
} catch {}

const IS_ADMIN =
  ADMIN_USERNAMES.includes(CURRENT_USERNAME) ||
  ADMIN_IDS.includes(CURRENT_USER_ID);

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

  // данные
  const [brands, setBrands] = useState([]);
  const [mixes, setMixes] = useState([]);
  const [likes, setLikes] = useState({});
  const [banned, setBanned] = useState([]);

  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then(setBrands).catch(console.error);
    fetch("/api/mixes").then(r => r.json()).then(setMixes).catch(console.error);
    try { setBanned(JSON.parse(localStorage.getItem("bannedWords") || "[]")); } catch {}
  }, []);

  const reloadMixes = () => fetch("/api/mixes").then(r => r.json()).then(setMixes);

  // лайки
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

  // удаление микса (только админ)
  const deleteMix = async (id) => {
    if (!confirm("Удалить этот микс?")) return;
    const r = await fetch(`/api/mixes/${id}`, {
      method: "DELETE",
      headers: { "x-admin-id": CURRENT_USER_ID || "" }
    });
    const j = await r.json().catch(() => ({}));
    if (j.success) { alert("✅ Микс удалён"); reloadMixes(); }
    else { alert("⚠️ Ошибка удаления"); }
  };

  // === Конструктор ===
  const [selected, setSelected] = useState(null);
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState("");
  const selectedBrand = brands.find(b => b.id === selected);
  const total = parts.reduce((a, b) => a + b.percent, 0);
  const avg = parts.length && total > 0
    ? Math.round(parts.reduce((a, p) => a + p.percent * p.strength, 0) / total)
    : 0;
  const remaining = Math.max(0, 100 - total);

  // доминирующий вкус (одно слово)
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
    if (bad) return alert(`❌ Запрещённое слово: \"${bad}\"`);
    const mix = { name: title.trim(), author: CURRENT_USER_NAME, flavors: parts, avgStrength: avg, finalTaste };
    const r = await fetch("/api/mixes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mix)
    });
    const j = await r.json();
    if (j.success) { alert("✅ Микс сохранён"); setParts([]); reloadMixes(); }
  };

  // === Фильтрация миксов ===
  const tasteCategories = Array.from(new Set(mixes.map(m => (m.finalTaste || "").toLowerCase()).filter(Boolean)));
  const [pref, setPref] = useState("all");
  const [strength, setStrength] = useState(5);
  const filteredMixes = mixes
    .filter(m => pref === "all" || (m.finalTaste || "").toLowerCase().includes(pref))
    .filter(m => Math.abs((m.avgStrength || 0) - strength) <= 1);

  // === Админ: состояния ===
  const [brandName, setBrandName] = useState("");
  const [flavorName, setFlavorName] = useState("");
  const [flavorTaste, setFlavorTaste] = useState("");
  const [flavorStrength, setFlavorStrength] = useState(5);
  const [brandForFlavor, setBrandForFlavor] = useState("");

  const saveLibrary = async (lib) => {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-id": CURRENT_USER_ID || "" },
      body: JSON.stringify(lib)
    });
  };
  const addBrand = () => {
    const name = brandName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-");
    const newLib = [...brands, { id, name, hidden: false, flavors: [] }];
    setBrands(newLib); saveLibrary(newLib); setBrandName("");
  };
  const addFlavorAdmin = () => {
    const b = brands.find(x => x.id === brandForFlavor);
    if (!b) return;
    const name = flavorName.trim();
    if (!name) return;
    const fl = { id: name.toLowerCase().replace(/\s+/g, "-"), name, strength: flavorStrength, taste: flavorTaste, hidden: false };
    const newLib = brands.map(x => x.id === b.id ? { ...x, flavors: [...x.flavors, fl] } : x);
    setBrands(newLib); saveLibrary(newLib); setFlavorName(""); setFlavorTaste("");
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
    setBrands(newLib); saveLibrary(newLib);
  };

  // запретные слова (локально)
  const [banInput, setBanInput] = useState("");
  const addBan = () => {
    const w = (banInput || "").trim();
    if (!w) return;
    const list = [...new Set([...(banned || []), w])];
    setBanned(list);
    localStorage.setItem("bannedWords", JSON.stringify(list));
    setBanInput("");
  };
  const delBan = (word) => {
    const list = (banned || []).filter(x => String(x) !== String(word));
    setBanned(list);
    localStorage.setItem("bannedWords", JSON.stringify(list));
  };

  // UI
  return (
    <div className="container">
      <header className="title">Кальянный Миксер</header>

      <div className="tabs">
        <button className={"tab-btn" + (tab === 'community' ? ' active' : '')} onClick={() => setTab('community')}>Миксы</button>
        <button className={"tab-btn" + (tab === 'builder' ? ' active' : '')} onClick={() => setTab('builder')}>Конструктор</button>
        {IS_ADMIN ? (
          <button className={"tab-btn" + (tab === 'admin' ? ' active' : '')} onClick={() => setTab('admin')}>Админ</button>
        ) : (
          <span className="tab-spacer" aria-hidden="true"></span> // чтобы не было «пустого места» у гостя
        )}
      </div>

      {/* === Вкладка: Миксы === */}
      {tab === 'community' && (
        <div className="card">
          <div className="hd">
            <h3>Рекомендации</h3>
            <p className="desc">Выберите вкус (категорию) и крепость</p>
          </div>
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

      {/* === Вкладка: Конструктор === */}
      {tab === 'builder' && (
        <>
          <div className="card">
            <div className="hd"><h3>Бренды</h3><p className="desc">Выберите бренд</p></div>
            <div className="bd grid-2">
              {brands.filter(b => !b.hidden).map(b =>
                <button key={b.id} className={"brand-btn" + (selected === b.id ? ' active' : '')} onClick={() => setSelected(b.id)}>{b.name}</button>
              )}
            </div>
          </div>

          {selectedBrand && (
            <div className="card">
              <div className="hd"><h3>{selectedBrand.name}</h3><p className="desc">Добавьте вкус</p></div>
              <div className="bd grid">
                <input className="input" placeholder="Поиск (название или вкус)" value={search} onChange={e => setSearch(e.target.value)} />
                {selectedBrand.flavors
                  .filter(f => !f.hidden)
                  .filter(f => {
                    const q = search.toLowerCase();
                    return (f.name || "").toLowerCase().includes(q) || (f.taste || "").toLowerCase().includes(q);
                  })
                  .map(f => (
                    <div key={f.id} className="flavor-item">
                      <div>
                        <div style={{ fontWeight: 600 }}>{f.name}</div>
                        <div className="tiny muted">{f.taste}</div>
                      </div>
                      <button className="btn" onClick={() => addFlavor(selectedBrand.id, f)}>+ в микс</button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="hd"><h3>Ваш микс</h3><p className="desc">Сумма должна быть 100%</p></div>
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
              <div className="row" style={{ flexWrap: "wrap", gap: "6px" }}>
                {finalTaste !== "—" && (
                  <span className="badge" style={{ background: tasteColor(finalTaste), color: "#000", border: "none" }}>{finalTaste}</span>
                )}
              </div>
              <button className={"btn " + (total === 100 ? 'accent' : '')} onClick={saveMix} disabled={total !== 100}>Сохранить</button>
            </div>
          </div>
        </>
      )}

      {/* === Вкладка: Админ === */}
      {IS_ADMIN && tab === 'admin' && (
        <>
          {/* бренды */}
          <div className="card">
            <div className="hd"><h3>Бренды</h3><p className="desc">Добавление / скрытие / удаление</p></div>
            <div className="bd">
              <div className="row">
                <input className="input" placeholder="Новый бренд" value={brandName} onChange={e => setBrandName(e.target.value)} />
                <button className="btn" onClick={addBrand}>Добавить</button>
              </div>
              <div className="sep"></div>
              <div className="grid-2">
                {brands.map(b => (
                  <div key={b.id} className="mix-card">
                    <div className="row between">
                      <div>
                        <div style={{ fontWeight: 600 }}>{b.name}</div>
                        <div className="tiny muted">вкусов: {b.flavors.length}</div>
                        {b.hidden ? <div className="badge hidden">скрыт</div> : <div className="badge ok">доступен</div>}
                      </div>
                      <div className="grid">
                        <button className="btn small ghost" onClick={() => toggleHidden(b.id)}>{b.hidden ? "показать" : "скрыть"}</button>
                        <button className="btn small danger" onClick={() => delBrand(b.id)}>удалить</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* вкусы */}
          <div className="card">
            <div className="hd"><h3>Вкусы</h3><p className="desc">Добавить вкус к бренду</p></div>
            <div className="bd grid">
              <select className="input" value={brandForFlavor} onChange={e => setBrandForFlavor(e.target.value)}>
                <option value="">Выбери бренд</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input className="input" placeholder="Название вкуса" value={flavorName} onChange={e => setFlavorName(e.target.value)} />
              <input className="input" placeholder="Описание вкуса (сладкий, кислый...)" value={flavorTaste} onChange={e => setFlavorTaste(e.target.value)} />
              <label>Крепость: {flavorStrength}</label>
              <input type="range" min="1" max="10" value={flavorStrength} onChange={e => setFlavorStrength(+e.target.value)} />
              <button className="btn accent" onClick={addFlavorAdmin}>Добавить вкус</button>
            </div>
          </div>

          {/* запрещённые слова */}
          <div className="card">
            <div className="hd"><h3>Запрещённые слова</h3><p className="desc">Миксы с такими словами не сохранятся</p></div>
            <div className="bd">
              <div className="row">
                <input className="input" placeholder="Добавить слово" value={banInput} onChange={e => setBanInput(e.target.value)} />
                <button className="btn" onClick={addBan}>Добавить</button>
              </div>
              <div className="sep"></div>
              {(banned || []).map(w => (
                <div key={w} className="row between mix-card">
                  <div>{w}</div>
                  <button className="btn small danger" onClick={() => delBan(w)}>удалить</button>
                </div>
              ))}
            </div>
          </div>

          {/* резервное копирование */}
          <div className="card">
            <div className="hd"><h3>📦 Резервное копирование</h3><p className="desc">Сохранить / восстановить библиотеку и миксы</p></div>
            <div className="bd grid-2">
              {/* скачать библиотеку */}
              <button className="btn accent" onClick={() => {
                const url = `${window.location.origin}/api/download/library`;
                if (window.Telegram?.WebApp?.openLink) { window.Telegram.WebApp.openLink(url); }
                else { window.open(url, "_blank"); }
              }}>⬇️ Скачать библиотеку</button>

              {/* скачать миксы */}
              <button className="btn accent" onClick={() => {
                const url = `${window.location.origin}/api/download/mixes`;
                if (window.Telegram?.WebApp?.openLink) { window.Telegram.WebApp.openLink(url); }
                else { window.open(url, "_blank"); }
              }}>⬇️ Скачать миксы</button>

              {/* загрузить библиотеку */}
              <button className="btn" onClick={() => document.getElementById("uploadLibrary").click()}>⬆️ Загрузить библиотеку</button>
              <input type="file" id="uploadLibrary" accept=".json" style={{ display: "none" }} onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const text = await file.text();
                try {
                  const data = JSON.parse(text);
                  await fetch("/api/library", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-id": CURRENT_USER_ID || "" },
                    body: JSON.stringify(data)
                  });
                  alert("✅ Библиотека восстановлена");
                  fetch("/api/library").then(r => r.json()).then(setBrands);
                } catch { alert("⚠️ Ошибка загрузки файла"); }
              }} />

              {/* загрузить миксы */}
              <button className="btn" onClick={() => document.getElementById("uploadMixes").click()}>⬆️ Загрузить миксы</button>
              <input type="file" id="uploadMixes" accept=".json" style={{ display: "none" }} onChange={async (e) => {
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
                  alert("✅ Миксы восстановлены");
                  fetch("/api/mixes").then(r => r.json()).then(setMixes);
                } catch { alert("⚠️ Ошибка загрузки миксов"); }
              }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
