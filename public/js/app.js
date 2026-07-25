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

const ESPACIOS = { aula1: 'Aula 01', aula2: 'Aula 02', cine: 'Auditorio', conferencias: 'Sala de conferencias', ingreso: 'Hall', puntodigital1: 'Aula punto digital', puntodigital2: 'Microcine' };
const DIAS_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_LARGO = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES      = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Banner eventos de hoy ──────────────────────────────────────────────────────
function mostrarBannerHoy() {
  const hoyStr = fmtDate(state.hoy);
  const eventosHoy = state.reservas.filter(r => {
    const f = r.fecha instanceof Date ? fmtDate(r.fecha) : r.fecha?.slice(0,10);
    return f === hoyStr;
  }).sort((a,b) => (a.hora_inicio||'').localeCompare(b.hora_inicio||''));

  const existing = document.getElementById('bannerHoy');
  if (existing) existing.remove();
  if (!eventosHoy.length) return;

  const colores = { aula1:'#4F6EF7', aula2:'#9D5CFF', cine:'#F7604F', conferencias:'#20C997', ingreso:'#F59E0B', puntodigital1:'#00B8D9', puntodigital2:'#0747A6' };
  const isMobile = window.innerWidth <= 640;

  const items = eventosHoy.slice(0, isMobile ? 3 : 4).map(ev => {
    const hi  = (ev.hora_inicio||'').slice(0,5);
    const hf  = (ev.hora_fin||'').slice(0,5);
    const col = colores[ev.espacio] || '#4F6EF7';
    const esp = ESPACIOS[ev.espacio] || ev.espacio;
    return `<div style="display:flex;align-items:center;gap:.45rem;padding:.3rem .45rem;background:rgba(255,255,255,.08);border-radius:6px;cursor:pointer;min-width:0" onclick="seleccionarReserva('${ev.id}')">
      <span style="width:7px;height:7px;border-radius:50%;background:${col};flex-shrink:0"></span>
      <span style="font-weight:600;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">${ev.titulo}</span>
      ${isMobile ? '' : `<span style="font-size:.72rem;opacity:.7;white-space:nowrap">${esp}</span>`}
      <span style="font-size:.72rem;opacity:.75;white-space:nowrap;flex-shrink:0">${hi}–${hf}</span>
    </div>`;
  }).join('');

  const mas = eventosHoy.length > (isMobile ? 3 : 4)
    ? `<div style="font-size:.7rem;opacity:.6;text-align:center;padding:.15rem 0">+${eventosHoy.length - (isMobile?3:4)} más</div>` : '';

  // Posición responsive
  const pos = isMobile
    ? 'left:.75rem; right:4rem; bottom:82px;'   /* deja espacio al FAB */
    : 'left:236px; right:306px; bottom:1.2rem;'; /* desktop: entre sidebar y panel */

  const banner = document.createElement('div');
  banner.id = 'bannerHoy';
  banner.style.cssText = `
    position:fixed; ${pos}
    background:linear-gradient(135deg,#1C2340ee,#2E3A63ee);
    border:1px solid rgba(79,110,247,.4); border-radius:12px;
    padding:.65rem .85rem; z-index:150;
    box-shadow:0 4px 20px rgba(0,0,0,.3);
    backdrop-filter:blur(8px);
    -webkit-backdrop-filter:blur(8px);
  `;
  banner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem;gap:.5rem">
      <span style="font-weight:700;font-size:.8rem;color:#fff;white-space:nowrap">
        Hoy · ${eventosHoy.length} evento${eventosHoy.length!==1?'s':''}
      </span>
      <button onclick="document.getElementById('bannerHoy').remove()"
        style="background:none;border:none;color:rgba(255,255,255,.5);cursor:pointer;font-size:.85rem;padding:.1rem .25rem;flex-shrink:0;line-height:1">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.25rem;color:#fff">${items}${mas}</div>
  `;
  document.body.appendChild(banner);

  setTimeout(() => { if(document.getElementById('bannerHoy')) document.getElementById('bannerHoy').remove(); }, 12000);
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
      document.getElementById('navDashboard').style.display = 'flex';
      document.getElementById('labelGeneral').style.display = 'block';
      const bnavAdmin = document.getElementById('bnav-admin');
      if (bnavAdmin) bnavAdmin.style.display = 'flex';
    }
    // Mobile: hide logout side button label (shown as top button instead)


    await cargarLogo();
    await cargarReservas();
    actualizarStats();
    mostrarBannerHoy();
    renderCalendario();
  } catch { window.location.href = '/login.html'; }
}

// ── Logo ───────────────────────────────────────────────────────────────────────
// El logo institucional está embebido directamente en index.html (base64) para
// evitar que se pierda cuando el hosting gratuito (Render) suspende el servicio
// y reinicia el filesystem. Esta función queda como no-op por compatibilidad.
async function cargarLogo() {}

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
  if (window.innerWidth <= 900) closeAllDrawers();
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
  if (window.innerWidth <= 640) openDetailPanel();

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-espacio-badge ${ev.espacio}">
      <span class="dot"></span>${ESPACIOS[ev.espacio]}
    </div>
    <div class="detail-titulo">${ev.titulo}</div>
    <div class="detail-row">
      <div class="detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
      <div class="detail-label">Fecha</div>
      <div class="detail-val">${formatFechaLarga(ev.fecha)}</div>
    </div>
    <div class="detail-row">
      <div class="detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="detail-label">Horario</div>
      <div class="detail-val">${ev.hora_inicio?.slice(0,5)} – ${ev.hora_fin?.slice(0,5)}</div>
    </div>
    <div class="detail-row">
      <div class="detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
      <div class="detail-label">Solicitante</div>
      <div class="detail-val">${ev.solicitante}</div>
    </div>
    ${ev.descripcion ? `<div class="detail-desc">${ev.descripcion}</div>` : ''}
    ${ev.usuario_nombre ? `<div class="detail-row"><div class="detail-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="detail-label">Registró</div><div class="detail-val">${ev.usuario_nombre}</div></div>` : ''}
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
          <button class="btn-icon" onclick="abrirResetPass('${u.id}','${u.nombre}')" title="Resetear contraseña">🔑</button>
          <button class="btn-icon" style="color:var(--danger)" onclick="eliminarUsuario('${u.id}','${u.nombre}')">✕</button>
        </td>
      </tr>`).join('');
  } catch {}
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
  if (e.key==='Escape') ['modalReserva','modalAdmin','modalDashboard','modalMiPass','modalResetPass'].forEach(id=>cerrarModal(id));
});
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if(e.target===o) cerrarModal(o.id); });
});

function toggleDrawer() {
  const sidebar = document.querySelector('.sidebar');
  const isOpen  = sidebar.classList.contains('drawer-open');
  if (isOpen) closeDrawer();
  else {
    closeDetailPanel(true); // cerrar detail si estaba abierto
    sidebar.style.display = 'flex';
    sidebar.classList.add('drawer-open');
    showOverlay();
  }
}

function closeDrawer() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.remove('drawer-open');
  if (window.innerWidth <= 640) sidebar.style.display = 'none';
  // Solo ocultar overlay si el detail tampoco está abierto
  const detail = document.getElementById('detailPanel');
  if (!detail.classList.contains('drawer-open')) hideOverlay();
}

function openDetailPanel() {
  if (window.innerWidth > 640) return; // en desktop se muestra siempre
  const detail = document.getElementById('detailPanel');
  closeDrawer(); // cerrar sidebar si estaba abierto
  detail.style.display = 'flex';
  detail.classList.add('drawer-open');
  showOverlay();
}

function closeDetailPanel(silent = false) {
  const detail = document.getElementById('detailPanel');
  detail.classList.remove('drawer-open');
  if (window.innerWidth <= 640) detail.style.display = 'none';
  if (!silent) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar.classList.contains('drawer-open')) hideOverlay();
  }
}

function closeAllDrawers() {
  closeDrawer();
  closeDetailPanel();
}

function showOverlay() {
  document.getElementById('drawerOverlay').classList.add('open');
}
function hideOverlay() {
  document.getElementById('drawerOverlay').classList.remove('open');
}

// ── Contraseñas ───────────────────────────────────────────────────────────────
function togglePassMain(id, btn) {
  const input = document.getElementById(id);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.querySelector('svg').innerHTML = isText
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

async function cambiarMiPass() {
  const actual  = document.getElementById('mpActual').value;
  const nueva   = document.getElementById('mpNueva').value;
  const confirm = document.getElementById('mpConfirm').value;
  const errEl   = document.getElementById('miPassError');
  errEl.style.display = 'none';
  if (!actual || !nueva) { errEl.textContent='Completá todos los campos'; errEl.style.display='block'; return; }
  if (nueva.length < 6)  { errEl.textContent='Mínimo 6 caracteres'; errEl.style.display='block'; return; }
  if (nueva !== confirm) { errEl.textContent='Las contraseñas no coinciden'; errEl.style.display='block'; return; }
  try {
    const r = await fetch('/api/auth/password', {
      method:'PUT', credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ actual, nueva })
    });
    const d = await r.json();
    if (!r.ok) { errEl.textContent = d.error; errEl.style.display='block'; return; }
    cerrarModal('modalMiPass');
    document.getElementById('mpActual').value = '';
    document.getElementById('mpNueva').value  = '';
    document.getElementById('mpConfirm').value= '';
    showToast('Contraseña actualizada', 'success');
  } catch { errEl.textContent='Error de conexión'; errEl.style.display='block'; }
}

let resetUserId = null;
function abrirResetPass(id, nombre) {
  resetUserId = id;
  document.getElementById('resetUserNombre').textContent = nombre;
  document.getElementById('resetPassNueva').value = '';
  document.getElementById('resetPassError').style.display = 'none';
  abrirModal('modalResetPass');
}

async function confirmarResetPass() {
  const nueva  = document.getElementById('resetPassNueva').value;
  const errEl  = document.getElementById('resetPassError');
  errEl.style.display = 'none';
  if (!nueva || nueva.length < 6) { errEl.textContent='Mínimo 6 caracteres'; errEl.style.display='block'; return; }
  try {
    const r = await fetch(`/api/admin/usuarios/${resetUserId}/password`, {
      method:'PUT', credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ password: nueva })
    });
    const d = await r.json();
    if (!r.ok) { errEl.textContent = d.error; errEl.style.display='block'; return; }
    cerrarModal('modalResetPass');
    showToast('Contraseña reseteada', 'success');
  } catch { errEl.textContent='Error de conexión'; errEl.style.display='block'; }
}

function setBottomNav(id) {
  document.querySelectorAll('.bottom-nav-item').forEach(el =>
    el.classList.toggle('active', el.id === id));
}


// ── DASHBOARD ──────────────────────────────────────────────────────────────────
const ESPACIOS_NOMBRES = {
  aula1: 'Aula 01', aula2: 'Aula 02', cine: 'Auditorio',
  conferencias: 'Sala de conferencias', ingreso: 'Hall',
  puntodigital1: 'Aula punto digital', puntodigital2: 'Microcine'
};
const COLORES_ESPACIO = {
  aula1:'#4F6EF7', aula2:'#9D5CFF', cine:'#F7604F',
  conferencias:'#20C997', ingreso:'#F59E0B',
  puntodigital1:'#00B8D9', puntodigital2:'#0747A6'
};
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

let statsCache = null;

async function abrirDashboard() {
  // Solo admins
  if (state.usuarioRol !== 'admin') {
    showToast('Solo los administradores pueden acceder al Dashboard', 'error');
    return;
  }
  abrirModal('modalDashboard');
  document.getElementById('dashBody').innerHTML =
    '<div style="text-align:center;padding:2rem;color:var(--text2)">Cargando estadísticas...</div>';

  // Inicializar selector de informes por período con mes/año actuales
  const hoy = new Date();
  const selMes = document.getElementById('informeMes');
  const inpAnio = document.getElementById('informeAnio');
  if (selMes) selMes.value = String(hoy.getMonth() + 1);
  if (inpAnio) inpAnio.value = hoy.getFullYear();
  toggleSelectorMes();

  try {
    const r = await fetch('/api/stats', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Error al cargar stats');
    statsCache = await r.json();
    renderDashboard(statsCache);
  } catch(e) {
    document.getElementById('dashBody').innerHTML =
      '<div style="text-align:center;padding:2rem;color:var(--danger)">Error al cargar estadísticas. Intentá de nuevo.</div>';
  }
}

// Muestra/oculta el selector de mes según el tipo de informe elegido
function toggleSelectorMes() {
  const tipo = document.getElementById('tipoInforme').value;
  const selMes = document.getElementById('informeMes');
  if (selMes) selMes.style.display = tipo === 'mensual' ? 'inline-block' : 'none';
}

function renderDashboard(d) {
  const maxEsp = d.porEspacio.length ? Math.max(...d.porEspacio.map(e => parseInt(e.reservas))) : 1;
  const maxMes = d.porMes.length ? Math.max(...d.porMes.map(m => parseInt(m.reservas))) : 1;

  // Tarjetas de resumen
  const cards = `
    <div class="dash-cards">
      <div class="dash-card">
        <div class="dash-card-num">${d.total}</div>
        <div class="dash-card-label">Total Reservas</div>
      </div>
      <div class="dash-card verde">
        <div class="dash-card-num">${d.realizadas}</div>
        <div class="dash-card-label">Realizadas</div>
      </div>
      <div class="dash-card azul">
        <div class="dash-card-num">${d.pendientes}</div>
        <div class="dash-card-label">Pendientes</div>
      </div>
      <div class="dash-card naranja">
        <div class="dash-card-num">${d.porEspacio.length}</div>
        <div class="dash-card-label">Espacios activos</div>
      </div>
    </div>`;

  // Barras por espacio
  const barrasEspacio = `
    <div class="dash-section">
      <div class="dash-section-title">Uso por Espacio — ${d.anio}</div>
      <div class="dash-bars">
        ${d.porEspacio.map(e => {
          const pct = Math.round(parseInt(e.reservas) / maxEsp * 100);
          const col = COLORES_ESPACIO[e.espacio] || '#7C6FFF';
          const nom = ESPACIOS_NOMBRES[e.espacio] || e.espacio;
          return `
            <div class="dash-bar-row">
              <div class="dash-bar-label" title="${nom}">${nom}</div>
              <div class="dash-bar-track">
                <div class="dash-bar-fill" style="width:${pct}%;background:${col}"></div>
              </div>
              <div class="dash-bar-val">${e.reservas} res. · ${e.horas || 0}h</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  // Barras por mes
  const mesesData = Array.from({length:12}, (_,i) => {
    const found = d.porMes.find(m => m.mes === i+1);
    return found ? parseInt(found.reservas) : 0;
  });
  const barrasMes = `
    <div class="dash-section">
      <div class="dash-section-title">Reservas por Mes — ${d.anio}</div>
      <div class="dash-col-chart">
        ${mesesData.map((v, i) => {
          const pct = maxMes > 0 ? Math.round(v / maxMes * 100) : 0;
          return `
            <div class="dash-col-item">
              <div class="dash-col-bar-wrap">
                <div class="dash-col-bar" style="height:${pct}%" title="${v} reservas"></div>
              </div>
              <div class="dash-col-val">${v > 0 ? v : ''}</div>
              <div class="dash-col-mes">${MESES_CORTO[i]}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  // Próximas reservas
  const hoy = fmtDate(new Date());
  const proxTable = d.proximas.length ? `
    <div class="dash-section">
      <div class="dash-section-title">Próximas Reservas (30 días)</div>
      <div style="overflow-x:auto">
        <table class="dash-table">
          <thead><tr><th>Fecha</th><th>Horario</th><th>Espacio</th><th>Título</th><th>Solicitante</th></tr></thead>
          <tbody>
            ${d.proximas.map(p => {
              const esHoy = normFecha(p.fecha) === hoy;
              return `<tr${esHoy ? ' class="dash-hoy-row"' : ''}>
                <td>${formatFechaLarga(p.fecha)}</td>
                <td>${(p.hora_inicio||'').slice(0,5)} – ${(p.hora_fin||'').slice(0,5)}</td>
                <td><span class="lista-tag ${p.espacio}">${ESPACIOS_NOMBRES[p.espacio]||p.espacio}</span></td>
                <td>${p.titulo}</td>
                <td>${p.solicitante}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  document.getElementById('dashBody').innerHTML = cards + barrasEspacio + barrasMes + proxTable;
}

// ── GENERAR PDF ────────────────────────────────────────────────────────────────

// Trunca texto con "…" si no entra en el ancho disponible (evita overlaps silenciosos)
function fitText(doc, text, maxWidthMm) {
  text = String(text || '');
  if (doc.getTextWidth(text) <= maxWidthMm) return text;
  let truncado = text;
  while (truncado.length > 1 && doc.getTextWidth(truncado + '…') > maxWidthMm) {
    truncado = truncado.slice(0, -1);
  }
  return truncado + '…';
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r,g,b];
}

// Botón principal del modal: informe general (año actual, comportamiento original)
function generarPDF() {
  if (!statsCache) { showToast('Cargá el dashboard primero', 'error'); return; }
  ejecutarGeneracionPDF(statsCache, 'general');
}

// Informes por período: consulta stats frescas para el período elegido
async function generarInformePeriodo() {
  const tipo = document.getElementById('tipoInforme').value; // 'mensual' | 'anual'
  const anio = parseInt(document.getElementById('informeAnio').value) || new Date().getFullYear();
  const btn  = document.getElementById('btnGenerarPeriodo');

  let url = '/api/stats?anio=' + anio;
  if (tipo === 'mensual') {
    const mes = parseInt(document.getElementById('informeMes').value);
    url += '&mes=' + mes;
  }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Generando...';

  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Error al obtener datos del período');
    const data = await r.json();
    ejecutarGeneracionPDF(data, tipo);
  } catch(e) {
    showToast('Error al generar el informe: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function ejecutarGeneracionPDF(data, tipo) {
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
    showToast('Cargando librería PDF...', 'success');
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => construirPDF(data, tipo);
    script.onerror = () => showToast('No se pudo cargar la librería PDF', 'error');
    document.head.appendChild(script);
  } else {
    construirPDF(data, tipo);
  }
}

const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function construirPDF(d, tipo) {
  try {
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const hoy = new Date();
    const fechaStr = hoy.toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' });
    const anioStr = d.anio;

    // Título y subtítulo según tipo de informe
    let tituloInforme, apaTitulo, cita;
    if (tipo === 'mensual') {
      const nombreMes = MESES_LARGO[d.mes - 1];
      tituloInforme = `Informe Mensual de Reservas — ${nombreMes} ${anioStr}`;
      apaTitulo = `Informe mensual de reservas de espacios — ${nombreMes} de ${anioStr}`;
    } else if (tipo === 'anual') {
      tituloInforme = `Informe Anual de Reservas — ${anioStr}`;
      apaTitulo = `Informe anual de reservas de espacios — ${anioStr}`;
    } else {
      tituloInforme = `Informe Estadístico de Reservas — ${anioStr}`;
      apaTitulo = `Informe estadístico de reservas de espacios — ${anioStr}`;
    }
    cita = `Centro Cultural Municipal. (${anioStr}). ${apaTitulo}. Sistema de Gestión de Reservas.`;

    // Paleta
    const azulOsc  = [28, 35, 64];
    const azulMed  = [79, 110, 247];
    const gris     = [120, 120, 135];
    const grisClar = [245, 245, 248];
    const negro    = [30, 30, 40];

    const W = 210, M = 18;
    const anchoUtil = W - M * 2; // 174mm — todo debe quedar dentro de este ancho
    let y = 0;

    // ── ENCABEZADO ──
    doc.setFillColor(...azulOsc);
    doc.rect(0, 0, W, 42, 'F');

    try {
      const imgEl = document.querySelector('.sidebar-logo img, #sidebarLogo img');
      if (imgEl && imgEl.src && imgEl.src.startsWith('data:')) {
        doc.addImage(imgEl.src, 'JPEG', M, 8, 22, 22);
      }
    } catch(e) {}

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Centro Cultural Municipal', M + 26, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 190, 230);
    doc.text('Sistema de Gestión de Reservas', M + 26, 22);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(fitText(doc, tituloInforme, W - M - 26 - 4), M + 26, 30);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 190, 230);
    doc.text(`Generado el ${fechaStr}`, M + 26, 36);

    y = 52;

    // ── CITA APA ──
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.setFont('helvetica', 'italic');
    const apaLines = doc.splitTextToSize(cita, anchoUtil);
    doc.text(apaLines, M, y);
    y += apaLines.length * 4 + 6;

    doc.setDrawColor(...azulMed);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    y += 7;

    // ── TARJETAS RESUMEN ──
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...negro);
    doc.text('1. Resumen General', M, y);
    y += 7;

    const tarjetas = [
      { label: 'Total Reservas', val: d.total, col: azulMed },
      { label: 'Realizadas',     val: d.realizadas, col: [32, 201, 151] },
      { label: 'Pendientes',     val: d.pendientes, col: [0, 184, 217] },
      { label: 'Espacios',       val: d.porEspacio.length, col: [245, 158, 11] },
    ];

    const gapCards = 3;
    const cardW = (anchoUtil - gapCards * 3) / 4;
    tarjetas.forEach((t, i) => {
      const cx = M + i * (cardW + gapCards);
      doc.setFillColor(...grisClar);
      doc.roundedRect(cx, y, cardW, 22, 2, 2, 'F');
      doc.setFillColor(...t.col);
      doc.roundedRect(cx, y, 3, 22, 1, 1, 'F');
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...t.col);
      doc.text(String(t.val), cx + cardW / 2, y + 12, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...gris);
      doc.text(t.label, cx + cardW / 2, y + 18, { align: 'center' });
    });
    y += 30;

    // ── TABLA POR ESPACIO ──
    // Columnas recalculadas en base a M (todo dentro de W-M en el extremo derecho)
    const colEspacioX  = M + 3;
    const colReservasX = M + 95;
    const colHorasX    = M + 122;
    const colPctX      = M + 145;
    const barX         = M + 158;
    const barW         = (W - M) - barX - 2; // termina 2mm antes del margen derecho real

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...negro);
    doc.text('2. Uso por Espacio', M, y);
    y += 6;

    doc.setFillColor(...azulOsc);
    doc.rect(M, y, anchoUtil, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Espacio', colEspacioX, y + 4.5);
    doc.text('Reservas', colReservasX, y + 4.5, { align: 'center' });
    doc.text('Horas', colHorasX, y + 4.5, { align: 'center' });
    doc.text('%', colPctX, y + 4.5, { align: 'center' });
    y += 7;

    if (!d.porEspacio.length) {
      doc.setFillColor(...grisClar);
      doc.rect(M, y, anchoUtil, 8, 'F');
      doc.setTextColor(...gris);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('Sin reservas registradas en este período.', M + anchoUtil / 2, y + 5.2, { align: 'center' });
      y += 8;
    } else {
      const maxEspRow = Math.max(...d.porEspacio.map(x => parseInt(x.reservas)), 1);
      d.porEspacio.forEach((e, i) => {
        const bg = i % 2 === 0 ? [255, 255, 255] : grisClar;
        doc.setFillColor(...bg);
        doc.rect(M, y, anchoUtil, 7, 'F');
        const col = COLORES_ESPACIO[e.espacio] || '#7C6FFF';
        const rgb = hexToRgb(col);
        doc.setFillColor(...rgb);
        doc.rect(M, y, 3, 7, 'F');
        doc.setTextColor(...negro);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const nombreEsp = ESPACIOS_NOMBRES[e.espacio] || e.espacio;
        doc.text(fitText(doc, nombreEsp, colReservasX - colEspacioX - 4), colEspacioX + 3, y + 4.5);
        doc.text(String(e.reservas), colReservasX, y + 4.5, { align: 'center' });
        doc.text(String(e.horas || 0) + 'h', colHorasX, y + 4.5, { align: 'center' });
        const pct = d.total > 0 ? ((parseInt(e.reservas) / d.total) * 100).toFixed(1) : '0';
        doc.text(pct + '%', colPctX, y + 4.5, { align: 'center' });

        const barFill = Math.round(parseInt(e.reservas) / maxEspRow * barW);
        doc.setFillColor(230, 230, 240);
        doc.rect(barX, y + 2, barW, 3, 'F');
        doc.setFillColor(...rgb);
        doc.rect(barX, y + 2, Math.max(barFill, 1), 3, 'F');
        y += 7;
      });
    }
    y += 8;

    // ── DISTRIBUCIÓN TEMPORAL ──
    // Mensual → barras por día del mes · General/Anual → barras por mes del año
    if (y > 220) { doc.addPage(); y = 20; }

    const esInformeMensual = tipo === 'mensual';
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...negro);
    doc.text(
      esInformeMensual
        ? `3. Distribución Diaria — ${MESES_LARGO[d.mes - 1]} ${anioStr}`
        : `3. Distribución Mensual — ${anioStr}`,
      M, y
    );
    y += 6;

    let etiquetasEje, valoresEje;
    if (esInformeMensual) {
      const diasEnMes = new Date(anioStr, d.mes, 0).getDate();
      valoresEje = Array.from({length: diasEnMes}, (_, i) => {
        const found = (d.porDia || []).find(x => x.dia === i + 1);
        return found ? parseInt(found.reservas) : 0;
      });
      etiquetasEje = Array.from({length: diasEnMes}, (_, i) => String(i + 1));
    } else {
      valoresEje = Array.from({length: 12}, (_, i) => {
        const found = d.porMes.find(m => m.mes === i + 1);
        return found ? parseInt(found.reservas) : 0;
      });
      etiquetasEje = MESES_CORTO;
    }

    const maxEje = Math.max(...valoresEje, 1);
    const chartH = 35;
    const barGap = esInformeMensual ? 0.5 : 3;
    const barSlot = anchoUtil / valoresEje.length;

    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.2);
    for (let g = 0; g <= 4; g++) {
      const gy = y + chartH - (g / 4 * chartH);
      doc.line(M, gy, W - M, gy);
      doc.setFontSize(6);
      doc.setTextColor(...gris);
      doc.text(String(Math.round(maxEje * g / 4)), M - 3, gy + 1, { align: 'right' });
    }

    valoresEje.forEach((v, i) => {
      const bH = maxEje > 0 ? (v / maxEje) * chartH : 0;
      const bx = M + i * barSlot + barGap / 2;
      const bw = Math.max(barSlot - barGap, 0.6);
      doc.setFillColor(...azulMed);
      doc.roundedRect(bx, y + chartH - bH, bw, bH, esInformeMensual ? 0.3 : 1, esInformeMensual ? 0.3 : 1, 'F');
      // Etiqueta de valor arriba de la barra (solo si hay espacio y valor > 0, y no es mensual con muchas barras finitas)
      if (v > 0 && !esInformeMensual) {
        doc.setFontSize(6);
        doc.setTextColor(...negro);
        doc.text(String(v), bx + bw / 2, y + chartH - bH - 1, { align: 'center' });
      }
      // Etiquetas del eje X: en mensual solo cada 5 días para no amontonar
      if (!esInformeMensual || (i + 1) % 5 === 0 || i === 0 || i === valoresEje.length - 1) {
        doc.setFontSize(esInformeMensual ? 5 : 6);
        doc.setTextColor(...gris);
        doc.text(etiquetasEje[i], bx + bw / 2, y + chartH + 4, { align: 'center' });
      }
    });
    y += chartH + 10;

    // ── LISTADO DE RESERVAS ──
    if (d.proximas.length > 0) {
      if (y > 220) { doc.addPage(); y = 20; }

      const tituloListado = tipo === 'general'
        ? '4. Próximas Reservas (30 días)'
        : `4. Reservas del Período (${d.proximas.length})`;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...negro);
      doc.text(tituloListado, M, y);
      y += 6;

      // Columnas recalculadas para que Título y Solicitante tengan más aire,
      // suficiente para nombres largos como "Aula punto digital" sin overlap.
      const cFecha = M + 3;
      const cHora  = M + 32;
      const cEsp   = M + 56;
      const cTit   = M + 100;
      const cSol   = M + 142;
      const wFecha = cHora - cFecha - 2;
      const wHora  = cEsp - cHora - 2;
      const wEsp   = cTit - cEsp - 2;
      const wTit   = cSol - cTit - 2;
      const wSol   = (W - M) - cSol - 2;

      doc.setFillColor(...azulOsc);
      doc.rect(M, y, anchoUtil, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text('Fecha', cFecha, y + 4.5);
      doc.text('Horario', cHora, y + 4.5);
      doc.text('Espacio', cEsp, y + 4.5);
      doc.text('Título', cTit, y + 4.5);
      doc.text('Solicitante', cSol, y + 4.5);
      y += 7;

      const maxFilas = tipo === 'general' ? d.proximas.length : d.proximas.length; // ya viene limitado por el server (200 máx)

      d.proximas.forEach((p, i) => {
        if (y > 273) {
          doc.addPage();
          y = 20;
          // Repetir cabecera en la página nueva
          doc.setFillColor(...azulOsc);
          doc.rect(M, y, anchoUtil, 7, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          doc.text('Fecha', cFecha, y + 4.5);
          doc.text('Horario', cHora, y + 4.5);
          doc.text('Espacio', cEsp, y + 4.5);
          doc.text('Título', cTit, y + 4.5);
          doc.text('Solicitante', cSol, y + 4.5);
          y += 7;
        }
        doc.setFillColor(...(i % 2 === 0 ? [255,255,255] : grisClar));
        doc.rect(M, y, anchoUtil, 7, 'F');
        doc.setTextColor(...negro);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');

        const fechaCorta = formatFechaLarga(p.fecha).replace(/^(\w+)\s(\d+)\sde\s(\w+)\s(\d+)$/, '$2 $3');
        doc.text(fitText(doc, fechaCorta, wFecha), cFecha, y + 4.5);
        doc.text(`${(p.hora_inicio||'').slice(0,5)}–${(p.hora_fin||'').slice(0,5)}`, cHora, y + 4.5);
        doc.text(fitText(doc, ESPACIOS_NOMBRES[p.espacio] || p.espacio, wEsp), cEsp, y + 4.5);
        doc.text(fitText(doc, p.titulo, wTit), cTit, y + 4.5);
        doc.text(fitText(doc, p.solicitante, wSol), cSol, y + 4.5);
        y += 7;
      });
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...gris);
      doc.text('No hay reservas registradas en este período.', M, y);
      y += 8;
    }

    // ── PIE DE PÁGINA ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let pg = 1; pg <= totalPages; pg++) {
      doc.setPage(pg);
      doc.setFillColor(...grisClar);
      doc.rect(0, 285, W, 12, 'F');
      doc.setFontSize(7);
      doc.setTextColor(...gris);
      doc.setFont('helvetica', 'normal');
      doc.text('Centro Cultural Municipal — Sistema de Gestión de Reservas', M, 291);
      doc.text(`Página ${pg} de ${totalPages}`, W - M, 291, { align: 'right' });
    }

    const sufijoNombre = tipo === 'mensual'
      ? `mensual-${anioStr}-${String(d.mes).padStart(2,'0')}`
      : tipo === 'anual' ? `anual-${anioStr}` : `general-${anioStr}`;
    const fname = `informe-${sufijoNombre}-${fmtDate(new Date())}.pdf`;
    doc.save(fname);
    showToast('PDF generado correctamente', 'success');
  } catch(e) {
    console.error('PDF error:', e);
    showToast('Error generando el PDF: ' + e.message, 'error');
  }
}

init();
