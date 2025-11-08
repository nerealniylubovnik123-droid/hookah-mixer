const { useState, useEffect } = React;

function App() {
  // === Telegram и состояние ===
  const tg = window.Telegram?.WebApp || {};
  const [tab, setTab] = useState("community");
  const [brands, setBrands] = useState([]);
  const [mixes, setMixes] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [mixParts, setMixParts] = useState([]);
  const [strength, setStrength] = useState(5);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // === Telegram Init ===
  useEffect(() => {
    try {
      tg.ready?.();
      tg.expand?.();
      const userData = tg.initDataUnsafe?.user || null;
      setUser(userData);
      if (userData && process.env.ADMIN_TG_IDS?.includes?.(String(userData.id))) {
        setIsAdmin(true);
      }
    } catch (err) {
      console.warn("Telegram init error:", err);
    }
  }, []);

  // === Загрузка данных ===
  useEffect(() => {
    Promise.all([
      fetch("/api/library").then(r => r.json()),
      fetch("/api/mixes").then(r => r.json())
    ])
      .then(([libs, mx]) => {
        setBrands(libs);
        setMixes(mx);
        const initCollapse = {};
        libs.forEach(b => (initCollapse[b.id] = true));
        setCollapsed(initCollapse);
      })
      .catch(e => console.error("Ошибка загрузки:", e))
      .finally(() => setLoading(false));
  }, []);

  // === SVG ИКОНКИ ===
  const IconFlame = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3C12 3 8 8 8 12C8 15.866 10.686 19 14 19C17.314 19 20 15.866 20 12C20 8 16 3 12 3Z"/>
    </svg>
  );
  const IconDroplet = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2C12 2 5 9.5 5 14C5 18.418 8.582 22 13 22C17.418 22 21 18.418 21 14C21 9.5 14 2 14 2Z"/>
    </svg>
  );
  const IconStar = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9 12 2"/>
    </svg>
  );
  const IconShield = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L4 5V11C4 17.627 8.477 21.681 12 22C15.523 21.681 20 17.627 20 11V5L12 2Z"/>
    </svg>
  );

  // === ЛАЙКИ, СОХРАНЕНИЕ, УДАЛЕНИЕ МИКСОВ ===
  const toggleLike = async (id) => {
    try {
      const res = await fetch(`/api/mixes/${id}/like`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        setMixes(mixes.map(m => m.id === id ? updated : m));
      }
    } catch (e) {
      console.error("Ошибка лайка:", e);
    }
  };

  const deleteMix = async (id) => {
    if (!confirm("Удалить микс?")) return;
    try {
      await fetch(`/api/mixes/${id}`, { method: "DELETE" });
      setMixes(mixes.filter(m => m.id !== id));
    } catch (e) {
      console.error("Ошибка удаления микса:", e);
    }
  };

  const saveMix = async () => {
    if (mixParts.length === 0) return alert("Добавьте хотя бы один вкус");
    const name = prompt("Название микса:");
    if (!name) return;

    const payload = {
      name,
      author: user?.first_name || "Аноним",
      strength,
      parts: mixParts
    };

    try {
      const res = await fetch("/api/mixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const newMix = await res.json();
      setMixes([...mixes, newMix]);
      setMixParts([]);
      alert("Микс сохранён!");
    } catch (e) {
      console.error("Ошибка сохранения:", e);
    }
  };

  if (loading) return <div className="panel"><p>Загрузка...</p></div>;
  // === ВКЛАДКА "МИКСЫ" ===
  const renderCommunity = () => (
    <div className="panel">
      <h2 className="tab-title"><IconStar /> Популярные миксы</h2>
      {mixes.length === 0 ? (
        <p className="muted">Пока нет сохранённых миксов</p>
      ) : (
        <div className="mix-list">
          {mixes.map(m => (
            <div key={m.id} className="mix-card">
              <div>
                <h4><IconFlame /> {m.name}</h4>
                <div className="meta">
                  Автор: {m.author || "Аноним"} • Крепость: {m.strength}
                </div>
                <div className="sub muted">
                  {m.parts?.map(p => p.name).join(", ") || "Без описания"}
                </div>
              </div>
              <div className="actions">
                <button className="btn small" onClick={() => toggleLike(m.id)}>
                  ❤ {m.likes || 0}
                </button>
                {isAdmin && (
                  <button
                    className="btn secondary small"
                    onClick={() => deleteMix(m.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // === КОНСТРУКТОР ===
  const addFlavor = (brand, flavor) => {
    if (mixParts.some(x => x.id === flavor.id)) return;
    setMixParts([...mixParts, { ...flavor, brand: brand.name }]);
  };

  const removeFlavor = (id) => {
    setMixParts(mixParts.filter(x => x.id !== id));
  };

  const renderBuilder = () => (
    <div className="builder">
      {/* === Ползунок крепости === */}
      <div className="panel flex-between mb-2">
        <div className="label">
          <IconDroplet /> Крепость: <b>{strength}</b>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          value={strength}
          onChange={e => setStrength(+e.target.value)}
          className="accent"
        />
      </div>

      {/* === Бренды и вкусы === */}
      <div className="brand-grid">
        {brands.map(b => (
          <div
            key={b.id}
            className={`brand-card ${collapsed[b.id] ? "" : "open"}`}
          >
            <div
              className="brand-header"
              onClick={() =>
                setCollapsed(c => ({ ...c, [b.id]: !c[b.id] }))
              }
            >
              <h3><IconFlame /> {b.name}</h3>
              <span className="arrow">{collapsed[b.id] ? "▼" : "▲"}</span>
            </div>

            <div
              className="flavors"
              style={{
                maxHeight: collapsed[b.id]
                  ? "0px"
                  : `${(b.flavors?.length || 0) * 48}px`,
                opacity: collapsed[b.id] ? 0 : 1,
                transition: "all 0.3s ease"
              }}
            >
              {(b.flavors || []).map(f => (
                <div
                  key={f.id}
                  className="flavor-item"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="info">
                    <div className="name">{f.name}</div>
                    <div className="sub">{f.type} • {f.taste}</div>
                  </div>
                  <button onClick={() => addFlavor(b, f)}>+ в микс</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* === Ваш микс === */}
      <div className="panel mt-3">
        <h3 className="tab-title"><IconStar /> Ваш микс</h3>
        {mixParts.length === 0 ? (
          <p className="muted">Добавьте вкусы, чтобы собрать микс</p>
        ) : (
          <div className="mix-part-list">
            {mixParts.map(p => (
              <div key={p.id} className="flavor-item small">
                <div className="info">
                  <div className="name"><IconFlame /> {p.name}</div>
                  <div className="sub">{p.brand} • {p.taste}</div>
                </div>
                <button
                  className="secondary"
                  onClick={() => removeFlavor(p.id)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="btn w-full mt-2" onClick={saveMix}>
              💾 Сохранить микс
            </button>
          </div>
        )}
      </div>
    </div>
  );
  // === ВКЛАДКА "АДМИН" ===
  const renderAdmin = () => (
    <div className="admin">
      <div className="panel">
        <h2 className="tab-title"><IconShield /> Управление библиотекой</h2>
        <p className="muted">
          Здесь вы можете экспортировать или импортировать библиотеку и миксы,
          а также управлять брендами и вкусами.
        </p>

        <div className="grid-2 gap">
          <button className="btn" onClick={() => window.open("/api/export/library")}>
            <IconFlame /> Скачать библиотеку
          </button>
          <button className="btn" onClick={() => window.open("/api/export/mixes")}>
            <IconDroplet /> Скачать миксы
          </button>
          <button className="btn secondary" onClick={() => document.getElementById("importLibrary").click()}>
            <IconStar /> Загрузить библиотеку
          </button>
          <button className="btn secondary" onClick={() => document.getElementById("importMixes").click()}>
            <IconStar /> Загрузить миксы
          </button>
        </div>

        {/* === Скрытые инпуты для импорта === */}
        <input
          id="importLibrary"
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={async e => {
            const file = e.target.files[0];
            if (!file) return;
            const text = await file.text();
            await fetch("/api/import/library", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: text
            });
            alert("Библиотека импортирована!");
          }}
        />
        <input
          id="importMixes"
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={async e => {
            const file = e.target.files[0];
            if (!file) return;
            const text = await file.text();
            await fetch("/api/import/mixes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: text
            });
            alert("Миксы импортированы!");
          }}
        />
      </div>

      {/* === СПИСОК БРЕНДОВ === */}
      <div className="panel mt-3">
        <h3 className="tab-title"><IconFlame /> Бренды и вкусы</h3>
        <div className="brand-grid">
          {brands.map(b => (
            <div key={b.id} className="brand-card small">
              <div className="brand-header">
                <h4><IconFlame /> {b.name}</h4>
                <span className="muted">{b.flavors?.length || 0} вкусов</span>
              </div>
              <div className="sub-list">
                {(b.flavors || []).slice(0, 3).map(f => (
                  <div key={f.id} className="sub muted">– {f.name}</div>
                ))}
                {b.flavors?.length > 3 && (
                  <div className="sub muted italic">...и другие</div>
                )}
              </div>
              <div className="btn-row mt-2">
                <button className="btn small">✎ Изменить</button>
                <button className="btn secondary small">✕ Удалить</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // === ГЛАВНЫЙ РЕНДЕР ===
  const tabs = [
    { id: "community", label: "Миксы", icon: <IconStar /> },
    { id: "builder", label: "Конструктор", icon: <IconDroplet /> },
    ...(isAdmin ? [{ id: "admin", label: "Админ", icon: <IconShield /> }] : [])
  ];

  return (
    <div className="app-wrapper">
      {/* === Вкладки === */}
      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* === Контент === */}
      <div className="content">
        {tab === "community" && renderCommunity()}
        {tab === "builder" && renderBuilder()}
        {tab === "admin" && renderAdmin()}
      </div>
    </div>
  );
}

// === РЕНДЕР ===
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
