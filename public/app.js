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

  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then(setBrands).catch(console.error);
    fetch("/api/mixes").then(r => r.json()).then(setMixes).catch(console.error);
    try { setBanned(JSON.parse(localStorage.getItem("bannedWords") || "[]")); } catch {}
  }, []);

  const reloadMixes = () => fetch("/api/mixes").then(r => r.json()).then(setMixes);
  const saveLibrary = async (lib) => {
    await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-id": CURRENT_USER_ID || "" }, body: JSON.stringify(lib) });
  };

  // скрытие / удаление вкусов и брендов
  const toggleFlavorHidden = (brandId, flavorId) => {
    const newLib = brands.map(b => b.id !== brandId ? b : { ...b, flavors: b.flavors.map(f => f.id === flavorId ? { ...f, hidden: !f.hidden } : f) });
    setBrands(newLib); saveLibrary(newLib);
  };
  const deleteFlavor = (brandId, flavorId) => {
    if (!confirm("Удалить этот вкус?")) return;
    const newLib = brands.map(b => b.id !== brandId ? b : { ...b, flavors: b.flavors.filter(f => f.id !== flavorId) });
    setBrands(newLib); saveLibrary(newLib);
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
    if (!confirm("Удалить бренд?")) return;
    const newLib = brands.filter(b => b.id !== id);
    setBrands(newLib); saveLibrary(newLib);
  };

  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState("");
  const [parts, setParts] = useState([]);

  // расчёт вкуса и крепости
  const total = parts.reduce((a, b) => a + b.percent, 0);
  const avg = parts.length && total > 0 ? Math.round(parts.reduce((a, p) => a + p.percent * p.strength, 0) / total) : 0;
  let tasteTotals = {};
  for (const p of parts) if (p.taste) tasteTotals[p.taste.trim().toLowerCase()] = (tasteTotals[p.taste.trim().toLowerCase()] || 0) + p.percent;
  const finalTaste = Object.keys(tasteTotals).length ? Object.entries(tasteTotals).sort((a, b) => b[1] - a[1])[0][0] : "—";

  // добавить вкус
  const addFlavor = (brandId, fl) => {
    const remaining = Math.max(0, 100 - total);
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
  // сохранить микс
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

  // поиск по всем брендам и вкусам
  const filteredBrands = brands
    .filter(b => !b.hidden)
    .map(b => ({
      ...b,
      flavors: (b.flavors || []).filter(f => {
        const q = search.toLowerCase();
        return !f.hidden && (
          (f.name || "").toLowerCase().includes(q) ||
          (f.taste || "").toLowerCase().includes(q) ||
          (f.type || "").toLowerCase().includes(q)
        );
      })
    }))
    .filter(b => b.flavors.length > 0 || !search);

  return (
    <div className="container">
      <header className="title">Кальянный Миксер</header>
      <div className="tabs">
        <button className={"tab-btn" + (tab === 'community' ? ' active' : '')} onClick={() => setTab('community')}>Миксы</button>
        <button className={"tab-btn" + (tab === 'builder' ? ' active' : '')} onClick={() => setTab('builder')}>Конструктор</button>
        {IS_ADMIN && <button className={"tab-btn" + (tab === 'admin' ? ' active' : '')} onClick={() => setTab('admin')}>Админ</button>}
      </div>

      {/* --- Вкладка Миксы --- */}
      {tab === 'community' && (
        <div className="card">
          <div className="hd"><h3>Миксы сообщества</h3></div>
          <div className="bd">
            {mixes.map(m => (
              <div key={m.id} className="mix-card">
                <div className="row between">
                  <div>
                    <b>{m.name}</b><div className="tiny muted">от {m.author}</div>
                  </div>
                  {IS_ADMIN && (
                    <button className="btn small danger" onClick={async () => {
                      if (!confirm("Удалить этот микс?")) return;
                      const res = await fetch(`/api/mixes/${m.id}`, { method: "DELETE", headers: { "x-admin-id": CURRENT_USER_ID || "" } });
                      const j = await res.json().catch(() => ({}));
                      if (j.success) {
                        alert("✅ Микс удалён");
                        reloadMixes();
                      } else alert("⚠️ Ошибка удаления");
                    }}>✕</button>
                  )}
                </div>
                <div className="tiny">Крепость: <b>{m.avgStrength}</b></div>
                <div className="row" style={{ flexWrap: "wrap", gap: "6px" }}>
                  <span className="badge" style={{ background: tasteColor(m.finalTaste) }}>{m.finalTaste}</span>
                </div>
                <div className="tiny muted">Состав: {m.flavors.map(p => `${p.name} ${p.percent}%`).join(' + ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Вкладка Конструктор --- */}
      {/* --- Вкладка Конструктор --- */}
{tab === 'builder' && (
  <>
    <div className="card">
      <div className="hd"><h3>Конструктор миксов</h3></div>
      <div className="bd">
        <input
          className="input"
          placeholder="Поиск по всем вкусам..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Сетка брендов */}
        <div
          className="brand-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            marginTop: "10px"
          }}
        >
          {brands.filter(b => !b.hidden).map(b => (
            <div
              key={b.id}
              onClick={() => setSelected(selected === b.id ? null : b.id)}
              className={`brand-card ${selected === b.id ? "active" : ""}`}
              style={{
                border: selected === b.id ? "2px solid #f5a623" : "1px solid #333",
                borderRadius: "12px",
                padding: "10px",
                background: selected === b.id ? "#242424" : "#1b1b1b",
                transition: "all 0.3s ease",
                cursor: "pointer",
                textAlign: "center"
              }}
            >
              <div style={{ fontWeight: 600 }}>{b.name}</div>
              <div className="tiny muted">{b.flavors.length} вкусов</div>
            </div>
          ))}
        </div>

        {/* Вкусы выбранного бренда */}
        {selected && (
          <div
            className="flavor-list"
            style={{
              marginTop: "20px",
              borderTop: "1px solid #333",
              paddingTop: "15px",
              animation: "fadeIn 0.4s ease"
            }}
          >
            <h4 style={{ marginBottom: "10px", textAlign: "center" }}>
              Вкусы {brands.find(b => b.id === selected)?.name}
            </h4>

            <div
              className="flavor-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px"
              }}
            >
              {brands
                .find(b => b.id === selected)
                ?.flavors.filter(f => {
                  const q = search.toLowerCase();
                  return (
                    !f.hidden &&
                    ((f.name || "").toLowerCase().includes(q) ||
                      (f.type || "").toLowerCase().includes(q) ||
                      (f.taste || "").toLowerCase().includes(q))
                  );
                })
                .map(f => (
                  <div
                    key={f.id}
                    className="flavor-item"
                    style={{
                      background: "#222",
                      border: "1px solid #333",
                      borderRadius: "10px",
                      padding: "10px",
                      textAlign: "center"
                    }}
                  >
                    <div><b>{f.name}</b></div>
                    <div className="tiny muted">{f.type}</div>
                    <div className="tiny">{f.taste}</div>
                    <button
                      className="btn small"
                      style={{ marginTop: "6px" }}
                      onClick={() => addFlavor(selected, f)}
                    >
                      + в микс
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>

    <div className="card">
      <div className="hd"><h3>Ваш микс</h3></div>
      <div className="bd">
        {parts.map(p => (
          <div key={p.key} className="mix-card">
            <div className="row between">
              <div><b>{p.name}</b><div className="tiny muted">{p.taste}</div></div>
              <button className="btn small" onClick={() => removePart(p.key)}>×</button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={p.percent}
              onChange={e => updatePct(p.key, +e.target.value)}
            />
            <div className="tiny muted">{p.percent}%</div>
          </div>
        ))}
        <div className="tiny muted">
          Итого: {total}% (осталось {100 - total}%) • Крепость {avg} • Вкус: {finalTaste}
        </div>
        <button
          className={"btn " + (total === 100 ? "accent" : "")}
          onClick={saveMix}
          disabled={total !== 100}
        >
          Сохранить
        </button>
      </div>
    </div>
  </>
)}
      {/* --- Вкладка Админ --- */}
      {IS_ADMIN && tab === 'admin' && (
        <div className="admin-panel">
          {/* === БРЕНДЫ И ВКУСЫ === */}
          <div className="card">
            <div className="hd">
              <h3>Бренды и вкусы</h3>
              <p className="desc">Добавляйте, скрывайте и удаляйте вкусы</p>
            </div>

            <div className="bd">
              {/* Добавление бренда */}
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <input className="input" placeholder="Новый бренд" id="brandInput"
                  onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                />
                <button className="btn" onClick={() => {
                  const el = document.getElementById("brandInput");
                  if (!el.value.trim()) return;
                  const id = el.value.toLowerCase().replace(/\s+/g, "-");
                  const newLib = [...brands, { id, name: el.value.trim(), hidden: false, flavors: [] }];
                  setBrands(newLib); saveLibrary(newLib); el.value = "";
                }}>Добавить бренд</button>
              </div>

              <div className="sep"></div>

              {/* Добавление вкуса */}
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <select className="input" id="brandSelect">
                  <option value="">Выберите бренд</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                <input className="input" id="flavorName" placeholder="Название вкуса" />
                <input className="input" id="flavorType" placeholder="Сам вкус (малина, клубника...)" />
                <input className="input" id="flavorTaste" placeholder="Описание (сладкий, кислый...)" />
                <label className="tiny">Крепость</label>
                <input type="range" id="flavorStrength" min="1" max="10" defaultValue="5" className="input" />

                <button className="btn accent" onClick={() => {
                  const sel = document.getElementById("brandSelect");
                  const name = document.getElementById("flavorName").value.trim();
                  const type = document.getElementById("flavorType").value.trim();
                  const taste = document.getElementById("flavorTaste").value.trim();
                  const strength = +document.getElementById("flavorStrength").value;
                  if (!sel.value || !name) return;
                  const b = brands.find(x => x.id === sel.value);
                  const fl = { id: name.toLowerCase().replace(/\s+/g, "-"), name, type, taste, strength, hidden: false };
                  const newLib = brands.map(x => x.id === b.id ? { ...x, flavors: [...x.flavors, fl] } : x);
                  setBrands(newLib); saveLibrary(newLib);
                  document.querySelectorAll("#flavorName,#flavorType,#flavorTaste").forEach(i => i.value = "");
                }}>Добавить вкус</button>
              </div>

              <div className="sep"></div>

              {/* Список брендов */}
              <div className="grid-2">
                {brands.map(b => (
                  <div key={b.id} className="mix-card">
                    <div className="row between" onClick={() => setExpanded(e => ({ ...e, [b.id]: !e[b.id] }))} style={{ cursor: "pointer" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{b.name}</div>
                        <div className="tiny muted">вкусов: {b.flavors.length}</div>
                        {b.hidden ? <div className="badge hidden">скрыт</div> : <div className="badge ok">доступен</div>}
                      </div>
                      <span style={{
                        transform: expanded[b.id] ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.3s"
                      }}>▶</span>
                    </div>

                    <div style={{
                      maxHeight: expanded[b.id] ? "600px" : "0",
                      overflow: "hidden",
                      transition: "max-height 0.4s ease"
                    }}>
                      {(b.flavors || []).map(f => (
                        <div key={f.id} className="mix-card row between" style={{ marginLeft: 10 }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{f.name}</div>
                            {f.type && <div className="tiny muted">{f.type}</div>}
                            {f.taste && <div className="tiny">{f.taste}</div>}
                            {f.hidden ? <div className="badge hidden">скрыт</div> : <div className="badge ok">доступен</div>}
                          </div>
                          <div className="grid">
                            <button className="btn small ghost" onClick={() => toggleFlavorHidden(b.id, f.id)}>
                              {f.hidden ? "показать" : "скрыть"}
                            </button>
                            <button className="btn small danger" onClick={() => deleteFlavor(b.id, f.id)}>удалить</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="row" style={{ marginTop: 8, gap: 4 }}>
                      <button className="btn small ghost" onClick={() => toggleHidden(b.id)}>
                        {b.hidden ? "показать бренд" : "скрыть бренд"}
                      </button>
                      <button className="btn small danger" onClick={() => delBrand(b.id)}>удалить бренд</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* === Бан-слова === */}
          <div className="card">
            <div className="hd"><h3>🚫 Бан-слова</h3><p className="desc">Список запрещённых слов в названиях миксов</p></div>
            <div className="bd">
              <div className="row" style={{ gap: 8 }}>
                <input className="input" placeholder="Добавить слово..." id="banInput" />
                <button className="btn" onClick={() => {
                  const el = document.getElementById("banInput");
                  const w = el.value.trim();
                  if (!w) return;
                  const list = [...new Set([...(banned || []), w])];
                  setBanned(list);
                  localStorage.setItem("bannedWords", JSON.stringify(list));
                  el.value = "";
                }}>Добавить</button>
              </div>
              <div className="grid" style={{ marginTop: 10 }}>
                {(banned || []).map(w => (
                  <div key={w} className="row between" style={{ borderBottom: "1px solid #333", padding: "4px 0" }}>
                    <div>{w}</div>
                    <button className="btn small danger" onClick={() => {
                      const list = (banned || []).filter(x => String(x) !== String(w));
                      setBanned(list);
                      localStorage.setItem("bannedWords", JSON.stringify(list));
                    }}>удалить</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* === Резервное копирование === */}
          <div className="card">
            <div className="hd">
              <h3>📦 Резервное копирование</h3>
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
              }}>⬇️ Скачать библиотеку</button>

              <button className="btn accent" onClick={async () => {
                const res = await fetch("/api/mixes");
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "mixes_backup.json";
                a.click();
              }}>⬇️ Скачать миксы</button>

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
                  alert("✅ Библиотека успешно восстановлена");
                  fetch("/api/library").then(r => r.json()).then(setBrands);
                } catch {
                  alert("⚠️ Ошибка при загрузке файла");
                }
              }} />

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
                  alert("✅ Миксы успешно восстановлены");
                  fetch("/api/mixes").then(r => r.json()).then(setMixes);
                } catch {
                  alert("⚠️ Ошибка при загрузке файла");
                }
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
