'use strict';

const express      = require('express');
const path         = require('path');
const { Pool }     = require('pg');
const bcrypt       = require('bcryptjs');
const session      = require('express-session');
const ConnectPg    = require('connect-pg-simple');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const cookieParser = require('cookie-parser');
const fs           = require('fs');
const crypto       = require('crypto');
const multer       = require('multer');

const app     = express();
const PORT    = process.env.PORT || 3000;
const DB_URL  = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
const USE_PG  = !!DB_URL;
const IS_PROD = !!DB_URL;

// ── PostgreSQL ─────────────────────────────────────────────────────────────────
let pool = null;
if (USE_PG) {
  pool = new Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', err => console.error('DB pool error:', err.message));
  console.log('Modo: PostgreSQL');
  console.log('DB URL presente:', !!process.env.DATABASE_URL, '| PUBLIC_URL presente:', !!process.env.DATABASE_PUBLIC_URL);
} else {
  console.log('Modo: JSON local');
}

// ── Trust proxy ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ── Helmet ─────────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com"],
      imgSrc:        ["'self'", "data:", "blob:"],
      connectSrc:    ["'self'"],
    },
  },
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// HTTPS forzado en producción
if (IS_PROD) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https')
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    next();
  });
}

// ── Rate limiting ──────────────────────────────────────────────────────────────
app.use(rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos, intentá en 15 minutos' } });

// ── Sesiones ───────────────────────────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const sessionConfig = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'cc_sid',
  cookie: { maxAge: 7*24*60*60*1000, httpOnly: true, sameSite: 'lax', secure: IS_PROD },
};
if (USE_PG) {
  const PgSession = ConnectPg(session);
  sessionConfig.store = new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true });
}

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(session(sessionConfig));

// ── Multer para logo ───────────────────────────────────────────────────────────
const logoStorage = multer.diskStorage({
  destination: path.join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname).toLowerCase()),
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.gif','.svg','.webp'];
    ok.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('Solo imágenes'));
  },
});

// ── Init DB ────────────────────────────────────────────────────────────────────
async function initDB() {
  if (!USE_PG) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id         TEXT PRIMARY KEY,
      nombre     TEXT NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      rol        TEXT NOT NULL DEFAULT 'staff',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reservas (
      id          TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      espacio     TEXT NOT NULL,
      titulo      TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      solicitante TEXT NOT NULL,
      fecha       DATE NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fin    TIME NOT NULL,
      color       TEXT DEFAULT '#7C6FFF',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reservas_fecha   ON reservas(fecha);
    CREATE INDEX IF NOT EXISTS idx_reservas_espacio ON reservas(espacio);
    CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON reservas(usuario_id);
  `);
  console.log('Tablas listas');
}

// ── Auth helpers ───────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'No autenticado' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'No autenticado' });
  if (req.session.rol !== 'admin') return res.status(403).json({ error: 'Sin permiso' });
  next();
}
function validar(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { res.status(400).json({ error: e.array()[0].msg }); return false; }
  return true;
}

// ── JSON local ─────────────────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
function loadJSON() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { reservas: [] }; }
}
function saveJSON(d) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

// ── Detección de conflictos ────────────────────────────────────────────────────
// Devuelve reservas que se solapan con el espacio/fecha/horario pedido (excluyendo reservaId)
async function buscarConflictos(espacio, fecha, horaInicio, horaFin, excludeId = null) {
  if (USE_PG) {
    const res = await pool.query(`
      SELECT id, titulo, solicitante, hora_inicio, hora_fin
      FROM reservas
      WHERE espacio = $1
        AND fecha = $2
        AND hora_inicio < $4
        AND hora_fin > $3
        ${excludeId ? 'AND id != $5' : ''}
    `, excludeId ? [espacio, fecha, horaInicio, horaFin, excludeId] : [espacio, fecha, horaInicio, horaFin]);
    return res.rows;
  } else {
    const d = loadJSON();
    return d.reservas.filter(r =>
      r.espacio === espacio &&
      r.fecha === fecha &&
      r.hora_inicio < horaFin &&
      r.hora_fin > horaInicio &&
      r.id !== excludeId
    );
  }
}

// ── Static ─────────────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use(express.static(path.join(__dirname, 'public')));

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }));

// ── Logo ───────────────────────────────────────────────────────────────────────
app.get('/api/logo', requireAuth, (req, res) => {
  const exts = ['.png','.jpg','.jpeg','.gif','.svg','.webp'];
  for (const ext of exts) {
    if (fs.existsSync(path.join(uploadsDir, 'logo' + ext)))
      return res.json({ url: '/uploads/logo' + ext });
  }
  res.json({ url: null });
});

app.post('/api/logo', requireAdmin, uploadLogo.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
  res.json({ ok: true, url: '/uploads/' + req.file.filename });
});

// ── AUTH ───────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, [
  body('nombre').trim().isLength({ min:2, max:100 }).withMessage('Nombre inválido'),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min:6, max:100 }).withMessage('Contraseña mínimo 6 caracteres'),
], async (req, res) => {
  if (!USE_PG) return res.json({ ok:true, nombre:'Local', rol:'admin' });
  if (!validar(req, res)) return;
  const { nombre, email, password } = req.body;
  try {
    const exists = await pool.query('SELECT id FROM usuarios WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(400).json({ error: 'El email ya está registrado' });
    const count   = await pool.query('SELECT COUNT(*) FROM usuarios');
    const isFirst = parseInt(count.rows[0].count) === 0;
    const hash    = await bcrypt.hash(password, 12);
    const id      = crypto.randomUUID();
    const rol     = isFirst ? 'admin' : 'staff';
    await pool.query('INSERT INTO usuarios (id,nombre,email,password,rol) VALUES ($1,$2,$3,$4,$5)',
      [id, nombre, email, hash, rol]);
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Error de sesión' });
      req.session.userId = id; req.session.nombre = nombre; req.session.rol = rol;
      req.session.save(saveErr => {
        if (saveErr) return res.status(500).json({ error: 'Error al guardar sesión' });
        res.json({ ok:true, nombre, rol });
      });
    });
  } catch(e) { console.error(e.message); res.status(500).json({ error: 'Error al registrar' }); }
});

app.post('/api/auth/login', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min:1 }).withMessage('Contraseña requerida'),
], async (req, res) => {
  if (!USE_PG) return res.json({ ok:true, nombre:'Local', rol:'admin' });
  if (!validar(req, res)) return;
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);
    const user   = result.rows[0];
    const fakeH  = '$2a$12$fakehashfakehashfakehashfakehashfakehashfakeha';
    const valid  = user ? await bcrypt.compare(password, user.password) : await bcrypt.compare(password, fakeH);
    if (!user || !valid) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Error de sesión' });
      req.session.userId = user.id; req.session.nombre = user.nombre; req.session.rol = user.rol;
      req.session.save(saveErr => {
        if (saveErr) return res.status(500).json({ error: 'Error al guardar sesión' });
        res.json({ ok:true, nombre: user.nombre, rol: user.rol });
      });
    });
  } catch(e) { console.error(e.message); res.status(500).json({ error: 'Error al ingresar' }); }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('cc_sid'); res.json({ ok:true }); });
});

app.get('/api/auth/me', (req, res) => {
  if (!USE_PG) return res.json({ ok:true, nombre:'Local', rol:'admin', localMode:true });
  console.log('[me] sessionID:', req.sessionID, '| userId:', req.session?.userId);
  if (!req.session?.userId) return res.status(401).json({ error: 'No autenticado' });
  res.json({ ok:true, nombre: req.session.nombre, rol: req.session.rol });
});

// ── ADMIN ──────────────────────────────────────────────────────────────────────
app.get('/api/admin/usuarios', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.rol, u.created_at, COUNT(rv.id) AS total_reservas
      FROM usuarios u LEFT JOIN reservas rv ON u.id = rv.usuario_id
      GROUP BY u.id ORDER BY u.created_at
    `);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/usuarios/:id/rol', requireAdmin, [
  body('rol').isIn(['admin','staff']).withMessage('Rol inválido'),
], async (req, res) => {
  if (!validar(req, res)) return;
  try { await pool.query('UPDATE usuarios SET rol=$1 WHERE id=$2', [req.body.rol, req.params.id]); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/usuarios/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.session.userId) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
  try { await pool.query('DELETE FROM usuarios WHERE id=$1', [req.params.id]); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RESERVAS ───────────────────────────────────────────────────────────────────
// GET todas (con filtros opcionales: ?mes=2024-03 o ?desde=2024-03-01&hasta=2024-03-31)
app.get('/api/reservas', requireAuth, async (req, res) => {
  try {
    if (USE_PG) {
      let query = `
        SELECT r.*, u.nombre AS usuario_nombre
        FROM reservas r JOIN usuarios u ON r.usuario_id = u.id
      `;
      const params = [];
      const conditions = [];
      if (req.query.desde) { params.push(req.query.desde); conditions.push(`r.fecha >= $${params.length}`); }
      if (req.query.hasta) { params.push(req.query.hasta); conditions.push(`r.fecha <= $${params.length}`); }
      if (req.query.espacio) { params.push(req.query.espacio); conditions.push(`r.espacio = $${params.length}`); }
      if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
      query += ' ORDER BY r.fecha, r.hora_inicio';
      const r = await pool.query(query, params);
      res.json(r.rows);
    } else {
      let reservas = loadJSON().reservas;
      if (req.query.desde) reservas = reservas.filter(r => r.fecha >= req.query.desde);
      if (req.query.hasta) reservas = reservas.filter(r => r.fecha <= req.query.hasta);
      if (req.query.espacio) reservas = reservas.filter(r => r.espacio === req.query.espacio);
      res.json(reservas.sort((a,b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio)));
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST nueva reserva
app.post('/api/reservas', requireAuth, [
  body('espacio').isIn(['aula1','aula2','cine','conferencias','ingreso']).withMessage('Espacio inválido'),
  body('titulo').trim().isLength({ min:1, max:200 }).withMessage('Título requerido'),
  body('solicitante').trim().isLength({ min:1, max:200 }).withMessage('Solicitante requerido'),
  body('fecha').isDate().withMessage('Fecha inválida'),
  body('hora_inicio').matches(/^\d{2}:\d{2}$/).withMessage('Hora de inicio inválida'),
  body('hora_fin').matches(/^\d{2}:\d{2}$/).withMessage('Hora de fin inválida'),
], async (req, res) => {
  if (!validar(req, res)) return;
  const { espacio, titulo, descripcion, solicitante, fecha, hora_inicio, hora_fin, color } = req.body;
  if (hora_fin <= hora_inicio) return res.status(400).json({ error: 'La hora de fin debe ser posterior al inicio' });
  try {
    const conflictos = await buscarConflictos(espacio, fecha, hora_inicio, hora_fin);
    if (conflictos.length) {
      return res.status(409).json({
        error: 'conflicto',
        mensaje: `El espacio ya está reservado en ese horario`,
        conflictos: conflictos.map(c => ({
          titulo: c.titulo, solicitante: c.solicitante,
          hora_inicio: c.hora_inicio?.slice(0,5) || c.hora_inicio,
          hora_fin:    c.hora_fin?.slice(0,5) || c.hora_fin,
        }))
      });
    }
    const id = crypto.randomUUID();
    const COLORES = { aula1:'#7C6FFF', aula2:'#9D5CFF', cine:'#FF6B6B', conferencias:'#20C997', ingreso:'#FFD43B' };
    const finalColor = color || COLORES[espacio] || '#7C6FFF';
    if (USE_PG) {
      await pool.query(
        `INSERT INTO reservas (id,usuario_id,espacio,titulo,descripcion,solicitante,fecha,hora_inicio,hora_fin,color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, req.session.userId, espacio, titulo, descripcion||'', solicitante, fecha, hora_inicio, hora_fin, finalColor]
      );
      const r = await pool.query(`SELECT r.*, u.nombre AS usuario_nombre FROM reservas r JOIN usuarios u ON r.usuario_id = u.id WHERE r.id=$1`, [id]);
      res.json(r.rows[0]);
    } else {
      const reserva = { id, usuario_id:'local', espacio, titulo, descripcion:descripcion||'', solicitante, fecha, hora_inicio, hora_fin, color: finalColor, created_at: new Date().toISOString() };
      const d = loadJSON(); d.reservas.push(reserva); saveJSON(d);
      res.json(reserva);
    }
  } catch(e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

// PUT editar reserva
app.put('/api/reservas/:id', requireAuth, [
  body('espacio').isIn(['aula1','aula2','cine','conferencias','ingreso']).withMessage('Espacio inválido'),
  body('titulo').trim().isLength({ min:1, max:200 }).withMessage('Título requerido'),
  body('solicitante').trim().isLength({ min:1, max:200 }).withMessage('Solicitante requerido'),
  body('fecha').isDate().withMessage('Fecha inválida'),
  body('hora_inicio').matches(/^\d{2}:\d{2}$/).withMessage('Hora inicio inválida'),
  body('hora_fin').matches(/^\d{2}:\d{2}$/).withMessage('Hora fin inválida'),
], async (req, res) => {
  if (!validar(req, res)) return;
  const { espacio, titulo, descripcion, solicitante, fecha, hora_inicio, hora_fin, color } = req.body;
  if (hora_fin <= hora_inicio) return res.status(400).json({ error: 'La hora de fin debe ser posterior al inicio' });
  try {
    // Verificar que la reserva existe y el usuario tiene permiso
    let reservaActual;
    if (USE_PG) {
      const r = await pool.query('SELECT * FROM reservas WHERE id=$1', [req.params.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
      reservaActual = r.rows[0];
    } else {
      const d = loadJSON();
      reservaActual = d.reservas.find(r => r.id === req.params.id);
      if (!reservaActual) return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    if (req.session.rol !== 'admin' && reservaActual.usuario_id !== req.session.userId)
      return res.status(403).json({ error: 'No podés editar esta reserva' });

    // Verificar conflictos excluyendo la reserva actual
    const conflictos = await buscarConflictos(espacio, fecha, hora_inicio, hora_fin, req.params.id);
    if (conflictos.length) {
      return res.status(409).json({
        error: 'conflicto',
        mensaje: 'El espacio ya está reservado en ese horario',
        conflictos: conflictos.map(c => ({
          titulo: c.titulo, solicitante: c.solicitante,
          hora_inicio: c.hora_inicio?.slice(0,5) || c.hora_inicio,
          hora_fin:    c.hora_fin?.slice(0,5) || c.hora_fin,
        }))
      });
    }

    const COLORES = { aula1:'#7C6FFF', aula2:'#9D5CFF', cine:'#FF6B6B', conferencias:'#20C997', ingreso:'#FFD43B' };
    const finalColor = color || COLORES[espacio] || '#7C6FFF';
    if (USE_PG) {
      await pool.query(
        `UPDATE reservas SET espacio=$1,titulo=$2,descripcion=$3,solicitante=$4,fecha=$5,hora_inicio=$6,hora_fin=$7,color=$8 WHERE id=$9`,
        [espacio, titulo, descripcion||'', solicitante, fecha, hora_inicio, hora_fin, finalColor, req.params.id]
      );
      const r = await pool.query(`SELECT r.*, u.nombre AS usuario_nombre FROM reservas r JOIN usuarios u ON r.usuario_id = u.id WHERE r.id=$1`, [req.params.id]);
      res.json(r.rows[0]);
    } else {
      const d = loadJSON();
      const idx = d.reservas.findIndex(r => r.id === req.params.id);
      d.reservas[idx] = { ...d.reservas[idx], espacio, titulo, descripcion:descripcion||'', solicitante, fecha, hora_inicio, hora_fin, color: finalColor };
      saveJSON(d); res.json(d.reservas[idx]);
    }
  } catch(e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

// DELETE reserva
app.delete('/api/reservas/:id', requireAuth, async (req, res) => {
  try {
    let reserva;
    if (USE_PG) {
      const r = await pool.query('SELECT * FROM reservas WHERE id=$1', [req.params.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
      reserva = r.rows[0];
    } else {
      const d = loadJSON();
      reserva = d.reservas.find(r => r.id === req.params.id);
      if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    if (req.session.rol !== 'admin' && reserva.usuario_id !== req.session.userId)
      return res.status(403).json({ error: 'No podés eliminar esta reserva' });

    if (USE_PG) {
      await pool.query('DELETE FROM reservas WHERE id=$1', [req.params.id]);
    } else {
      const d = loadJSON(); d.reservas = d.reservas.filter(r => r.id !== req.params.id); saveJSON(d);
    }
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET verificar conflictos sin guardar (para preview)
app.get('/api/reservas/conflictos', requireAuth, async (req, res) => {
  const { espacio, fecha, hora_inicio, hora_fin, exclude_id } = req.query;
  if (!espacio || !fecha || !hora_inicio || !hora_fin) return res.status(400).json({ error: 'Faltan parámetros' });
  try {
    const conflictos = await buscarConflictos(espacio, fecha, hora_inicio, hora_fin, exclude_id || null);
    res.json({ conflictos: conflictos.map(c => ({
      titulo: c.titulo, solicitante: c.solicitante,
      hora_inicio: c.hora_inicio?.slice(0,5) || c.hora_inicio,
      hora_fin:    c.hora_fin?.slice(0,5) || c.hora_fin,
    }))});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Start ──────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=====================================');
    console.log('  Agenda Cultural v1 en puerto ' + PORT);
    if (!USE_PG) console.log('  Abre: http://localhost:' + PORT);
    console.log('=====================================\n');
  });
}).catch(err => { console.error('Error init:', err); process.exit(1); });
