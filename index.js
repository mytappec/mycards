// ============================================================
// Tarjetas de sellos digitales — Worker principal
// Rutas:
//   GET  /:slug/:code          -> tarjeta del cliente
//   GET  /staff/:slug          -> pantalla de PIN o panel de sellado
//   POST /staff/:slug/login    -> valida el PIN, crea sesión
//   POST /staff/:slug/stamp    -> suma un sello a un cliente
//   POST /staff/:slug/register -> registra un cliente nuevo (nombre, cédula, celular)
//   GET  /staff/:slug/clientes -> lista de todos los clientes registrados
//   GET  /staff/:slug/logout   -> cierra sesión
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      // ---- panel del staff ----
      if (parts[0] === 'staff' && parts[1]) {
        const slug = parts[1];
        if (parts[2] === 'login' && request.method === 'POST') return handleLogin(request, env, slug);
        if (parts[2] === 'stamp' && request.method === 'POST') return handleStamp(request, env, slug);
        if (parts[2] === 'register' && request.method === 'POST') return handleRegister(request, env, slug);
        if (parts[2] === 'clientes') return handleClientesList(request, env, slug);
        if (parts[2] === 'logout') return handleLogout(slug);
        return handleStaffPage(request, env, slug);
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
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(cardUrl)}&color=${b.color_brown.replace('#','')}&bgcolor=${b.color_pink.replace('#','')}`;

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
  .qr-box img{width:100%;height:100%;border-radius:6px;}
  .qr-copy{font-size:11.5px;color:var(--brown-soft);line-height:1.45;}
  .qr-copy b{display:block;font-family:'Baloo 2',sans-serif;font-weight:700;font-size:13.5px;color:var(--brown);letter-spacing:.3px;margin-bottom:2px;}
  .social-link{display:flex;align-items:center;justify-content:center;gap:7px;width:fit-content;margin:16px auto 0;padding:7px 14px;background:var(--page-bg);border-radius:99px;color:var(--brown);text-decoration:none;font-size:12px;font-weight:700;}
  .credit{text-align:center;font-size:13px;color:var(--brown);margin:18px 0 0;}
  .credit a{color:var(--brown);font-weight:700;text-decoration:underline;}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="card-top">
        <img class="brand-logo" src="data:image/png;base64,${b.logo_base64}" alt="${escapeHtml(b.name)}">
      </div>
      <div class="card-body">
        <p class="greeting-eyebrow">${escapeHtml(b.greeting_eyebrow)}</p>
        <p class="greeting-name">${escapeHtml(customer.name)}</p>
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
          <div class="qr-box"><img src="${qrSrc}" alt="QR"></div>
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

      <a class="logout" href="./staff/clientes">Ver todos los clientes</a>
      <a class="logout" href="./staff/logout">Cerrar sesión del local</a>
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
    a.back{display:inline-block;margin-bottom:14px;color:${business.color_brown};font-weight:700;text-decoration:none;}
  </style></head>
  <body>
    <a class="back" href="./${slug}">← Volver al panel</a>
    <h1>Clientes de ${escapeHtml(business.name)} (${results.length})</h1>
    <table>
      <tr><th>Nombre</th><th>Cédula</th><th>Celular</th><th>Código</th><th>Sellos</th><th>Ciclo</th></tr>
      ${rows || '<tr><td colspan="6">Todavía no hay clientes registrados</td></tr>'}
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
