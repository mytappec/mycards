// ============================================================
// Tarjetas de sellos digitales — Worker principal
// Rutas:
//   GET  /admin                -> login / crear tu cuenta / panel (según el caso)
//   POST /admin/signup         -> crea tu cuenta (solo si todavía no existe ninguna)
//   POST /admin/login          -> inicia sesión con correo y contraseña
//   GET  /admin/logout         -> cierra tu sesión
//   POST /admin/businesses     -> crea un negocio nuevo (protegido con tu sesión)
//   GET  /:slug/nuevo          -> formulario público para que el CLIENTE se registre solo
//   POST /:slug/nuevo          -> crea al cliente y lo manda directo a su tarjeta
//   GET  /:slug/:code          -> tarjeta del cliente
//   GET  /staff/:slug          -> pantalla de PIN o panel de sellado
//   POST /staff/:slug/login    -> valida el PIN, crea sesión
//   POST /staff/:slug/stamp    -> suma un sello a un cliente
//   POST /staff/:slug/register -> registra un cliente nuevo desde el panel (respaldo manual)
//   GET  /staff/:slug/clientes -> lista de todos los clientes registrados
//   GET  /staff/:slug/logout   -> cierra sesión
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      // ---- tu panel de administración (My Tapp) ----
      if (parts[0] === 'admin') {
        if (parts[1] === 'signup' && request.method === 'POST') return handleAdminSignup(request, env);
        if (parts[1] === 'login' && request.method === 'POST') return handleAdminLogin(request, env);
        if (parts[1] === 'logout') return handleAdminLogout();
        if (parts[1] === 'businesses' && request.method === 'POST') return handleCreateBusiness(request, env);
        return handleAdminPage(request, env);
      }

      // ---- panel del staff ----
      if (parts[0] === 'staff' && parts[1]) {
        const slug = parts[1];
        if (parts[2] === 'login' && request.method === 'POST') return handleLogin(request, env, slug);
        if (parts[2] === 'stamp' && request.method === 'POST') return handleStamp(request, env, slug);
        if (parts[2] === 'register' && request.method === 'POST') return handleRegister(request, env, slug);
        if (parts[2] === 'clientes') return handleClientesList(request, env, slug);
        if (parts[2] === 'historial' && parts[3]) return handleHistorial(request, env, slug, parts[3]);
        if (parts[2] === 'logout') return handleLogout(slug);
        return handleStaffPage(request, env, slug);
      }

      // ---- auto-registro público del cliente: /:slug/nuevo ----
      if (parts.length === 2 && parts[1] === 'nuevo') {
        if (request.method === 'POST') return handlePublicRegisterSubmit(request, env, parts[0]);
        return handlePublicRegisterForm(env, parts[0]);
      }

      // ---- tarjeta del cliente: /:slug/:code ----
      if (parts.length === 2) {
        return handleCustomerCard(env, parts[0], parts[1], url.origin);
      }

      return new Response('No encontrado', { status: 404 });
    } catch (err) {
      return new Response('Error del servidor: ' + err.message, { status: 500 });
    }
  }
};

// ------------------------------------------------------------
// utilidades
// ------------------------------------------------------------

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// contraseñas reales: con salt único por persona + 100,000 vueltas de PBKDF2,
// no un hash simple como el PIN (que es solo un candado corto, no una contraseña)
async function hashPassword(password, existingSaltHex) {
  const salt = existingSaltHex ? hexToBytes(existingSaltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return `${bytesToHex(salt)}:${bytesToHex(new Uint8Array(bits))}`;
}
async function verifyPassword(password, stored) {
  const [saltHex] = stored.split(':');
  const recomputed = await hashPassword(password, saltHex);
  return recomputed === stored;
}

function generateCode(slug) {
  const prefix = slug.slice(0, 2).toUpperCase();
  const rand = crypto.getRandomValues(new Uint8Array(4));
  const suffix = [...rand].map(b => b.toString(16)).join('').toUpperCase().slice(0, 6);
  return `${prefix}-${suffix}`;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getBusiness(env, slug) {
  return env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(slug).first();
}

// ------------------------------------------------------------
// tarjeta del cliente
// ------------------------------------------------------------

// ------------------------------------------------------------
// tu panel de administración (My Tapp)
// ------------------------------------------------------------

async function getAdminFromSession(env, cookieVal) {
  if (!cookieVal || !cookieVal.includes('.')) return null;
  const [idStr, token] = cookieVal.split('.');
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(Number(idStr)).first();
  if (!admin) return null;
  const expected = await sha256Hex(admin.password_hash);
  return token === expected ? admin : null;
}

async function handleAdminPage(request, env) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (admin) return renderAdminDashboard(env, admin);

  const row = await env.DB.prepare('SELECT COUNT(*) as count FROM admins').first();
  const hasAdmin = Number(row.count) > 0;
  return new Response(hasAdmin ? renderAdminLogin() : renderAdminSignup(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function adminBaseStyles() {
  return `
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;background:#F4F1EA;font-family:'Quicksand',sans-serif;padding:24px;}
  .box{width:100%;max-width:380px;margin:60px auto;background:white;border:2.5px solid #2B2320;border-radius:20px;padding:28px 24px;box-shadow:0 8px 0 #2B2320;}
  h1{font-family:'Baloo 2',sans-serif;font-size:20px;color:#2B2320;margin:0 0 4px;text-align:center;}
  p.sub{font-size:13px;color:#6B6259;text-align:center;margin:0 0 20px;}
  input{width:100%;padding:12px 14px;border:2px solid #2B2320;border-radius:12px;font-size:15px;margin-bottom:10px;font-family:'Quicksand',sans-serif;}
  button{width:100%;padding:13px;border:2px solid #2B2320;border-radius:12px;background:#FFD966;color:#2B2320;font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;}
  button:active{transform:scale(.98);}
  .msg{text-align:center;font-size:13px;margin-top:12px;min-height:18px;}
  .msg.ok{color:#215A34;} .msg.err{color:#B23A3A;}
  a{color:#2B2320;}
  `;
}

function renderAdminSignup() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crear cuenta · My Tapp</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${adminBaseStyles()}</style></head>
  <body>
    <div class="box">
      <h1>My Tapp</h1>
      <p class="sub">Primera vez aquí. Crea tu cuenta de administradora con tu propio correo y contraseña.</p>
      <form id="f">
        <input type="email" id="email" placeholder="Tu correo" required>
        <input type="password" id="password" placeholder="Contraseña (mínimo 6 caracteres)" required minlength="6">
        <button type="submit">Crear mi cuenta</button>
      </form>
      <p class="msg" id="msg"></p>
    </div>
    <script>
      document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const msg = document.getElementById('msg');
        msg.textContent = 'Creando...'; msg.className = 'msg';
        const res = await fetch('/admin/signup', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
        if (res.ok) { location.href = '/admin'; }
        else { const d = await res.json(); msg.textContent = d.error || 'No se pudo crear la cuenta'; msg.className = 'msg err'; }
      });
    </script>
  </body></html>`;
}

function renderAdminLogin() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Entrar · My Tapp</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${adminBaseStyles()}</style></head>
  <body>
    <div class="box">
      <h1>My Tapp</h1>
      <p class="sub">Entra con tu correo y contraseña.</p>
      <form id="f">
        <input type="email" id="email" placeholder="Tu correo" required>
        <input type="password" id="password" placeholder="Contraseña" required>
        <button type="submit">Entrar</button>
      </form>
      <p class="msg" id="msg"></p>
    </div>
    <script>
      document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const msg = document.getElementById('msg');
        msg.textContent = 'Entrando...'; msg.className = 'msg';
        const res = await fetch('/admin/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
        if (res.ok) { location.href = '/admin'; }
        else { const d = await res.json(); msg.textContent = d.error || 'Correo o contraseña incorrectos'; msg.className = 'msg err'; }
      });
    </script>
  </body></html>`;
}

async function renderAdminDashboard(env, admin) {
  const { results } = await env.DB.prepare('SELECT slug, name, created_at FROM businesses ORDER BY id DESC').all();
  const rows = results.map(b => `
    <tr>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.slug)}</td>
      <td><a href="/staff/${escapeHtml(b.slug)}" target="_blank">Panel staff</a></td>
      <td><a href="/${escapeHtml(b.slug)}/nuevo" target="_blank">Link registro</a></td>
    </tr>`).join('');

  return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panel · My Tapp</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;}
    body{margin:0;background:#F4F1EA;font-family:'Quicksand',sans-serif;padding:24px;color:#2B2320;}
    .wrap{max-width:640px;margin:0 auto;}
    h1{font-family:'Baloo 2',sans-serif;font-size:22px;}
    h2{font-family:'Baloo 2',sans-serif;font-size:16px;margin-top:30px;}
    table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;font-size:13px;margin-bottom:10px;}
    th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #eee;}
    th{background:#2B2320;color:white;}
    .card{background:white;border:2px solid #2B2320;border-radius:16px;padding:20px;margin-top:12px;}
    label{display:block;font-size:12px;font-weight:700;margin:10px 0 4px;}
    input[type=text], input[type=number], input[type=email]{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:14px;font-family:'Quicksand',sans-serif;}
    input[type=color]{width:100%;height:42px;border:2px solid #2B2320;border-radius:10px;padding:2px;}
    input[type=file]{width:100%;font-size:12px;margin-top:4px;}
    .colors{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .sellos{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    button{margin-top:18px;width:100%;padding:14px;border:2px solid #2B2320;border-radius:12px;background:#FFD966;color:#2B2320;font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;}
    .msg{text-align:center;font-size:13px;margin-top:12px;}
    .msg.ok{color:#215A34;} .msg.err{color:#B23A3A;}
    a.logout{float:right;font-size:12px;}
    a{color:#2B2320;}
  </style></head>
  <body>
    <div class="wrap">
      <a class="logout" href="/admin/logout">Cerrar sesión</a>
      <h1>My Tapp — ${escapeHtml(admin.email)}</h1>

      <h2>Tus negocios (${results.length})</h2>
      <table>
        <tr><th>Nombre</th><th>Slug</th><th>Staff</th><th>Registro</th></tr>
        ${rows || '<tr><td colspan="4">Todavía no has creado ningún negocio</td></tr>'}
      </table>

      <h2>Crear negocio nuevo</h2>
      <div class="card">
        <form id="bizForm">
          <label>Nombre del negocio</label>
          <input type="text" id="name" required placeholder="Ej. Cloud's Cookies">

          <label>Slug (va en el link, sin espacios ni tildes)</label>
          <input type="text" id="slug" required placeholder="Ej. cloudscookies">

          <label>Logo (imagen con fondo transparente)</label>
          <input type="file" id="logo" accept="image/*" required>

          <label>Sellos (hasta 4 variantes de color)</label>
          <div class="sellos">
            <input type="file" id="sello1" accept="image/*" required>
            <input type="file" id="sello2" accept="image/*" required>
            <input type="file" id="sello3" accept="image/*" required>
            <input type="file" id="sello4" accept="image/*" required>
          </div>

          <label>Colores de marca</label>
          <div class="colors">
            <div>Fondo de página<input type="color" id="color_page_bg" value="#DCEAF4"></div>
            <div>Fondo de tarjeta<input type="color" id="color_card_bg" value="#FFFCF5"></div>
            <div>Tinta / texto<input type="color" id="color_brown" value="#593212"></div>
            <div>Tinta fuerte (sombra)<input type="color" id="color_brown_deep" value="#3E2107"></div>
            <div>Texto secundario<input type="color" id="color_brown_soft" value="#8A5A34"></div>
            <div>Acento (QR, barra)<input type="color" id="color_pink" value="#F4D3DF"></div>
            <div>Fondo del premio<input type="color" id="color_butter_mid" value="#F9E6B2"></div>
            <div>Fondo claro extra<input type="color" id="color_butter_light" value="#FBEFD2"></div>
          </div>

          <label>Cuántos sellos para el premio</label>
          <input type="number" id="total_stamps" value="10" min="3" max="30" required>

          <label>Saludo (arriba del nombre)</label>
          <input type="text" id="greeting_eyebrow" value="¡Hello!">

          <label>Título del premio</label>
          <input type="text" id="reward_heading" value="Tu premio, cada vez más cerca">

          <label>Texto del premio</label>
          <input type="text" id="reward_text" required placeholder="Ej. Al llegar a tu sello #10, recibes tu producto gratis.">

          <label>Instagram (usuario)</label>
          <input type="text" id="instagram_handle" placeholder="@usuario">

          <label>Instagram (link completo)</label>
          <input type="text" id="instagram_url" placeholder="https://www.instagram.com/usuario">

          <label>PIN para el staff de este negocio (4-6 dígitos)</label>
          <input type="text" id="pin" required placeholder="Ej. 1234">

          <button type="submit">Crear negocio</button>
        </form>
        <p class="msg" id="msg"></p>
      </div>
    </div>
    <script>
      function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      document.getElementById('bizForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg');
        msg.textContent = 'Creando negocio...'; msg.className = 'msg';
        try {
          const logoFile = document.getElementById('logo').files[0];
          const s1 = document.getElementById('sello1').files[0];
          const s2 = document.getElementById('sello2').files[0];
          const s3 = document.getElementById('sello3').files[0];
          const s4 = document.getElementById('sello4').files[0];
          const payload = {
            name: document.getElementById('name').value.trim(),
            slug: document.getElementById('slug').value.trim().toLowerCase(),
            logo_base64: await fileToBase64(logoFile),
            sello_1_base64: await fileToBase64(s1),
            sello_2_base64: await fileToBase64(s2),
            sello_3_base64: await fileToBase64(s3),
            sello_4_base64: await fileToBase64(s4),
            color_page_bg: document.getElementById('color_page_bg').value,
            color_card_bg: document.getElementById('color_card_bg').value,
            color_brown: document.getElementById('color_brown').value,
            color_brown_deep: document.getElementById('color_brown_deep').value,
            color_brown_soft: document.getElementById('color_brown_soft').value,
            color_pink: document.getElementById('color_pink').value,
            color_butter_mid: document.getElementById('color_butter_mid').value,
            color_butter_light: document.getElementById('color_butter_light').value,
            total_stamps: Number(document.getElementById('total_stamps').value),
            greeting_eyebrow: document.getElementById('greeting_eyebrow').value,
            reward_heading: document.getElementById('reward_heading').value,
            reward_text: document.getElementById('reward_text').value,
            instagram_handle: document.getElementById('instagram_handle').value,
            instagram_url: document.getElementById('instagram_url').value,
            pin: document.getElementById('pin').value
          };
          const res = await fetch('/admin/businesses', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
          const data = await res.json();
          if (res.ok) {
            msg.innerHTML = '✅ Negocio creado. <a href="/' + data.slug + '/nuevo" target="_blank">Ver link de registro</a>';
            msg.className = 'msg ok';
            setTimeout(() => location.reload(), 1800);
          } else {
            msg.textContent = data.error || 'No se pudo crear'; msg.className = 'msg err';
          }
        } catch (err) {
          msg.textContent = 'Error: ' + err.message; msg.className = 'msg err';
        }
      });
    </script>
  </body></html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function handleAdminSignup(request, env) {
  const row = await env.DB.prepare('SELECT COUNT(*) as count FROM admins').first();
  if (Number(row.count) > 0) {
    return new Response(JSON.stringify({ error: 'Ya existe una cuenta de administradora. Inicia sesión.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const { email, password } = await request.json();
  if (!email || !password || password.length < 6) {
    return new Response(JSON.stringify({ error: 'Correo o contraseña inválidos (mínimo 6 caracteres)' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const passwordHash = await hashPassword(password);
  await env.DB.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').bind(email.trim().toLowerCase(), passwordHash).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleAdminLogin(request, env) {
  const { email, password } = await request.json();
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind((email || '').trim().toLowerCase()).first();
  if (!admin || !(await verifyPassword(password || '', admin.password_hash))) {
    return new Response(JSON.stringify({ error: 'Correo o contraseña incorrectos' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const token = await sha256Hex(admin.password_hash);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `admin_session=${admin.id}.${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
  return new Response(JSON.stringify({ ok: true }), { headers });
}

function handleAdminLogout() {
  const headers = new Headers({ 'Location': '/admin' });
  headers.append('Set-Cookie', `admin_session=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  return new Response(null, { status: 302, headers });
}

async function handleCreateBusiness(request, env) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const body = await request.json();
  const slug = (body.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug || !body.name || !body.logo_base64 || !body.pin) {
    return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (['admin', 'staff'].includes(slug)) {
    return new Response(JSON.stringify({ error: 'Ese slug está reservado, usa otro' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const existing = await env.DB.prepare('SELECT id FROM businesses WHERE slug = ?').bind(slug).first();
  if (existing) {
    return new Response(JSON.stringify({ error: 'Ya existe un negocio con ese slug' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const pinHash = await sha256Hex(body.pin);

  await env.DB.prepare(`INSERT INTO businesses
    (slug, name, logo_base64, color_page_bg, color_card_bg, color_brown, color_brown_deep, color_brown_soft, color_pink, color_butter_mid, color_butter_light,
     sello_1_base64, sello_2_base64, sello_3_base64, sello_4_base64, total_stamps, greeting_eyebrow, reward_heading, reward_text, reward_emoji,
     instagram_handle, instagram_url, staff_pin_hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(slug, body.name, body.logo_base64,
      body.color_page_bg || '#DCEAF4', body.color_card_bg || '#FFFCF5', body.color_brown || '#593212', body.color_brown_deep || '#3E2107',
      body.color_brown_soft || '#8A5A34', body.color_pink || '#F4D3DF', body.color_butter_mid || '#F9E6B2', body.color_butter_light || '#FBEFD2',
      body.sello_1_base64, body.sello_2_base64, body.sello_3_base64, body.sello_4_base64,
      body.total_stamps || 10, body.greeting_eyebrow || '¡Hello!', body.reward_heading || 'Tu premio, cada vez más cerca', body.reward_text, '⭐',
      body.instagram_handle || null, body.instagram_url || null, pinHash)
    .run();

  return new Response(JSON.stringify({ ok: true, slug }), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePublicRegisterForm(env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido · ${escapeHtml(business.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${business.color_page_bg};font-family:'Quicksand',sans-serif;padding:24px;}
    .box{width:100%;max-width:360px;background:${business.color_card_bg};border:2.5px solid ${business.color_brown};border-radius:24px;padding:28px 24px;box-shadow:0 10px 0 ${business.color_brown_deep};text-align:center;}
    .brand-logo{max-width:140px;width:60%;margin:0 auto 18px;display:block;}
    h1{font-family:'Baloo 2',sans-serif;font-size:19px;color:${business.color_brown};margin:0 0 6px;}
    p.sub{font-size:13px;color:${business.color_brown_soft};margin:0 0 20px;}
    input{width:100%;padding:12px 14px;border:2px solid ${business.color_brown};border-radius:12px;font-size:15px;margin-bottom:10px;font-family:'Quicksand',sans-serif;text-align:center;}
    button{width:100%;padding:13px;border:2px solid ${business.color_brown};border-radius:12px;background:${business.color_pink};color:${business.color_brown};font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;margin-top:6px;}
    button:active{transform:scale(.98);}
    .msg{text-align:center;font-size:13px;margin-top:12px;min-height:18px;color:#B23A3A;}
  </style></head>
  <body>
    <div class="box">
      <img class="brand-logo" src="data:image/png;base64,${business.logo_base64}" alt="${escapeHtml(business.name)}">
      <h1>¡Bienvenido!</h1>
      <p class="sub">Aquí te recompensamos por tus compras. Regístrate para empezar a juntar tus sellos.</p>
      <form id="regForm">
        <input type="text" id="nombre" placeholder="Nombre" required>
        <input type="text" id="apellido" placeholder="Apellido" required>
        <input type="text" id="cedula" placeholder="Cédula" required>
        <button type="submit">Continuar</button>
      </form>
      <p class="msg" id="msg"></p>
    </div>
    <script>
      document.getElementById('regForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nombre').value.trim();
        const apellido = document.getElementById('apellido').value.trim();
        const cedula = document.getElementById('cedula').value.trim();
        const msg = document.getElementById('msg');
        if (!nombre || !apellido || !cedula) { msg.textContent = 'Completa los 3 campos'; return; }
        msg.textContent = 'Creando tu tarjeta...';
        const res = await fetch(location.pathname, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ nombre, apellido, cedula })
        });
        const data = await res.json();
        if (res.ok) {
          location.href = data.url;
        } else {
          msg.textContent = data.error || 'No se pudo crear tu tarjeta';
        }
      });
    </script>
  </body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function handlePublicRegisterSubmit(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const { nombre, apellido, cedula } = await request.json();
  if (!nombre || !apellido || !cedula) {
    return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const fullName = `${nombre.trim()} ${apellido.trim()}`;
  const code = generateCode(slug);
  await env.DB.prepare('INSERT INTO customers (business_id, code, name, cedula, stamps) VALUES (?, ?, ?, ?, 0)')
    .bind(business.id, code, fullName, cedula.trim()).run();

  const url = new URL(request.url);
  const cardUrl = `${url.origin}/${slug}/${code}`;
  return new Response(JSON.stringify({ ok: true, code, url: cardUrl }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleCustomerCard(env, slug, code, origin) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });

  const customer = await env.DB.prepare('SELECT * FROM customers WHERE code = ? AND business_id = ?')
    .bind(code, business.id).first();
  if (!customer) return new Response('Tarjeta no encontrada', { status: 404 });

  return new Response(renderCustomerCard(business, customer, slug, origin), {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

function renderCustomerCard(b, customer, slug, origin) {
  const sellos = [b.sello_1_base64, b.sello_2_base64, b.sello_3_base64, b.sello_4_base64];
  const selloNames = ['s1', 's2', 's3', 's4'];
  const total = b.total_stamps;
  const filled = Math.min(customer.stamps, total);
  const pct = Math.round((filled / total) * 100);
  const left = total - filled;

  const cardUrl = `${origin}/${slug}/${customer.code}`;

  let stampsHtml = '';
  for (let i = 1; i <= total; i++) {
    const isReward = i === total;
    const selloKey = selloNames[(i - 1) % 4];
    const isFilled = i <= filled;
    stampsHtml += `<div class="stamp${isFilled ? ' filled' : ''}${isReward ? ' reward' : ''}" data-sello="${selloKey}">
      <div class="stamp-img"></div>
      <span class="stamp-placeholder">${b.reward_emoji}</span>
      ${isReward ? '<span class="reward-tag">PREMIO</span>' : ''}
    </div>`;
  }

  const progressText = left === 0
    ? `<b>${total}</b> de ${total} sellos. <b>¡Ya tienes tu premio! 🎉</b>`
    : `<b>${filled}</b> de ${total} sellos, te faltan <b>${left}</b> para tu premio.`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(b.name)} — Tarjeta de sellos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --page-bg:${b.color_page_bg}; --card-bg:${b.color_card_bg};
    --brown:${b.color_brown}; --brown-deep:${b.color_brown_deep}; --brown-soft:${b.color_brown_soft};
    --pink:${b.color_pink}; --butter-mid:${b.color_butter_mid}; --butter-light:${b.color_butter_light};
    --img-s1:url("data:image/png;base64,${sellos[0]}");
    --img-s2:url("data:image/png;base64,${sellos[1]}");
    --img-s3:url("data:image/png;base64,${sellos[2]}");
    --img-s4:url("data:image/png;base64,${sellos[3]}");
  }
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--page-bg);font-family:'Quicksand','Segoe UI',sans-serif;padding:36px 16px;}
  .wrap{width:100%;max-width:380px;}
  .card{background:var(--card-bg);border-radius:32px;border:2.5px solid var(--brown);box-shadow:0 12px 0 var(--brown-deep);overflow:hidden;}
  .card-top{padding:30px 24px 22px;text-align:center;border-bottom:2px solid var(--brown);}
  .brand-logo{max-width:150px;width:56%;height:auto;display:block;margin:0 auto;}
  .card-body{padding:20px 24px 22px;}
  .greeting-eyebrow{font-family:'Baloo 2','Arial Rounded MT Bold','Quicksand',sans-serif;font-weight:700;font-size:16px;letter-spacing:.3px;color:var(--brown-soft);margin:0;line-height:1.15;text-transform:uppercase;}
  .greeting-name{font-family:'Baloo 2','Arial Rounded MT Bold','Quicksand',sans-serif;font-weight:800;font-size:21px;color:var(--brown);margin:1px 0 16px;line-height:1.15;}
  .progress-row{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
  .progress-track{flex:1;height:20px;border-radius:99px;background:#FFFFFF;border:2px solid var(--brown);overflow:hidden;}
  .progress-fill{height:100%;border-radius:99px;background:var(--pink);}
  .progress-pct{font-family:'Baloo 2',sans-serif;font-weight:700;font-size:13px;color:var(--brown);min-width:34px;text-align:right;}
  .progress-text{font-size:12.5px;color:var(--brown-soft);margin:0 0 26px;}
  .progress-text b{color:var(--brown);}
  .stamp-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:14px;}
  .stamp{aspect-ratio:1;border-radius:50%;background:var(--brown);display:flex;align-items:center;justify-content:center;position:relative;}
  .stamp-img{width:84%;height:84%;background-size:contain;background-position:center;background-repeat:no-repeat;opacity:0;}
  .stamp-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:19px;opacity:.22;}
  .stamp.filled .stamp-placeholder{display:none;}
  .stamp[data-sello="s1"] .stamp-img{background-image:var(--img-s1);} .stamp[data-sello="s2"] .stamp-img{background-image:var(--img-s2);}
  .stamp[data-sello="s3"] .stamp-img{background-image:var(--img-s3);} .stamp[data-sello="s4"] .stamp-img{background-image:var(--img-s4);}
  .stamp::before{content:"";position:absolute;inset:3px;border-radius:50%;border:1.5px solid rgba(255,248,236,.4);}
  .stamp.filled{box-shadow:0 3px 8px rgba(89,50,18,.3);}
  .stamp.filled::before{border:none;}
  .stamp.filled .stamp-img{opacity:1;}
  .stamp.reward::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2.5px solid var(--butter-mid);opacity:0;z-index:1;}
  .stamp.reward:not(.filled)::after{opacity:1;animation:pulse 1.8s ease-in-out infinite;}
  @keyframes pulse{0%,100%{transform:scale(1);opacity:.55;}50%{transform:scale(1.04);opacity:1;}}
  .reward-tag{position:absolute;bottom:-15px;left:0;right:0;width:max-content;margin:0 auto;background:var(--butter-mid);border:1.5px solid var(--brown);color:var(--brown);font-family:'Baloo 2',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.5px;padding:2px 7px;border-radius:8px;white-space:nowrap;text-align:center;z-index:3;}
  .reward-note{margin-top:26px;background:var(--butter-mid);border:2px solid var(--brown);border-radius:16px;padding:10px 14px;display:flex;align-items:center;gap:10px;color:var(--brown);font-size:12px;}
  .reward-note .r-emoji{font-size:24px;flex-shrink:0;}
  .reward-note strong{display:block;font-family:'Baloo 2',sans-serif;font-weight:700;font-size:13.5px;margin-bottom:1px;color:var(--brown);}
  .qr-section{margin-top:20px;border-top:2px dashed var(--page-bg);padding-top:18px;display:flex;align-items:center;gap:14px;}
  .qr-box{width:86px;height:86px;background:var(--pink);border:2px solid var(--brown);border-radius:14px;padding:6px;flex-shrink:0;}
  .qr-box canvas{width:100%!important;height:100%!important;border-radius:6px;display:block;}
  .qr-copy{font-size:11.5px;color:var(--brown-soft);line-height:1.45;}
  .qr-copy b{display:block;font-family:'Baloo 2',sans-serif;font-weight:700;font-size:13.5px;color:var(--brown);letter-spacing:.3px;margin-bottom:2px;}
  .social-link{display:flex;align-items:center;justify-content:center;gap:7px;width:fit-content;margin:16px auto 0;padding:7px 14px;background:var(--page-bg);border-radius:99px;color:var(--brown);text-decoration:none;font-size:12px;font-weight:700;}
  .credit{text-align:center;font-size:13px;color:var(--brown);margin:18px 0 0;}
  .credit a{color:var(--brown);font-weight:700;text-decoration:underline;}
</style>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="card-top">
        <img class="brand-logo" src="data:image/png;base64,${b.logo_base64}" alt="${escapeHtml(b.name)}">
      </div>
      <div class="card-body">
        <p class="greeting-eyebrow">${escapeHtml(b.greeting_eyebrow)}</p>
        <p class="greeting-name">${escapeHtml(customer.name.split(' ')[0])}</p>
        <div class="progress-row">
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="progress-pct">${pct}%</span>
        </div>
        <p class="progress-text">${progressText}</p>
        <div class="stamp-grid">${stampsHtml}</div>
        <div class="reward-note">
          <span class="r-emoji">${b.reward_emoji}</span>
          <span><strong>${escapeHtml(b.reward_heading)}</strong>${escapeHtml(b.reward_text)}</span>
        </div>
        <div class="qr-section">
          <div class="qr-box"><canvas id="qrCanvas"></canvas></div>
          <div class="qr-copy">
            <b>#${escapeHtml(customer.code)}</b>
            Muestra este código en caja para sumar tu sello en cada compra.
          </div>
        </div>
        ${b.instagram_url ? `<a class="social-link" href="${b.instagram_url}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
          <span>${escapeHtml(b.instagram_handle || '')}</span>
        </a>` : ''}
      </div>
    </div>
    <p class="credit">Design by <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">Anaelí Brand</a></p>
  </div>
  <script>
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(document.getElementById('qrCanvas'), ${JSON.stringify(cardUrl)}, {
        width: 300, margin: 1,
        color: { dark: ${JSON.stringify(b.color_brown)}, light: ${JSON.stringify(b.color_pink)} }
      });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------
// panel del staff
// ------------------------------------------------------------

async function handleStaffPage(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });

  const cookieVal = getCookie(request, 'staff_session');
  const isLoggedIn = cookieVal === business.staff_pin_hash;

  const html = isLoggedIn ? renderStaffPanel(business) : renderStaffLogin(business);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function baseStaffStyles(b) {
  return `
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${b.color_page_bg};font-family:'Quicksand',sans-serif;padding:24px;}
  .box{width:100%;max-width:340px;background:${b.color_card_bg};border:2.5px solid ${b.color_brown};border-radius:24px;padding:28px 22px;box-shadow:0 10px 0 ${b.color_brown_deep};}
  h1{font-family:'Baloo 2',sans-serif;font-size:19px;color:${b.color_brown};margin:0 0 4px;text-align:center;}
  p.sub{font-size:12.5px;color:${b.color_brown_soft};text-align:center;margin:0 0 20px;}
  input{width:100%;padding:12px 14px;border:2px solid ${b.color_brown};border-radius:12px;font-size:16px;margin-bottom:12px;font-family:'Quicksand',sans-serif;}
  button{width:100%;padding:12px;border:2px solid ${b.color_brown};border-radius:12px;background:${b.color_pink};color:${b.color_brown};font-weight:700;font-size:15px;cursor:pointer;}
  button:active{transform:scale(.98);}
  .msg{text-align:center;font-size:13px;margin-top:12px;min-height:18px;}
  .msg.ok{color:#215A34;background:#DFF3E4;border:2px solid #3F7D4F;border-radius:12px;padding:14px 10px;font-size:17px;font-weight:800;}
  .msg.err{color:#B23A3A;background:#FBE4E4;border:2px solid #B23A3A;border-radius:12px;padding:14px 10px;font-size:15px;font-weight:700;}
  a.logout{display:block;text-align:center;margin-top:16px;font-size:12px;color:${b.color_brown_soft};}
  `;
}

function renderStaffLogin(b) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff · ${escapeHtml(b.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${baseStaffStyles(b)}</style></head>
  <body>
    <div class="box">
      <h1>${escapeHtml(b.name)}</h1>
      <p class="sub">Ingresa el PIN del local para sumar sellos</p>
      <form id="loginForm">
        <input type="password" inputmode="numeric" id="pin" placeholder="PIN" autofocus>
        <button type="submit">Entrar</button>
      </form>
      <p class="msg" id="msg"></p>
    </div>
    <script>
      document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = document.getElementById('pin').value;
        const msg = document.getElementById('msg');
        msg.textContent = 'Verificando...'; msg.className = 'msg';
        const res = await fetch(location.pathname + '/login', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pin })
        });
        if (res.ok) { location.reload(); }
        else { msg.textContent = 'PIN incorrecto'; msg.className = 'msg err'; }
      });
    </script>
  </body></html>`;
}

function renderStaffPanel(b) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff · ${escapeHtml(b.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.umd.min.js"></script>
  <style>${baseStaffStyles(b)}
    .scan-btn{background:${b.color_blue};margin-bottom:12px;}
    .secondary-btn{width:100%;padding:10px;border:2px dashed ${b.color_brown};border-radius:12px;background:transparent;color:${b.color_brown};font-weight:700;font-size:13px;cursor:pointer;margin-top:14px;}
    #registerForm{margin-top:10px;}
    #preview{width:100%;border-radius:14px;border:2px solid ${b.color_brown};margin-bottom:12px;display:none;}
    .scan-hint{font-size:11px;color:${b.color_brown_soft};text-align:center;margin:-4px 0 12px;}
  </style></head>
  <body>
    <div class="box">
      <h1>${escapeHtml(b.name)}</h1>
      <p class="sub">Escanea el QR del cliente, o escribe su código a mano</p>

      <button type="button" id="scanBtn" class="scan-btn">📷 Escanear con cámara</button>
      <video id="preview" muted playsinline></video>
      <p class="scan-hint" id="scanHint"></p>

      <form id="stampForm">
        <input type="text" id="code" placeholder="Código del cliente (ej. CC-JB2317)" autocapitalize="characters">
        <button type="submit">Sumar sello</button>
      </form>
      <p class="msg" id="msg"></p>

      <button type="button" id="toggleRegisterBtn" class="secondary-btn">➕ Registrar cliente nuevo</button>
      <form id="registerForm" style="display:none;">
        <input type="text" id="regName" placeholder="Nombre completo">
        <input type="text" id="regCedula" placeholder="Cédula">
        <input type="tel" id="regPhone" placeholder="Celular">
        <button type="submit">Crear tarjeta</button>
      </form>
      <p class="msg" id="regMsg"></p>

      <a class="logout" href="/staff/${b.slug}/clientes">Ver todos los clientes</a>
      <a class="logout" href="/staff/${b.slug}/logout">Cerrar sesión del local</a>
    </div>
    <script>
      const codeInput = document.getElementById('code');
      const msg = document.getElementById('msg');
      const scanHint = document.getElementById('scanHint');
      const videoEl = document.getElementById('preview');
      let qrScanner = null;
      let scanLocked = false;
      if (typeof QrScanner !== 'undefined') {
        QrScanner.WORKER_PATH = 'https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner-worker.min.js';
      }
      let scanning = false;

      function extractCode(rawValue){
        // el QR guarda el link completo de la tarjeta (.../slug/CODIGO); nos quedamos con lo último
        const parts = rawValue.split('/').filter(Boolean);
        return parts[parts.length - 1] || rawValue;
      }

      async function submitStamp(code){
        if (!code) return;
        msg.textContent = 'Sumando...'; msg.className = 'msg';
        const res = await fetch(location.pathname + '/stamp', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (res.ok) {
          msg.textContent = data.redeemed
            ? '🎉 ¡Completó su tarjeta! Se generó un nuevo ciclo.'
            : '✅ Sello sumado: ' + data.stamps + '/' + data.total;
          msg.className = 'msg ok';
          codeInput.value = '';
        } else {
          msg.textContent = data.error || 'No se encontró ese código';
          msg.className = 'msg err';
        }
      }

      document.getElementById('stampForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitStamp(codeInput.value.trim());
      });

      document.getElementById('scanBtn').addEventListener('click', async () => {
        if (scanning) {
          if (qrScanner) { qrScanner.stop(); qrScanner.destroy(); qrScanner = null; }
          videoEl.style.display = 'none';
          scanHint.textContent = '';
          scanning = false;
          document.getElementById('scanBtn').textContent = '📷 Escanear con cámara';
          return;
        }
        if (typeof QrScanner === 'undefined') {
          scanHint.textContent = 'No se pudo cargar la cámara, escribe el código a mano.';
          return;
        }
        if (qrScanner) { qrScanner.destroy(); qrScanner = null; }
        scanLocked = false;
        try {
          videoEl.style.display = 'block';
          qrScanner = new QrScanner(videoEl, result => {
            if (scanLocked) return;
            scanLocked = true;
            const code = extractCode(result.data);
            qrScanner.stop();
            qrScanner.destroy();
            qrScanner = null;
            videoEl.style.display = 'none';
            scanning = false;
            document.getElementById('scanBtn').textContent = '📷 Escanear con cámara';
            codeInput.value = code;
            submitStamp(code);
          }, { highlightScanRegion: true, highlightCodeOutline: true });
          await qrScanner.start();
          scanning = true;
          scanHint.textContent = 'Apunta la cámara al QR del cliente';
          document.getElementById('scanBtn').textContent = '✕ Cancelar escaneo';
        } catch (err) {
          scanHint.textContent = 'No se pudo abrir la cámara (revisa permisos). Escribe el código a mano.';
          videoEl.style.display = 'none';
          if (qrScanner) { qrScanner.destroy(); qrScanner = null; }
        }
      });

      const toggleBtn = document.getElementById('toggleRegisterBtn');
      const registerForm = document.getElementById('registerForm');
      const regMsg = document.getElementById('regMsg');
      toggleBtn.addEventListener('click', () => {
        const showing = registerForm.style.display !== 'none';
        registerForm.style.display = showing ? 'none' : 'block';
        toggleBtn.textContent = showing ? '➕ Registrar cliente nuevo' : '✕ Cancelar registro';
        regMsg.textContent = '';
      });

      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const cedula = document.getElementById('regCedula').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        if (!name) { regMsg.textContent = 'Falta el nombre'; regMsg.className = 'msg err'; return; }
        regMsg.textContent = 'Creando tarjeta...'; regMsg.className = 'msg';
        const res = await fetch(location.pathname + '/register', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name, cedula, phone })
        });
        const data = await res.json();
        if (res.ok) {
          regMsg.innerHTML = '✅ Tarjeta creada.<br>Código: <b>' + data.code + '</b><br><a href="' + data.url + '" target="_blank">Abrir su tarjeta</a>';
          regMsg.className = 'msg ok';
          document.getElementById('regName').value = '';
          document.getElementById('regCedula').value = '';
          document.getElementById('regPhone').value = '';
        } else {
          regMsg.textContent = data.error || 'No se pudo registrar';
          regMsg.className = 'msg err';
        }
      });
    </script>
  </body></html>`;
}

async function handleLogin(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });
  const { pin } = await request.json();
  const hash = await sha256Hex(String(pin || ''));
  if (hash !== business.staff_pin_hash) {
    return new Response(JSON.stringify({ error: 'PIN incorrecto' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `staff_session=${hash}; Path=/staff/${slug}; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
  return new Response(JSON.stringify({ ok: true }), { headers });
}

function handleLogout(slug) {
  const headers = new Headers({ 'Location': `/staff/${slug}` });
  headers.append('Set-Cookie', `staff_session=; Path=/staff/${slug}; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  return new Response(null, { status: 302, headers });
}

async function handleRegister(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const cookieVal = getCookie(request, 'staff_session');
  if (cookieVal !== business.staff_pin_hash) {
    return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a ingresar el PIN' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { name, cedula, phone } = await request.json();
  if (!name) {
    return new Response(JSON.stringify({ error: 'Falta el nombre del cliente' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const code = generateCode(slug);
  await env.DB.prepare('INSERT INTO customers (business_id, code, name, cedula, phone, stamps) VALUES (?, ?, ?, ?, ?, 0)')
    .bind(business.id, code, name, cedula || null, phone || null).run();

  const url = new URL(request.url);
  const cardUrl = `${url.origin}/${slug}/${code}`;
  return new Response(JSON.stringify({ ok: true, code, url: cardUrl }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleClientesList(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });

  const cookieVal = getCookie(request, 'staff_session');
  if (cookieVal !== business.staff_pin_hash) {
    return new Response(renderStaffLogin(business), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }

  const { results } = await env.DB.prepare(
    'SELECT name, cedula, phone, code, stamps, cycle FROM customers WHERE business_id = ? ORDER BY id DESC'
  ).bind(business.id).all();

  const rows = results.map(c => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.cedula || '—')}</td>
      <td>${escapeHtml(c.phone || '—')}</td>
      <td>${escapeHtml(c.code)}</td>
      <td>${c.stamps}/${business.total_stamps}</td>
      <td>${c.cycle}</td>
      <td><a href="/staff/${slug}/historial/${escapeHtml(c.code)}">Ver fechas</a></td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clientes · ${escapeHtml(business.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    body{margin:0;padding:20px;font-family:'Quicksand',sans-serif;background:${business.color_page_bg};}
    h1{font-family:'Baloo 2',sans-serif;color:${business.color_brown};font-size:18px;}
    table{width:100%;border-collapse:collapse;background:${business.color_card_bg};border-radius:12px;overflow:hidden;font-size:13px;}
    th,td{padding:8px 10px;text-align:left;border-bottom:1px solid ${business.color_page_bg};}
    th{background:${business.color_brown};color:white;}
    a{color:${business.color_brown};}
    a.back{display:inline-block;margin-bottom:14px;color:${business.color_brown};font-weight:700;text-decoration:none;}
  </style></head>
  <body>
    <a class="back" href="/staff/${slug}">← Volver al panel</a>
    <h1>Clientes de ${escapeHtml(business.name)} (${results.length})</h1>
    <table>
      <tr><th>Nombre</th><th>Cédula</th><th>Celular</th><th>Código</th><th>Sellos</th><th>Ciclo</th><th>Historial</th></tr>
      ${rows || '<tr><td colspan="7">Todavía no hay clientes registrados</td></tr>'}
    </table>
  </body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function handleHistorial(request, env, slug, code) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });

  const cookieVal = getCookie(request, 'staff_session');
  if (cookieVal !== business.staff_pin_hash) {
    return new Response(renderStaffLogin(business), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }

  const customer = await env.DB.prepare('SELECT * FROM customers WHERE code = ? AND business_id = ?')
    .bind(code, business.id).first();
  if (!customer) return new Response('Cliente no encontrado', { status: 404 });

  const { results } = await env.DB.prepare(
    'SELECT stamped_at, cycle FROM visits WHERE customer_id = ? ORDER BY stamped_at DESC'
  ).bind(customer.id).all();

  const rows = results.map(v => `<tr><td>${escapeHtml(v.stamped_at)}</td><td>Tarjeta #${v.cycle}</td></tr>`).join('');
  const premiosGanados = customer.cycle - 1;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Historial de ${escapeHtml(customer.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    body{margin:0;padding:20px;font-family:'Quicksand',sans-serif;background:${business.color_page_bg};}
    h1{font-family:'Baloo 2',sans-serif;color:${business.color_brown};font-size:18px;margin-bottom:2px;}
    p.sub{color:${business.color_brown_soft};font-size:13px;margin-top:0;}
    table{width:100%;border-collapse:collapse;background:${business.color_card_bg};border-radius:12px;overflow:hidden;font-size:13px;}
    th,td{padding:8px 10px;text-align:left;border-bottom:1px solid ${business.color_page_bg};}
    th{background:${business.color_brown};color:white;}
    a.back{display:inline-block;margin-bottom:14px;color:${business.color_brown};font-weight:700;text-decoration:none;}
    .resumen{background:${business.color_butter_mid};border:2px solid ${business.color_brown};border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:${business.color_brown};}
  </style></head>
  <body>
    <a class="back" href="/staff/${slug}/clientes">← Volver a clientes</a>
    <h1>${escapeHtml(customer.name)}</h1>
    <p class="sub">Código actual: ${escapeHtml(customer.code)} · Cédula: ${escapeHtml(customer.cedula || '—')} · Celular: ${escapeHtml(customer.phone || '—')}</p>
    <div class="resumen">
      Sellos en su tarjeta actual: <b>${customer.stamps}/${business.total_stamps}</b><br>
      Premios ganados hasta ahora: <b>${premiosGanados}</b><br>
      Total de compras selladas: <b>${results.length}</b>
    </div>
    <table>
      <tr><th>Fecha</th><th>Tarjeta</th></tr>
      ${rows || '<tr><td colspan="2">Todavía no tiene compras registradas</td></tr>'}
    </table>
  </body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function handleStamp(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const cookieVal = getCookie(request, 'staff_session');
  if (cookieVal !== business.staff_pin_hash) {
    return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a ingresar el PIN' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { code } = await request.json();
  const customer = await env.DB.prepare('SELECT * FROM customers WHERE code = ? AND business_id = ?')
    .bind(code, business.id).first();
  if (!customer) {
    return new Response(JSON.stringify({ error: 'No se encontró ese código de cliente' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const newStamps = customer.stamps + 1;

  // siempre queda una fila en la bitácora, con la fecha real, sin importar si completa el ciclo o no
  await env.DB.prepare('INSERT INTO visits (customer_id, business_id, cycle, stamped_at) VALUES (?, ?, ?, datetime(\'now\'))')
    .bind(customer.id, business.id, customer.cycle).run();

  if (newStamps >= business.total_stamps) {
    // completó la tarjeta: se cierra este ciclo y se genera un código nuevo para el siguiente
    const newCode = generateCode(slug);
    await env.DB.prepare("UPDATE customers SET stamps = 0, cycle = cycle + 1, redeemed_at = datetime('now'), code = ? WHERE id = ?")
      .bind(newCode, customer.id).run();
    return new Response(JSON.stringify({ ok: true, redeemed: true, stamps: business.total_stamps, total: business.total_stamps, newCode }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  await env.DB.prepare('UPDATE customers SET stamps = ? WHERE id = ?').bind(newStamps, customer.id).run();
  return new Response(JSON.stringify({ ok: true, redeemed: false, stamps: newStamps, total: business.total_stamps }),
    { headers: { 'Content-Type': 'application/json' } });
}
