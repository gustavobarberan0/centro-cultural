'use strict';

// ── Estado global ──────────────────────────────────────────────────────────────
const state = {
  vista: 'mensual',
  hoy: new Date(),
  fecha: new Date(),
  reservas: [],
  filtro: 'todos',
  editandoId: null,
  usuarioRol: null,
  usuarioNombre: null,
  conflictoTimeout: null,
};

const ESPACIOS = {
  aula1:        'Aula 1',
  aula2:        'Aula 2',
  cine:         'Sala de Cine',
  conferencias: 'Sala de Conferencias',
  ingreso:      'Ingreso Principal',
};

const COLORES_ESPACIO = {
  aula1:'#7C6FFF', aula2:'#9D5CFF', cine:'#FF6B6B', conferencias:'#20C997', ingreso:'#FFD43B'
};

const DIAS_CORTO   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_LARGO   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES        = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok) { window.location.href = '/login.html'; return; }
    const d = await r.json();
    state.usuarioRol    = d.rol;
    state.usuarioNombre = d.nombre;
    document.getElementById('userNombre').textContent = d.nombre;
    document.getElementById('userRol').textContent    = d.rol === 'admin' ? '● admin' : '';
    if (d.rol === 'admin') {
      document.getElementById('headerNav').innerHTML =
        `<button class="nav-btn" onclick="abrirAdmin()">⚙ Admin</button>`;
    }
    await cargarLogo();
    await cargarReservas();
    renderCalendario();
  } catch(e) { window.location.href = '/login.html'; }
}

// ── Logo ───────────────────────────────────────────────────────────────────────
async function cargarLogo() {
  try {
    const r = await fetch('/api/logo', { credentials: 'same-origin' });
    const d = await r.json();
    if (d.url) {
      document.getElementById('headerLogo').innerHTML =
        `<img src="${d.url}?t=${Date.now()}" alt="Logo" style="height:40px;width:40px;object-fit:contain;border-radius:6px">`;
    }
  } catch {}
}

// ── Reservas ───────────────────────────────────────────────────────────────────
async function cargarReservas() {
  const params = buildFetchParams();
  try {
    const r = await fetch(`/api/reservas?${params}`, { credentials: 'same-origin' });
    if (!r.ok) return;
    state.reservas = await r.json();
  } catch {}
}

function buildFetchParams() {
  const f = state.fecha;
  let desde, hasta;
  if (state.vista === 'mensual') {
    desde = new Date(f.getFullYear(), f.getMonth(), 1);
    hasta = new Date(f.getFullYear(), f.getMonth()+1, 0);
  } else if (state.vista === 'semanal') {
    const lunes = new Date(f); lunes.setDate(f.getDate() - f.getDay() + (f.getDay()===0?-6:1));
    desde = lunes;
    hasta = new Date(lunes); hasta.setDate(lunes.getDate()+6);
  } else if (state.vista === 'diaria') {
    desde = hasta = f;
  } else { // lista: próximos 60 días
    desde = new Date(); desde.setDate(desde.getDate()-7);
    hasta = new Date(); hasta.setDate(hasta.getDate()+60);
  }
  return `desde=${fmtDate(desde)}&hasta=${fmtDate(hasta)}`;
}

function filtrarReservas(reservas) {
  if (state.filtro === 'todos') return reservas;
  return reservas.filter(r => r.espacio === state.filtro);
}

// ── Navegación ─────────────────────────────────────────────────────────────────
function setVista(v) {
  state.vista = v;
  document.querySelectorAll('.view-tab').forEach((el, i) => {
    el.classList.toggle('active', ['mensual','semanal','diaria','lista'][i] === v);
  });
  cargarReservas().then(() => renderCalendario());
}

function navFecha(dir) {
  const f = state.fecha;
  if (state.vista === 'mensual') f.setMonth(f.getMonth() + dir);
  else if (state.vista === 'semanal') f.setDate(f.getDate() + dir*7);
  else if (state.vista === 'diaria') f.setDate(f.getDate() + dir);
  else f.setDate(f.getDate() + dir*30);
  cargarReservas().then(() => renderCalendario());
}

function irHoy() {
  state.fecha = new Date(state.hoy);
  cargarReservas().then(() => renderCalendario());
}

function setFiltro(f) {
  state.filtro = f;
  document.querySelectorAll('.filtro-btn').forEach(el => {
    el.classList.toggle('active', el.classList.contains(f));
  });
  renderCalendario();
}

// ── Render principal ───────────────────────────────────────────────────────────
function renderCalendario() {
  actualizarFechaLabel();
  const wrap = document.getElementById('calendarWrap');
  if (state.vista === 'mensual')  renderMensual(wrap);
  else if (state.vista === 'semanal') renderSemanal(wrap);
  else if (state.vista === 'diaria')  renderDiaria(wrap);
  else renderLista(wrap);
}

function actualizarFechaLabel() {
  const f = state.fecha;
  let txt = '';
  if (state.vista === 'mensual') txt = `${MESES[f.getMonth()]} ${f.getFullYear()}`;
  else if (state.vista === 'semanal') {
    const lunes = new Date(f); lunes.setDate(f.getDate() - f.getDay() + (f.getDay()===0?-6:1));
    const dom   = new Date(lunes); dom.setDate(lunes.getDate()+6);
    txt = `${lunes.getDate()} ${MESES[lunes.getMonth()].slice(0,3)} — ${dom.getDate()} ${MESES[dom.getMonth()].slice(0,3)} ${dom.getFullYear()}`;
  } else if (state.vista === 'diaria') {
    txt = `${DIAS_LARGO[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]} ${f.getFullYear()}`;
  } else txt = `Próximos eventos`;
  document.getElementById('fechaLabel').textContent = txt;
}

// ── Vista mensual ──────────────────────────────────────────────────────────────
function renderMensual(wrap) {
  const f        = state.fecha;
  const year     = f.getFullYear();
  const month    = f.getMonth();
  const primero  = new Date(year, month, 1);
  const ultimo   = new Date(year, month+1, 0);
  const inicioGrid = new Date(primero);
  // Empezamos en lunes
  const dow = primero.getDay(); // 0=dom
  inicioGrid.setDate(primero.getDate() - (dow === 0 ? 6 : dow - 1));

  const reservas = filtrarReservas(state.reservas);
  const porDia   = {};
  for (const r of reservas) {
    if (!porDia[r.fecha]) porDia[r.fecha] = [];
    porDia[r.fecha].push(r);
  }

  let html = '<div class="cal-mensual">';
  for (const d of ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'])
    html += `<div class="cal-header-day">${d}</div>`;

  const cursor = new Date(inicioGrid);
  while (cursor <= ultimo || cursor.getDay() !== 1) {
    const dateStr   = fmtDate(cursor);
    const esHoy     = dateStr === fmtDate(state.hoy);
    const otroMes   = cursor.getMonth() !== month;
    const eventos   = porDia[dateStr] || [];
    const MAX_SHOW  = 3;
    html += `<div class="cal-day${otroMes?' otro-mes':''}${esHoy?' hoy':''}" onclick="clickDia('${dateStr}')">`;
    html += `<div class="day-num">${cursor.getDate()}</div>`;
    for (let i = 0; i < Math.min(eventos.length, MAX_SHOW); i++) {
      const ev = eventos[i];
      html += `<div class="cal-evento ${ev.espacio}" onclick="event.stopPropagation();verDetalle('${ev.id}')" title="${ev.titulo} — ${ev.solicitante}">
        ${ev.hora_inicio?.slice(0,5)||''} ${ev.titulo}
      </div>`;
    }
    if (eventos.length > MAX_SHOW)
      html += `<div class="mas-eventos">+${eventos.length-MAX_SHOW} más</div>`;
    html += '</div>';
    cursor.setDate(cursor.getDate()+1);
    if (cursor.getDay() === 1 && cursor > ultimo) break;
  }
  html += '</div>';
  wrap.innerHTML = html;
}

// ── Vista semanal ──────────────────────────────────────────────────────────────
function renderSemanal(wrap) {
  const f = state.fecha;
  const dow = f.getDay();
  const lunes = new Date(f);
  lunes.setDate(f.getDate() - (dow === 0 ? 6 : dow-1));

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes); d.setDate(lunes.getDate()+i);
    dias.push(d);
  }

  const reservas = filtrarReservas(state.reservas);
  const HORAS = Array.from({length:24}, (_,i) => i);

  let html = '<div class="cal-semanal">';
  // Headers
  html += '<div class="sem-header"></div>';
  for (const d of dias) {
    const esHoy = fmtDate(d) === fmtDate(state.hoy);
    html += `<div class="sem-header${esHoy?' hoy-col':''}">${DIAS_CORTO[d.getDay()]}<br><span style="font-size:1rem;font-weight:800">${d.getDate()}</span></div>`;
  }
  // Horas y celdas
  html += '<div class="sem-hora-col">';
  for (const h of HORAS) html += `<div class="sem-hora">${String(h).padStart(2,'0')}:00</div>`;
  html += '</div>';

  for (let di = 0; di < 7; di++) {
    const d = dias[di];
    const dateStr = fmtDate(d);
    const evsDia  = reservas.filter(r => r.fecha === dateStr);
    html += `<div class="sem-day-col" onclick="clickDia('${dateStr}')">`;
    for (const h of HORAS) html += `<div class="sem-slot"></div>`;
    for (const ev of evsDia) {
      const [sh,sm] = ev.hora_inicio.split(':').map(Number);
      const [eh,em] = ev.hora_fin.split(':').map(Number);
      const top     = (sh*60+sm) * (60/60);
      const height  = Math.max(((eh*60+em)-(sh*60+sm)) * (60/60), 20);
      html += `<div class="sem-evento ${ev.espacio}" style="top:${top}px;height:${height}px" onclick="event.stopPropagation();verDetalle('${ev.id}')" title="${ev.titulo}">
        <strong>${ev.hora_inicio?.slice(0,5)}</strong> ${ev.titulo}
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  wrap.innerHTML = html;
}

// ── Vista diaria ───────────────────────────────────────────────────────────────
function renderDiaria(wrap) {
  const dateStr = fmtDate(state.fecha);
  const reservas = filtrarReservas(state.reservas).filter(r => r.fecha === dateStr);
  const HORAS   = Array.from({length:24}, (_,i) => i);

  let html = '<div class="cal-diaria">';
  // Columna horas
  for (const h of HORAS)
    html += `<div class="dia-hora">${String(h).padStart(2,'0')}:00</div>`;
  // Columna eventos
  html += `<div class="dia-col" onclick="clickDia('${dateStr}')">`;
  for (const h of HORAS) html += `<div class="dia-slot" onclick="clickDiaHora('${dateStr}',${h})"></div>`;
  for (const ev of reservas) {
    const [sh,sm] = ev.hora_inicio.split(':').map(Number);
    const [eh,em] = ev.hora_fin.split(':').map(Number);
    const top     = (sh*60+sm);
    const height  = Math.max((eh*60+em)-(sh*60+sm), 30);
    html += `<div class="dia-evento ${ev.espacio}" style="top:${top}px;height:${height}px;left:4px;right:4px" onclick="event.stopPropagation();verDetalle('${ev.id}')">
      <strong>${ev.hora_inicio?.slice(0,5)} — ${ev.hora_fin?.slice(0,5)}</strong><br>${ev.titulo}<br><span style="font-size:.72rem;opacity:.8">${ESPACIOS[ev.espacio]}</span>
    </div>`;
  }
  html += '</div></div>';
  wrap.innerHTML = html;
}

// ── Vista lista ────────────────────────────────────────────────────────────────
function renderLista(wrap) {
  const reservas = filtrarReservas(state.reservas).sort((a,b) =>
    a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));

  if (!reservas.length) {
    wrap.innerHTML = '<div class="cal-lista"><div class="lista-vacia">No hay reservas en este período</div></div>';
    return;
  }

  const grupos = {};
  for (const r of reservas) {
    if (!grupos[r.fecha]) grupos[r.fecha] = [];
    grupos[r.fecha].push(r);
  }

  let html = '<div class="cal-lista">';
  for (const fecha of Object.keys(grupos).sort()) {
    const d = new Date(fecha + 'T00:00:00');
    const esHoy = fecha === fmtDate(state.hoy);
    html += `<div class="lista-grupo">
      <div class="lista-fecha-header${esHoy?' hoy':''}">
        ${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}
        ${esHoy ? ' — <span style="color:var(--accent)">Hoy</span>' : ''}
      </div>`;
    for (const ev of grupos[fecha]) {
      html += `<div class="lista-item" onclick="verDetalle('${ev.id}')">
        <div class="lista-espacio-badge ${ev.espacio}"></div>
        <div class="lista-hora">${ev.hora_inicio?.slice(0,5)} – ${ev.hora_fin?.slice(0,5)}</div>
        <div class="lista-info">
          <div class="lista-titulo">${ev.titulo}</div>
          <div class="lista-sol">${ev.solicitante}${ev.usuario_nombre ? ' · '+ev.usuario_nombre : ''}</div>
        </div>
        <div class="lista-espacio-tag ${ev.espacio}">${ESPACIOS[ev.espacio]}</div>
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  wrap.innerHTML = html;
}

// ── Click en día ───────────────────────────────────────────────────────────────
function clickDia(dateStr) {
  state.vista = 'diaria';
  state.fecha = new Date(dateStr + 'T12:00:00');
  document.querySelectorAll('.view-tab').forEach((el,i) => el.classList.toggle('active', i===2));
  cargarReservas().then(() => renderCalendario());
}

function clickDiaHora(dateStr, hora) {
  abrirNueva(dateStr, `${String(hora).padStart(2,'0')}:00`, `${String(hora+1).padStart(2,'0')}:00`);
}

// ── Modal nueva/editar reserva ─────────────────────────────────────────────────
function abrirNueva(fecha = null, horaInicio = '08:00', horaFin = '10:00') {
  state.editandoId = null;
  document.getElementById('modalTitle').textContent = 'Nueva reserva';
  document.getElementById('rEspacio').value    = 'salon';
  document.getElementById('rTitulo').value     = '';
  document.getElementById('rSolicitante').value= '';
  document.getElementById('rDescripcion').value= '';
  document.getElementById('rFecha').value      = fecha || fmtDate(state.fecha);
  document.getElementById('rHoraInicio').value = horaInicio;
  document.getElementById('rHoraFin').value    = horaFin;
  ocultarConflictos();
  abrirModal('modalReserva');
  setTimeout(() => checkConflictos(), 300);
}

function abrirEditar(id) {
  const ev = state.reservas.find(r => r.id === id);
  if (!ev) return;
  state.editandoId = id;
  document.getElementById('modalTitle').textContent = 'Editar reserva';
  document.getElementById('rEspacio').value    = ev.espacio;
  document.getElementById('rTitulo').value     = ev.titulo;
  document.getElementById('rSolicitante').value= ev.solicitante;
  document.getElementById('rDescripcion').value= ev.descripcion || '';
  document.getElementById('rFecha').value      = ev.fecha;
  document.getElementById('rHoraInicio').value = ev.hora_inicio?.slice(0,5) || '';
  document.getElementById('rHoraFin').value    = ev.hora_fin?.slice(0,5) || '';
  ocultarConflictos();
  cerrarModal('modalDetalle');
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

  if (!titulo) return showToast('Ingresá un título', 'error');
  if (!solicitante) return showToast('Ingresá el solicitante', 'error');
  if (!fecha) return showToast('Seleccioná una fecha', 'error');
  if (!hora_inicio || !hora_fin) return showToast('Ingresá los horarios', 'error');
  if (hora_fin <= hora_inicio) return showToast('La hora de fin debe ser posterior al inicio', 'error');

  const body = { espacio, titulo, solicitante, descripcion, fecha, hora_inicio, hora_fin };
  const url  = state.editandoId ? `/api/reservas/${state.editandoId}` : '/api/reservas';
  const method = state.editandoId ? 'PUT' : 'POST';

  try {
    const r = await fetch(url, { method, credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) {
      if (d.error === 'conflicto') {
        mostrarConflictos(d.conflictos, true);
        return;
      }
      return showToast(d.error || 'Error al guardar', 'error');
    }
    cerrarModal('modalReserva');
    showToast(state.editandoId ? 'Reserva actualizada' : 'Reserva creada', 'success');
    await cargarReservas();
    renderCalendario();
  } catch { showToast('Error de conexión', 'error'); }
}

// ── Conflictos ─────────────────────────────────────────────────────────────────
async function checkConflictos() {
  clearTimeout(state.conflictoTimeout);
  state.conflictoTimeout = setTimeout(async () => {
    const espacio    = document.getElementById('rEspacio').value;
    const fecha      = document.getElementById('rFecha').value;
    const hora_inicio= document.getElementById('rHoraInicio').value;
    const hora_fin   = document.getElementById('rHoraFin').value;
    if (!fecha || !hora_inicio || !hora_fin || hora_fin <= hora_inicio) { ocultarConflictos(); return; }
    try {
      const params = `espacio=${espacio}&fecha=${fecha}&hora_inicio=${hora_inicio}&hora_fin=${hora_fin}${state.editandoId?'&exclude_id='+state.editandoId:''}`;
      const r = await fetch(`/api/reservas/conflictos?${params}`, { credentials:'same-origin' });
      const d = await r.json();
      if (d.conflictos?.length) mostrarConflictos(d.conflictos, false);
      else ocultarConflictos();
    } catch {}
  }, 400);
}

function mostrarConflictos(conflictos, esError) {
  const box = document.getElementById('conflictoBox');
  let html = `<div class="conflicto-box">
    <div class="conflicto-title">${esError ? '⛔' : '⚠️'} ${esError ? 'No se puede guardar' : 'Advertencia'}: el espacio ya tiene reservas en ese horario</div>`;
  for (const c of conflictos)
    html += `<div class="conflicto-item"><strong>${c.titulo}</strong> — ${c.solicitante} · ${c.hora_inicio} a ${c.hora_fin}</div>`;
  html += '</div>';
  box.innerHTML = html;
  box.style.display = 'block';
}

function ocultarConflictos() {
  const box = document.getElementById('conflictoBox');
  box.style.display = 'none'; box.innerHTML = '';
}

// ── Detalle ────────────────────────────────────────────────────────────────────
function verDetalle(id) {
  const ev = state.reservas.find(r => r.id === id);
  if (!ev) return;
  const puedeMod = state.usuarioRol === 'admin' || ev.usuario_id === getUserId();
  document.getElementById('detalleBody').innerHTML = `
    <div class="detail-espacio ${ev.espacio}">${ESPACIOS[ev.espacio]}</div>
    <div style="font-family:Syne,sans-serif;font-weight:800;font-size:1.2rem;margin-bottom:1rem">${ev.titulo}</div>
    <div class="detail-row"><div class="detail-label">📅 Fecha</div><div class="detail-val">${formatFechaLarga(ev.fecha)}</div></div>
    <div class="detail-row"><div class="detail-label">🕐 Horario</div><div class="detail-val">${ev.hora_inicio?.slice(0,5)} – ${ev.hora_fin?.slice(0,5)}</div></div>
    <div class="detail-row"><div class="detail-label">👤 Solicitante</div><div class="detail-val">${ev.solicitante}</div></div>
    ${ev.descripcion ? `<div class="detail-row"><div class="detail-label">📝 Descripción</div><div class="detail-val">${ev.descripcion}</div></div>` : ''}
    ${ev.usuario_nombre ? `<div class="detail-row"><div class="detail-label">🧑‍💼 Registró</div><div class="detail-val">${ev.usuario_nombre}</div></div>` : ''}
  `;
  document.getElementById('detalleFooter').innerHTML = `
    <button class="btn-secondary" onclick="cerrarModal('modalDetalle')">Cerrar</button>
    ${puedeMod ? `<button class="btn-primary" onclick="abrirEditar('${id}')">Editar</button>
    <button class="btn-danger" onclick="confirmarEliminar('${id}')">Eliminar</button>` : ''}
  `;
  abrirModal('modalDetalle');
}

async function confirmarEliminar(id) {
  const ev = state.reservas.find(r => r.id === id);
  if (!confirm(`¿Eliminar la reserva "${ev?.titulo}"?`)) return;
  try {
    const r = await fetch(`/api/reservas/${id}`, { method:'DELETE', credentials:'same-origin' });
    if (!r.ok) { const d = await r.json(); return showToast(d.error, 'error'); }
    cerrarModal('modalDetalle');
    showToast('Reserva eliminada', 'success');
    await cargarReservas(); renderCalendario();
  } catch { showToast('Error de conexión', 'error'); }
}

// ── Admin ──────────────────────────────────────────────────────────────────────
async function abrirAdmin() {
  abrirModal('modalAdmin');
  await cargarLogoAdmin();
  try {
    const r = await fetch('/api/admin/usuarios', { credentials:'same-origin' });
    const usuarios = await r.json();
    document.getElementById('adminSubtitle').textContent = `${usuarios.length} usuario${usuarios.length!==1?'s':''}`;
    const tbody = document.getElementById('adminTbody');
    tbody.innerHTML = usuarios.map(u => `
      <tr>
        <td>${u.nombre}</td>
        <td style="font-size:.78rem;color:var(--text2)">${u.email}</td>
        <td><span class="rol-badge ${u.rol}">${u.rol}</span></td>
        <td style="text-align:center">${u.total_reservas}</td>
        <td style="display:flex;gap:.3rem;flex-wrap:wrap">
          <button class="btn-icon" onclick="cambiarRol('${u.id}','${u.rol==='admin'?'staff':'admin'}')">${u.rol==='admin'?'→ staff':'→ admin'}</button>
          <button class="btn-icon" style="color:var(--danger)" onclick="eliminarUsuario('${u.id}','${u.nombre}')">✕</button>
        </td>
      </tr>`).join('');
  } catch {}
}

async function cargarLogoAdmin() {
  try {
    const r = await fetch('/api/logo', { credentials:'same-origin' });
    const d = await r.json();
    const wrap = document.getElementById('logoPreviewWrap');
    if (d.url) wrap.innerHTML = `<img class="logo-preview" src="${d.url}?t=${Date.now()}" alt="Logo actual"><br><p style="font-size:.72rem;color:var(--text2)">Hacé click para cambiar</p>`;
    else wrap.innerHTML = `<p style="font-size:.82rem;color:var(--text2)">Hacé click para subir el escudo / logo<br><span style="font-size:.72rem">PNG, JPG, SVG — máx 2MB</span></p>`;
  } catch {}
}

async function subirLogo(input) {
  if (!input.files[0]) return;
  const formData = new FormData();
  formData.append('logo', input.files[0]);
  try {
    const r = await fetch('/api/logo', { method:'POST', credentials:'same-origin', body: formData });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Error al subir', 'error');
    showToast('Logo actualizado', 'success');
    await cargarLogo();
    await cargarLogoAdmin();
  } catch { showToast('Error al subir el logo', 'error'); }
}

async function cambiarRol(id, nuevoRol) {
  if (!confirm(`¿Cambiar el rol a "${nuevoRol}"?`)) return;
  try {
    const r = await fetch(`/api/admin/usuarios/${id}/rol`, { method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rol: nuevoRol }) });
    if (!r.ok) { const d = await r.json(); return showToast(d.error, 'error'); }
    showToast('Rol actualizado', 'success');
    abrirAdmin();
  } catch { showToast('Error', 'error'); }
}

async function eliminarUsuario(id, nombre) {
  if (!confirm(`¿Eliminar al usuario "${nombre}"? Se eliminarán también todas sus reservas.`)) return;
  try {
    const r = await fetch(`/api/admin/usuarios/${id}`, { method:'DELETE', credentials:'same-origin' });
    if (!r.ok) { const d = await r.json(); return showToast(d.error, 'error'); }
    showToast('Usuario eliminado', 'success');
    abrirAdmin();
    await cargarReservas(); renderCalendario();
  } catch { showToast('Error', 'error'); }
}

// ── Logout ─────────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout', { method:'POST', credentials:'same-origin' });
  window.location.href = '/login.html';
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function abrirModal(id)  { document.getElementById(id).classList.add('open'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatFechaLarga(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function getUserId() {
  // No almacenamos el ID en el cliente, el servidor valida por sesión
  return null;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

// Cerrar modales con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modalReserva','modalDetalle','modalAdmin'].forEach(id => cerrarModal(id));
  }
});

// Cerrar al click afuera
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) cerrarModal(overlay.id);
  });
});

// ── Arrancar ───────────────────────────────────────────────────────────────────
init();
