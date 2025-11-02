// public/app.js
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

function App() {
  const [tab, setTab] = useState("community");
  const [brands, setBrands] = useState([]);
  const [mixes, setMixes] = useState([]);
  const [likes, setLikes] = useState({});
  const [banned, setBanned] = useState([]);

  // load from server
  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then(setBrands).catch(console.error);
    fetch("/api/mixes").then(r => r.json()).then(setMixes).catch(console.error);
    try { setBanned(JSON.parse(localStorage.getItem("bannedWords") || "[]")); } catch {}
  }, []);

  // likes
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

  // builder
  const [selected, setSelected] = useState(null);
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState("");
  const selectedBrand = brands.find(b => b.id === selected);
  const total = parts.reduce((a, b) => a + b.percent, 0);
  const avg = parts.length && total > 0 ? Math.round(parts.reduce((a, p) => a + p.percent * p.strength, 0) / total) : 0;
  const remaining = Math.max(0, 100 - total);

  const addFlavor = (brandId, fl) => {
    if (remaining <= 0) return;
    const key = `${brandId}:${fl.id}`;
    setParts(p => p.some(x => x.key === key) ? p : [...p, { key, brandId, flavorId: fl.id, name: fl.name, taste: fl.taste, strength: fl.strength, percent: Math.min(20, remaining) }]);
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
    const mix = { name: title.trim(), author: CURRENT_USER_NAME, flavors: parts, avgStrength: avg };
    const r = await fetch("/api/mixes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mix)
    });
    const j = await r.json();
    if (j.success) { alert("✅ Микс сохранён"); setParts([]); fetch("/api/mixes").then(r => r.json()).then(setMixes); }
  };

  // admin
  const [brandName, setBrandName] = useState("");
  const [flavorName, setFlavorName] = useState("");
  const [flavorTaste, setFlavorTaste] = useState("");
  const [flavorStrength, setFlavorStrength] = useState(5);
  const [brandForFlavor, setBrandForFlavor] = useState("");

  const saveLibrary = async (lib) => {
    await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lib) });
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
  const delBrand = id => { const newLib = brands.filter(b => b.id !== id); setBrands(newLib); saveLibrary(newLib); };
  const delFlavor = (bid, fid) => {
    const newLib = brands.map(b => b.id === bid ? { ...b, flavors: b.flavors.filter(f => f.id !== fid) } : b);
    setBrands(newLib); saveLibrary(newLib);
  };

  const [banInput, setBanInput] = useState("");
  const addBan = () => {
    const w = (banInput || "").trim();
    if (!w) return;
    const list = [...new Set([...(banned || []), w])];
    setBanned(list); localStorage.setItem("bannedWords", JSON.stringify(list)); setBanInput("");
  };
  const delBan = (word) => {
    const list = (banned || []).filter(x => String(x) !== String(word));
    setBanned(list); localStorage.setItem("bannedWords", JSON.stringify(list));
  };

  const DIR = ["десертный", "кислый", "травяной", "пряный", "чайный", "сладкий", "свежий", "алкогольный", "гастрономический"];
  const [pref, setPref] = useState("all");
  const [strength, setStrength] = useState(5);
  const rec = mixes
    .filter(m => pref === "all" || (m.flavors || []).some(p => (p.taste || "").toLowerCase().includes(pref)))
    .filter(m => Math.abs((m.avgStrength || 0) - strength) <= 1);

  return (
    <div className="container">
      <header className="title">Кальянный Миксер</header>
      <div className="tabs">
        <button className={"tab-btn" + (tab === 'community' ? ' active' : '')} onClick={() => setTab('community')}>Миксы</button>
        <button className={"tab-btn" + (tab === 'builder' ? ' active' : '')} onClick={() => setTab('builder')}>Конструктор</button>
        {IS_ADMIN && <button className={"tab-btn" + (tab === 'admin' ? ' active' : '')} onClick={() => setTab('admin')}>Админ</button>}
      </div>

      {tab === 'community' && (
        <div className="card">
          <div className="hd"><h3>Рекомендации</h3><p className="desc">Выберите настроение и крепость</p></div>
          <div className="bd">
            <div className="grid-2">
              <button className={"btn " + (pref === 'all' ? 'accent' : '')} onClick={() => setPref('all')}>Все</button>
              {DIR.map(t => <button key={t} className={"btn " + (pref === t ? 'accent' : '')} onClick={() => setPref(t)}>{t}</button>)}
            </div>
            <div className="sep"></div>
            <div>Крепость: <b>{strength}</b></div>
            <input type="range" min="1" max="10" value={strength} onChange={e => setStrength(+e.target.value)} />
            <div className="sep"></div>
            <div className="grid">
              {rec.map(m => (
                <div key={m.id} className="mix-card">
                  <div className="row between">
                    <div><div style={{ fontWeight: 600 }}>{m.name}</div><div className="tiny muted">от {m.author}</div></div>
                    <button className={"btn " + (likes[m.id] ? 'accent' : '')} onClick={() => toggleLike(m.id)}>❤ {m.likes}</button>
                  </div>
                  <div className="tiny">Крепость: <b>{m.avgStrength}</b></div>
                  <div className="tiny muted">Состав: {(m.flavors || []).map(p => `${p.name} ${p.percent}%`).join(' + ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                <input className="input" placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)} />
                {selectedBrand.flavors
                  .filter(f => !f.hidden)
                  .filter(f => {
                    const q = search.toLowerCase();
                    return (f.name || "").toLowerCase().includes(q) || (f.taste || "").toLowerCase().includes(q);
                  })
                  .map(f => (
                    <div key={f.id} className="flavor-item">
                      <div><div style={{ fontWeight: 600 }}>{f.name}</div><div className="tiny muted">{f.taste}</div></div>
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
                  <div className="row between"><div><b>{p.name}</b><div className="tiny muted">{p.taste}</div></div>
                    <button className="btn small" onClick={() => removePart(p.key)}>×</button></div>
                  <input type="range" min="0" max="100" step="5" value={p.percent} onChange={e => updatePct(p.key, +e.target.value)} />
                  <div className="tiny muted">{p.percent}%</div>
                </div>
              ))}
              <div className="tiny muted">Итого: {total}% (осталось {100 - total}%) • Крепость {avg}</div>
              <button className={"btn " + (total === 100 ? 'accent' : '')} onClick={saveMix} disabled={total !== 100}>Сохранить</button>
            </div>
          </div>
        </>
      )}

      {IS_ADMIN && tab === 'admin' && (
        <>
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

          <div className="card">
            <div className="hd"><h3>Вкусы</h3><p className="desc">Добавить вкус к бренду</p></div>
            <div className="bd grid">
              <select className="input" value={brandForFlavor} onChange={e => setBrandForFlavor(e.target.value)}>
                <option value="">Выбери бренд</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input className="input" placeholder="Название вкуса" value={flavorName} onChange={e => setFlavorName(e.target.value)} />
              <input className="input" placeholder="Описание вкуса" value={flavorTaste} onChange={e => setFlavorTaste(e.target.value)} />
              <label>Крепость: {flavorStrength}</label>
              <input type="range" min="1" max="10" value={flavorStrength} onChange={e => setFlavorStrength(+e.target.value)} />
              <button className="btn accent" onClick={addFlavorAdmin}>Добавить вкус</button>
            </div>
          </div>

          <div className="card">
            <div className="hd"><h3>Запрещённые слова</h3><p className="desc">Миксы с такими словами не будут сохраняться</p></div>
            <div className="bd">
              <div className="row">
                <input className="input" placeholder="Добавить слово" value={banInput} onChange={e => setBanInput(e.target.value)} />
                <button className="btn" onClick={addBan}>Добавить</button>
              </div>
              <div className="sep"></div>
              {(!banned || !banned.length) ? (
                <div className="tiny muted">Список пуст.</div>
              ) : (
                <div className="grid">
                  {banned.map(w => (
                    <div key={w} className="row between mix-card">
                      <div className="tiny">{w}</div>
                      <button className="btn small danger" onClick={() => delBan(w)}>удалить</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
