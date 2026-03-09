'use strict';

const state = {
  vista: 'mensual',
  hoy: new Date(),
  fecha: new Date(),
  reservas: [],
  filtro: 'todos',
  editandoId: null,
  selectedId: null,
  usuarioRol: null,
  usuarioNombre: null,
  conflictoTimeout: null,
};

const ESPACIOS = { aula1: 'Aula 1', aula2: 'Aula 2', cine: 'Sala de Cine', conferencias: 'Sala de Conferencias', ingreso: 'Salón de Ingreso' };
const DIAS_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_LARGO = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES      = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Banner eventos de hoy ──────────────────────────────────────────────────────
function mostrarBannerHoy() {
  const hoyStr   = fmtDate(state.hoy);
  const eventosHoy = state.reservas.filter(r => {
    const f = r.fecha instanceof Date ? fmtDate(r.fecha) : r.fecha?.slice(0,10);
    return f === hoyStr;
  }).sort((a,b) => (a.hora_inicio||'').localeCompare(b.hora_inicio||''));

  // Remover banner anterior si existe
  const existing = document.getElementById('bannerHoy');
  if (existing) existing.remove();
  if (!eventosHoy.length) return;

  const nombres = {
    aula1:'Aula 1', aula2:'Aula 2', cine:'Sala de Cine',
    conferencias:'Sala de Conferencias', ingreso:'Salón de Ingreso'
  };
  const colores = {
    aula1:'#4F6EF7', aula2:'#9D5CFF', cine:'#F7604F',
    conferencias:'#20C997', ingreso:'#F59E0B'
  };

  const items = eventosHoy.slice(0,4).map(ev => {
    const hi = (ev.hora_inicio||'').slice(0,5);
    const hf = (ev.hora_fin||'').slice(0,5);
    const col = colores[ev.espacio] || '#4F6EF7';
    const esp = nombres[ev.espacio] || ev.espacio;
    return `<div style="display:flex;align-items:center;gap:.5rem;padding:.35rem .5rem;background:rgba(255,255,255,.07);border-radius:6px;cursor:pointer" onclick="seleccionarReserva('${ev.id}')">
      <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0"></span>
      <span style="font-weight:600;font-size:.8rem">${ev.titulo}</span>
      <span style="font-size:.75rem;opacity:.75">${esp}</span>
      <span style="margin-left:auto;font-size:.75rem;opacity:.75;white-space:nowrap">${hi}–${hf}</span>
    </div>`;
  }).join('');

  const mas = eventosHoy.length > 4
    ? `<div style="font-size:.72rem;opacity:.6;text-align:center;padding:.2rem 0">+${eventosHoy.length-4} más</div>` : '';

  const banner = document.createElement('div');
  banner.id = 'bannerHoy';
  banner.style.cssText = `
    position:fixed; bottom:1.2rem; left:230px; right:310px;
    background:linear-gradient(135deg,#1C2340,#2E3A63);
    border:1px solid rgba(79,110,247,.4); border-radius:12px;
    padding:.75rem 1rem; z-index:50; box-shadow:0 4px 20px rgba(0,0,0,.25);
    animation: slideUp .3s ease;
  `;
  banner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">
      <div style="display:flex;align-items:center;gap:.5rem">
        <span style="font-size:1rem">📅</span>
        <span style="font-weight:700;font-size:.85rem;color:#fff">Hoy — ${eventosHoy.length} evento${eventosHoy.length!==1?'s':''} programado${eventosHoy.length!==1?'s':''}</span>
      </div>
      <button onclick="document.getElementById('bannerHoy').remove()" style="background:none;border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:.9rem;padding:.1rem .3rem">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.3rem;color:#fff">${items}${mas}</div>
  `;
  document.body.appendChild(banner);

  // Auto-ocultar después de 10 segundos
  setTimeout(() => { if(document.getElementById('bannerHoy')) document.getElementById('bannerHoy').remove(); }, 10000);
}


// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok) { window.location.href = '/login.html'; return; }
    const d = await r.json();
    state.usuarioRol    = d.rol;
    state.usuarioNombre = d.nombre;

    document.getElementById('userNombre').textContent = d.nombre;
    document.getElementById('userRol').textContent    = d.rol === 'admin' ? 'Administrador' : 'Personal';
    document.getElementById('userAvatar').textContent = d.nombre.charAt(0).toUpperCase();
    if (d.rol === 'admin') {
      document.getElementById('navAdmin').style.display = 'flex';
      const bnavAdmin = document.getElementById('bnav-admin');
      if (bnavAdmin) bnavAdmin.style.display = 'flex';
    }

    await cargarLogo();
    await cargarReservas();
    actualizarStats();
    mostrarBannerHoy();
    renderCalendario();
  } catch { window.location.href = '/login.html'; }
}

// ── Logo ───────────────────────────────────────────────────────────────────────
async function cargarLogo() {
  try {
    const r = await fetch('/api/logo', { credentials: 'same-origin' });
    const d = await r.json();
    if (d.url) {
      const url = d.url + '?t=' + Date.now();
      document.getElementById('sidebarLogo').innerHTML =
        `<img class="sidebar-logo-img" src="${url}" alt="Logo" style="width:56px;height:56px;border-radius:10px">
         <div><div class="sidebar-app-name">Centro Cultural</div><div class="sidebar-app-sub">Sistema de Reservas</div></div>`;
    }
  } catch {}
}

// ── Reservas ───────────────────────────────────────────────────────────────────
async function cargarReservas() {
  const params = buildFetchParams();
  try {
    const r = await fetch(`/api/reservas?${params}`, { credentials: 'same-origin' });
    if (r.ok) state.reservas = await r.json();
  } catch {}
}

function buildFetchParams() {
  const f = state.fecha;
  let desde, hasta;
  if (state.vista === 'mensual') {
    desde = new Date(f.getFullYear(), f.getMonth(), 1);
    hasta = new Date(f.getFullYear(), f.getMonth()+1, 0);
  } else if (state.vista === 'semanal') {
    const dow = f.getDay();
    const lunes = new Date(f); lunes.setDate(f.getDate() - (dow===0?6:dow-1));
    desde = lunes; hasta = new Date(lunes); hasta.setDate(lunes.getDate()+6);
  } else if (state.vista === 'diaria') {
    desde = hasta = f;
  } else {
    desde = new Date(); desde.setDate(desde.getDate()-7);
    hasta = new Date(); hasta.setDate(hasta.getDate()+60);
  }
  return `desde=${fmtDate(desde)}&hasta=${fmtDate(hasta)}`;
}

function filtrarReservas(rs) {
  return state.filtro === 'todos' ? rs : rs.filter(r => r.espacio === state.filtro);
}

function actualizarStats() {
  const hoyStr = fmtDate(state.hoy);
  const hoy    = state.reservas.filter(r => normFecha(r.fecha) === hoyStr).length;
  document.getElementById('statHoy').textContent = hoy;
}

// ── Navegación ─────────────────────────────────────────────────────────────────
function setVista(v) {
  state.vista = v;
  // View tabs en topbar
  document.querySelectorAll('.view-tab').forEach((el,i) =>
    el.classList.toggle('active', ['mensual','semanal','diaria','lista'][i] === v));
  // Nav items en sidebar
  document.getElementById('navMensual').classList.toggle('active', v === 'mensual' || v === 'semanal' || v === 'diaria');
  document.getElementById('navLista').classList.toggle('active', v === 'lista');
  // Topbar title
  document.getElementById('topbarTitle').textContent =
    v === 'mensual' ? 'Calendario' : v === 'semanal' ? 'Semana' : v === 'diaria' ? 'Día' : 'Todas las Reservas';
  cargarReservas().then(() => { actualizarStats(); renderCalendario(); });
  // Sync bottom nav
  const map = { mensual:'bnav-cal', semanal:'bnav-cal', diaria:'bnav-hoy', lista:'bnav-lista' };
  if (map[v]) setBottomNav(map[v]);
}

function navFecha(dir) {
  const f = state.fecha;
  if (state.vista === 'mensual') f.setMonth(f.getMonth()+dir);
  else if (state.vista === 'semanal') f.setDate(f.getDate()+dir*7);
  else if (state.vista === 'diaria') f.setDate(f.getDate()+dir);
  else f.setDate(f.getDate()+dir*30);
  cargarReservas().then(() => renderCalendario());
}

function irHoy() {
  state.fecha = new Date(state.hoy);
  cargarReservas().then(() => renderCalendario());
}

function setFiltro(f) {
  state.filtro = f;
  document.querySelectorAll('.filtro-chip').forEach(el => {
    el.classList.toggle('active', el.classList.contains(f));
  });
  renderCalendario();
}

// ── Render ─────────────────────────────────────────────────────────────────────
function renderCalendario() {
  actualizarFechaLabel();
  const wrap = document.getElementById('calendarWrap');
  if (state.vista === 'mensual')     renderMensual(wrap);
  else if (state.vista === 'semanal') renderSemanal(wrap);
  else if (state.vista === 'diaria')  renderDiaria(wrap);
  else renderLista(wrap);
}

function actualizarFechaLabel() {
  const f = state.fecha;
  let txt = '';
  if (state.vista === 'mensual') txt = `${MESES[f.getMonth()]} ${f.getFullYear()}`;
  else if (state.vista === 'semanal') {
    const dow = f.getDay();
    const lu  = new Date(f); lu.setDate(f.getDate()-(dow===0?6:dow-1));
    const do_ = new Date(lu); do_.setDate(lu.getDate()+6);
    txt = `${lu.getDate()} ${MESES[lu.getMonth()].slice(0,3)} — ${do_.getDate()} ${MESES[do_.getMonth()].slice(0,3)} ${do_.getFullYear()}`;
  } else if (state.vista === 'diaria') {
    txt = `${DIAS_LARGO[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]} ${f.getFullYear()}`;
  } else txt = 'Próximos eventos';
  document.getElementById('fechaLabel').textContent = txt;
}

// Mensual
function renderMensual(wrap) {
  const f = state.fecha, year = f.getFullYear(), month = f.getMonth();
  const primero = new Date(year, month, 1);
  const ultimo  = new Date(year, month+1, 0);
  const inicio  = new Date(primero);
  const dow     = primero.getDay();
  inicio.setDate(primero.getDate() - (dow===0?6:dow-1));

  const reservas = filtrarReservas(state.reservas);
  const porDia   = {};
  for (const r of reservas) { const rf = normFecha(r.fecha); if (!porDia[rf]) porDia[rf]=[]; r._fecha = rf; porDia[r._fecha || normFecha(r.fecha)].push(r); }

  let html = '<div class="cal-mensual">';
  for (const d of ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'])
    html += `<div class="cal-header-day">${d}</div>`;

  const cur = new Date(inicio);
  for (let w = 0; w < 6; w++) {
    for (let d = 0; d < 7; d++) {
      const ds     = fmtDate(cur);
      const esHoy  = ds === fmtDate(state.hoy);
      const otro   = cur.getMonth() !== month;
      const evs    = porDia[ds] || [];
      html += `<div class="cal-day${otro?' otro-mes':''}${esHoy?' hoy':''}" onclick="clickDia('${ds}')">`;
      html += `<div class="day-num">${cur.getDate()}</div>`;
      evs.slice(0,3).forEach(ev => {
        html += `<div class="cal-evento ${ev.espacio}" onclick="event.stopPropagation();seleccionarReserva('${ev.id}')" title="${ev.titulo}">${ev.hora_inicio?.slice(0,5)||''} ${ev.titulo}</div>`;
      });
      if (evs.length > 3) html += `<div class="mas-eventos">+${evs.length-3} más</div>`;
      html += '</div>';
      cur.setDate(cur.getDate()+1);
    }
    if (cur > ultimo && cur.getDay() === 1) break;
  }
  html += '</div>';
  wrap.innerHTML = html;
}

// Semanal
function renderSemanal(wrap) {
  const f = state.fecha, dow = f.getDay();
  const lu = new Date(f); lu.setDate(f.getDate()-(dow===0?6:dow-1));
  const dias = Array.from({length:7}, (_,i) => { const d=new Date(lu); d.setDate(lu.getDate()+i); return d; });
  const reservas = filtrarReservas(state.reservas);
  const HORAS = Array.from({length:24},(_,i)=>i);

  let html = '<div class="cal-semanal"><div class="sem-header-row"><div class="sem-header-cell"></div>';
  dias.forEach(d => {
    const esHoy = fmtDate(d)===fmtDate(state.hoy);
    html += `<div class="sem-header-cell${esHoy?' hoy-col':''}">${DIAS_CORTO[d.getDay()]}<br><span style="font-size:.95rem;font-weight:800">${d.getDate()}</span></div>`;
  });
  html += '</div>';

  // Wrap para las horas + cols
  html += '<div style="position:relative">';
  // Horas
  html += '<div style="position:absolute;left:0;top:0;width:46px">';
  HORAS.forEach(h => html += `<div class="sem-hora">${String(h).padStart(2,'0')}:00</div>`);
  html += '</div>';
  // Grid días
  html += '<div style="margin-left:46px;display:grid;grid-template-columns:repeat(7,1fr)">';
  dias.forEach((d,di) => {
    const ds  = fmtDate(d);
    const evs = reservas.filter(r => normFecha(r.fecha)===ds);
    html += `<div class="sem-col" onclick="clickDia('${ds}')">`;
    HORAS.forEach(() => html += '<div class="sem-slot"></div>');
    evs.forEach(ev => {
      const [sh,sm] = ev.hora_inicio.split(':').map(Number);
      const [eh,em] = ev.hora_fin.split(':').map(Number);
      const top    = (sh*60+sm)*(54/60);
      const height = Math.max(((eh*60+em)-(sh*60+sm))*(54/60), 18);
      html += `<div class="sem-evento ${ev.espacio}" style="top:${top}px;height:${height}px" onclick="event.stopPropagation();seleccionarReserva('${ev.id}')" title="${ev.titulo}"><strong>${ev.hora_inicio?.slice(0,5)}</strong> ${ev.titulo}</div>`;
    });
    html += '</div>';
  });
  html += '</div></div></div>';
  wrap.innerHTML = html;
}

// Diaria
function renderDiaria(wrap) {
  const ds  = fmtDate(state.fecha);
  const evs = filtrarReservas(state.reservas).filter(r => r.fecha===ds);
  const HORAS = Array.from({length:24},(_,i)=>i);

  let html = '<div class="cal-diaria"><div style="position:relative">';
  html += '<div style="position:absolute;left:0;top:0;width:46px">';
  HORAS.forEach(h => html += `<div class="dia-hora">${String(h).padStart(2,'0')}:00</div>`);
  html += '</div>';
  html += `<div class="dia-col" style="margin-left:46px">`;
  HORAS.forEach(h => html += `<div class="dia-slot" onclick="clickDiaHora('${ds}',${h})"></div>`);
  evs.forEach(ev => {
    const [sh,sm] = ev.hora_inicio.split(':').map(Number);
    const [eh,em] = ev.hora_fin.split(':').map(Number);
    const top    = (sh*60+sm);
    const height = Math.max((eh*60+em)-(sh*60+sm), 28);
    html += `<div class="dia-evento ${ev.espacio}" style="top:${top}px;height:${height}px;left:6px;right:6px" onclick="event.stopPropagation();seleccionarReserva('${ev.id}')">
      <strong>${ev.hora_inicio?.slice(0,5)} – ${ev.hora_fin?.slice(0,5)}</strong><br>${ev.titulo}
      <br><span style="font-size:.68rem;opacity:.75">${ESPACIOS[ev.espacio]}</span>
    </div>`;
  });
  html += '</div></div></div>';
  wrap.innerHTML = html;
}

// Lista
function renderLista(wrap) {
  const rs = filtrarReservas(state.reservas).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.hora_inicio.localeCompare(b.hora_inicio));
  if (!rs.length) { wrap.innerHTML = '<div class="cal-lista"><div class="lista-vacia">No hay reservas en este período</div></div>'; return; }
  const grupos = {};
  rs.forEach(r => { const fd=normFecha(r.fecha); if (!grupos[fd]) grupos[fd]=[]; grupos[fd].push(r); });
  let html = '<div class="cal-lista">';
  Object.keys(grupos).sort().forEach(fecha => {
    const d = new Date(fecha+'T12:00:00');
    const esHoy = fecha === fmtDate(state.hoy);
    html += `<div class="lista-grupo"><div class="lista-fecha-header${esHoy?' hoy':''}">${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}${esHoy?' — Hoy':''}</div>`;
    grupos[fecha].forEach(ev => {
      const sel = ev.id === state.selectedId ? ' selected' : '';
      html += `<div class="lista-item${sel}" onclick="seleccionarReserva('${ev.id}')">
        <div class="lista-dot ${ev.espacio}"></div>
        <div class="lista-hora">${ev.hora_inicio?.slice(0,5)} – ${ev.hora_fin?.slice(0,5)}</div>
        <div class="lista-info"><div class="lista-titulo">${ev.titulo}</div><div class="lista-sol">${ev.solicitante}</div></div>
        <div class="lista-tag ${ev.espacio}">${ESPACIOS[ev.espacio]}</div>
      </div>`;
    });
    html += '</div>';
  });
  html += '</div>';
  wrap.innerHTML = html;
}

// ── Click día ──────────────────────────────────────────────────────────────────
function clickDia(ds) {
  state.vista = 'diaria';
  state.fecha = new Date(ds+'T12:00:00');
  document.querySelectorAll('.view-tab').forEach((el,i)=>el.classList.toggle('active',i===2));
  cargarReservas().then(()=>renderCalendario());
}
function clickDiaHora(ds, h) {
  abrirNueva(ds, `${String(h).padStart(2,'0')}:00`, `${String(h+1).padStart(2,'0')}:00`);
}

// ── Detail panel ───────────────────────────────────────────────────────────────
function seleccionarReserva(id) {
  state.selectedId = id;
  const ev = state.reservas.find(r => r.id===id);
  if (!ev) return;

  const puedeMod = state.usuarioRol === 'admin' || ev.usuario_id === null;

  document.getElementById('detailEmpty').style.display   = 'none';
  document.getElementById('detailContent').style.display = 'block';

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-espacio-badge ${ev.espacio}">
      <span class="dot"></span>${ESPACIOS[ev.espacio]}
    </div>
    <div class="detail-titulo">${ev.titulo}</div>
    <div class="detail-row">
      <div class="detail-icon">📅</div>
      <div class="detail-label">Fecha</div>
      <div class="detail-val">${formatFechaLarga(ev.fecha)}</div>
    </div>
    <div class="detail-row">
      <div class="detail-icon">🕐</div>
      <div class="detail-label">Horario</div>
      <div class="detail-val">${ev.hora_inicio?.slice(0,5)} – ${ev.hora_fin?.slice(0,5)}</div>
    </div>
    <div class="detail-row">
      <div class="detail-icon">👤</div>
      <div class="detail-label">Solicitante</div>
      <div class="detail-val">${ev.solicitante}</div>
    </div>
    ${ev.descripcion ? `<div class="detail-desc">${ev.descripcion}</div>` : ''}
    ${ev.usuario_nombre ? `<div class="detail-row"><div class="detail-icon">🧑‍💼</div><div class="detail-label">Registró</div><div class="detail-val">${ev.usuario_nombre}</div></div>` : ''}
    <div class="detail-actions">
      <button class="btn-edit" onclick="abrirEditar('${id}')">✏️ Editar</button>
      <button class="btn-del"  onclick="confirmarEliminar('${id}')">🗑</button>
    </div>
  `;
}

// ── Modal nueva/editar ─────────────────────────────────────────────────────────
function abrirNueva(fecha=null, hi='08:00', hf='10:00') {
  state.editandoId = null;
  document.getElementById('modalTitle').textContent = 'Nueva reserva';
  document.getElementById('rEspacio').value = 'aula1';
  document.getElementById('rTitulo').value    = '';
  document.getElementById('rSolicitante').value='';
  document.getElementById('rDescripcion').value='';
  document.getElementById('rFecha').value     = fecha || fmtDate(state.fecha);
  document.getElementById('rHoraInicio').value = hi;
  document.getElementById('rHoraFin').value   = hf;
  ocultarConflictos();
  abrirModal('modalReserva');
  setTimeout(checkConflictos, 300);
}

function abrirEditar(id) {
  const ev = state.reservas.find(r=>r.id===id);
  if (!ev) return;
  state.editandoId = id;
  document.getElementById('modalTitle').textContent = 'Editar reserva';
  document.getElementById('rEspacio').value    = ev.espacio;
  document.getElementById('rTitulo').value     = ev.titulo;
  document.getElementById('rSolicitante').value= ev.solicitante;
  document.getElementById('rDescripcion').value= ev.descripcion||'';
  document.getElementById('rFecha').value      = ev.fecha;
  document.getElementById('rHoraInicio').value = ev.hora_inicio?.slice(0,5)||'';
  document.getElementById('rHoraFin').value    = ev.hora_fin?.slice(0,5)||'';
  ocultarConflictos();
  abrirModal('modalReserva');
}

async function guardarReserva() {
  const espacio    = document.getElementById('rEspacio').value;
  const titulo     = document.getElementById('rTitulo').value.trim();
  const solicitante= document.getElementById('rSolicitante').value.trim();
  const descripcion= document.getElementById('rDescripcion').value.trim();
  const fecha      = document.getElementById('rFecha').value;
  const hora_inicio= document.getElementById('rHoraInicio').value;
  const hora_fin   = document.getElementById('rHoraFin').value;
  if (!titulo)     return showToast('Ingresá un título','error');
  if (!solicitante)return showToast('Ingresá el solicitante','error');
  if (!fecha)      return showToast('Seleccioná una fecha','error');
  if (!hora_inicio||!hora_fin) return showToast('Ingresá los horarios','error');
  if (hora_fin<=hora_inicio)   return showToast('La hora de fin debe ser posterior al inicio','error');
  const body = {espacio,titulo,solicitante,descripcion,fecha,hora_inicio,hora_fin};
  const url  = state.editandoId ? `/api/reservas/${state.editandoId}` : '/api/reservas';
  try {
    const r = await fetch(url,{method:state.editandoId?'PUT':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d = await r.json();
    if (!r.ok) {
      if (d.error==='conflicto') { mostrarConflictos(d.conflictos,true); return; }
      return showToast(d.error||'Error al guardar','error');
    }
    cerrarModal('modalReserva');
    showToast(state.editandoId?'Reserva actualizada':'Reserva creada','success');
    await cargarReservas();
    actualizarStats();
    renderCalendario();
    seleccionarReserva(d.id||state.editandoId);
  } catch { showToast('Error de conexión','error'); }
}

// ── Conflictos ─────────────────────────────────────────────────────────────────
async function checkConflictos() {
  clearTimeout(state.conflictoTimeout);
  state.conflictoTimeout = setTimeout(async () => {
    const espacio    = document.getElementById('rEspacio').value;
    const fecha      = document.getElementById('rFecha').value;
    const hora_inicio= document.getElementById('rHoraInicio').value;
    const hora_fin   = document.getElementById('rHoraFin').value;
    if (!fecha||!hora_inicio||!hora_fin||hora_fin<=hora_inicio){ocultarConflictos();return;}
    try {
      const params = `espacio=${espacio}&fecha=${fecha}&hora_inicio=${hora_inicio}&hora_fin=${hora_fin}${state.editandoId?'&exclude_id='+state.editandoId:''}`;
      const r = await fetch(`/api/reservas/conflictos?${params}`,{credentials:'same-origin'});
      const d = await r.json();
      d.conflictos?.length ? mostrarConflictos(d.conflictos,false) : ocultarConflictos();
    } catch {}
  }, 380);
}

function mostrarConflictos(cs, esError) {
  const box = document.getElementById('conflictoBox');
  let html = `<div class="conflicto-box"><div class="conflicto-title">${esError?'⛔ No se puede guardar':'⚠️ Advertencia'}: el espacio ya tiene reservas en ese horario</div>`;
  cs.forEach(c => html += `<div class="conflicto-item"><strong>${c.titulo}</strong> — ${c.solicitante} · ${c.hora_inicio} a ${c.hora_fin}</div>`);
  html += '</div>';
  box.innerHTML = html; box.style.display='block';
}
function ocultarConflictos() {
  const b = document.getElementById('conflictoBox'); b.style.display='none'; b.innerHTML='';
}

// ── Eliminar ───────────────────────────────────────────────────────────────────
async function confirmarEliminar(id) {
  const ev = state.reservas.find(r=>r.id===id);
  if (!confirm(`¿Eliminar "${ev?.titulo}"?`)) return;
  try {
    const r = await fetch(`/api/reservas/${id}`,{method:'DELETE',credentials:'same-origin'});
    if (!r.ok){const d=await r.json();return showToast(d.error,'error');}
    showToast('Reserva eliminada','success');
    document.getElementById('detailEmpty').style.display   = 'flex';
    document.getElementById('detailContent').style.display = 'none';
    state.selectedId = null;
    await cargarReservas(); actualizarStats(); renderCalendario();
  } catch { showToast('Error de conexión','error'); }
}

// ── Admin ──────────────────────────────────────────────────────────────────────
async function abrirAdmin() {
  abrirModal('modalAdmin');
  await cargarLogoAdmin();
  try {
    const r = await fetch('/api/admin/usuarios',{credentials:'same-origin'});
    const us = await r.json();
    document.getElementById('adminSubtitle').textContent = `${us.length} usuario${us.length!==1?'s':''}`;
    document.getElementById('adminTbody').innerHTML = us.map(u=>`
      <tr>
        <td>${u.nombre}</td>
        <td style="font-size:.75rem;color:var(--text2)">${u.email}</td>
        <td><span class="rol-badge ${u.rol}">${u.rol}</span></td>
        <td style="text-align:center">${u.total_reservas}</td>
        <td style="display:flex;gap:.3rem">
          <button class="btn-icon" onclick="cambiarRol('${u.id}','${u.rol==='admin'?'staff':'admin'}')">${u.rol==='admin'?'→ staff':'→ admin'}</button>
          <button class="btn-icon" style="color:var(--danger)" onclick="eliminarUsuario('${u.id}','${u.nombre}')">✕</button>
        </td>
      </tr>`).join('');
  } catch {}
}

async function cargarLogoAdmin() {
  try {
    const r = await fetch('/api/logo',{credentials:'same-origin'});
    const d = await r.json();
    const w = document.getElementById('logoPreviewWrap');
    if (d.url) w.innerHTML=`<img class="logo-preview" src="${d.url}?t=${Date.now()}"><br><p style="font-size:.7rem;color:var(--text2)">Hacé click para cambiar</p>`;
    else w.innerHTML=`<p style="font-size:.78rem;color:var(--text2)">Hacé click para subir el escudo / logo<br><span style="font-size:.7rem">PNG, JPG, SVG — máx 2MB</span></p>`;
  } catch {}
}

async function subirLogo(input) {
  if (!input.files[0]) return;
  const fd = new FormData(); fd.append('logo', input.files[0]);
  try {
    const r = await fetch('/api/logo',{method:'POST',credentials:'same-origin',body:fd});
    const d = await r.json();
    if (!r.ok) return showToast(d.error||'Error al subir','error');
    showToast('Logo actualizado','success');
    await cargarLogo(); await cargarLogoAdmin();
  } catch { showToast('Error al subir','error'); }
}

async function cambiarRol(id, rol) {
  if (!confirm(`¿Cambiar rol a "${rol}"?`)) return;
  try {
    const r = await fetch(`/api/admin/usuarios/${id}/rol`,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({rol})});
    if (!r.ok){const d=await r.json();return showToast(d.error,'error');}
    showToast('Rol actualizado','success'); abrirAdmin();
  } catch { showToast('Error','error'); }
}

async function eliminarUsuario(id, nombre) {
  if (!confirm(`¿Eliminar a "${nombre}"? Se eliminarán sus reservas.`)) return;
  try {
    const r = await fetch(`/api/admin/usuarios/${id}`,{method:'DELETE',credentials:'same-origin'});
    if (!r.ok){const d=await r.json();return showToast(d.error,'error');}
    showToast('Usuario eliminado','success'); abrirAdmin();
    await cargarReservas(); actualizarStats(); renderCalendario();
  } catch { showToast('Error','error'); }
}

// ── Logout ─────────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  window.location.href='/login.html';
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function abrirModal(id)  { document.getElementById(id).classList.add('open'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }
function fmtDate(d) {
  if (typeof d === 'string') { return d.slice(0,10); }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatFechaLarga(ds) {
  if (!ds) return '—';
  // Normaliza cualquier formato: Date, '2026-03-09', '2026-03-09T00:00:00.000Z'
  const str = (ds instanceof Date) ? ds.toISOString() : String(ds);
  const parts = str.slice(0,10).split('-');
  if (parts.length !== 3) return ds;
  const year = parseInt(parts[0]), month = parseInt(parts[1])-1, day = parseInt(parts[2]);
  const d = new Date(year, month, day);
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

// Normaliza fecha a string YYYY-MM-DD desde cualquier formato PG
function normFecha(ds) {
  if (!ds) return '';
  const str = (ds instanceof Date) ? ds.toISOString() : String(ds);
  return str.slice(0, 10);
}
function showToast(msg, type='success') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),3000);
}

document.addEventListener('keydown', e => {
  if (e.key==='Escape') ['modalReserva','modalAdmin'].forEach(id=>cerrarModal(id));
});
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if(e.target===o) cerrarModal(o.id); });
});

function setBottomNav(id) {
  document.querySelectorAll('.bottom-nav-item').forEach(el =>
    el.classList.toggle('active', el.id === id));
}

init();
