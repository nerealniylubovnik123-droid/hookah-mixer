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
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then(data => {
      setBrands(data);
      const init = {};
      (data || []).forEach(b => { init[b.id] = true; });
      setCollapsed(init);
    }).catch(console.error);

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
    const title = prompt("Назови свой микс 🔥", `Микс от ${CURRENT_USER_NAME}`);
    if (!title) return;

    const mixData = {
      name: title.trim(),
      author: CURRENT_USER_NAME,
      authorId: CURRENT_USER_ID,
      parts: parts.map(p => ({ brandId: p.brandId, flavorId: p.flavorId, name: p.name, percent: p.percent, taste: p.taste, strength: p.strength })),
      strength: avg,
      taste: finalTaste,
      createdAt: new Date().toISOString()
    };

    const r = await fetch("/api/mixes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mixData)
    });

    if (r.ok) {
      alert("Микс сохранён в сообщество!");
      setParts([]);
      reloadMixes();
      setTab("community");
    } else {
      alert("Ошибка сохранения :(");
    }
  };

  const filteredBrands = brands.filter(brand => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return brand.name.toLowerCase().includes(q) || brand.flavors.some(f => f.name.toLowerCase().includes(q));
  });

  return (
    <div className="container">
      <header className="title with-icon">Кальянный Миксер</header>

      <div className="tabs">
        <button className={`tab-btn ${tab === "builder" ? "active" : ""}`} onClick={() => { setTab("builder"); setSearch(""); }}>
          <span className="ico ico-flame"></span> Конструктор
        </button>
        <button className={`tab-btn ${tab === "community" ? "active" : ""}`} onClick={() => { setTab("community"); setSearch(""); }}>
          <span className="ico ico-star"></span> Сообщество
        </button>
        {IS_ADMIN && (
          <button className={`tab-btn ${tab === "admin" ? "active" : ""}`} onClick={() => setTab("admin")}>
            <span className="ico ico-shield"></span> Админка
          </button>
        )}
      </div>

      {tab === "builder" && (
        <>
          <div className="card glow" style={{marginBottom:"16px"}}>
            <input
              type="text"
              placeholder="🔥 Поиск по вкусу или бренду..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width:"100%",
                padding:"16px",
                fontSize:"17px",
                border:"none",
                borderRadius:"14px",
                background:"rgba(255,255,255,0.1)",
                color:"white",
                backdropFilter:"blur(8px)"
              }}
            />
          </div>

          <div className="card">
            <div className="hd">
              <h3>Текущий микс ({total}% / 100%)</h3>
              <div style={{display:"flex",gap:"12px",marginTop:"8px"}}>
                <div>Крепость: <strong>{avg}</strong></div>
                <div>Вкус: <strong style={{color:tasteColor(finalTaste)}}>{finalTaste || "—"}</strong></div>
              </div>
            </div>

            <div className="builder-parts">
              {parts.length === 0 && <p style={{textAlign:"center",color:"#888",margin:"20px 0"}}>Добавь вкусы ↓</p>}
              {parts.map(p => (
                <div key={p.key} className="slider-row">
                  <div style={{flex:1}}>
                    <div style={{fontWeight:"600"}}>{p.name}</div>
                    <div style={{fontSize:"12px",opacity:0.7}}>{p.taste} • {p.strength}</div>
                  </div>
                  <div className="control">
                    <input type="range" min="0" max="100" value={p.percent} onChange={e=>updatePct(p.key,+e.target.value)} style={{flex:1}} />
                    <input type="number" min="0" max="100" value={p.percent} onChange={e=>updatePct(p.key,+e.target.value||0)} style={{width:"50px",textAlign:"center"}} />
                    <button className="btn small danger" onClick={()=>removePart(p.key)}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            {total === 100 && <button className="btn accent large" onClick={saveMix} style={{marginTop:"16px",width:"100%"}}>Сохранить микс в сообщество</button>}
            {total !== 100 && remaining > 0 && <p style={{textAlign:"center",color:"#f0b85a",marginTop:"12px"}}>Осталось: {remaining}%</p>}
          </div>

          <div className="brands-grid">
            {filteredBrands.map(brand => (
              <div key={brand.id} className="card brand-box">
                <div className="brand-head" onClick={()=>setCollapsed(c=>({...c,[brand.id]:!c[brand.id]}))} style={{cursor:"pointer"}}>
                  <h3 className="brand-name">{brand.name}</h3>
                  <span className={`arrow ${collapsed[brand.id]?"up":"down"}`}>▼</span>
                </div>

                {!collapsed[brand.id] && (
                  <div className="flavors">
                    {brand.flavors.map(fl => (
                      <div key={fl.id} className="flavor" onClick={()=>addFlavor(brand.id,fl)}
                        style={{cursor:"pointer",padding:"10px",borderRadius:"8px",margin:"4px 0",background:"rgba(255,255,255,0.05)"}}>
                        <div style={{fontWeight:"600"}}>{fl.name}</div>
                        <div style={{fontSize:"12px",opacity:0.8}}>
                          <span style={{color:tasteColor(fl.taste)}}>{fl.taste}</span> • крепость {fl.strength}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "community" && (
        <div>
          {mixes.length === 0 && <p style={{textAlign:"center",padding:"40px",color:"#888"}}>Пока нет миксов :( Создай первый!</p>}
          {mixes.sort((a,b)=>(b.likes||0)-(a.likes||0)).map(mix=>(
            <div key={mix.id} className="card mix-card">
              <div className="hd">
                <h3 className="mix-title">{mix.name}</h3>
                <div style={{fontSize:"14px",opacity:0.8}}>от {mix.author} • {new Date(mix.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="mix-parts">
                {mix.parts.map((p,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
                    <span>{p.name}</span>
                    <strong>{p.percent}%</strong>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"12px"}}>
                <div>Крепость: <strong>{mix.strength}</strong> • Вкус: <strong style={{color:tasteColor(mix.taste)}}>{mix.taste}</strong></div>
                <button className={`btn like ${likes[mix.id]?"liked":""}`} onClick={()=>toggleLike(mix.id)}>
                  ❤️ {mix.likes || 0}
                </button>
              </div>
              {IS_ADMIN && <button className="btn small danger" style={{marginTop:"8px"}} onClick={()=>deleteMix(mix.id)}>Удалить</button>}
            </div>
          ))}
        </div>
      )}

      {tab === "admin" && IS_ADMIN && (
        <div className="admin-panel">
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
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));