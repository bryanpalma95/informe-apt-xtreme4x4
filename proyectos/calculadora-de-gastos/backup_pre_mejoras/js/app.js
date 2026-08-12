  /* ══════════════════════════════════════
     FIREBASE INIT
  ══════════════════════════════════════ */
  const firebaseConfig = {
    apiKey: "AIzaSyAm1ogHBKfbT5xEa0GBPGxn3JZ9O1FP7k4",
    authDomain: "control-de-usuarios-17170.firebaseapp.com",
    projectId: "control-de-usuarios-17170",
    storageBucket: "control-de-usuarios-17170.firebasestorage.app",
    messagingSenderId: "434859524662",
    appId: "1:434859524662:web:89a34291021a31f9b80e97",
    measurementId: "G-WJGGCQ4VM0"
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let currentUser = null;
  let userDocRef = null;

  /* ══════════════════════════════════════
     AUTH LOGIC
  ══════════════════════════════════════ */
  let authMode = 'login';

  function switchAuth(mode) {
    authMode = mode;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('authPassConfirmWrap').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('authBtn').textContent = mode === 'login' ? 'Iniciar Sesion' : 'Crear Cuenta';
    document.getElementById('authErr').style.display = 'none';
    document.getElementById('authOk').style.display = 'none';
  }

  function showAuthErr(msg) {
    const el = document.getElementById('authErr');
    el.textContent = msg; el.style.display = 'block';
    document.getElementById('authOk').style.display = 'none';
  }

  function showAuthOk(msg) {
    const el = document.getElementById('authOk');
    el.textContent = msg; el.style.display = 'block';
    document.getElementById('authErr').style.display = 'none';
  }

  function togglePassVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🙈';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  }
  async function doAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPass').value;
    if (!email || !pass) { showAuthErr('Completa todos los campos'); return; }
    if (pass.length < 6) { showAuthErr('La contrasena debe tener al menos 6 caracteres'); return; }

    if (authMode === 'register') {
      const pass2 = document.getElementById('authPassConfirm').value;
      if (pass !== pass2) { showAuthErr('Las contrasenas no coinciden'); return; }
    }

    try {
      document.getElementById('authBtn').disabled = true;
      document.getElementById('authBtn').textContent = 'Cargando...';

      if (authMode === 'login') {
        await auth.signInWithEmailAndPassword(email, pass);
      } else {
        await auth.createUserWithEmailAndPassword(email, pass);
      }
    } catch (err) {
      let msg = 'Error desconocido';
      switch (err.code) {
        case 'auth/user-not-found': msg = 'No existe una cuenta con este correo'; break;
        case 'auth/wrong-password': msg = 'Contrasena incorrecta'; break;
        case 'auth/invalid-credential': msg = 'Credenciales invalidas'; break;
        case 'auth/email-already-in-use': msg = 'Ya existe una cuenta con este correo'; break;
        case 'auth/weak-password': msg = 'La contrasena es muy debil (minimo 6 caracteres)'; break;
        case 'auth/invalid-email': msg = 'El correo no es valido'; break;
        case 'auth/too-many-requests': msg = 'Demasiados intentos. Espera un momento'; break;
        default: msg = err.message;
      }
      showAuthErr(msg);
      document.getElementById('authBtn').disabled = false;
      document.getElementById('authBtn').textContent = authMode === 'login' ? 'Iniciar Sesion' : 'Crear Cuenta';
    }
  }

  function doLogout() {
    if (!confirm('¿Cerrar sesion?')) return;
    auth.signOut();
  }

  async function doResetPassword() {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) {
      showAuthErr('Ingresa tu correo electronico para recuperar la contrasena');
      return;
    }
    try {
      await auth.sendPasswordResetEmail(email);
      showAuthOk('Se envio un enlace de recuperacion a ' + email + '. Revisa tu bandeja de entrada y la carpeta de Spam/Correo no deseado.');
    } catch (err) {
      let msg = 'Error al enviar el correo';
      switch (err.code) {
        case 'auth/user-not-found': msg = 'No existe una cuenta con este correo'; break;
        case 'auth/invalid-email': msg = 'El correo no es valido'; break;
        case 'auth/too-many-requests': msg = 'Demasiados intentos. Espera un momento'; break;
        default: msg = err.message;
      }
      showAuthErr(msg);
    }
  }

  // Auth state observer
  auth.onAuthStateChanged(async (user) => {
    document.getElementById('loadingScreen').style.display = 'none';
    if (user) {
      currentUser = user;
      userDocRef = db.collection('users').doc(user.uid);
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      document.getElementById('userEmail').textContent = user.email;
      await loadDataFromFirestore();
    } else {
      currentUser = null;
      userDocRef = null;
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('authBtn').disabled = false;
      document.getElementById('authBtn').textContent = authMode === 'login' ? 'Iniciar Sesion' : 'Crear Cuenta';
    }
  });
  /* ══════════════════════════════════════
     FIRESTORE SYNC
  ══════════════════════════════════════ */
  async function loadDataFromFirestore() {
    try {
      const doc = await userDocRef.get();
      if (doc.exists) {
        const data = doc.data();
        ints = data.integrantes || [];
        movs = data.movimientos || [];
        budgetLimit = data.budget_limit || 0;
        metasData = data.metas || { emergencia_total: 0, ahorro_asignaciones: [], gustos_asignaciones: [] };
        customCategories = data.custom_categories || [];
        cycleStartDay = data.cycle_start_day || 1;
        refreshCategoryData();
        if (document.getElementById('cycleLabel')) document.getElementById('cycleLabel').textContent = cycleStartDay;
        console.log('✅ Datos cargados desde Firestore:', {ints: ints.length, movs: movs.length});
      } else {
        // New user — start fresh
        ints = []; movs = []; budgetLimit = 0;
        metasData = { emergencia_total: 0, ahorro_asignaciones: [], gustos_asignaciones: [] };
        customCategories = [];
        refreshCategoryData();
        await saveAllToFirestore();
        console.log('✅ Usuario nuevo, documento creado');
      }
    } catch (e) {
      console.error('❌ Error cargando datos:', e);
      alert('Error al cargar datos desde la nube: ' + e.message + '\n\nVerifica:\n1. Que publicaste las reglas de Firestore\n2. Que no estas abriendo el archivo con file:// (usa un servidor local)');
      // Fallback to empty
      ints = []; movs = []; budgetLimit = 0;
      metasData = { emergencia_total: 0, ahorro_asignaciones: [], gustos_asignaciones: [] };
      customCategories = [];
      refreshCategoryData();
    }
    renderInts(); renderGass(); renderP();
    restoreTab();
  }

  let isSaving = false;
  let pendingSave = false;

  async function saveAllToFirestore() {
    if (!userDocRef) return;
    if (isSaving) { pendingSave = true; return; }
    isSaving = true;
    try {
      await userDocRef.set({
        integrantes: ints,
        movimientos: movs,
        budget_limit: budgetLimit,
        metas: metasData,
        custom_categories: customCategories,
        cycle_start_day: cycleStartDay,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('✅ Datos guardados en Firestore');
    } catch (e) {
      console.error('❌ Error guardando datos:', e);
      alert('Error al guardar datos: ' + e.message + '\nRevisa la consola del navegador (F12).');
    } finally {
      isSaving = false;
      if (pendingSave) {
        pendingSave = false;
        saveAllToFirestore();
      }
    }
  }

  // Save immediately on each change (no debounce)
  function scheduleSave() {
    saveAllToFirestore();
  }

  // Force save before page unload
  window.addEventListener('beforeunload', () => {
    if (userDocRef && (ints.length || gass.length || movs.length)) {
      navigator.sendBeacon && userDocRef.set({
        integrantes: ints,
        movimientos: movs,
        budget_limit: budgetLimit
      }, { merge: true });
    }
  });

  /* ══════════════════════════════════════
     UTILIDADES COMPARTIDAS
  ══════════════════════════════════════ */
  const fmt = n => '$' + Math.round(Math.abs(n)).toLocaleString('es-CL');
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function getRaw(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const v = el.value.replace(/\./g,'').replace(',','.');
    return parseFloat(v) || 0;
  }

  function setupFmt(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
      const pos = this.selectionStart;
      const raw = this.value.replace(/\D/g,'');
      if (!raw) { this.value = ''; return; }
      const fmtd = parseInt(raw,10).toLocaleString('es-CL');
      const diff = fmtd.length - this.value.length;
      this.value = fmtd;
      try { this.setSelectionRange(pos+diff, pos+diff); } catch(e){}
    });
  }
  /* ══════════════════════════════════════
     COLORES Y EMOJIS POR CATEGORIA
  ══════════════════════════════════════ */
  const DEFAULT_CATS = [
    {name:'Vivienda', emoji:'🏠', color:'#7986cb'},
    {name:'Alimentacion', emoji:'🛒', color:'#4db6ac'},
    {name:'Transporte', emoji:'🚗', color:'#ffb74d'},
    {name:'Salud', emoji:'🏥', color:'#ef5350'},
    {name:'Educacion', emoji:'📚', color:'#ba68c8'},
    {name:'Entretenimiento', emoji:'🎮', color:'#4fc3f7'},
    {name:'Ropa', emoji:'👕', color:'#a1887f'},
    {name:'Servicios', emoji:'💡', color:'#81c784'},
    {name:'Sueldo', emoji:'💼', color:'#38ef7d'},
    {name:'Personal', emoji:'☕', color:'#78909c'},
    {name:'Otro', emoji:'📦', color:'#90a4ae'}
  ];
  let customCategories = [];

  function getAllCategories() {
    return [...DEFAULT_CATS, ...customCategories];
  }

  function getEmojis() {
    const obj = {};
    getAllCategories().forEach(c => { obj[c.name] = c.emoji; });
    return obj;
  }

  function getCatColors() {
    const obj = {};
    getAllCategories().forEach(c => { obj[c.name] = c.color; });
    return obj;
  }

  let EMOJIS = getEmojis();
  let CAT_COLORS = getCatColors();

  function refreshCategoryData() {
    EMOJIS = getEmojis();
    CAT_COLORS = getCatColors();
    renderCategorySelect();
  }

  function renderCategorySelect() {
    const sel = document.getElementById('pCat');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="__new__">➕ Nueva categoria...</option>' +
      getAllCategories().map(c =>
        `<option value="${c.name}">${c.emoji} ${c.name}</option>`
      ).join('');
    if (current && current !== '__new__' && [...sel.options].some(o => o.value === current)) {
      sel.value = current;
    } else {
      sel.value = getAllCategories()[0].name;
    }
  }

  function addCustomCategory() {
    openModal('➕ Nueva Categoria', `
      <div class="fg"><label>Nombre</label>
        <input type="text" id="newCatName" placeholder="Ej: Mascotas, Auto, Delivery..." maxlength="20"></div>
      <div class="fg"><label>Emoji</label>
        <input type="text" id="newCatEmoji" placeholder="Ej: 🐶 🚗 🍕" maxlength="2" style="font-size:1.5rem;text-align:center"></div>
      <div class="fg"><label>¿A que grupo pertenece?</label>
        <select id="newCatGroup">
          <option value="ninguno">Sin grupo (solo balance general)</option>
          <option value="gustos">🎉 Gustos y Salidas</option>
          <option value="fijos">🏠 Gastos Fijos del Hogar</option>
        </select></div>
    `, function() {
      const name = document.getElementById('newCatName').value.trim();
      const emoji = document.getElementById('newCatEmoji').value.trim() || '📌';
      const group = document.getElementById('newCatGroup').value;
      if (!name) { alert('Ingresa un nombre para la categoria'); return false; }
      // Check duplicates
      if (getAllCategories().some(c => c.name.toLowerCase() === name.toLowerCase())) {
        alert('Ya existe una categoria con ese nombre'); return false;
      }
      // Random color
      const colors = ['#e91e63','#9c27b0','#673ab7','#3f51b5','#009688','#ff5722','#795548','#607d8b','#4caf50','#ff9800'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      customCategories.push({ name, emoji, color, group });
      scheduleSave();
      refreshCategoryData();
      // Select the new category
      document.getElementById('pCat').value = name;
      return true;
    });
  }

  // Categories for auto-calculation (base + custom)
  const BASE_GUSTOS_CATS = ['Entretenimiento', 'Ropa'];
  const BASE_FIJOS_CATS = ['Vivienda', 'Alimentacion', 'Transporte', 'Servicios', 'Educacion', 'Salud'];

  function getGustosCats() {
    const custom = customCategories.filter(c => c.group === 'gustos').map(c => c.name);
    return [...BASE_GUSTOS_CATS, ...custom];
  }

  function getFijosCats() {
    const custom = customCategories.filter(c => c.group === 'fijos').map(c => c.name);
    return [...BASE_FIJOS_CATS, ...custom];
  }

  function getCurrentMonthYear() {
    const now = new Date();
    return getCycleForDate(now);
  }

  // Returns {month, year, startDate, endDate} for the cycle that contains the given date
  function getCycleForDate(date) {
    const day = date.getDate();
    let month, year;

    if (cycleStartDay === 1) {
      // Normal calendar month
      month = date.getMonth();
      year = date.getFullYear();
    } else {
      // Custom cycle: if today is before the start day, we're in the previous cycle
      if (day < cycleStartDay) {
        // We're in cycle that started last month
        const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
        month = prev.getMonth();
        year = prev.getFullYear();
      } else {
        // We're in cycle that started this month
        month = date.getMonth();
        year = date.getFullYear();
      }
    }
    return { month, year };
  }

  // Check if a timestamp falls within a given cycle (month/year)
  function isInCycle(ts, targetMonth, targetYear) {
    const d = new Date(ts);
    if (cycleStartDay === 1) {
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    }
    // Custom cycle: from startDay of targetMonth/Year to startDay-1 of next month
    const cycleStart = new Date(targetYear, targetMonth, cycleStartDay);
    const cycleEnd = new Date(targetYear, targetMonth + 1, cycleStartDay);
    return d >= cycleStart && d < cycleEnd;
  }

  /* ══════════════════════════════════════
     GRAFICO INTERACTIVO SVG DONUT
  ══════════════════════════════════════ */
  function renderDonutSVG(containerId, pcMap) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const entries = Object.entries(pcMap).sort((a,b)=>b[1]-a[1]);
    const total = entries.reduce((s, [,v]) => s + v, 0);
    if (!total || !entries.length) { el.innerHTML = ''; return; }

    const r = 50, circ = 2 * Math.PI * r;
    let accumulatedAngle = 0;
    let circlesHTML = '';
    let legendHTML = '';

    entries.forEach(([cat, val]) => {
      const pct = val / total;
      const strokeDash = `${pct * circ} ${circ}`;
      const offset = accumulatedAngle * circ;
      const color = CAT_COLORS[cat] || '#90a4ae';
      const pctTxt = (pct * 100).toFixed(1) + '%';

      circlesHTML += `<circle r="${r}" cx="80" cy="80" fill="transparent" stroke="${color}" stroke-width="18" stroke-dasharray="${strokeDash}" stroke-dashoffset="-${offset}" style="transition:all 0.5s ease" />`;
      legendHTML += `<div class="donut-item"><div class="donut-dot" style="background:${color}"></div><span style="flex:1">${EMOJIS[cat]||'📦'} ${cat}</span><strong style="color:var(--t1)">${fmt(val)}</strong><span style="color:var(--tm);font-size:11px">(${pctTxt})</span></div>`;
      accumulatedAngle += pct;
    });

    el.innerHTML = `<div class="donut-container"><svg class="donut-svg" viewBox="0 0 160 160">${circlesHTML}</svg><div class="donut-legend">${legendHTML}</div></div>`;
  }

  /* ══════════════════════════════════════
     MODAL REUTILIZABLE DE EDICION
  ══════════════════════════════════════ */
  function closeModal() { document.getElementById('editModal').style.display = 'none'; }

  function openModal(title, bodyHTML, onSave) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;
    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.onclick = function() { if (onSave()) closeModal(); };
    document.getElementById('editModal').style.display = 'flex';
  }
  function editInt(id) {
    const item = ints.find(i => i.id === id);
    if (!item) return;
    openModal('✏️ Editar Integrante', `
      <div class="fg"><label>Nombre</label><input type="text" id="mNombre" value="${esc(item.n)}"></div>
      <div class="fg"><label>Ingreso ($)</label><input type="text" id="mIngreso" value="${item.v.toLocaleString('es-CL')}" inputmode="numeric"></div>
    `, function() {
      const n = document.getElementById('mNombre').value.trim();
      const v = getRaw('mIngreso');
      if (!n || v <= 0) { alert('Ingresa datos validos'); return false; }
      item.n = n; item.v = v;
      scheduleSave(); renderInts(); hideRes();
      return true;
    });
    setupFmt('mIngreso');
  }

  function editMov(id) {
    const item = movs.find(m => m.id === id);
    if (!item) return;
    const catOpts = Object.keys(EMOJIS).map(c => `<option value="${c}" ${c===item.c?'selected':''}>${EMOJIS[c]} ${c}</option>`).join('');
    openModal('✏️ Editar Movimiento Personal', `
      <div class="fg"><label>Descripcion</label><input type="text" id="mDesc" value="${esc(item.d)}"></div>
      <div class="fg"><label>Monto ($)</label><input type="text" id="mMonto" value="${item.v.toLocaleString('es-CL')}" inputmode="numeric"></div>
      <div class="fg"><label>Categoria</label><select id="mCat">${catOpts}</select></div>
      <div class="fg"><label>Tipo</label><select id="mTipo">
        <option value="gasto" ${item.t==='gasto'?'selected':''}>🔴 Gasto</option>
        <option value="ingreso" ${item.t==='ingreso'?'selected':''}>🟢 Ingreso</option>
      </select></div>
      <div style="margin-top:6px"><label style="font-size:0.82rem;cursor:pointer;color:var(--t1)"><input type="checkbox" id="mRec" ${item.rec?'checked':''}> 🔄 Gasto Fijo / Recurrente</label></div>
    `, function() {
      const d = document.getElementById('mDesc').value.trim();
      const v = getRaw('mMonto');
      const c = document.getElementById('mCat').value;
      const t = document.getElementById('mTipo').value;
      const rec = document.getElementById('mRec').checked;
      if (!d || v <= 0) { alert('Ingresa datos validos'); return false; }
      item.d = d; item.v = v; item.c = c; item.t = t; item.rec = rec;
      scheduleSave(); renderP();
      if (document.getElementById('panel-resumen').classList.contains('active')) renderResumen();
      return true;
    });
    setupFmt('mMonto');
  }
  /* ══════════════════════════════════════
     TEMA
  ══════════════════════════════════════ */
  function toggleTheme(){
    const d = document.documentElement.getAttribute('data-theme')==='dark';
    applyTheme(d ? 'light' : 'dark');
    localStorage.setItem('tema_calc', d ? 'light' : 'dark');
  }
  function applyTheme(t){
    document.documentElement.setAttribute('data-theme',t);
    const d = t==='dark';
    document.getElementById('tKnob').textContent = d ? '☀️' : '🌙';
    document.getElementById('tLabel').textContent = d ? 'Modo Claro' : 'Modo Oscuro';
  }
  (function(){
    const s = localStorage.getItem('tema_calc') ||
      (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
    applyTheme(s);
  })();

  /* ══════════════════════════════════════
     SIDEBAR
  ══════════════════════════════════════ */
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }

  /* ══════════════════════════════════════
     TABS
  ══════════════════════════════════════ */
  function switchTab(name, btn){
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .sidebar-item').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-'+name).classList.add('active');
    if (btn) btn.classList.add('active');
    if (name === 'hogar') renderGass();
    if (name === 'resumen') initResumen();
    if (name === 'metas') renderMetasPanel();
    localStorage.setItem('active_tab', name);
    closeSidebar();
  }

  // Restore active tab on load
  function restoreTab() {
    const saved = localStorage.getItem('active_tab');
    if (saved && document.getElementById('panel-' + saved)) {
      const btns = document.querySelectorAll('.sidebar-nav .sidebar-item');
      const tabs = ['hogar', 'personal', 'metas', 'resumen', 'calc'];
      const idx = tabs.indexOf(saved);
      if (idx >= 0 && btns[idx]) {
        switchTab(saved, btns[idx]);
      }
    }
  }

  function renderMetasPanel() {
    const ti = movs.filter(m => m.t === 'ingreso').reduce((s, m) => s + m.v, 0);
    const tg = movs.filter(m => m.t === 'gasto').reduce((s, m) => s + m.v, 0);
    const noData = document.getElementById('metasNoData');
    const body = document.getElementById('metasBody');
    if (ti > 0) {
      if (noData) noData.style.display = 'none';
      body.style.display = 'flex';
      document.getElementById('metaSueldo').textContent = fmt(ti);
      renderMetas(ti, tg);
    } else {
      if (noData) noData.style.display = 'block';
      body.style.display = 'none';
    }
    renderCategoryBudgets();
  }

  /* ══════════════════════════════════════
     HOGAR
  ══════════════════════════════════════ */
  let ints = [];

  function addInt(){
    const n = document.getElementById('iNombre').value.trim();
    const v = getRaw('iIngreso');
    if (!n)     { alert('Ingresa el nombre'); return; }
    if (v <= 0) { alert('Ingresa un ingreso valido'); return; }
    ints.push({id:Date.now(), n, v});
    document.getElementById('iNombre').value = '';
    document.getElementById('iIngreso').value = '';
    scheduleSave(); renderInts(); hideRes();
    document.getElementById('iNombre').focus();
  }

  function delInt(id){ ints=ints.filter(i=>i.id!==id); scheduleSave(); renderInts(); hideRes(); }

  function renderInts(){
    const tot = ints.reduce((s,i)=>s+i.v, 0);
    const e=document.getElementById('emptyInt'), w=document.getElementById('wrapInt');
    if (!ints.length){ e.style.display='block'; w.style.display='none'; return; }
    e.style.display='none'; w.style.display='block';
    document.getElementById('bodyInt').innerHTML = ints.map(i=>{
      const p = ((i.v/tot)*100).toFixed(1);
      return `<tr><td>${esc(i.n)}</td><td>${fmt(i.v)}</td>
        <td class="col-prop">${p}%</td>
        <td style="text-align:right">
          <button class="bs" style="padding:4px 8px;font-size:.75rem" onclick="editInt(${i.id})">✏️</button>
          <button class="bd" onclick="delInt(${i.id})">✕</button>
        </td></tr>`;
    }).join('');
  }
  function getHogarGastos() {
    const { month, year } = getCurrentMonthYear();
    return movs.filter(m => {
      if (m.t !== 'gasto' || !m.rec) return false;
      if (!getFijosCats().includes(m.c)) return false;
      return isInCycle(m.ts || m.id, month, year);
    });
  }

  function renderGass(){
    const gastos = getHogarGastos();
    const e=document.getElementById('emptyGasAuto'), w=document.getElementById('wrapGas');
    const tb=document.getElementById('tboxGas');
    if (!gastos.length){ e.style.display='block'; w.style.display='none'; tb.style.display='none'; return; }
    e.style.display='none'; w.style.display='block'; tb.style.display='flex';
    const tot = gastos.reduce((s,g)=>s+g.v, 0);
    document.getElementById('tvGas').textContent = fmt(tot);
    document.getElementById('bodyGas').innerHTML = gastos.map(g=>`
      <tr><td>${esc(g.d)}</td><td>${EMOJIS[g.c]||'📦'} ${g.c}</td><td>${fmt(g.v)}</td></tr>
    `).join('');
  }

  function limpiarHogar(){
    if (!ints.length) return;
    if (!confirm('¿Borrar todos los integrantes?')) return;
    ints=[]; scheduleSave(); renderInts(); hideRes();
  }

  function hideRes(){ document.getElementById('resCard').style.display='none'; }

  function calcular(){
    if (!ints.length){ alert('Agrega al menos un integrante'); return; }
    const gastos = getHogarGastos();
    if (!gastos.length){ alert('No hay gastos fijos registrados este mes. Ve a Personal y agrega gastos marcados como Recurrente.'); return; }
    const tg = gastos.reduce((s,g)=>s+g.v, 0);
    const ti = ints.reduce((s,i)=>s+i.v, 0);
    const body = document.getElementById('resBody');
    body.innerHTML = '';
    let ts = 0;
    ints.forEach(i=>{
      const p=i.v/ti, a=tg*p, sob=i.v-a, pct=(p*100).toFixed(1);
      ts += sob;
      const div = document.createElement('div');
      div.className = 'ritem';
      div.innerHTML = `
        <div class="ri">
          <div class="rn">${esc(i.n)}</div>
          <div class="rd2">Ingreso: ${fmt(i.v)} · ${pct}% del hogar</div>
          <div class="pb"><div class="pf" style="width:${pct}%"></div></div>
        </div>
        <div class="rm">
          <div class="ra">${fmt(a)}</div>
          <div class="rs ${sob>=0?'sp':'sn'}">${sob>=0?'Le sobran':'Le falta'} ${fmt(sob)}</div>
        </div>`;
      body.appendChild(div);
    });
    const sg = document.createElement('div');
    sg.className = 'sgrid';
    sg.innerHTML = `
      <div class="sc"><div class="sl">Total gastos</div><div class="sv svr">${fmt(tg)}</div></div>
      <div class="sc"><div class="sl">Ingresos totales</div><div class="sv svg">${fmt(ti)}</div></div>
      <div class="sc"><div class="sl">Gastos/Ingresos</div><div class="sv sva">${((tg/ti)*100).toFixed(1)}%</div></div>
      <div class="sc"><div class="sl">Sobrante total</div><div class="sv ${ts>=0?'svg':'svr'}">${fmt(ts)}</div></div>`;
    body.appendChild(sg);
    const card = document.getElementById('resCard');
    card.style.display = 'block';
    card.scrollIntoView({behavior:'smooth', block:'start'});
  }
  /* ══════════════════════════════════════
     PERSONAL & PRESUPUESTO
  ══════════════════════════════════════ */
  let movs = [];
  let filtP = 'todos';
  let budgetLimit = 0;
  let metasData = { emergencia_total: 0, ahorro_asignaciones: [], gustos_asignaciones: [] };
  let cycleStartDay = 1; // Dia de inicio del ciclo mensual (1 = calendario normal)

  function addMov(){
    const d = document.getElementById('pDesc').value.trim();
    const v = getRaw('pMonto');
    const c = document.getElementById('pCat').value;
    const t = document.getElementById('pTipo').value;
    const rec = document.getElementById('pRecurrente').checked;

    if (!d)     { alert('Ingresa una descripcion'); return; }
    if (v <= 0) { alert('Ingresa un monto valido'); return; }

    movs.unshift({
      id: Date.now(), d, v, c, t, rec,
      f: new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'short'}),
      ts: Date.now()
    });

    document.getElementById('pDesc').value = '';
    document.getElementById('pMonto').value = '';
    document.getElementById('pRecurrente').checked = false;

    scheduleSave(); renderP();
    document.getElementById('pDesc').focus();
  }

  function delMov(id){ movs=movs.filter(m=>m.id!==id); scheduleSave(); renderP(); }

  function filtrarP(t, btn){
    filtP = t;
    document.querySelectorAll('#panel-personal .pfilter-bar .tab').forEach(b=>{
      b.style.background='rgba(255,255,255,.12)'; b.style.color='rgba(255,255,255,.7)';
    });
    btn.style.background='rgba(255,255,255,.25)'; btn.style.color='#fff';
    renderP();
  }

  function limpiarPersonal(){
    if (!movs.length) return;
    if (!confirm('¿Eliminar todos los movimientos?')) return;
    movs=[]; scheduleSave(); renderP();
  }
  function renderP(){
    const ti = movs.filter(m=>m.t==='ingreso').reduce((s,m)=>s+m.v, 0);
    const tg = movs.filter(m=>m.t==='gasto').reduce((s,m)=>s+m.v, 0);
    const bal = ti-tg;

    document.getElementById('pIngresos').textContent = fmt(ti);
    document.getElementById('pGastos').textContent = fmt(tg);
    const bel = document.getElementById('pBalance');
    bel.textContent = (bal<0?'-':'') + fmt(bal);
    bel.className = 'pv pvb' + (bal<0?' neg':'');

    const lista = document.getElementById('pLista');
    const fil = filtP==='todos' ? movs : movs.filter(m=>m.t===filtP);
    lista.innerHTML = !fil.length
      ? `<div class="mitem" style="justify-content:center;background:var(--card)">
           <span style="color:var(--tm);font-size:.9rem;padding:16px">No hay movimientos aqui</span></div>`
      : fil.map(m=>`
          <div class="mitem">
            <div class="micon ${m.t==='gasto'?'ig':'ii'}">${EMOJIS[m.c]||'📦'}</div>
            <div class="minfo">
              <div class="mn">${esc(m.d)} ${m.rec ? '<span class="rec-tag">🔄 Fijo</span>' : ''}</div>
              <div class="mm2">${m.c} · ${m.f}</div>
            </div>
            <div class="mamt ${m.t==='gasto'?'mg':'mi2'}">${m.t==='gasto'?'−':'+'}${fmt(m.v)}</div>
            <button class="bdel" style="color:var(--ac);margin-right:2px" onclick="editMov(${m.id})">✏️</button>
            <button class="bdel" onclick="delMov(${m.id})">✕</button>
          </div>`).join('');

    const cw = document.getElementById('pCatWrap');
    const gas2 = movs.filter(m=>m.t==='gasto');
    if (!gas2.length){ cw.style.display='none'; return; }
    cw.style.display='block';
    const pc={};
    gas2.forEach(m=>{ pc[m.c]=(pc[m.c]||0)+m.v; });
    const mx = Math.max(...Object.values(pc));

    renderDonutSVG('pDonutChart', pc);

    document.getElementById('pCatLista').innerHTML = Object.entries(pc)
      .sort((a,b)=>b[1]-a[1])
      .map(([c,tot])=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="font-size:13px;min-width:90px;max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--t1)">${EMOJIS[c]||'📦'} ${c}</div>
          <div style="flex:1;height:6px;background:var(--sub);border-radius:100px;overflow:hidden">
            <div style="height:100%;width:${(tot/mx)*100}%;background:var(--ac);border-radius:100px;transition:width .4s"></div>
          </div>
          <div style="font-size:12px;color:var(--tm);min-width:70px;text-align:right;white-space:nowrap">${fmt(tot)}</div>
        </div>`).join('');
  }

  /* ══════════════════════════════════════
     METAS FINANCIERAS
  ══════════════════════════════════════ */
  function getMonthlyAssigned(arr) {
    const { month, year } = getCurrentMonthYear();
    return (arr || []).filter(a => a.month === month && a.year === year).reduce((s, a) => s + a.amount, 0);
  }

  function renderMetas(ingresos, gastosTotales) {
    const targetAhorro = ingresos * 0.1;
    const targetGustos = ingresos * 0.2;
    const targetFijos = ingresos * 0.7;
    const targetEmergencia = ingresos * 4;
    const targetInversion = ingresos * 200;

    const { month, year } = getCurrentMonthYear();

    // Ahorro mensual (manual assignment)
    const ahorroActual = getMonthlyAssigned(metasData.ahorro_asignaciones);
    const ahorroPct = targetAhorro > 0 ? Math.min((ahorroActual / targetAhorro) * 100, 100) : 0;
    document.getElementById('metaAhorroTarget').textContent = fmt(targetAhorro);
    document.getElementById('metaAhorroActual').textContent = fmt(ahorroActual);
    document.getElementById('metaAhorroPct').textContent = Math.round(ahorroPct) + '%';
    document.getElementById('metaAhorroBarra').style.width = ahorroPct + '%';

    // Gustos y salidas (AUTO: from Entretenimiento + Ropa categories this month)
    const gustosActual = movs.filter(m => {
      if (m.t !== 'gasto') return false;
      return isInCycle(m.ts || m.id, month, year) && getGustosCats().includes(m.c);
    }).reduce((s, m) => s + m.v, 0);
    const gustosPct = targetGustos > 0 ? Math.min((gustosActual / targetGustos) * 100, 100) : 0;
    document.getElementById('metaGustosTarget').textContent = fmt(targetGustos);
    document.getElementById('metaGustosActual').textContent = fmt(gustosActual);
    document.getElementById('metaGustosPct').textContent = Math.round(gustosPct) + '%';
    const gustosBarra = document.getElementById('metaGustosBarra');
    gustosBarra.style.width = gustosPct + '%';
    gustosBarra.style.background = gustosPct >= 80 ? 'linear-gradient(90deg,var(--yw),var(--rd))' : 'linear-gradient(90deg,#ec4899,#db2777)';

    // Gastos fijos (AUTO: from fixed categories marked as recurrent this month)
    const fijosMes = movs.filter(m => {
      if (m.t !== 'gasto') return false;
      return isInCycle(m.ts || m.id, month, year) && m.rec && getFijosCats().includes(m.c);
    }).reduce((s, m) => s + m.v, 0);
    const fijosPct = targetFijos > 0 ? Math.min((fijosMes / targetFijos) * 100, 100) : 0;
    document.getElementById('metaFijosTarget').textContent = fmt(targetFijos);
    document.getElementById('metaFijosActual').textContent = fmt(fijosMes);
    document.getElementById('metaFijosPct').textContent = Math.round(fijosPct) + '%';
    const fijosBarra = document.getElementById('metaFijosBarra');
    fijosBarra.style.width = fijosPct + '%';
    fijosBarra.style.background = fijosPct >= 90 ? 'linear-gradient(90deg,var(--yw),var(--rd))' : 'linear-gradient(90deg,var(--rd),var(--rd2))';
    const fijosAlert = document.getElementById('metaFijosAlert');
    if (fijosPct >= 100) {
      fijosAlert.textContent = '⚠️ Has superado el tope de gastos fijos recomendado';
      fijosAlert.style.display = 'block';
      fijosAlert.style.color = 'var(--rd)';
    } else if (fijosPct >= 85) {
      fijosAlert.textContent = '⚡ Estas cerca del limite de gastos fijos (' + Math.round(fijosPct) + '%)';
      fijosAlert.style.display = 'block';
      fijosAlert.style.color = '#d97706';
    } else {
      fijosAlert.style.display = 'none';
    }

    // Fondo de emergencia (acumulado total, manual)
    const emergenciaActual = metasData.emergencia_total || 0;
    const emergenciaPct = targetEmergencia > 0 ? Math.min((emergenciaActual / targetEmergencia) * 100, 100) : 0;
    document.getElementById('metaEmergenciaTarget').textContent = fmt(targetEmergencia);
    document.getElementById('metaEmergenciaActual').textContent = fmt(emergenciaActual);
    document.getElementById('metaEmergenciaPct').textContent = emergenciaPct.toFixed(1) + '%';
    document.getElementById('metaEmergenciaBarra').style.width = emergenciaPct + '%';

    // Meta inversion (proyeccion basada en ahorro mensual)
    document.getElementById('metaInversionTarget').textContent = fmt(targetInversion);
    const ahorroMensualReal = ahorroActual > 0 ? ahorroActual : targetAhorro;
    const mesesParaMeta = ahorroMensualReal > 0 ? Math.ceil(targetInversion / ahorroMensualReal) : 0;
    const anios = Math.floor(mesesParaMeta / 12);
    const mesesResto = mesesParaMeta % 12;
    const proyeccionText = mesesParaMeta > 0 ? (anios > 0 ? anios + ' anos ' + mesesResto + ' meses' : mesesResto + ' meses') : '—';
    document.getElementById('metaInversionProyeccion').textContent = proyeccionText;
    const ahorroTotal = (metasData.ahorro_asignaciones || []).reduce((s, a) => s + a.amount, 0);
    const invPct = targetInversion > 0 ? Math.min((ahorroTotal / targetInversion) * 100, 100) : 0;
    document.getElementById('metaInversionPct').textContent = invPct.toFixed(2) + '%';
    document.getElementById('metaInversionBarra').style.width = invPct + '%';
  }

  function addToMeta(tipo) {
    let label, placeholder;
    if (tipo === 'ahorro') {
      label = '¿Cuanto asignas a ahorro este mes?';
      placeholder = 'Ej: 100.000';
    } else if (tipo === 'emergencia') {
      label = '¿Cuanto agregas al fondo de emergencia?';
      placeholder = 'Ej: 50.000';
    }

    openModal('💰 Asignar a Meta', `
      <div class="fg"><label>${label}</label>
        <input type="text" id="metaMontoInput" placeholder="${placeholder}" inputmode="numeric">
      </div>
    `, function() {
      const v = getRaw('metaMontoInput');
      if (v <= 0) { alert('Ingresa un monto valido'); return false; }

      const { month, year } = getCurrentMonthYear();

      if (tipo === 'ahorro') {
        if (!metasData.ahorro_asignaciones) metasData.ahorro_asignaciones = [];
        metasData.ahorro_asignaciones.push({ amount: v, ts: Date.now(), month, year });
      } else if (tipo === 'emergencia') {
        metasData.emergencia_total = (metasData.emergencia_total || 0) + v;
      }

      scheduleSave();
      renderMetasPanel();
      return true;
    });
    setupFmt('metaMontoInput');
  }

  /* ══════════════════════════════════════
     PRESUPUESTOS POR CATEGORIA
  ══════════════════════════════════════ */
  function addCategoryBudget() {
    const cats = getAllCategories().filter(c => c.name !== 'Sueldo');
    const opts = cats.map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
    openModal('📋 Definir Presupuesto', `
      <div class="fg"><label>Categoria</label>
        <select id="budgetCat">${opts}</select></div>
      <div class="fg"><label>Limite mensual ($)</label>
        <input type="text" id="budgetLimit" placeholder="Ej: 100.000" inputmode="numeric"></div>
    `, function() {
      const cat = document.getElementById('budgetCat').value;
      const limit = getRaw('budgetLimit');
      if (!cat) { alert('Selecciona una categoria'); return false; }
      if (limit <= 0) { alert('Ingresa un monto valido'); return false; }
      if (!metasData.category_budgets) metasData.category_budgets = {};
      metasData.category_budgets[cat] = limit;
      scheduleSave();
      renderCategoryBudgets();
      return true;
    });
    setupFmt('budgetLimit');
  }

  function removeCategoryBudget(cat) {
    if (!confirm('¿Eliminar presupuesto de ' + cat + '?')) return;
    delete metasData.category_budgets[cat];
    scheduleSave();
    renderCategoryBudgets();
  }

  function renderCategoryBudgets() {
    const budgets = metasData.category_budgets || {};
    const keys = Object.keys(budgets);
    const emptyEl = document.getElementById('catBudgetsEmpty');
    const listEl = document.getElementById('catBudgetsList');

    if (!keys.length) {
      emptyEl.style.display = 'block';
      listEl.innerHTML = '';
      return;
    }
    emptyEl.style.display = 'none';

    const { month, year } = getCurrentMonthYear();

    listEl.innerHTML = keys.map(cat => {
      const limit = budgets[cat];
      const spent = movs.filter(m => {
        if (m.t !== 'gasto' || m.c !== cat) return false;
        return isInCycle(m.ts || m.id, month, year);
      }).reduce((s, m) => s + m.v, 0);

      const pct = Math.min((spent / limit) * 100, 100);
      const emoji = EMOJIS[cat] || '📦';
      let barColor = 'linear-gradient(90deg,var(--gr),var(--ac))';
      let statusText = '';
      if (pct >= 100) {
        barColor = 'linear-gradient(90deg,var(--rd),var(--rd2))';
        statusText = `<span style="color:var(--rd);font-size:.75rem;font-weight:600">⚠️ Superado por ${fmt(spent - limit)}</span>`;
      } else if (pct >= 80) {
        barColor = 'linear-gradient(90deg,var(--yw),var(--rd))';
        statusText = `<span style="color:#d97706;font-size:.75rem;font-weight:600">⚡ Quedan ${fmt(limit - spent)}</span>`;
      }

      return `
        <div style="padding:12px;background:var(--sub);border-radius:10px;border-left:4px solid ${CAT_COLORS[cat] || '#90a4ae'}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:16px">${emoji}</span>
            <span style="flex:1;font-size:.85rem;font-weight:600;color:var(--t1)">${cat}</span>
            <span style="font-size:.75rem;color:var(--tm)">${fmt(spent)} / ${fmt(limit)}</span>
            <button class="bdel" onclick="removeCategoryBudget('${cat}')" style="font-size:12px">✕</button>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--tm);margin-bottom:4px">
            <span>${Math.round(pct)}% usado</span>
            ${statusText}
          </div>
          <div class="bbg"><div class="bfill" style="width:${pct}%;background:${barColor}"></div></div>
        </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════
     RESUMEN MENSUAL
  ══════════════════════════════════════ */
  function configurarCiclo() {
    const val = prompt('¿Que dia del mes inicia tu ciclo financiero?\n\n(Ej: 1 = calendario normal, 26 = del 26 al 25)', cycleStartDay);
    if (val === null) return;
    const num = parseInt(val);
    if (isNaN(num) || num < 1 || num > 28) {
      alert('Ingresa un numero entre 1 y 28');
      return;
    }
    cycleStartDay = num;
    document.getElementById('cycleLabel').textContent = num;
    scheduleSave();
    renderResumen();
  }

  function initResumen(){
    const anioSel = document.getElementById('rAnio');
    const hoy = new Date();
    const anioAct = hoy.getFullYear();
    if (!anioSel.options.length){
      for(let y=anioAct-2; y<=anioAct; y++){
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        if (y===anioAct) opt.selected = true;
        anioSel.appendChild(opt);
      }
      document.getElementById('rMes').value = hoy.getMonth();
    }
    renderResumen();
  }

  function clonarFijosMes() {
    const mes = parseInt(document.getElementById('rMes').value);
    const anio = parseInt(document.getElementById('rAnio').value);
    const fijos = movs.filter(m => m.rec);
    if (!fijos.length) {
      alert('No tienes ningun movimiento marcado como "Gasto Fijo / Recurrente".');
      return;
    }
    let count = 0;
    const dateForMonth = new Date(anio, mes, 1);
    const dateStr = dateForMonth.toLocaleDateString('es-CL',{day:'2-digit',month:'short'});

    fijos.forEach(m => {
      const exists = movs.some(exist => {
        return isInCycle(exist.ts || exist.id, mes, anio) && exist.d===m.d && exist.v===m.v;
      });
      if (!exists) {
        movs.unshift({
          id: Date.now() + Math.random(),
          d: m.d, v: m.v, c: m.c, t: m.t, rec: true,
          f: dateStr,
          ts: dateForMonth.getTime()
        });
        count++;
      }
    });

    scheduleSave();
    renderP();
    renderResumen();
    alert(count > 0 ? `Se cargaron ${count} gastos fijos en este mes.` : 'Los gastos fijos ya estaban presentes en este mes.');
  }

  function renderResumen(){
    const mes  = parseInt(document.getElementById('rMes').value);
    const anio = parseInt(document.getElementById('rAnio').value);

    const delMes = movs.filter(m=>{
      return isInCycle(m.ts || m.id, mes, anio);
    });

    const rStats   = document.getElementById('rStats');
    const rCatCard = document.getElementById('rCatCard');
    const rMovCard = document.getElementById('rMovCard');
    const rEmpty   = document.getElementById('rEmpty');

    if (!delMes.length){
      rStats.innerHTML=''; rCatCard.style.display='none';
      rMovCard.style.display='none'; rEmpty.style.display='block';
      return;
    }
    rEmpty.style.display='none';

    const ti  = delMes.filter(m=>m.t==='ingreso').reduce((s,m)=>s+m.v, 0);
    const tg  = delMes.filter(m=>m.t==='gasto').reduce((s,m)=>s+m.v, 0);
    const bal = ti-tg;
    const pct = ti>0 ? ((tg/ti)*100).toFixed(1) : '—';
    const nGas = delMes.filter(m=>m.t==='gasto').length;
    const promGas = nGas>0 ? tg/nGas : 0;

    rStats.innerHTML = `
      <div class="sc"><div class="sl">💰 Ingresos</div><div class="sv svg">${fmt(ti)}</div></div>
      <div class="sc"><div class="sl">💸 Gastos</div><div class="sv svr">${fmt(tg)}</div></div>
      <div class="sc"><div class="sl">📊 Balance</div><div class="sv ${bal>=0?'svg':'svr'}">${bal<0?'-':''}${fmt(bal)}</div></div>
      <div class="sc"><div class="sl">% Gasto/Ingreso</div><div class="sv sva">${pct}%</div></div>
      <div class="sc"><div class="sl">N° Gastos</div><div class="sv sva">${nGas}</div></div>
      <div class="sc"><div class="sl">Gasto promedio</div><div class="sv svr">${fmt(promGas)}</div></div>`;
    const gas3 = delMes.filter(m=>m.t==='gasto');
    if (gas3.length){
      const pc={};
      gas3.forEach(m=>{ pc[m.c]=(pc[m.c]||0)+m.v; });
      const mx = Math.max(...Object.values(pc));

      renderDonutSVG('rDonutChart', pc);

      document.getElementById('rCatBody').innerHTML = Object.entries(pc)
        .sort((a,b)=>b[1]-a[1])
        .map(([c,tot])=>`
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <div style="font-size:13px;min-width:90px;max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--t1)">${EMOJIS[c]||'📦'} ${c}</div>
            <div style="flex:1;height:7px;background:var(--sub);border-radius:100px;overflow:hidden">
              <div style="height:100%;width:${(tot/mx)*100}%;background:linear-gradient(90deg,var(--ac),var(--ac2));border-radius:100px;transition:width .4s"></div>
            </div>
            <div style="font-size:12px;color:var(--tm);min-width:80px;text-align:right;white-space:nowrap">${fmt(tot)} (${((tot/tg)*100).toFixed(0)}%)</div>
          </div>`).join('');
      rCatCard.style.display='block';
    } else {
      rCatCard.style.display='none';
    }

    document.getElementById('rMovBody').innerHTML = delMes.map(m=>`
      <tr>
        <td>${m.f||'—'}</td>
        <td>${esc(m.d)} ${m.rec ? '<span class="rec-tag">🔄 Fijo</span>' : ''}</td>
        <td>${EMOJIS[m.c]||'📦'} ${m.c}</td>
        <td style="color:${m.t==='gasto'?'var(--rd)':'var(--gr)'}">${m.t==='gasto'?'Gasto':'Ingreso'}</td>
        <td style="font-weight:700;color:${m.t==='gasto'?'var(--rd)':'var(--gr)'}">${m.t==='gasto'?'−':'+'}${fmt(m.v)}</td>
        <td style="text-align:right">
          <button class="bdel" style="color:var(--ac);margin-right:2px" onclick="editMov(${m.id})">✏️</button>
          <button class="bdel" onclick="delMov(${m.id})">✕</button>
        </td>
      </tr>`).join('');
    rMovCard.style.display='block';
  }

  function exportarCSV() {
    const mes = parseInt(document.getElementById('rMes').value);
    const anio = parseInt(document.getElementById('rAnio').value);
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const delMes = movs.filter(m => {
      return isInCycle(m.ts || m.id, mes, anio);
    });

    if (!delMes.length) {
      alert('No hay movimientos en este periodo para exportar.');
      return;
    }

    const header = 'Fecha,Descripcion,Categoria,Tipo,Monto,Recurrente\n';
    const rows = delMes.map(m => {
      const tipo = m.t === 'ingreso' ? 'Ingreso' : 'Gasto';
      const monto = m.t === 'ingreso' ? m.v : -m.v;
      const rec = m.rec ? 'Si' : 'No';
      return `"${m.f || ''}","${m.d.replace(/"/g,'""')}","${m.c}","${tipo}",${monto},"${rec}"`;
    }).join('\n');

    const csv = header + rows;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos_${meses[mes]}_${anio}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ══════════════════════════════════════
     CALCULADORA
  ══════════════════════════════════════ */
  let calcExpr = '';
  let calcNewNumber = true;

  function calcInput(val) {
    const display = document.getElementById('calcResult');
    const exprEl = document.getElementById('calcExpr');

    if (val === 'C') {
      calcExpr = '';
      calcNewNumber = true;
      display.textContent = '0';
      exprEl.textContent = '';
      return;
    }

    if (val === '⌫') {
      if (calcExpr.length > 0) {
        calcExpr = calcExpr.slice(0, -1);
        exprEl.textContent = calcExpr;
        const parts = calcExpr.split(/[+\-×÷−]/);
        display.textContent = parts[parts.length - 1] || '0';
        if (!calcExpr) calcNewNumber = true;
      }
      return;
    }

    if (val === '=') {
      try {
        // Remove trailing operator if any
        let cleanExpr = calcExpr.replace(/[+\-×÷−]$/, '');
        if (!cleanExpr) return;
        const expr = cleanExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
        const result = Function('"use strict"; return (' + expr + ')')();
        exprEl.textContent = cleanExpr + ' =';
        display.textContent = isFinite(result) ? parseFloat(result.toFixed(10)).toLocaleString('es-CL') : 'Error';
        calcExpr = isFinite(result) ? String(parseFloat(result.toFixed(10))) : '';
        calcNewNumber = true;
      } catch (e) {
        display.textContent = 'Error';
        calcExpr = '';
        calcNewNumber = true;
      }
      return;
    }

    if (val === '%') {
      try {
        const expr = calcExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
        const result = Function('"use strict"; return (' + expr + ')')() / 100;
        display.textContent = isFinite(result) ? parseFloat(result.toFixed(10)).toLocaleString('es-CL') : 'Error';
        calcExpr = isFinite(result) ? String(parseFloat(result.toFixed(10))) : '';
        exprEl.textContent = calcExpr;
        calcNewNumber = true;
      } catch (e) {
        display.textContent = 'Error';
      }
      return;
    }

    const ops = ['+', '-', '×', '÷', '−'];
    if (ops.includes(val)) {
      // Don't allow operator at the start (except minus for negative)
      if (!calcExpr && val !== '-') return;
      // Don't allow consecutive operators — replace the last one
      const lastChar = calcExpr[calcExpr.length - 1];
      if (ops.includes(lastChar)) {
        calcExpr = calcExpr.slice(0, -1);
      }
      calcExpr += val;
      exprEl.textContent = calcExpr;
      calcNewNumber = true;
      return;
    }

    // Number or dot
    if (calcNewNumber) {
      if (val === '.') {
        calcExpr += '0.';
        display.textContent = '0.';
      } else {
        calcExpr += val;
        display.textContent = val;
      }
      calcNewNumber = false;
    } else {
      // Prevent multiple dots in same number
      if (val === '.') {
        const parts = calcExpr.split(/[+\-×÷−]/);
        const current = parts[parts.length - 1];
        if (current.includes('.')) return;
      }
      calcExpr += val;
      // Show current number
      const parts = calcExpr.split(/[+\-×÷−]/);
      display.textContent = parts[parts.length - 1] || '0';
    }
    exprEl.textContent = calcExpr;
  }

  // Keyboard support for calculator
  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('panel-calc').classList.contains('active')) return;
    const key = e.key;
    if (key >= '0' && key <= '9') calcInput(key);
    else if (key === '.') calcInput('.');
    else if (key === '+') calcInput('+');
    else if (key === '-') calcInput('-');
    else if (key === '*') calcInput('×');
    else if (key === '/') { e.preventDefault(); calcInput('÷'); }
    else if (key === 'Enter') calcInput('=');
    else if (key === 'Escape') calcInput('C');
    else if (key === '%') calcInput('%');
    else if (key === 'Backspace') {
      if (calcExpr.length > 0) {
        calcExpr = calcExpr.slice(0, -1);
        document.getElementById('calcExpr').textContent = calcExpr;
        const parts = calcExpr.split(/[+\-×÷−]/);
        document.getElementById('calcResult').textContent = parts[parts.length - 1] || '0';
      }
    }
  });

  function copyCalcToMonto() {
    const result = document.getElementById('calcResult').textContent;
    if (!result || result === '0' || result === 'Error') return;
    const num = parseFloat(result.replace(/\./g,'').replace(',','.')) || 0;
    if (num <= 0) return;
    const montoEl = document.getElementById('pMonto');
    montoEl.value = Math.round(num).toLocaleString('es-CL');
    switchTab('personal', document.querySelectorAll('.sidebar-nav .sidebar-item')[1]);
    montoEl.focus();
  }

  function openMiniCalc() {
    let miniExpr = '';
    let miniNew = true;
    const btnGrid = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
        <button type="button" class="calc-btn calc-op" onclick="mcInput('C')">C</button>
        <button type="button" class="calc-btn calc-op" onclick="mcInput('⌫')">⌫</button>
        <button type="button" class="calc-btn calc-op" onclick="mcInput('%')">%</button>
        <button type="button" class="calc-btn calc-op" onclick="mcInput('÷')">÷</button>
        <button type="button" class="calc-btn" onclick="mcInput('7')">7</button>
        <button type="button" class="calc-btn" onclick="mcInput('8')">8</button>
        <button type="button" class="calc-btn" onclick="mcInput('9')">9</button>
        <button type="button" class="calc-btn calc-op" onclick="mcInput('×')">×</button>
        <button type="button" class="calc-btn" onclick="mcInput('4')">4</button>
        <button type="button" class="calc-btn" onclick="mcInput('5')">5</button>
        <button type="button" class="calc-btn" onclick="mcInput('6')">6</button>
        <button type="button" class="calc-btn calc-op" onclick="mcInput('-')">−</button>
        <button type="button" class="calc-btn" onclick="mcInput('1')">1</button>
        <button type="button" class="calc-btn" onclick="mcInput('2')">2</button>
        <button type="button" class="calc-btn" onclick="mcInput('3')">3</button>
        <button type="button" class="calc-btn calc-op" onclick="mcInput('+')">+</button>
        <button type="button" class="calc-btn" style="grid-column:span 2" onclick="mcInput('0')">0</button>
        <button type="button" class="calc-btn" onclick="mcInput('.')">.</button>
        <button type="button" class="calc-btn calc-eq" onclick="mcInput('=')">=</button>
      </div>`;

    openModal('🧮 Calculadora Rapida', `
      <div id="mcDisplay" style="background:var(--sub);border:2px solid var(--bdr);border-radius:8px;padding:12px 16px;text-align:right;margin-bottom:12px">
        <div id="mcExpr" style="font-size:.75rem;color:var(--tm);min-height:16px"></div>
        <div id="mcResult" style="font-size:1.5rem;font-weight:800;color:var(--t1)">0</div>
      </div>
      ${btnGrid}
    `, function() {
      const result = document.getElementById('mcResult').textContent;
      if (!result || result === '0' || result === 'Error') return false;
      const num = parseFloat(result.replace(/\./g,'').replace(',','.')) || 0;
      if (num <= 0) return false;
      document.getElementById('pMonto').value = Math.round(num).toLocaleString('es-CL');
      return true;
    });

    // Override save button text
    document.getElementById('modalSaveBtn').textContent = '📋 Usar este monto';

    // Expose mcInput globally for this modal
    window.mcInput = function(val) {
      const display = document.getElementById('mcResult');
      const exprEl = document.getElementById('mcExpr');

      if (val === 'C') { miniExpr = ''; miniNew = true; display.textContent = '0'; exprEl.textContent = ''; return; }
      if (val === '⌫') {
        if (miniExpr.length > 0) { miniExpr = miniExpr.slice(0, -1); exprEl.textContent = miniExpr;
          const parts = miniExpr.split(/[+\-×÷−]/); display.textContent = parts[parts.length - 1] || '0';
          if (!miniExpr) miniNew = true; } return; }
      if (val === '=') {
        try { let clean = miniExpr.replace(/[+\-×÷−]$/, ''); if (!clean) return;
          const expr = clean.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
          const r = Function('"use strict"; return (' + expr + ')')();
          exprEl.textContent = clean + ' =';
          display.textContent = isFinite(r) ? parseFloat(r.toFixed(10)).toLocaleString('es-CL') : 'Error';
          miniExpr = isFinite(r) ? String(parseFloat(r.toFixed(10))) : ''; miniNew = true;
        } catch(e) { display.textContent = 'Error'; miniExpr = ''; miniNew = true; } return; }
      if (val === '%') {
        try { const expr = miniExpr.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
          const r = Function('"use strict"; return (' + expr + ')')() / 100;
          display.textContent = isFinite(r) ? parseFloat(r.toFixed(10)).toLocaleString('es-CL') : 'Error';
          miniExpr = isFinite(r) ? String(parseFloat(r.toFixed(10))) : ''; exprEl.textContent = miniExpr; miniNew = true;
        } catch(e) { display.textContent = 'Error'; } return; }

      const ops = ['+', '-', '×', '÷', '−'];
      if (ops.includes(val)) {
        if (!miniExpr && val !== '-') return;
        const last = miniExpr[miniExpr.length - 1];
        if (ops.includes(last)) miniExpr = miniExpr.slice(0, -1);
        miniExpr += val; exprEl.textContent = miniExpr; miniNew = true; return; }

      if (miniNew) {
        if (val === '.') { miniExpr += '0.'; display.textContent = '0.'; }
        else { miniExpr += val; display.textContent = val; }
        miniNew = false;
      } else {
        if (val === '.') { const parts = miniExpr.split(/[+\-×÷−]/); if (parts[parts.length-1].includes('.')) return; }
        miniExpr += val;
        const parts = miniExpr.split(/[+\-×÷−]/); display.textContent = parts[parts.length - 1] || '0';
      }
      exprEl.textContent = miniExpr;
    };
  }

  /* ══════════════════════════════════════
     CALENDARIO SIDEBAR
  ══════════════════════════════════════ */
  let calDate = new Date();

  function initSidebarDate() {
    const hoy = new Date();
    const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const txt = hoy.toLocaleDateString('es-CL', opts);
    document.getElementById('sidebarDateText').textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function toggleCalendar() {
    const popup = document.getElementById('calendarPopup');
    if (popup.style.display === 'none') {
      calDate = new Date();
      renderCalendar();
      popup.style.display = 'block';
    } else {
      popup.style.display = 'none';
    }
  }

  function calNavMonth(dir) {
    calDate.setMonth(calDate.getMonth() + dir);
    renderCalendar();
  }

  function renderCalendar() {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const dias = ['Lu','Ma','Mi','Ju','Vi','Sa','Do'];
    const y = calDate.getFullYear();
    const m = calDate.getMonth();
    const hoy = new Date();

    document.getElementById('calMonthYear').textContent = meses[m] + ' ' + y;

    let firstDay = new Date(y, m, 1).getDay();
    firstDay = firstDay === 0 ? 6 : firstDay - 1; // Monday start
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let html = dias.map(d => `<div style="font-size:.65rem;font-weight:700;color:var(--tm);padding:4px">${d}</div>`).join('');

    for (let i = 0; i < firstDay; i++) {
      html += '<div></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = d === hoy.getDate() && m === hoy.getMonth() && y === hoy.getFullYear();
      const style = isToday
        ? 'background:var(--ac);color:#fff;border-radius:50%;font-weight:700'
        : 'color:var(--t1);border-radius:50%';
      html += `<div style="padding:6px;font-size:.78rem;${style}">${d}</div>`;
    }

    document.getElementById('calGrid').innerHTML = html;
  }

  initSidebarDate();

  /* ══════════════════════════════════════
     FORMATEO NUMERICO — INIT
  ══════════════════════════════════════ */
  setupFmt('iIngreso');
  setupFmt('pMonto');
  renderCategorySelect();

  document.getElementById('pCat').addEventListener('change', function() {
    if (this.value === '__new__') {
      this.value = getAllCategories()[0].name;
      addCustomCategory();
    }
  });

  document.getElementById('iIngreso').addEventListener('keypress',e=>{if(e.key==='Enter')addInt();});
  document.getElementById('pDesc').addEventListener('keypress',e=>{if(e.key==='Enter')addMov();});

  // Enter on auth fields
  document.getElementById('authPass').addEventListener('keypress',e=>{if(e.key==='Enter')doAuth();});
  document.getElementById('authEmail').addEventListener('keypress',e=>{if(e.key==='Enter')document.getElementById('authPass').focus();});
