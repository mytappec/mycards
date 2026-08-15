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
        if (parts[1] === 'recuperar' && request.method === 'POST') return handleAdminRecover(request, env);
        if (parts[1] === 'recuperar') return new Response(renderAdminRecoverForm(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
        if (parts[1] === 'cambiar-password' && request.method === 'POST') return handleAdminChangePassword(request, env);
        if (parts[1] === 'businesses' && request.method === 'POST') return handleCreateBusiness(request, env);
        if (parts[1] === 'business' && parts[2] && parts[3] === 'edit') return handleEditBusinessForm(request, env, parts[2]);
        if (parts[1] === 'business' && parts[2] && parts[3] === 'update' && request.method === 'POST') return handleUpdateBusiness(request, env, parts[2]);
        if (parts[1] === 'business' && parts[2] && parts[3] === 'delete' && request.method === 'POST') return handleDeleteBusiness(request, env, parts[2]);
        if (parts[1] === 'business' && parts[2] && parts[3] === 'unlock' && request.method === 'POST') return handleUnlockBusiness(request, env, parts[2]);
        if (parts[1] === 'business' && parts[2] && parts[3] === 'reveal-pin' && request.method === 'POST') return handleRevealPin(request, env, parts[2]);
        if (parts[1] === 'business' && parts[2] && parts[3] === 'update-pin-note' && request.method === 'POST') return handleUpdatePinNote(request, env, parts[2]);
        if (parts[1] === 'business' && parts[2] && parts[3] === 'payment' && request.method === 'POST') return handleUpdatePayment(request, env, parts[2]);
        if (parts[1] === 'business' && parts[2] && parts[3] === 'toggle-suspend' && request.method === 'POST') return handleToggleSuspend(request, env, parts[2]);
        return handleAdminPage(request, env);
      }

      // ---- panel del staff ----
      if (parts[0] === 'staff' && parts[1]) {
        const slug = parts[1];
        if (parts[2] === 'login' && request.method === 'POST') return handleLogin(request, env, slug);
        if (parts[2] === 'stamp' && request.method === 'POST') return handleStamp(request, env, slug);
        if (parts[2] === 'register' && request.method === 'POST') return handleRegister(request, env, slug);
        if (parts[2] === 'clientes' && parts[3] === 'borrar-varios' && request.method === 'POST') return handleBulkDeleteCustomers(request, env, slug);
        if (parts[2] === 'clientes') return handleClientesList(request, env, slug);
        if (parts[2] === 'cliente' && parts[3] && parts[4] === 'delete' && request.method === 'POST') return handleDeleteCustomer(request, env, slug, parts[3]);
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

// Catálogo de tipografías, para que cada marca elija la que le queda,
// en vez de tener siempre la misma redondita para todas.
const FONTS = {
  'Baloo 2':          { label: 'Redondeada y divertida',  google: 'Baloo+2:wght@400;600;700;800',        fallback: "'Arial Rounded MT Bold', sans-serif" },
  'Poppins':           { label: 'Moderna y minimalista',   google: 'Poppins:wght@400;600;700;800',        fallback: "sans-serif" },
  'Playfair Display':  { label: 'Elegante y clásica',      google: 'Playfair+Display:wght@400;600;700;800', fallback: "serif" },
  'Montserrat':        { label: 'Seria y corporativa',     google: 'Montserrat:wght@400;600;700;800',     fallback: "sans-serif" },
  'Caveat':            { label: 'Manuscrita y artesanal',  google: 'Caveat:wght@400;600;700',             fallback: "cursive" },
  'Amiko':             { label: 'Limpia y legible',        google: 'Amiko:wght@400;600;700',          fallback: "sans-serif" },
};
function getFontConfig(fontFamily) {
  return FONTS[fontFamily] || FONTS['Baloo 2'];
}

function colorField(id, label, value) {
  return `<div class="color-row"><span class="color-row-label">${label}</span><input type="color" class="colorPicker" id="${id}" value="${value}"><input type="text" class="colorHex" id="${id}_hex" value="${value}"></div>`;
}

// cuadro modal para pedir la contraseña de administradora, con asteriscos reales
// y un ojito para revelar lo que se escribió (reemplaza los prompt() feos del navegador).
// se usa en varios lugares: ver el PIN, borrar un negocio, cambiar el recordatorio.
function passwordModalHtml() {
  return `
  <div id="pwModalOverlay" class="pw-modal-overlay">
    <div class="pw-modal">
      <p id="pwModalLabel" style="white-space:pre-line;font-size:13px;"></p>
      <div class="pw-wrap">
        <input type="password" id="pwModalInput" autocomplete="off">
        <button type="button" class="pw-toggle" data-target="pwModalInput">👁</button>
      </div>
      <p class="msg err" id="pwModalError" style="display:none;margin-top:6px;"></p>
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button type="button" id="pwModalCancel" style="background:#EEE9DF;color:#2B2320;">Cancelar</button>
        <button type="button" id="pwModalConfirm">Confirmar</button>
      </div>
    </div>
  </div>`;
}

function passwordModalStyles() {
  return `
  .pw-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;align-items:center;justify-content:center;}
  .pw-modal-overlay.show{display:flex;}
  .pw-modal{background:white;border-radius:16px;padding:22px;max-width:320px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,.3);}
  .pw-modal button{margin-top:0;}
  `;
}

function passwordModalScript() {
  return `
    document.querySelectorAll('.pw-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
        else { input.type = 'password'; btn.textContent = '👁'; }
      });
    });
    function askPassword(label) {
      return new Promise((resolve) => {
        const overlay = document.getElementById('pwModalOverlay');
        const input = document.getElementById('pwModalInput');
        const labelEl = document.getElementById('pwModalLabel');
        const errorEl = document.getElementById('pwModalError');
        const confirmBtn = document.getElementById('pwModalConfirm');
        const cancelBtn = document.getElementById('pwModalCancel');
        labelEl.textContent = label;
        input.value = ''; input.type = 'password';
        const toggleBtn = document.querySelector('.pw-toggle[data-target="pwModalInput"]');
        if (toggleBtn) toggleBtn.textContent = '👁';
        errorEl.style.display = 'none';
        overlay.classList.add('show');
        setTimeout(() => input.focus(), 50);
        function cleanup(value) {
          overlay.classList.remove('show');
          confirmBtn.removeEventListener('click', onConfirm);
          cancelBtn.removeEventListener('click', onCancel);
          input.removeEventListener('keydown', onKeydown);
          resolve(value);
        }
        function onConfirm() { cleanup(input.value); }
        function onCancel() { cleanup(null); }
        function onKeydown(e) { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); }
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKeydown);
      });
    }
  `;
}

// Todos los colores de la tarjeta, organizados en 3 grupos: Textos, Fondos, Bordes.
// Se usa tanto en "Crear negocio" como en "Editar", así quedan siempre iguales.
function colorGroupsHtml(b) {
  const v = (key, fallback) => (b && b[key]) || fallback;
  return `
    <label style="margin-top:18px;">🔤 Textos</label>
    <div class="colors">
      ${colorField('color_brown_soft', 'Título bienvenida: "¡Hello!"', v('color_brown_soft', '#8A5A34'))}
      ${colorField('color_brown', 'Nombre del cliente', v('color_brown', '#593212'))}
      ${colorField('color_text_progress_pct', 'Porcentaje al lado de la barra (ej. 40%)', v('color_text_progress_pct', '#593212'))}
      ${colorField('color_text_progress_label', 'Texto debajo de la barra: "X de 10 sellos..."', v('color_text_progress_label', '#8A5A34'))}
      ${colorField('color_text_progress_number', 'Números en negrita de ese mismo texto', v('color_text_progress_number', '#593212'))}
      ${colorField('color_reward_heading', 'Título: "Tu premio, cada vez más cerca"', v('color_reward_heading', '#593212'))}
      ${colorField('color_reward_text', 'Descripción debajo de ese título', v('color_reward_text', '#593212'))}
      ${colorField('color_text_qr_code', 'Código de cliente (ej. #ABC123)', v('color_text_qr_code', '#593212'))}
      ${colorField('color_text_qr_instruction', 'Descripción debajo del código de cliente', v('color_text_qr_instruction', '#8A5A34'))}
      ${colorField('color_text_instagram', 'Usuario de Instagram (@usuario)', v('color_text_instagram', '#593212'))}
      ${colorField('color_text_credit', 'Texto final: "My Tapp, una marca de Anaelí Brand"', v('color_text_credit', '#593212'))}
    </div>

    <label style="margin-top:18px;">🎨 Fondos</label>
    <div class="colors">
      ${colorField('color_page_bg', 'Fondo de toda la pantalla', v('color_page_bg', '#DCEAF4'))}
      ${colorField('color_card_bg', 'Fondo de la tarjeta', v('color_card_bg', '#FFFCF5'))}
      ${colorField('color_stamp_bg', 'Fondo de los círculos de sello', v('color_stamp_bg', '#593212'))}
      ${colorField('color_pink', 'Relleno de la barra de progreso', v('color_pink', '#F4D3DF'))}
      ${colorField('color_butter_mid', 'Fondo del bloque "Tu premio"', v('color_butter_mid', '#F9E6B2'))}
      ${colorField('color_qr_bg', 'Fondo del recuadro del código QR', v('color_qr_bg', '#F4D3DF'))}
      ${colorField('color_qr_pattern_light', 'Color del QR: espacio entre cuadritos', v('color_qr_pattern_light', '#F4D3DF'))}
      ${colorField('color_instagram_bg', 'Fondo de la burbuja de Instagram', v('color_instagram_bg', '#DCEAF4'))}
      ${colorField('color_butter_light', 'Fondo claro adicional (uso interno)', v('color_butter_light', '#FBEFD2'))}
    </div>

    <label style="margin-top:18px;">🖊️ Bordes y sombra</label>
    <div class="colors">
      ${colorField('color_border_card', 'Marco que rodea toda la tarjeta', v('color_border_card', '#593212'))}
      ${colorField('color_brown_deep', 'Sombra debajo de la tarjeta', v('color_brown_deep', '#3E2107'))}
      ${colorField('color_border_progress', 'Contorno de la barra de progreso', v('color_border_progress', '#593212'))}
      ${colorField('color_border_stamp_ring', 'Anillo interno de los sellos vacíos', v('color_border_stamp_ring', '#FFF8EC'))}
      ${colorField('color_border_reward', 'Contorno del bloque "Tu premio"', v('color_border_reward', '#593212'))}
      ${colorField('color_border_qr', 'Contorno del recuadro del código QR', v('color_border_qr', '#593212'))}
      ${colorField('color_qr_pattern_dark', 'Color del QR: cuadritos del código', v('color_qr_pattern_dark', '#593212'))}
    </div>
  `;
}

// ---- vista previa en vivo, reutilizada en "crear negocio" y "editar negocio" ----
function previewStyles() {
  return `
    .preview-col{width:300px;flex-shrink:0;position:sticky;top:24px;}
    .preview-label{font-size:12px;font-weight:700;color:#8A6F4E;margin:0 0 8px;text-align:center;}
    .preview-card{border-radius:24px;border:2.5px solid #593212;overflow:hidden;box-shadow:0 8px 0 rgba(0,0,0,.15);}
    .preview-page{padding:20px;border-radius:24px;}
    .preview-top{padding:20px 16px 14px;text-align:center;border-bottom:2px solid;}
    .preview-logo{max-width:100px;max-height:60px;object-fit:contain;margin:0 auto;display:block;}
    .preview-body{padding:16px;}
    .preview-eyebrow{font-size:12px;font-weight:700;text-transform:uppercase;margin:0;}
    .preview-name{font-size:16px;font-weight:800;margin:2px 0 12px;}
    .preview-bar-track{height:10px;border-radius:99px;background:white;border:2px solid;overflow:hidden;margin-bottom:10px;}
    .preview-bar-fill{height:100%;width:45%;border-radius:99px;}
    .preview-stamps{display:flex;gap:6px;margin-bottom:12px;}
    .preview-stamp{width:32px;height:32px;border-radius:50%;flex-shrink:0;background-size:65% 65%;background-position:center;background-repeat:no-repeat;}
    .preview-reward{border-radius:10px;border:2px solid;padding:8px 10px;font-size:10.5px;}
    .preview-reward b{display:block;font-size:11.5px;}
    .preview-qr-section{margin-top:14px;padding-top:12px;border-top:1.5px dashed #ddd;display:flex;align-items:center;gap:10px;}
    .preview-qr-box{width:52px;height:52px;border-radius:10px;border:2px solid;padding:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
    .preview-qr-box canvas{width:100%;height:100%;display:block;}
    .preview-qr-copy{font-size:9.5px;line-height:1.3;}
    .preview-qr-copy b{display:block;font-size:10.5px;margin-bottom:1px;}
  `;
}

function previewPanelHtml(logoBase64, sello1Base64) {
  return `<div class="preview-col">
    <p class="preview-label">Vista previa (aproximada)</p>
    <div class="preview-card">
      <div class="preview-page" id="prevPage">
        <div class="preview-top" id="prevTop">
          <img class="preview-logo" id="prevLogo" src="data:image/png;base64,${logoBase64 || ''}">
        </div>
        <div class="preview-body" id="prevBody">
          <p class="preview-eyebrow" id="prevEyebrow">¡Hello!</p>
          <p class="preview-name" id="prevName">Nombre Cliente</p>
          <div class="preview-bar-track" id="prevBarTrack"><div class="preview-bar-fill" id="prevBarFill"></div></div>
          <div class="preview-stamps">
            <div class="preview-stamp" id="prevStamp1"></div>
            <div class="preview-stamp" id="prevStamp2"></div>
            <div class="preview-stamp" id="prevStamp3"></div>
          </div>
          <div class="preview-reward" id="prevReward">
            <b id="prevRewardHeading">Tu premio, cada vez más cerca</b>
            <span id="prevRewardText">Al llegar a tu sello #10, recibe algo gratis.</span>
          </div>
          <div class="preview-qr-section">
            <div class="preview-qr-box" id="prevQrBox"><canvas id="prevQrCanvas" width="60" height="60"></canvas></div>
            <div class="preview-qr-copy">
              <b id="prevQrCode">#EJEMPLO01</b>
              <span id="prevQrInstruction">Muestra este código en caja para sumar tu sello.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function previewScript(initialSelloBase64) {
  return `
    let prevSelloUrl = ${JSON.stringify(initialSelloBase64 ? `data:image/png;base64,${initialSelloBase64}` : '')};
    function readColor(id, fallback) { const el = document.getElementById(id); return el ? el.value : fallback; }
    function updatePreview() {
      const pageBg = readColor('color_page_bg', '#DCEAF4'), cardBg = readColor('color_card_bg', '#FFFCF5');
      const brown = readColor('color_brown', '#593212'), brownSoft = readColor('color_brown_soft', '#8A5A34');
      const pink = readColor('color_pink', '#F4D3DF'), butterMid = readColor('color_butter_mid', '#F9E6B2');
      const stampBg = readColor('color_stamp_bg', brown);
      const rewardBody = readColor('color_reward_text', brown), rewardHeading = readColor('color_reward_heading', brown);
      const borderCard = readColor('color_border_card', brown), borderProgress = readColor('color_border_progress', brown), borderReward = readColor('color_border_reward', brown);
      const fontSel = document.getElementById('font_family');
      const font = fontSel ? fontSel.value : 'Baloo 2';
      const fallback = { 'Baloo 2':"'Arial Rounded MT Bold',sans-serif", 'Poppins':'sans-serif', 'Playfair Display':'serif', 'Montserrat':'sans-serif', 'Caveat':'cursive', 'Amiko':'sans-serif' }[font] || 'sans-serif';
      const fontCss = "'" + font + "'," + fallback;
      const nameBold = document.getElementById('font_bold') ? document.getElementById('font_bold').checked : true;
      const nameItalic = document.getElementById('font_italic') ? document.getElementById('font_italic').checked : false;
      const eyebrowBold = document.getElementById('eyebrow_bold') ? document.getElementById('eyebrow_bold').checked : true;
      const eyebrowItalic = document.getElementById('eyebrow_italic') ? document.getElementById('eyebrow_italic').checked : false;
      const rewardBold = document.getElementById('reward_bold') ? document.getElementById('reward_bold').checked : true;
      const rewardItalic = document.getElementById('reward_italic') ? document.getElementById('reward_italic').checked : false;

      document.getElementById('prevPage').style.background = pageBg;
      document.getElementById('prevTop').style.borderColor = borderCard;
      document.getElementById('prevBody').style.background = cardBg;
      document.querySelector('.preview-card').style.borderColor = borderCard;

      const eyebrow = document.getElementById('prevEyebrow');
      eyebrow.style.color = brownSoft; eyebrow.style.fontFamily = fontCss;
      eyebrow.style.fontWeight = eyebrowBold ? '700' : '400'; eyebrow.style.fontStyle = eyebrowItalic ? 'italic' : 'normal';
      eyebrow.textContent = document.getElementById('greeting_eyebrow') ? document.getElementById('greeting_eyebrow').value || '¡Hello!' : '¡Hello!';

      const name = document.getElementById('prevName');
      name.style.color = brown; name.style.fontFamily = fontCss;
      name.style.fontWeight = nameBold ? '700' : '400'; name.style.fontStyle = nameItalic ? 'italic' : 'normal';

      document.getElementById('prevBarTrack').style.borderColor = borderProgress;
      document.getElementById('prevBarFill').style.background = pink;

      ['prevStamp1','prevStamp2','prevStamp3'].forEach((id, i) => {
        const el = document.getElementById(id);
        el.style.background = stampBg;
        if (i === 0 && prevSelloUrl) { el.style.backgroundImage = 'url(' + prevSelloUrl + ')'; }
      });

      const reward = document.getElementById('prevReward');
      reward.style.background = butterMid; reward.style.borderColor = borderReward; reward.style.color = rewardBody;
      const rewardHeadingEl = document.getElementById('prevRewardHeading');
      rewardHeadingEl.style.fontFamily = fontCss; rewardHeadingEl.style.color = rewardHeading;
      rewardHeadingEl.style.fontWeight = rewardBold ? '700' : '400'; rewardHeadingEl.style.fontStyle = rewardItalic ? 'italic' : 'normal';
      const rh = document.getElementById('reward_heading'); if (rh) rewardHeadingEl.textContent = rh.value || 'Tu premio, cada vez más cerca';
      const rt = document.getElementById('reward_text'); if (rt) document.getElementById('prevRewardText').textContent = rt.value || '';

      const qrBg = readColor('color_qr_bg', '#F4D3DF'), borderQr = readColor('color_border_qr', brown);
      const qrDark = readColor('color_qr_pattern_dark', brown), qrLight = readColor('color_qr_pattern_light', qrBg);
      document.getElementById('prevQrBox').style.background = qrBg;
      document.getElementById('prevQrBox').style.borderColor = borderQr;
      if (typeof QRCode !== 'undefined') {
        QRCode.toCanvas(document.getElementById('prevQrCanvas'), 'https://mytapp.club/ejemplo/EJ-0001', { width: 44, margin: 1, color: { dark: qrDark, light: qrLight } });
      }
      const qrCodeEl = document.getElementById('prevQrCode');
      qrCodeEl.style.color = readColor('color_text_qr_code', brown);
      const qrInstructionEl = document.getElementById('prevQrInstruction');
      qrInstructionEl.style.color = readColor('color_text_qr_instruction', brownSoft);
    }
    document.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', updatePreview);
      el.addEventListener('change', updatePreview);
    });
    const logoFileInput = document.getElementById('logo');
    if (logoFileInput) logoFileInput.addEventListener('change', () => {
      if (logoFileInput.files[0]) document.getElementById('prevLogo').src = URL.createObjectURL(logoFileInput.files[0]);
    });
    const sello1Input = document.getElementById('sello1');
    if (sello1Input) sello1Input.addEventListener('change', () => {
      if (sello1Input.files[0]) { prevSelloUrl = URL.createObjectURL(sello1Input.files[0]); updatePreview(); }
    });
    updatePreview();
  `;
}

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
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 5000, hash: 'SHA-256' }, keyMaterial, 256);
  return `${bytesToHex(salt)}:${bytesToHex(new Uint8Array(bits))}`;
}
async function verifyPassword(password, stored) {
  const [saltHex] = stored.split(':');
  const recomputed = await hashPassword(password, saltHex);
  return recomputed === stored;
}

// nunca deja que el número de sellos quede en 0, negativo, o algo absurdo
// (evita que la tarjeta se rompa con divisiones entre cero o porcentajes imposibles)
// nunca deja pasar un "color" que no sea un color de verdad (formato #RRGGBB),
// para que nadie pueda meter código raro en la página a través de este campo
// si alguien escribe el link de Instagram sin "https://" al inicio (ej. "www.instagram.com/x"),
// el navegador lo trataría como un link roto dentro del propio sitio, no como un link externo real.
// Aquí se corrige solo, sin importar cómo lo hayan escrito.
function normalizeExternalUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function sanitizeColor(value, fallback) {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  return fallback;
}

function sanitizeTotalStamps(value, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 3) return fallback || 10;
  if (n > 50) return 50;
  return n;
}

function generateCode(slug) {
  const prefix = slug.slice(0, 2).toUpperCase();
  const rand = crypto.getRandomValues(new Uint8Array(4));
  const suffix = [...rand].map(b => b.toString(16)).join('').toUpperCase().slice(0, 6);
  return `${prefix}-${suffix}`;
}

// el código es único en TODA la base de datos (no solo por negocio), así que antes de
// usarlo comprobamos que no exista ya. Con el azar disponible esto casi nunca se repite,
// pero si algún día pasa, aquí se reintenta en vez de fallar.
async function generateUniqueCode(env, slug) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode(slug);
    const existing = await env.DB.prepare('SELECT id FROM customers WHERE code = ?').bind(code).first();
    if (!existing) return code;
  }
  // si en 5 intentos seguidos hubo choque (prácticamente imposible), se agrega algo de tiempo para forzar diferencia
  return generateCode(slug) + Date.now().toString(36).slice(-2).toUpperCase();
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
  .pw-wrap{position:relative;}
  .pw-wrap input{padding-right:44px;}
  .pw-toggle{position:absolute;right:10px;top:11px;background:none!important;border:none!important;width:auto!important;padding:2px!important;font-size:18px;cursor:pointer;line-height:1;}
  button{width:100%;padding:13px;border:2px solid #2B2320;border-radius:12px;background:#000000;color:#FFFFFF;font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;}
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
  <style>${adminBaseStyles()}
    .recovery-box{background:#FFF3CD;border:2px solid #856404;border-radius:12px;padding:16px;text-align:center;margin-top:14px;}
    .recovery-code{font-family:monospace;font-size:17px;font-weight:700;color:#2B2320;letter-spacing:1px;margin:8px 0;word-break:break-all;}
    .warn{font-size:12px;color:#856404;}
  </style></head>
  <body>
    <div class="box">
      <h1>My Tapp</h1>
      <p class="sub">Primera vez aquí. Crea tu cuenta de administradora con tu propio correo y contraseña.</p>
      <form id="f">
        <input type="email" id="email" placeholder="Tu correo" required>
        <div class="pw-wrap">
          <input type="password" id="password" placeholder="Contraseña (mínimo 6 caracteres)" required minlength="6">
          <button type="button" class="pw-toggle" data-target="password">👁</button>
        </div>
        <button type="submit">Crear mi cuenta</button>
      </form>
      <p class="msg" id="msg"></p>
      <div id="recoveryBox" style="display:none;">
        <div class="recovery-box">
          <b>Guarda este código de recuperación</b>
          <div class="recovery-code" id="recoveryCode"></div>
          <p class="warn">Es la única forma de recuperar tu cuenta si olvidas tu contraseña. No te lo vuelvo a mostrar. Guárdalo en tu gestor de contraseñas o en un lugar seguro.</p>
        </div>
        <button type="button" id="continueBtn">Ya lo guardé, continuar</button>
      </div>
    </div>
    <script>
      document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = document.getElementById(btn.dataset.target);
          if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
          else { input.type = 'password'; btn.textContent = '👁'; }
        });
      });
      document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const msg = document.getElementById('msg');
        msg.textContent = 'Creando...'; msg.className = 'msg';
        try {
          const res = await fetch('/admin/signup', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
          if (res.ok) {
            const data = await res.json();
            document.getElementById('recoveryCode').textContent = data.recoveryCode;
            document.getElementById('f').style.display = 'none';
            document.getElementById('recoveryBox').style.display = 'block';
            msg.textContent = '';
          } else { const d = await res.json(); msg.textContent = d.error || 'No se pudo crear la cuenta'; msg.className = 'msg err'; }
        } catch (err) {
          msg.textContent = 'Algo falló (' + err.message + '). Intenta de nuevo.'; msg.className = 'msg err';
        }
      });
      document.getElementById('continueBtn').addEventListener('click', () => { location.href = '/admin'; });
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
        <div class="pw-wrap">
          <input type="password" id="password" placeholder="Contraseña" required>
          <button type="button" class="pw-toggle" data-target="password">👁</button>
        </div>
        <button type="submit">Entrar</button>
      </form>
      <p class="msg" id="msg"></p>
      <p class="sub"><a href="/admin/recuperar">¿Olvidaste tu contraseña?</a></p>
    </div>
    <script>
      document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = document.getElementById(btn.dataset.target);
          if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
          else { input.type = 'password'; btn.textContent = '👁'; }
        });
      });
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
  const { results } = await env.DB.prepare('SELECT slug, name, created_at, staff_login_locked_until, last_payment_date, next_payment_date, is_suspended FROM businesses ORDER BY id DESC').all();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const rows = results.map(b => {
    const isLocked = b.staff_login_locked_until && new Date(b.staff_login_locked_until + 'Z') > now;
    const isOverdue = b.next_payment_date && b.next_payment_date < today;
    return `
    <tr>
      <td style="white-space:nowrap;"><a href="/admin/business/${escapeHtml(b.slug)}/edit">Editar</a></td>
      <td style="white-space:nowrap;">${escapeHtml(b.name)}</td>
      <td style="white-space:nowrap;">${escapeHtml(b.slug)}</td>
      <td style="white-space:nowrap;"><a href="#" class="download-qr" data-slug="${escapeHtml(b.slug)}" data-name="${escapeHtml(b.name)}">Descargar QR</a></td>
      <td style="white-space:nowrap;"><span class="pin-cell" data-slug="${escapeHtml(b.slug)}">🔒 <a href="#" class="reveal-pin">Ver PIN</a></span></td>
      <td style="white-space:nowrap;">${isLocked ? `<a href="#" class="unlock-biz" data-slug="${escapeHtml(b.slug)}" style="color:#B26A00;font-weight:700;">🔒 Desbloquear</a>` : '—'}</td>
      <td style="white-space:nowrap;"><a href="/staff/${escapeHtml(b.slug)}" target="_blank">Link para staff</a></td>
      <td style="white-space:nowrap;"><a href="/${escapeHtml(b.slug)}/nuevo" target="_blank">Link para clientes</a></td>
      <td style="white-space:nowrap;">
        <div class="payment-cell" data-slug="${escapeHtml(b.slug)}">
          <div style="margin-bottom:4px;">
            <label style="font-size:10px;font-weight:400;margin:0;">Pagó:</label>
            <input type="date" class="last-payment-input" value="${b.last_payment_date || ''}" style="font-size:11px;padding:3px 5px;width:120px;">
          </div>
          <div>
            <label style="font-size:10px;font-weight:400;margin:0;">Próximo:</label>
            <input type="date" class="next-payment-input" value="${b.next_payment_date || ''}" style="font-size:11px;padding:3px 5px;width:120px;${isOverdue ? 'border-color:#B23A3A;color:#B23A3A;font-weight:700;' : ''}">
          </div>
          <button type="button" class="save-payment-btn" style="width:auto;margin-top:4px;padding:4px 10px;font-size:11px;">Guardar</button>
        </div>
      </td>
      <td style="white-space:nowrap;">
        <a href="#" class="toggle-suspend" data-slug="${escapeHtml(b.slug)}" data-suspended="${b.is_suspended}" style="color:${b.is_suspended ? '#215A34' : '#B26A00'};font-weight:700;">
          ${b.is_suspended ? '▶️ Activar' : '⏸️ Suspender'}
        </a>
      </td>
      <td style="white-space:nowrap;"><a href="#" class="delete-biz" data-slug="${escapeHtml(b.slug)}" data-name="${escapeHtml(b.name)}" style="color:#B23A3A;">Borrar</a></td>
    </tr>`;
  }).join('');

  return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panel · My Tapp</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Poppins:wght@600;700;800&family=Playfair+Display:wght@600;700;800&family=Montserrat:wght@600;700;800&family=Caveat:wght@600;700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<script>var QRCode=function(t){"use strict";var r,e=function(){return"function"==typeof Promise&&Promise.prototype&&Promise.prototype.then},n=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706],o=function(t){if(!t)throw new Error('"version" cannot be null or undefined');if(t<1||t>40)throw new Error('"version" should be in range from 1 to 40');return 4*t+17},a=function(t){return n[t]},i=function(t){for(var r=0;0!==t;)r++,t>>>=1;return r},u=function(t){if("function"!=typeof t)throw new Error('"toSJISFunc" is not a valid function.');r=t},s=function(){return void 0!==r},f=function(t){return r(t)};function h(t,r){return t(r={exports:{}},r.exports),r.exports}var c=h((function(t,r){r.L={bit:1},r.M={bit:0},r.Q={bit:3},r.H={bit:2},r.isValid=function(t){return t&&void 0!==t.bit&&t.bit>=0&&t.bit<4},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"l":case"low":return r.L;case"m":case"medium":return r.M;case"q":case"quartile":return r.Q;case"h":case"high":return r.H;default:throw new Error("Unknown EC Level: "+t)}}(t)}catch(t){return e}}}));function g(){this.buffer=[],this.length=0}c.L,c.M,c.Q,c.H,c.isValid,g.prototype={get:function(t){var r=Math.floor(t/8);return 1==(this.buffer[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e++)this.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return this.length},putBit:function(t){var r=Math.floor(this.length/8);this.buffer.length<=r&&this.buffer.push(0),t&&(this.buffer[r]|=128>>>this.length%8),this.length++}};var d=g;function l(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}l.prototype.set=function(t,r,e,n){var o=t*this.size+r;this.data[o]=e,n&&(this.reservedBit[o]=!0)},l.prototype.get=function(t,r){return this.data[t*this.size+r]},l.prototype.xor=function(t,r,e){this.data[t*this.size+r]^=e},l.prototype.isReserved=function(t,r){return this.reservedBit[t*this.size+r]};var v=l,p=h((function(t,r){var e=o;r.getRowColCoords=function(t){if(1===t)return[];for(var r=Math.floor(t/7)+2,n=e(t),o=145===n?26:2*Math.ceil((n-13)/(2*r-2)),a=[n-7],i=1;i<r-1;i++)a[i]=a[i-1]-o;return a.push(6),a.reverse()},r.getPositions=function(t){for(var e=[],n=r.getRowColCoords(t),o=n.length,a=0;a<o;a++)for(var i=0;i<o;i++)0===a&&0===i||0===a&&i===o-1||a===o-1&&0===i||e.push([n[a],n[i]]);return e}}));p.getRowColCoords,p.getPositions;var w=o,m=function(t){var r=w(t);return[[0,0],[r-7,0],[0,r-7]]},E=h((function(t,r){r.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var e=3,n=3,o=40,a=10;function i(t,e,n){switch(t){case r.Patterns.PATTERN000:return(e+n)%2==0;case r.Patterns.PATTERN001:return e%2==0;case r.Patterns.PATTERN010:return n%3==0;case r.Patterns.PATTERN011:return(e+n)%3==0;case r.Patterns.PATTERN100:return(Math.floor(e/2)+Math.floor(n/3))%2==0;case r.Patterns.PATTERN101:return e*n%2+e*n%3==0;case r.Patterns.PATTERN110:return(e*n%2+e*n%3)%2==0;case r.Patterns.PATTERN111:return(e*n%3+(e+n)%2)%2==0;default:throw new Error("bad maskPattern:"+t)}}r.isValid=function(t){return null!=t&&""!==t&&!isNaN(t)&&t>=0&&t<=7},r.from=function(t){return r.isValid(t)?parseInt(t,10):void 0},r.getPenaltyN1=function(t){for(var r=t.size,n=0,o=0,a=0,i=null,u=null,s=0;s<r;s++){o=a=0,i=u=null;for(var f=0;f<r;f++){var h=t.get(s,f);h===i?o++:(o>=5&&(n+=e+(o-5)),i=h,o=1),(h=t.get(f,s))===u?a++:(a>=5&&(n+=e+(a-5)),u=h,a=1)}o>=5&&(n+=e+(o-5)),a>=5&&(n+=e+(a-5))}return n},r.getPenaltyN2=function(t){for(var r=t.size,e=0,o=0;o<r-1;o++)for(var a=0;a<r-1;a++){var i=t.get(o,a)+t.get(o,a+1)+t.get(o+1,a)+t.get(o+1,a+1);4!==i&&0!==i||e++}return e*n},r.getPenaltyN3=function(t){for(var r=t.size,e=0,n=0,a=0,i=0;i<r;i++){n=a=0;for(var u=0;u<r;u++)n=n<<1&2047|t.get(i,u),u>=10&&(1488===n||93===n)&&e++,a=a<<1&2047|t.get(u,i),u>=10&&(1488===a||93===a)&&e++}return e*o},r.getPenaltyN4=function(t){for(var r=0,e=t.data.length,n=0;n<e;n++)r+=t.data[n];return Math.abs(Math.ceil(100*r/e/5)-10)*a},r.applyMask=function(t,r){for(var e=r.size,n=0;n<e;n++)for(var o=0;o<e;o++)r.isReserved(o,n)||r.xor(o,n,i(t,o,n))},r.getBestMask=function(t,e){for(var n=Object.keys(r.Patterns).length,o=0,a=1/0,i=0;i<n;i++){e(i),r.applyMask(i,t);var u=r.getPenaltyN1(t)+r.getPenaltyN2(t)+r.getPenaltyN3(t)+r.getPenaltyN4(t);r.applyMask(i,t),u<a&&(a=u,o=i)}return o}}));E.Patterns,E.isValid,E.getPenaltyN1,E.getPenaltyN2,E.getPenaltyN3,E.getPenaltyN4,E.applyMask,E.getBestMask;var y=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],A=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430],I=function(t,r){switch(r){case c.L:return y[4*(t-1)+0];case c.M:return y[4*(t-1)+1];case c.Q:return y[4*(t-1)+2];case c.H:return y[4*(t-1)+3];default:return}},M=function(t,r){switch(r){case c.L:return A[4*(t-1)+0];case c.M:return A[4*(t-1)+1];case c.Q:return A[4*(t-1)+2];case c.H:return A[4*(t-1)+3];default:return}},N=new Uint8Array(512),B=new Uint8Array(256);!function(){for(var t=1,r=0;r<255;r++)N[r]=t,B[t]=r,256&(t<<=1)&&(t^=285);for(var e=255;e<512;e++)N[e]=N[e-255]}();var C=function(t){return N[t]},P=function(t,r){return 0===t||0===r?0:N[B[t]+B[r]]},R=h((function(t,r){r.mul=function(t,r){for(var e=new Uint8Array(t.length+r.length-1),n=0;n<t.length;n++)for(var o=0;o<r.length;o++)e[n+o]^=P(t[n],r[o]);return e},r.mod=function(t,r){for(var e=new Uint8Array(t);e.length-r.length>=0;){for(var n=e[0],o=0;o<r.length;o++)e[o]^=P(r[o],n);for(var a=0;a<e.length&&0===e[a];)a++;e=e.slice(a)}return e},r.generateECPolynomial=function(t){for(var e=new Uint8Array([1]),n=0;n<t;n++)e=r.mul(e,new Uint8Array([1,C(n)]));return e}}));function T(t){this.genPoly=void 0,this.degree=t,this.degree&&this.initialize(this.degree)}R.mul,R.mod,R.generateECPolynomial,T.prototype.initialize=function(t){this.degree=t,this.genPoly=R.generateECPolynomial(this.degree)},T.prototype.encode=function(t){if(!this.genPoly)throw new Error("Encoder not initialized");var r=new Uint8Array(t.length+this.degree);r.set(t);var e=R.mod(r,this.genPoly),n=this.degree-e.length;if(n>0){var o=new Uint8Array(this.degree);return o.set(e,n),o}return e};var L=T,b=function(t){return!isNaN(t)&&t>=1&&t<=40},U="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+",x="(?:(?![A-Z0-9 $%*+\\\\-./:]|"+(U=U.replace(/u/g,"\\\\u"))+")(?:.|[\\r\\n]))+",k=new RegExp(U,"g"),F=new RegExp("[^A-Z0-9 $%*+\\\\-./:]+","g"),S=new RegExp(x,"g"),D=new RegExp("[0-9]+","g"),Y=new RegExp("[A-Z $%*+\\\\-./:]+","g"),_=new RegExp("^"+U+"$"),z=new RegExp("^[0-9]+$"),H=new RegExp("^[A-Z0-9 $%*+\\\\-./:]+$"),J={KANJI:k,BYTE_KANJI:F,BYTE:S,NUMERIC:D,ALPHANUMERIC:Y,testKanji:function(t){return _.test(t)},testNumeric:function(t){return z.test(t)},testAlphanumeric:function(t){return H.test(t)}},K=h((function(t,r){r.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},r.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},r.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},r.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},r.MIXED={bit:-1},r.getCharCountIndicator=function(t,r){if(!t.ccBits)throw new Error("Invalid mode: "+t);if(!b(r))throw new Error("Invalid version: "+r);return r>=1&&r<10?t.ccBits[0]:r<27?t.ccBits[1]:t.ccBits[2]},r.getBestModeForData=function(t){return J.testNumeric(t)?r.NUMERIC:J.testAlphanumeric(t)?r.ALPHANUMERIC:J.testKanji(t)?r.KANJI:r.BYTE},r.toString=function(t){if(t&&t.id)return t.id;throw new Error("Invalid mode")},r.isValid=function(t){return t&&t.bit&&t.ccBits},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return r.NUMERIC;case"alphanumeric":return r.ALPHANUMERIC;case"kanji":return r.KANJI;case"byte":return r.BYTE;default:throw new Error("Unknown mode: "+t)}}(t)}catch(t){return e}}}));K.NUMERIC,K.ALPHANUMERIC,K.BYTE,K.KANJI,K.MIXED,K.getCharCountIndicator,K.getBestModeForData,K.isValid;var O=h((function(t,r){var e=i(7973);function n(t,r){return K.getCharCountIndicator(t,r)+4}function o(t,r){var e=0;return t.forEach((function(t){var o=n(t.mode,r);e+=o+t.getBitsLength()})),e}r.from=function(t,r){return b(t)?parseInt(t,10):r},r.getCapacity=function(t,r,e){if(!b(t))throw new Error("Invalid QR Code version");void 0===e&&(e=K.BYTE);var o=8*(a(t)-M(t,r));if(e===K.MIXED)return o;var i=o-n(e,t);switch(e){case K.NUMERIC:return Math.floor(i/10*3);case K.ALPHANUMERIC:return Math.floor(i/11*2);case K.KANJI:return Math.floor(i/13);case K.BYTE:default:return Math.floor(i/8)}},r.getBestVersionForData=function(t,e){var n,a=c.from(e,c.M);if(Array.isArray(t)){if(t.length>1)return function(t,e){for(var n=1;n<=40;n++){if(o(t,n)<=r.getCapacity(n,e,K.MIXED))return n}}(t,a);if(0===t.length)return 1;n=t[0]}else n=t;return function(t,e,n){for(var o=1;o<=40;o++)if(e<=r.getCapacity(o,n,t))return o}(n.mode,n.getLength(),a)},r.getEncodedBits=function(t){if(!b(t)||t<7)throw new Error("Invalid QR Code version");for(var r=t<<12;i(r)-e>=0;)r^=7973<<i(r)-e;return t<<12|r}}));O.getCapacity,O.getBestVersionForData,O.getEncodedBits;var Q=i(1335),V=function(t,r){for(var e=t.bit<<3|r,n=e<<10;i(n)-Q>=0;)n^=1335<<i(n)-Q;return 21522^(e<<10|n)};function q(t){this.mode=K.NUMERIC,this.data=t.toString()}q.getBitsLength=function(t){return 10*Math.floor(t/3)+(t%3?t%3*3+1:0)},q.prototype.getLength=function(){return this.data.length},q.prototype.getBitsLength=function(){return q.getBitsLength(this.data.length)},q.prototype.write=function(t){var r,e,n;for(r=0;r+3<=this.data.length;r+=3)e=this.data.substr(r,3),n=parseInt(e,10),t.put(n,10);var o=this.data.length-r;o>0&&(e=this.data.substr(r),n=parseInt(e,10),t.put(n,3*o+1))};var j=q,$=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function X(t){this.mode=K.ALPHANUMERIC,this.data=t}X.getBitsLength=function(t){return 11*Math.floor(t/2)+t%2*6},X.prototype.getLength=function(){return this.data.length},X.prototype.getBitsLength=function(){return X.getBitsLength(this.data.length)},X.prototype.write=function(t){var r;for(r=0;r+2<=this.data.length;r+=2){var e=45*$.indexOf(this.data[r]);e+=$.indexOf(this.data[r+1]),t.put(e,11)}this.data.length%2&&t.put($.indexOf(this.data[r]),6)};var Z=X;function W(t){this.mode=K.BYTE,"string"==typeof t&&(t=function(t){for(var r=[],e=t.length,n=0;n<e;n++){var o=t.charCodeAt(n);if(o>=55296&&o<=56319&&e>n+1){var a=t.charCodeAt(n+1);a>=56320&&a<=57343&&(o=1024*(o-55296)+a-56320+65536,n+=1)}o<128?r.push(o):o<2048?(r.push(o>>6|192),r.push(63&o|128)):o<55296||o>=57344&&o<65536?(r.push(o>>12|224),r.push(o>>6&63|128),r.push(63&o|128)):o>=65536&&o<=1114111?(r.push(o>>18|240),r.push(o>>12&63|128),r.push(o>>6&63|128),r.push(63&o|128)):r.push(239,191,189)}return new Uint8Array(r).buffer}(t)),this.data=new Uint8Array(t)}W.getBitsLength=function(t){return 8*t},W.prototype.getLength=function(){return this.data.length},W.prototype.getBitsLength=function(){return W.getBitsLength(this.data.length)},W.prototype.write=function(t){for(var r=0,e=this.data.length;r<e;r++)t.put(this.data[r],8)};var G=W;function tt(t){this.mode=K.KANJI,this.data=t}tt.getBitsLength=function(t){return 13*t},tt.prototype.getLength=function(){return this.data.length},tt.prototype.getBitsLength=function(){return tt.getBitsLength(this.data.length)},tt.prototype.write=function(t){var r;for(r=0;r<this.data.length;r++){var e=f(this.data[r]);if(e>=33088&&e<=40956)e-=33088;else{if(!(e>=57408&&e<=60351))throw new Error("Invalid SJIS character: "+this.data[r]+"\\nMake sure your charset is UTF-8");e-=49472}e=192*(e>>>8&255)+(255&e),t.put(e,13)}};var rt=tt,et=h((function(t){var r={single_source_shortest_paths:function(t,e,n){var o={},a={};a[e]=0;var i,u,s,f,h,c,g,d=r.PriorityQueue.make();for(d.push(e,0);!d.empty();)for(s in u=(i=d.pop()).value,f=i.cost,h=t[u]||{})h.hasOwnProperty(s)&&(c=f+h[s],g=a[s],(void 0===a[s]||g>c)&&(a[s]=c,d.push(s,c),o[s]=u));if(void 0!==n&&void 0===a[n]){var l=["Could not find a path from ",e," to ",n,"."].join("");throw new Error(l)}return o},extract_shortest_path_from_predecessor_list:function(t,r){for(var e=[],n=r;n;)e.push(n),n=t[n];return e.reverse(),e},find_path:function(t,e,n){var o=r.single_source_shortest_paths(t,e,n);return r.extract_shortest_path_from_predecessor_list(o,n)},PriorityQueue:{make:function(t){var e,n=r.PriorityQueue,o={};for(e in t=t||{},n)n.hasOwnProperty(e)&&(o[e]=n[e]);return o.queue=[],o.sorter=t.sorter||n.default_sorter,o},default_sorter:function(t,r){return t.cost-r.cost},push:function(t,r){var e={value:t,cost:r};this.queue.push(e),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return 0===this.queue.length}}};t.exports=r})),nt=h((function(t,r){function e(t){return unescape(encodeURIComponent(t)).length}function n(t,r,e){for(var n,o=[];null!==(n=t.exec(e));)o.push({data:n[0],index:n.index,mode:r,length:n[0].length});return o}function o(t){var r,e,o=n(J.NUMERIC,K.NUMERIC,t),a=n(J.ALPHANUMERIC,K.ALPHANUMERIC,t);return s()?(r=n(J.BYTE,K.BYTE,t),e=n(J.KANJI,K.KANJI,t)):(r=n(J.BYTE_KANJI,K.BYTE,t),e=[]),o.concat(a,r,e).sort((function(t,r){return t.index-r.index})).map((function(t){return{data:t.data,mode:t.mode,length:t.length}}))}function a(t,r){switch(r){case K.NUMERIC:return j.getBitsLength(t);case K.ALPHANUMERIC:return Z.getBitsLength(t);case K.KANJI:return rt.getBitsLength(t);case K.BYTE:return G.getBitsLength(t)}}function i(t,r){var e,n=K.getBestModeForData(t);if((e=K.from(r,n))!==K.BYTE&&e.bit<n.bit)throw new Error('"'+t+'" cannot be encoded with mode '+K.toString(e)+".\\n Suggested mode is: "+K.toString(n));switch(e!==K.KANJI||s()||(e=K.BYTE),e){case K.NUMERIC:return new j(t);case K.ALPHANUMERIC:return new Z(t);case K.KANJI:return new rt(t);case K.BYTE:return new G(t)}}r.fromArray=function(t){return t.reduce((function(t,r){return"string"==typeof r?t.push(i(r,null)):r.data&&t.push(i(r.data,r.mode)),t}),[])},r.fromString=function(t,n){for(var i=function(t,r){for(var e={},n={start:{}},o=["start"],i=0;i<t.length;i++){for(var u=t[i],s=[],f=0;f<u.length;f++){var h=u[f],c=""+i+f;s.push(c),e[c]={node:h,lastCount:0},n[c]={};for(var g=0;g<o.length;g++){var d=o[g];e[d]&&e[d].node.mode===h.mode?(n[d][c]=a(e[d].lastCount+h.length,h.mode)-a(e[d].lastCount,h.mode),e[d].lastCount+=h.length):(e[d]&&(e[d].lastCount=h.length),n[d][c]=a(h.length,h.mode)+4+K.getCharCountIndicator(h.mode,r))}}o=s}for(var l=0;l<o.length;l++)n[o[l]].end=0;return{map:n,table:e}}(function(t){for(var r=[],n=0;n<t.length;n++){var o=t[n];switch(o.mode){case K.NUMERIC:r.push([o,{data:o.data,mode:K.ALPHANUMERIC,length:o.length},{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.ALPHANUMERIC:r.push([o,{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.KANJI:r.push([o,{data:o.data,mode:K.BYTE,length:e(o.data)}]);break;case K.BYTE:r.push([{data:o.data,mode:K.BYTE,length:e(o.data)}])}}return r}(o(t)),n),u=et.find_path(i.map,"start","end"),s=[],f=1;f<u.length-1;f++)s.push(i.table[u[f]].node);return r.fromArray(function(t){return t.reduce((function(t,r){var e=t.length-1>=0?t[t.length-1]:null;return e&&e.mode===r.mode?(t[t.length-1].data+=r.data,t):(t.push(r),t)}),[])}(s))},r.rawSplit=function(t){return r.fromArray(o(t))}}));function ot(t,r,e){var n,o,a=t.size,i=V(r,e);for(n=0;n<15;n++)o=1==(i>>n&1),n<6?t.set(n,8,o,!0):n<8?t.set(n+1,8,o,!0):t.set(a-15+n,8,o,!0),n<8?t.set(8,a-n-1,o,!0):n<9?t.set(8,15-n-1+1,o,!0):t.set(8,15-n-1,o,!0);t.set(a-8,8,1,!0)}function at(t,r,e){var n=new d;e.forEach((function(r){n.put(r.mode.bit,4),n.put(r.getLength(),K.getCharCountIndicator(r.mode,t)),r.write(n)}));var o=8*(a(t)-M(t,r));for(n.getLengthInBits()+4<=o&&n.put(0,4);n.getLengthInBits()%8!=0;)n.putBit(0);for(var i=(o-n.getLengthInBits())/8,u=0;u<i;u++)n.put(u%2?17:236,8);return function(t,r,e){for(var n=a(r),o=M(r,e),i=n-o,u=I(r,e),s=u-n%u,f=Math.floor(n/u),h=Math.floor(i/u),c=h+1,g=f-h,d=new L(g),l=0,v=new Array(u),p=new Array(u),w=0,m=new Uint8Array(t.buffer),E=0;E<u;E++){var y=E<s?h:c;v[E]=m.slice(l,l+y),p[E]=d.encode(v[E]),l+=y,w=Math.max(w,y)}var A,N,B=new Uint8Array(n),C=0;for(A=0;A<w;A++)for(N=0;N<u;N++)A<v[N].length&&(B[C++]=v[N][A]);for(A=0;A<g;A++)for(N=0;N<u;N++)B[C++]=p[N][A];return B}(n,t,r)}function it(t,r,e,n){var a;if(Array.isArray(t))a=nt.fromArray(t);else{if("string"!=typeof t)throw new Error("Invalid data");var i=r;if(!i){var u=nt.rawSplit(t);i=O.getBestVersionForData(u,e)}a=nt.fromString(t,i||40)}var s=O.getBestVersionForData(a,e);if(!s)throw new Error("The amount of data is too big to be stored in a QR Code");if(r){if(r<s)throw new Error("\\nThe chosen QR Code version cannot contain this amount of data.\\nMinimum version required to store current data is: "+s+".\\n")}else r=s;var f=at(r,e,a),h=o(r),c=new v(h);return function(t,r){for(var e=t.size,n=m(r),o=0;o<n.length;o++)for(var a=n[o][0],i=n[o][1],u=-1;u<=7;u++)if(!(a+u<=-1||e<=a+u))for(var s=-1;s<=7;s++)i+s<=-1||e<=i+s||(u>=0&&u<=6&&(0===s||6===s)||s>=0&&s<=6&&(0===u||6===u)||u>=2&&u<=4&&s>=2&&s<=4?t.set(a+u,i+s,!0,!0):t.set(a+u,i+s,!1,!0))}(c,r),function(t){for(var r=t.size,e=8;e<r-8;e++){var n=e%2==0;t.set(e,6,n,!0),t.set(6,e,n,!0)}}(c),function(t,r){for(var e=p.getPositions(r),n=0;n<e.length;n++)for(var o=e[n][0],a=e[n][1],i=-2;i<=2;i++)for(var u=-2;u<=2;u++)-2===i||2===i||-2===u||2===u||0===i&&0===u?t.set(o+i,a+u,!0,!0):t.set(o+i,a+u,!1,!0)}(c,r),ot(c,e,0),r>=7&&function(t,r){for(var e,n,o,a=t.size,i=O.getEncodedBits(r),u=0;u<18;u++)e=Math.floor(u/3),n=u%3+a-8-3,o=1==(i>>u&1),t.set(e,n,o,!0),t.set(n,e,o,!0)}(c,r),function(t,r){for(var e=t.size,n=-1,o=e-1,a=7,i=0,u=e-1;u>0;u-=2)for(6===u&&u--;;){for(var s=0;s<2;s++)if(!t.isReserved(o,u-s)){var f=!1;i<r.length&&(f=1==(r[i]>>>a&1)),t.set(o,u-s,f),-1===--a&&(i++,a=7)}if((o+=n)<0||e<=o){o-=n,n=-n;break}}}(c,f),isNaN(n)&&(n=E.getBestMask(c,ot.bind(null,c,e))),E.applyMask(n,c),ot(c,e,n),{modules:c,version:r,errorCorrectionLevel:e,maskPattern:n,segments:a}}nt.fromArray,nt.fromString,nt.rawSplit;var ut=function(t,r){if(void 0===t||""===t)throw new Error("No input text");var e,n,o=c.M;return void 0!==r&&(o=c.from(r.errorCorrectionLevel,c.M),e=O.from(r.version),n=E.from(r.maskPattern),r.toSJISFunc&&u(r.toSJISFunc)),it(t,e,o,n)},st=h((function(t,r){function e(t){if("number"==typeof t&&(t=t.toString()),"string"!=typeof t)throw new Error("Color should be defined as hex string");var r=t.slice().replace("#","").split("");if(r.length<3||5===r.length||r.length>8)throw new Error("Invalid hex color: "+t);3!==r.length&&4!==r.length||(r=Array.prototype.concat.apply([],r.map((function(t){return[t,t]})))),6===r.length&&r.push("F","F");var e=parseInt(r.join(""),16);return{r:e>>24&255,g:e>>16&255,b:e>>8&255,a:255&e,hex:"#"+r.slice(0,6).join("")}}r.getOptions=function(t){t||(t={}),t.color||(t.color={});var r=void 0===t.margin||null===t.margin||t.margin<0?4:t.margin,n=t.width&&t.width>=21?t.width:void 0,o=t.scale||4;return{width:n,scale:n?4:o,margin:r,color:{dark:e(t.color.dark||"#000000ff"),light:e(t.color.light||"#ffffffff")},type:t.type,rendererOpts:t.rendererOpts||{}}},r.getScale=function(t,r){return r.width&&r.width>=t+2*r.margin?r.width/(t+2*r.margin):r.scale},r.getImageWidth=function(t,e){var n=r.getScale(t,e);return Math.floor((t+2*e.margin)*n)},r.qrToImageData=function(t,e,n){for(var o=e.modules.size,a=e.modules.data,i=r.getScale(o,n),u=Math.floor((o+2*n.margin)*i),s=n.margin*i,f=[n.color.light,n.color.dark],h=0;h<u;h++)for(var c=0;c<u;c++){var g=4*(h*u+c),d=n.color.light;if(h>=s&&c>=s&&h<u-s&&c<u-s)d=f[a[Math.floor((h-s)/i)*o+Math.floor((c-s)/i)]?1:0];t[g++]=d.r,t[g++]=d.g,t[g++]=d.b,t[g]=d.a}}}));st.getOptions,st.getScale,st.getImageWidth,st.qrToImageData;var ft=h((function(t,r){r.render=function(t,r,e){var n=e,o=r;void 0!==n||r&&r.getContext||(n=r,r=void 0),r||(o=function(){try{return document.createElement("canvas")}catch(t){throw new Error("You need to specify a canvas element")}}()),n=st.getOptions(n);var a=st.getImageWidth(t.modules.size,n),i=o.getContext("2d"),u=i.createImageData(a,a);return st.qrToImageData(u.data,t,n),function(t,r,e){t.clearRect(0,0,r.width,r.height),r.style||(r.style={}),r.height=e,r.width=e,r.style.height=e+"px",r.style.width=e+"px"}(i,o,a),i.putImageData(u,0,0),o},r.renderToDataURL=function(t,e,n){var o=n;void 0!==o||e&&e.getContext||(o=e,e=void 0),o||(o={});var a=r.render(t,e,o),i=o.type||"image/png",u=o.rendererOpts||{};return a.toDataURL(i,u.quality)}}));function ht(t,r){var e=t.a/255,n=r+'="'+t.hex+'"';return e<1?n+" "+r+'-opacity="'+e.toFixed(2).slice(1)+'"':n}function ct(t,r,e){var n=t+r;return void 0!==e&&(n+=" "+e),n}ft.render,ft.renderToDataURL;var gt=function(t,r,e){var n=st.getOptions(r),o=t.modules.size,a=t.modules.data,i=o+2*n.margin,u=n.color.light.a?"<path "+ht(n.color.light,"fill")+' d="M0 0h'+i+"v"+i+'H0z"/>':"",s="<path "+ht(n.color.dark,"stroke")+' d="'+function(t,r,e){for(var n="",o=0,a=!1,i=0,u=0;u<t.length;u++){var s=Math.floor(u%r),f=Math.floor(u/r);s||a||(a=!0),t[u]?(i++,u>0&&s>0&&t[u-1]||(n+=a?ct("M",s+e,.5+f+e):ct("m",o,0),o=0,a=!1),s+1<r&&t[u+1]||(n+=ct("h",i),i=0)):o++}return n}(a,o,n.margin)+'"/>',f='viewBox="0 0 '+i+" "+i+'"',h='<svg xmlns="http://www.w3.org/2000/svg" '+(n.width?'width="'+n.width+'" height="'+n.width+'" ':"")+f+' shape-rendering="crispEdges">'+u+s+"</svg>\\n";return"function"==typeof e&&e(null,h),h};function dt(t,r,n,o,a){var i=[].slice.call(arguments,1),u=i.length,s="function"==typeof i[u-1];if(!s&&!e())throw new Error("Callback required as last argument");if(!s){if(u<1)throw new Error("Too few arguments provided");return 1===u?(n=r,r=o=void 0):2!==u||r.getContext||(o=n,n=r,r=void 0),new Promise((function(e,a){try{var i=ut(n,o);e(t(i,r,o))}catch(t){a(t)}}))}if(u<2)throw new Error("Too few arguments provided");2===u?(a=n,n=r,r=o=void 0):3===u&&(r.getContext&&void 0===a?(a=o,o=void 0):(a=o,o=n,n=r,r=void 0));try{var f=ut(n,o);a(null,t(f,r,o))}catch(t){a(t)}}var lt=ut,vt=dt.bind(null,ft.render),pt=dt.bind(null,ft.renderToDataURL),wt=dt.bind(null,(function(t,r,e){return gt(t,e)})),mt={create:lt,toCanvas:vt,toDataURL:pt,toString:wt};return t.create=lt,t.default=mt,t.toCanvas=vt,t.toDataURL=pt,t.toString=wt,Object.defineProperty(t,"__esModule",{value:!0}),t}({});</script>
  <style>
    *{box-sizing:border-box;}
    body{margin:0;background:#F4F1EA;font-family:'Quicksand',sans-serif;padding:24px;color:#2B2320;}
    .wrap{max-width:1040px;margin:0 auto;}
    .create-flex{display:flex;gap:24px;align-items:flex-start;}
    .form-col{flex:1;min-width:0;}
    ${previewStyles()}
    ${passwordModalStyles()}
    h1{font-family:'Baloo 2',sans-serif;font-size:22px;}
    h2{font-family:'Baloo 2',sans-serif;font-size:16px;margin-top:30px;}
    table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;font-size:13px;margin-bottom:10px;}
    th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #eee;white-space:nowrap;}
    th{font-size:12px;}
    th{background:#2B2320;color:white;}
    .card{background:white;border:2px solid #2B2320;border-radius:16px;padding:20px;margin-top:12px;}
    label{display:block;font-size:12px;font-weight:700;margin:10px 0 4px;}
    input[type=text], input[type=number], input[type=email]{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:14px;font-family:'Quicksand',sans-serif;}
    input[type=password]{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:14px;font-family:'Quicksand',sans-serif;}
    .pw-wrap{position:relative;}
    .pw-wrap input{padding-right:44px;}
    .pw-toggle{position:absolute;right:8px;top:8px;background:none!important;border:none!important;width:auto!important;padding:2px!important;font-size:17px;cursor:pointer;line-height:1;color:#2B2320!important;}
    input[type=color]{width:46px;height:42px;border:2px solid #2B2320;border-radius:10px;padding:2px;flex-shrink:0;}
    .color-field{display:flex;gap:6px;}
    .color-field input.colorHex{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:13px;font-family:monospace;text-transform:uppercase;}
    .color-row{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid #EEE9DF;}
    .color-row-label{flex:1;font-size:13px;color:#2B2320;}
    .color-row input[type=color]{width:38px;height:34px;flex-shrink:0;padding:2px;}
    .color-row input.colorHex{width:100px;flex-shrink:0;padding:7px 8px;border:2px solid #2B2320;border-radius:8px;font-size:12px;font-family:monospace;text-transform:uppercase;}
    input[type=file]{width:100%;font-size:12px;margin-top:4px;}
    select{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:14px;font-family:'Quicksand',sans-serif;background:white;}
    .colors{display:flex;flex-direction:column;gap:0;}
    .sellos{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    button{margin-top:18px;width:100%;padding:14px;border:2px solid #2B2320;border-radius:12px;background:#000000;color:#FFFFFF;font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;}
    .msg{text-align:center;font-size:13px;margin-top:12px;}
    .msg.ok{color:#215A34;} .msg.err{color:#B23A3A;}
    a.logout{float:right;font-size:12px;}
    a{color:#2B2320;}
  </style></head>
  <body>
    <div class="wrap">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
        <h1 style="white-space:nowrap;margin:0;">My Tapp by Anaelí Brand</h1>
        <div style="display:flex;align-items:center;gap:14px;">
          <button type="button" id="toggleSettingsBtn" style="width:auto;margin:0;padding:8px 14px;font-size:12px;background:#F4F1EA;color:#2B2320;">⚙️ Configuración</button>
          <a class="logout" href="/admin/logout" style="float:none;">Cerrar sesión</a>
        </div>
      </div>
      <div class="card" id="settingsCard" style="display:none;margin-top:14px;">
        <form id="pwForm">
          <label>Contraseña actual</label>
          <div class="pw-wrap">
            <input type="password" id="currentPassword" required>
            <button type="button" class="pw-toggle" data-target="currentPassword">👁</button>
          </div>
          <label>Nueva contraseña</label>
          <div class="pw-wrap">
            <input type="password" id="newPassword" required minlength="6">
            <button type="button" class="pw-toggle" data-target="newPassword">👁</button>
          </div>
          <button type="submit">Cambiar contraseña</button>
        </form>
        <p class="msg" id="pwMsg"></p>
      </div>

      <h2>Tus negocios (${results.length})</h2>
      <div style="overflow-x:auto;">
      <table>
        <tr><th>Editar<br>tarjeta</th><th>Negocio</th><th>Slug</th><th>Código<br>QR</th><th>PIN</th><th>Ver<br>PIN</th><th>Panel<br>staff</th><th>Link<br>registro</th><th>Suscripción</th><th>Estado<br>de pago</th><th>Borrar</th></tr>
        ${rows || '<tr><td colspan="11">Todavía no has creado ningún negocio</td></tr>'}
      </table>
      </div>
      <p id="deleteMsg" class="msg"></p>

      <h2>Crear negocio nuevo</h2>
      <div class="create-flex">
      <div class="form-col">
      <div class="card">
        <form id="bizForm">
          <label>Nombre del negocio</label>
          <input type="text" id="name" required placeholder="Ej. Cloud's Cookies">

          <label>Slug (va en el link, sin espacios ni tildes)</label>
          <input type="text" id="slug" required placeholder="Ej. cloudscookies">

          <label>Logo (imagen con fondo transparente)</label>
          <input type="file" id="logo" accept="image/*" required>

          <label>Sellos (solo el primero es obligatorio, los demás son opcionales)</label>
          <div class="sellos">
            <input type="file" id="sello1" accept="image/*" required>
            <input type="file" id="sello2" accept="image/*">
            <input type="file" id="sello3" accept="image/*">
            <input type="file" id="sello4" accept="image/*">
          </div>

          <label>Colores de marca</label>
          ${colorGroupsHtml(null)}

          <label>Tipografía</label>
          <select id="font_family">
            <option value="Baloo 2" style="font-family:'Baloo 2','Arial Rounded MT Bold',sans-serif;">Baloo 2 — Redondeada y divertida</option>
            <option value="Poppins" style="font-family:'Poppins',sans-serif;">Poppins — Moderna y minimalista</option>
            <option value="Playfair Display" style="font-family:'Playfair Display',serif;">Playfair Display — Elegante y clásica</option>
            <option value="Montserrat" style="font-family:'Montserrat',sans-serif;">Montserrat — Seria y corporativa</option>
            <option value="Caveat" style="font-family:'Caveat',cursive;">Caveat — Manuscrita y artesanal</option>
            <option value="Amiko" style="font-family:'Amiko',sans-serif;">Amiko — Limpia y legible</option>
          </select>

          <label>Estilo del saludo (ej. "¡Hello!")</label>
          <div style="display:flex;gap:16px;margin-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="eyebrow_bold" checked style="width:auto;margin:0;"> Negrita</label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="eyebrow_italic" style="width:auto;margin:0;"> Cursiva</label>
          </div>

          <label>Estilo del nombre del cliente</label>
          <div style="display:flex;gap:16px;margin-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="font_bold" checked style="width:auto;margin:0;"> Negrita</label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="font_italic" style="width:auto;margin:0;"> Cursiva</label>
          </div>

          <label>Estilo del bloque "Tu premio"</label>
          <div style="display:flex;gap:16px;margin-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="reward_bold" checked style="width:auto;margin:0;"> Negrita</label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="reward_italic" style="width:auto;margin:0;"> Cursiva</label>
          </div>

          <label>Cuántos sellos para el premio</label>
          <input type="number" id="total_stamps" value="10" min="3" max="30" required>

          <label>Saludo (arriba del nombre)</label>
          <input type="text" id="greeting_eyebrow" value="¡Hello!">

          <label>Título del premio</label>
          <input type="text" id="reward_heading" value="Tu premio, cada vez más cerca">

          <label>Texto del premio</label>
          <input type="text" id="reward_text" required placeholder="Ej. Al llegar a tu sello #10, recibes tu producto gratis.">

          <label>Instrucción para sumar sellos</label>
          <select id="instruction_text">
            <option value="Muestra este código en caja para sumar tu sello en cada compra.">Negocio físico: mostrar en caja</option>
            <option value="Muestra este código al momento de pagar para sumar tu sello.">Negocio físico: mostrar al pagar</option>
            <option value="Envía este código al confirmar tu pedido para sumar tu sello.">Negocio digital: al confirmar pedido</option>
            <option value="Pega este código en el chat al hacer tu compra.">Negocio digital: pegar en el chat</option>
            <option value="Envía una captura de este código junto a tu comprobante de pago.">Negocio digital: junto al comprobante</option>
          </select>

          <label>Instagram (usuario)</label>
          <input type="text" id="instagram_handle" placeholder="@usuario">

          <label>Instagram (link completo)</label>
          <input type="text" id="instagram_url" placeholder="https://www.instagram.com/usuario">

          <label>PIN para el staff de este negocio (4-6 dígitos)</label>
          <input type="text" id="pin" required placeholder="Ej. 1234">

          <label>Tu recordatorio de este PIN (solo tú lo ves, con tu contraseña)</label>
          <input type="text" id="pin_note" placeholder="Ej. mismo que arriba, o alguna nota para ti">

          <button type="submit">Crear negocio</button>
        </form>
        <p class="msg" id="msg"></p>
      </div>
      </div>

      ${previewPanelHtml(null, null)}
      </div>
    </div>
    ${passwordModalHtml()}
    <script>
      document.getElementById('toggleSettingsBtn').addEventListener('click', () => {
        const card = document.getElementById('settingsCard');
        const showing = card.style.display !== 'none';
        card.style.display = showing ? 'none' : 'block';
      });
      document.querySelectorAll('.delete-biz').forEach(link => {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          const slug = link.dataset.slug;
          const name = link.dataset.name;
          const password = await askPassword('Esto borra "' + name + '" y a TODOS sus clientes registrados, para siempre.\\n\\nPara confirmar, escribe tu contraseña de administradora:');
          if (password === null) return;
          const deleteMsg = document.getElementById('deleteMsg');
          deleteMsg.textContent = 'Borrando...'; deleteMsg.className = 'msg';
          const res = await fetch('/admin/business/' + slug + '/delete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password }) });
          if (res.ok) { location.reload(); }
          else { const d = await res.json(); deleteMsg.textContent = d.error || 'No se pudo borrar'; deleteMsg.className = 'msg err'; }
        });
      });
      document.querySelectorAll('.reveal-pin').forEach(link => {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          const cell = link.closest('.pin-cell');
          const slug = cell.dataset.slug;
          const password = await askPassword('Escribe tu contraseña de administradora para ver el PIN de este negocio:');
          if (password === null) return;
          const res = await fetch('/admin/business/' + slug + '/reveal-pin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password }) });
          const data = await res.json();
          if (res.ok) {
            cell.textContent = '🔓 ' + data.pin;
          } else {
            alert(data.error || 'No se pudo ver el PIN');
          }
        });
      });
      document.querySelectorAll('.last-payment-input').forEach(input => {
        input.addEventListener('change', () => {
          const cell = input.closest('.payment-cell');
          const nextInput = cell.querySelector('.next-payment-input');
          if (input.value && !nextInput.value) {
            const d = new Date(input.value + 'T00:00:00');
            d.setMonth(d.getMonth() + 1);
            nextInput.value = d.toISOString().slice(0, 10);
          }
        });
      });
      document.querySelectorAll('.save-payment-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const cell = btn.closest('.payment-cell');
          const slug = cell.dataset.slug;
          const last_payment_date = cell.querySelector('.last-payment-input').value;
          const next_payment_date = cell.querySelector('.next-payment-input').value;
          btn.textContent = 'Guardando...';
          const res = await fetch('/admin/business/' + slug + '/payment', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ last_payment_date, next_payment_date }) });
          if (res.ok) { location.reload(); } else { btn.textContent = 'Error, reintenta'; }
        });
      });
      document.querySelectorAll('.toggle-suspend').forEach(link => {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          const slug = link.dataset.slug;
          const isSuspended = link.dataset.suspended === '1';
          const action = isSuspended ? 'activar' : 'suspender';
          if (!confirm('¿Seguro que quieres ' + action + ' este negocio?' + (isSuspended ? '' : ' Su staff no va a poder sellar hasta que lo actives de nuevo.'))) return;
          const res = await fetch('/admin/business/' + slug + '/toggle-suspend', { method: 'POST' });
          if (res.ok) { location.reload(); } else { alert('No se pudo cambiar el estado'); }
        });
      });
      document.querySelectorAll('.download-qr').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          if (typeof QRCode === 'undefined') { alert('No se pudo generar el QR, intenta recargar la página.'); return; }
          const slug = link.dataset.slug;
          const name = link.dataset.name;
          const url = location.origin + '/' + slug + '/nuevo';
          const canvas = document.createElement('canvas');
          QRCode.toCanvas(canvas, url, { width: 800, margin: 3, color: { dark: '#000000', light: '#FFFFFF' } }, (err) => {
            if (err) { alert('No se pudo generar el QR: ' + err.message); return; }
            const link2 = document.createElement('a');
            link2.download = 'QR_' + name.replace(/[^a-z0-9]+/gi, '_') + '.png';
            link2.href = canvas.toDataURL('image/png');
            link2.click();
          });
        });
      });
      document.querySelectorAll('.unlock-biz').forEach(link => {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          const slug = link.dataset.slug;
          const res = await fetch('/admin/business/' + slug + '/unlock', { method: 'POST' });
          if (res.ok) { location.reload(); }
          else { alert('No se pudo desbloquear, intenta de nuevo.'); }
        });
      });
      function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      document.querySelectorAll('.colorPicker').forEach(picker => {
        const hexInput = document.getElementById(picker.id + '_hex');
        picker.addEventListener('input', () => { hexInput.value = picker.value.toUpperCase(); });
        hexInput.addEventListener('input', () => {
          let v = hexInput.value.trim();
          if (v && v[0] !== '#') v = '#' + v;
          if (/^#[0-9A-Fa-f]{6}$/.test(v)) { picker.value = v; hexInput.style.borderColor = '#2B2320'; }
          else { hexInput.style.borderColor = '#B23A3A'; }
        });
        hexInput.addEventListener('blur', () => { hexInput.value = picker.value.toUpperCase(); hexInput.style.borderColor = '#2B2320'; });
      });

      document.getElementById('pwForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const pwMsg = document.getElementById('pwMsg');
        pwMsg.textContent = 'Actualizando...'; pwMsg.className = 'msg';
        const res = await fetch('/admin/cambiar-password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ currentPassword, newPassword }) });
        const data = await res.json();
        if (res.ok) {
          pwMsg.textContent = '✅ Contraseña actualizada'; pwMsg.className = 'msg ok';
          document.getElementById('pwForm').reset();
        } else {
          pwMsg.textContent = data.error || 'No se pudo cambiar'; pwMsg.className = 'msg err';
        }
      });

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
            sello_2_base64: s2 ? await fileToBase64(s2) : null,
            sello_3_base64: s3 ? await fileToBase64(s3) : null,
            sello_4_base64: s4 ? await fileToBase64(s4) : null,
            font_family: document.getElementById('font_family').value,
            font_bold: document.getElementById('font_bold').checked,
            font_italic: document.getElementById('font_italic').checked,
            eyebrow_bold: document.getElementById('eyebrow_bold').checked,
            eyebrow_italic: document.getElementById('eyebrow_italic').checked,
            reward_bold: document.getElementById('reward_bold').checked,
            reward_italic: document.getElementById('reward_italic').checked,
            instruction_text: document.getElementById('instruction_text').value,
            total_stamps: Number(document.getElementById('total_stamps').value),
            greeting_eyebrow: document.getElementById('greeting_eyebrow').value,
            reward_heading: document.getElementById('reward_heading').value,
            reward_text: document.getElementById('reward_text').value,
            instagram_handle: document.getElementById('instagram_handle').value,
            instagram_url: document.getElementById('instagram_url').value,
            pin: document.getElementById('pin').value,
            pin_note: document.getElementById('pin_note').value
          };
          document.querySelectorAll('.colorPicker').forEach(picker => { payload[picker.id] = picker.value; });
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
      ${previewScript(null)}
      ${passwordModalScript()}
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
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await sha256Hex(recoveryCode);
  await env.DB.prepare('INSERT INTO admins (email, password_hash, recovery_code_hash) VALUES (?, ?, ?)')
    .bind(email.trim().toLowerCase(), passwordHash, recoveryCodeHash).run();
  return new Response(JSON.stringify({ ok: true, recoveryCode }), { headers: { 'Content-Type': 'application/json' } });
}

function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const hex = bytesToHex(bytes).toUpperCase();
  return hex.match(/.{1,4}/g).join('-'); // ej. 4F2A-9C1B-77E0-...
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

function renderAdminRecoverForm() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperar cuenta · My Tapp</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${adminBaseStyles()}</style></head>
  <body>
    <div class="box">
      <h1>Recuperar cuenta</h1>
      <p class="sub">Escribe tu correo y el código de recuperación que guardaste cuando creaste tu cuenta.</p>
      <form id="f">
        <input type="email" id="email" placeholder="Tu correo" required>
        <input type="text" id="code" placeholder="Código de recuperación" required>
        <div class="pw-wrap">
          <input type="password" id="password" placeholder="Nueva contraseña (mínimo 6 caracteres)" required minlength="6">
          <button type="button" class="pw-toggle" data-target="password">👁</button>
        </div>
        <button type="submit">Restablecer contraseña</button>
      </form>
      <p class="msg" id="msg"></p>
      <p class="sub"><a href="/admin">← Volver a entrar</a></p>
    </div>
    <script>
      document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = document.getElementById(btn.dataset.target);
          if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
          else { input.type = 'password'; btn.textContent = '👁'; }
        });
      });
      document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const code = document.getElementById('code').value.trim();
        const password = document.getElementById('password').value;
        const msg = document.getElementById('msg');
        msg.textContent = 'Verificando...'; msg.className = 'msg';
        const res = await fetch('/admin/recuperar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, code, password }) });
        if (res.ok) { msg.textContent = '✅ Contraseña actualizada. Ya puedes entrar.'; msg.className = 'msg ok'; }
        else { const d = await res.json(); msg.textContent = d.error || 'Código o correo incorrectos'; msg.className = 'msg err'; }
      });
    </script>
  </body></html>`;
}

async function handleAdminRecover(request, env) {
  const { email, code, password } = await request.json();
  if (!password || password.length < 6) {
    return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind((email || '').trim().toLowerCase()).first();
  if (!admin || !admin.recovery_code_hash) {
    return new Response(JSON.stringify({ error: 'Correo o código incorrectos' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const codeHash = await sha256Hex((code || '').trim().toUpperCase());
  if (codeHash !== admin.recovery_code_hash) {
    return new Response(JSON.stringify({ error: 'Correo o código incorrectos' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const newHash = await hashPassword(password);
  await env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(newHash, admin.id).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleAdminChangePassword(request, env) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const { currentPassword, newPassword } = await request.json();
  if (!(await verifyPassword(currentPassword || '', admin.password_hash))) {
    return new Response(JSON.stringify({ error: 'Tu contraseña actual no es correcta' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (!newPassword || newPassword.length < 6) {
    return new Response(JSON.stringify({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const newHash = await hashPassword(newPassword);
  await env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(newHash, admin.id).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
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
  if (['admin', 'staff', 'nuevo', 'api', 'www', 'null', 'undefined'].includes(slug)) {
    return new Response(JSON.stringify({ error: 'Ese slug está reservado, usa otro' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const existing = await env.DB.prepare('SELECT id FROM businesses WHERE slug = ?').bind(slug).first();
  if (existing) {
    return new Response(JSON.stringify({ error: 'Ya existe un negocio con ese slug' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const pinHash = await sha256Hex(body.pin);

  // los sellos 2, 3 y 4 son opcionales: si faltan, se repite el anterior disponible
  const sello1 = body.sello_1_base64;
  const sello2 = body.sello_2_base64 || sello1;
  const sello3 = body.sello_3_base64 || sello2;
  const sello4 = body.sello_4_base64 || sello3;
  const fontFamily = FONTS[body.font_family] ? body.font_family : 'Baloo 2';

  // columnas con valor fijo/calculado
  const fixedFields = {
    slug, name: body.name, logo_base64: body.logo_base64,
    sello_1_base64: sello1, sello_2_base64: sello2, sello_3_base64: sello3, sello_4_base64: sello4,
    font_family: fontFamily, total_stamps: sanitizeTotalStamps(body.total_stamps, 10),
    greeting_eyebrow: body.greeting_eyebrow || '¡Hello!', reward_heading: body.reward_heading || 'Tu premio, cada vez más cerca',
    reward_text: body.reward_text, reward_emoji: '⭐',
    instagram_handle: body.instagram_handle || null, instagram_url: normalizeExternalUrl(body.instagram_url), staff_pin_hash: pinHash,
    staff_pin_note: body.pin_note || null,
    instruction_text: body.instruction_text || 'Muestra este código en caja para sumar tu sello en cada compra.',
  };
  // casillas de negrita/cursiva, por bloque
  const boldFields = { font_bold: 1, font_italic: 0, eyebrow_bold: 1, eyebrow_italic: 0, reward_bold: 1, reward_italic: 0 };
  for (const key of Object.keys(boldFields)) fixedFields[key] = body[key] ? 1 : 0;
  // todos los colores individuales, con su valor por defecto
  const colorDefaults = {
    color_page_bg: '#DCEAF4', color_card_bg: '#FFFCF5', color_brown: '#593212', color_brown_deep: '#3E2107', color_brown_soft: '#8A5A34',
    color_pink: '#F4D3DF', color_butter_mid: '#F9E6B2', color_butter_light: '#FBEFD2',
    color_stamp_bg: '#593212', color_qr_bg: '#F4D3DF', color_instagram_bg: '#DCEAF4',
    color_reward_text: '#593212', color_reward_heading: '#593212',
    color_border_card: '#593212', color_border_progress: '#593212', color_border_stamp_ring: '#FFF8EC', color_border_reward: '#593212', color_border_qr: '#593212',
    color_text_progress_pct: '#593212', color_text_progress_label: '#8A5A34', color_text_progress_number: '#593212',
    color_text_qr_code: '#593212', color_text_qr_instruction: '#8A5A34', color_text_instagram: '#593212', color_text_credit: '#593212',
    color_qr_pattern_dark: '#593212', color_qr_pattern_light: '#F4D3DF',
  };
  for (const key of Object.keys(colorDefaults)) fixedFields[key] = sanitizeColor(body[key], colorDefaults[key]);

  const columns = Object.keys(fixedFields);
  const placeholders = columns.map(() => '?').join(',');
  await env.DB.prepare(`INSERT INTO businesses (${columns.join(', ')}) VALUES (${placeholders})`)
    .bind(...columns.map(c => fixedFields[c]))
    .run();

  return new Response(JSON.stringify({ ok: true, slug }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleDeleteBusiness(request, env, slug) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const { password } = await request.json().catch(() => ({}));
  if (!(await verifyPassword(password || '', admin.password_hash))) {
    return new Response(JSON.stringify({ error: 'Contraseña incorrecta, no se borró nada' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  // se borra en orden: primero la bitácora de visitas, luego los clientes, y al final el negocio
  await env.DB.prepare('DELETE FROM visits WHERE business_id = ?').bind(business.id).run();
  await env.DB.prepare('DELETE FROM customers WHERE business_id = ?').bind(business.id).run();
  await env.DB.prepare('DELETE FROM businesses WHERE id = ?').bind(business.id).run();

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleRevealPin(request, env, slug) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const { password } = await request.json().catch(() => ({}));
  if (!(await verifyPassword(password || '', admin.password_hash))) {
    return new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ ok: true, pin: business.staff_pin_note || '(no lo has anotado todavía)' }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleUpdatePinNote(request, env, slug) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const { password, note } = await request.json().catch(() => ({}));
  if (!(await verifyPassword(password || '', admin.password_hash))) {
    return new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  await env.DB.prepare('UPDATE businesses SET staff_pin_note = ? WHERE id = ?').bind(note || null, business.id).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleUpdatePayment(request, env, slug) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const { last_payment_date, next_payment_date } = await request.json().catch(() => ({}));
  await env.DB.prepare('UPDATE businesses SET last_payment_date = ?, next_payment_date = ? WHERE id = ?')
    .bind(last_payment_date || null, next_payment_date || null, business.id).run();

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleToggleSuspend(request, env, slug) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const newValue = business.is_suspended ? 0 : 1;
  await env.DB.prepare('UPDATE businesses SET is_suspended = ? WHERE id = ?').bind(newValue, business.id).run();

  return new Response(JSON.stringify({ ok: true, is_suspended: newValue }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleUnlockBusiness(request, env, slug) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  await env.DB.prepare('UPDATE businesses SET staff_login_fails = 0, staff_login_locked_until = NULL WHERE id = ?').bind(business.id).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleEditBusinessForm(request, env, slug) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(renderAdminLogin(), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });

  const b = await getBusiness(env, slug);
  if (!b) return new Response('Negocio no encontrado', { status: 404 });

  const fontOptions = Object.keys(FONTS).map(key =>
    `<option value="${key}" style="font-family:'${key}',${FONTS[key].fallback};"${b.font_family === key ? ' selected' : ''}>${key} — ${FONTS[key].label}</option>`
  ).join('');
  const allFontsGoogleParams = Object.values(FONTS).map(f => f.google).join('&family=');

  return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Editar ${escapeHtml(b.name)} · My Tapp</title>
  <link href="https://fonts.googleapis.com/css2?family=${allFontsGoogleParams}&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<script>var QRCode=function(t){"use strict";var r,e=function(){return"function"==typeof Promise&&Promise.prototype&&Promise.prototype.then},n=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706],o=function(t){if(!t)throw new Error('"version" cannot be null or undefined');if(t<1||t>40)throw new Error('"version" should be in range from 1 to 40');return 4*t+17},a=function(t){return n[t]},i=function(t){for(var r=0;0!==t;)r++,t>>>=1;return r},u=function(t){if("function"!=typeof t)throw new Error('"toSJISFunc" is not a valid function.');r=t},s=function(){return void 0!==r},f=function(t){return r(t)};function h(t,r){return t(r={exports:{}},r.exports),r.exports}var c=h((function(t,r){r.L={bit:1},r.M={bit:0},r.Q={bit:3},r.H={bit:2},r.isValid=function(t){return t&&void 0!==t.bit&&t.bit>=0&&t.bit<4},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"l":case"low":return r.L;case"m":case"medium":return r.M;case"q":case"quartile":return r.Q;case"h":case"high":return r.H;default:throw new Error("Unknown EC Level: "+t)}}(t)}catch(t){return e}}}));function g(){this.buffer=[],this.length=0}c.L,c.M,c.Q,c.H,c.isValid,g.prototype={get:function(t){var r=Math.floor(t/8);return 1==(this.buffer[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e++)this.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return this.length},putBit:function(t){var r=Math.floor(this.length/8);this.buffer.length<=r&&this.buffer.push(0),t&&(this.buffer[r]|=128>>>this.length%8),this.length++}};var d=g;function l(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}l.prototype.set=function(t,r,e,n){var o=t*this.size+r;this.data[o]=e,n&&(this.reservedBit[o]=!0)},l.prototype.get=function(t,r){return this.data[t*this.size+r]},l.prototype.xor=function(t,r,e){this.data[t*this.size+r]^=e},l.prototype.isReserved=function(t,r){return this.reservedBit[t*this.size+r]};var v=l,p=h((function(t,r){var e=o;r.getRowColCoords=function(t){if(1===t)return[];for(var r=Math.floor(t/7)+2,n=e(t),o=145===n?26:2*Math.ceil((n-13)/(2*r-2)),a=[n-7],i=1;i<r-1;i++)a[i]=a[i-1]-o;return a.push(6),a.reverse()},r.getPositions=function(t){for(var e=[],n=r.getRowColCoords(t),o=n.length,a=0;a<o;a++)for(var i=0;i<o;i++)0===a&&0===i||0===a&&i===o-1||a===o-1&&0===i||e.push([n[a],n[i]]);return e}}));p.getRowColCoords,p.getPositions;var w=o,m=function(t){var r=w(t);return[[0,0],[r-7,0],[0,r-7]]},E=h((function(t,r){r.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var e=3,n=3,o=40,a=10;function i(t,e,n){switch(t){case r.Patterns.PATTERN000:return(e+n)%2==0;case r.Patterns.PATTERN001:return e%2==0;case r.Patterns.PATTERN010:return n%3==0;case r.Patterns.PATTERN011:return(e+n)%3==0;case r.Patterns.PATTERN100:return(Math.floor(e/2)+Math.floor(n/3))%2==0;case r.Patterns.PATTERN101:return e*n%2+e*n%3==0;case r.Patterns.PATTERN110:return(e*n%2+e*n%3)%2==0;case r.Patterns.PATTERN111:return(e*n%3+(e+n)%2)%2==0;default:throw new Error("bad maskPattern:"+t)}}r.isValid=function(t){return null!=t&&""!==t&&!isNaN(t)&&t>=0&&t<=7},r.from=function(t){return r.isValid(t)?parseInt(t,10):void 0},r.getPenaltyN1=function(t){for(var r=t.size,n=0,o=0,a=0,i=null,u=null,s=0;s<r;s++){o=a=0,i=u=null;for(var f=0;f<r;f++){var h=t.get(s,f);h===i?o++:(o>=5&&(n+=e+(o-5)),i=h,o=1),(h=t.get(f,s))===u?a++:(a>=5&&(n+=e+(a-5)),u=h,a=1)}o>=5&&(n+=e+(o-5)),a>=5&&(n+=e+(a-5))}return n},r.getPenaltyN2=function(t){for(var r=t.size,e=0,o=0;o<r-1;o++)for(var a=0;a<r-1;a++){var i=t.get(o,a)+t.get(o,a+1)+t.get(o+1,a)+t.get(o+1,a+1);4!==i&&0!==i||e++}return e*n},r.getPenaltyN3=function(t){for(var r=t.size,e=0,n=0,a=0,i=0;i<r;i++){n=a=0;for(var u=0;u<r;u++)n=n<<1&2047|t.get(i,u),u>=10&&(1488===n||93===n)&&e++,a=a<<1&2047|t.get(u,i),u>=10&&(1488===a||93===a)&&e++}return e*o},r.getPenaltyN4=function(t){for(var r=0,e=t.data.length,n=0;n<e;n++)r+=t.data[n];return Math.abs(Math.ceil(100*r/e/5)-10)*a},r.applyMask=function(t,r){for(var e=r.size,n=0;n<e;n++)for(var o=0;o<e;o++)r.isReserved(o,n)||r.xor(o,n,i(t,o,n))},r.getBestMask=function(t,e){for(var n=Object.keys(r.Patterns).length,o=0,a=1/0,i=0;i<n;i++){e(i),r.applyMask(i,t);var u=r.getPenaltyN1(t)+r.getPenaltyN2(t)+r.getPenaltyN3(t)+r.getPenaltyN4(t);r.applyMask(i,t),u<a&&(a=u,o=i)}return o}}));E.Patterns,E.isValid,E.getPenaltyN1,E.getPenaltyN2,E.getPenaltyN3,E.getPenaltyN4,E.applyMask,E.getBestMask;var y=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],A=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430],I=function(t,r){switch(r){case c.L:return y[4*(t-1)+0];case c.M:return y[4*(t-1)+1];case c.Q:return y[4*(t-1)+2];case c.H:return y[4*(t-1)+3];default:return}},M=function(t,r){switch(r){case c.L:return A[4*(t-1)+0];case c.M:return A[4*(t-1)+1];case c.Q:return A[4*(t-1)+2];case c.H:return A[4*(t-1)+3];default:return}},N=new Uint8Array(512),B=new Uint8Array(256);!function(){for(var t=1,r=0;r<255;r++)N[r]=t,B[t]=r,256&(t<<=1)&&(t^=285);for(var e=255;e<512;e++)N[e]=N[e-255]}();var C=function(t){return N[t]},P=function(t,r){return 0===t||0===r?0:N[B[t]+B[r]]},R=h((function(t,r){r.mul=function(t,r){for(var e=new Uint8Array(t.length+r.length-1),n=0;n<t.length;n++)for(var o=0;o<r.length;o++)e[n+o]^=P(t[n],r[o]);return e},r.mod=function(t,r){for(var e=new Uint8Array(t);e.length-r.length>=0;){for(var n=e[0],o=0;o<r.length;o++)e[o]^=P(r[o],n);for(var a=0;a<e.length&&0===e[a];)a++;e=e.slice(a)}return e},r.generateECPolynomial=function(t){for(var e=new Uint8Array([1]),n=0;n<t;n++)e=r.mul(e,new Uint8Array([1,C(n)]));return e}}));function T(t){this.genPoly=void 0,this.degree=t,this.degree&&this.initialize(this.degree)}R.mul,R.mod,R.generateECPolynomial,T.prototype.initialize=function(t){this.degree=t,this.genPoly=R.generateECPolynomial(this.degree)},T.prototype.encode=function(t){if(!this.genPoly)throw new Error("Encoder not initialized");var r=new Uint8Array(t.length+this.degree);r.set(t);var e=R.mod(r,this.genPoly),n=this.degree-e.length;if(n>0){var o=new Uint8Array(this.degree);return o.set(e,n),o}return e};var L=T,b=function(t){return!isNaN(t)&&t>=1&&t<=40},U="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+",x="(?:(?![A-Z0-9 $%*+\\\\-./:]|"+(U=U.replace(/u/g,"\\\\u"))+")(?:.|[\\r\\n]))+",k=new RegExp(U,"g"),F=new RegExp("[^A-Z0-9 $%*+\\\\-./:]+","g"),S=new RegExp(x,"g"),D=new RegExp("[0-9]+","g"),Y=new RegExp("[A-Z $%*+\\\\-./:]+","g"),_=new RegExp("^"+U+"$"),z=new RegExp("^[0-9]+$"),H=new RegExp("^[A-Z0-9 $%*+\\\\-./:]+$"),J={KANJI:k,BYTE_KANJI:F,BYTE:S,NUMERIC:D,ALPHANUMERIC:Y,testKanji:function(t){return _.test(t)},testNumeric:function(t){return z.test(t)},testAlphanumeric:function(t){return H.test(t)}},K=h((function(t,r){r.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},r.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},r.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},r.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},r.MIXED={bit:-1},r.getCharCountIndicator=function(t,r){if(!t.ccBits)throw new Error("Invalid mode: "+t);if(!b(r))throw new Error("Invalid version: "+r);return r>=1&&r<10?t.ccBits[0]:r<27?t.ccBits[1]:t.ccBits[2]},r.getBestModeForData=function(t){return J.testNumeric(t)?r.NUMERIC:J.testAlphanumeric(t)?r.ALPHANUMERIC:J.testKanji(t)?r.KANJI:r.BYTE},r.toString=function(t){if(t&&t.id)return t.id;throw new Error("Invalid mode")},r.isValid=function(t){return t&&t.bit&&t.ccBits},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return r.NUMERIC;case"alphanumeric":return r.ALPHANUMERIC;case"kanji":return r.KANJI;case"byte":return r.BYTE;default:throw new Error("Unknown mode: "+t)}}(t)}catch(t){return e}}}));K.NUMERIC,K.ALPHANUMERIC,K.BYTE,K.KANJI,K.MIXED,K.getCharCountIndicator,K.getBestModeForData,K.isValid;var O=h((function(t,r){var e=i(7973);function n(t,r){return K.getCharCountIndicator(t,r)+4}function o(t,r){var e=0;return t.forEach((function(t){var o=n(t.mode,r);e+=o+t.getBitsLength()})),e}r.from=function(t,r){return b(t)?parseInt(t,10):r},r.getCapacity=function(t,r,e){if(!b(t))throw new Error("Invalid QR Code version");void 0===e&&(e=K.BYTE);var o=8*(a(t)-M(t,r));if(e===K.MIXED)return o;var i=o-n(e,t);switch(e){case K.NUMERIC:return Math.floor(i/10*3);case K.ALPHANUMERIC:return Math.floor(i/11*2);case K.KANJI:return Math.floor(i/13);case K.BYTE:default:return Math.floor(i/8)}},r.getBestVersionForData=function(t,e){var n,a=c.from(e,c.M);if(Array.isArray(t)){if(t.length>1)return function(t,e){for(var n=1;n<=40;n++){if(o(t,n)<=r.getCapacity(n,e,K.MIXED))return n}}(t,a);if(0===t.length)return 1;n=t[0]}else n=t;return function(t,e,n){for(var o=1;o<=40;o++)if(e<=r.getCapacity(o,n,t))return o}(n.mode,n.getLength(),a)},r.getEncodedBits=function(t){if(!b(t)||t<7)throw new Error("Invalid QR Code version");for(var r=t<<12;i(r)-e>=0;)r^=7973<<i(r)-e;return t<<12|r}}));O.getCapacity,O.getBestVersionForData,O.getEncodedBits;var Q=i(1335),V=function(t,r){for(var e=t.bit<<3|r,n=e<<10;i(n)-Q>=0;)n^=1335<<i(n)-Q;return 21522^(e<<10|n)};function q(t){this.mode=K.NUMERIC,this.data=t.toString()}q.getBitsLength=function(t){return 10*Math.floor(t/3)+(t%3?t%3*3+1:0)},q.prototype.getLength=function(){return this.data.length},q.prototype.getBitsLength=function(){return q.getBitsLength(this.data.length)},q.prototype.write=function(t){var r,e,n;for(r=0;r+3<=this.data.length;r+=3)e=this.data.substr(r,3),n=parseInt(e,10),t.put(n,10);var o=this.data.length-r;o>0&&(e=this.data.substr(r),n=parseInt(e,10),t.put(n,3*o+1))};var j=q,$=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function X(t){this.mode=K.ALPHANUMERIC,this.data=t}X.getBitsLength=function(t){return 11*Math.floor(t/2)+t%2*6},X.prototype.getLength=function(){return this.data.length},X.prototype.getBitsLength=function(){return X.getBitsLength(this.data.length)},X.prototype.write=function(t){var r;for(r=0;r+2<=this.data.length;r+=2){var e=45*$.indexOf(this.data[r]);e+=$.indexOf(this.data[r+1]),t.put(e,11)}this.data.length%2&&t.put($.indexOf(this.data[r]),6)};var Z=X;function W(t){this.mode=K.BYTE,"string"==typeof t&&(t=function(t){for(var r=[],e=t.length,n=0;n<e;n++){var o=t.charCodeAt(n);if(o>=55296&&o<=56319&&e>n+1){var a=t.charCodeAt(n+1);a>=56320&&a<=57343&&(o=1024*(o-55296)+a-56320+65536,n+=1)}o<128?r.push(o):o<2048?(r.push(o>>6|192),r.push(63&o|128)):o<55296||o>=57344&&o<65536?(r.push(o>>12|224),r.push(o>>6&63|128),r.push(63&o|128)):o>=65536&&o<=1114111?(r.push(o>>18|240),r.push(o>>12&63|128),r.push(o>>6&63|128),r.push(63&o|128)):r.push(239,191,189)}return new Uint8Array(r).buffer}(t)),this.data=new Uint8Array(t)}W.getBitsLength=function(t){return 8*t},W.prototype.getLength=function(){return this.data.length},W.prototype.getBitsLength=function(){return W.getBitsLength(this.data.length)},W.prototype.write=function(t){for(var r=0,e=this.data.length;r<e;r++)t.put(this.data[r],8)};var G=W;function tt(t){this.mode=K.KANJI,this.data=t}tt.getBitsLength=function(t){return 13*t},tt.prototype.getLength=function(){return this.data.length},tt.prototype.getBitsLength=function(){return tt.getBitsLength(this.data.length)},tt.prototype.write=function(t){var r;for(r=0;r<this.data.length;r++){var e=f(this.data[r]);if(e>=33088&&e<=40956)e-=33088;else{if(!(e>=57408&&e<=60351))throw new Error("Invalid SJIS character: "+this.data[r]+"\\nMake sure your charset is UTF-8");e-=49472}e=192*(e>>>8&255)+(255&e),t.put(e,13)}};var rt=tt,et=h((function(t){var r={single_source_shortest_paths:function(t,e,n){var o={},a={};a[e]=0;var i,u,s,f,h,c,g,d=r.PriorityQueue.make();for(d.push(e,0);!d.empty();)for(s in u=(i=d.pop()).value,f=i.cost,h=t[u]||{})h.hasOwnProperty(s)&&(c=f+h[s],g=a[s],(void 0===a[s]||g>c)&&(a[s]=c,d.push(s,c),o[s]=u));if(void 0!==n&&void 0===a[n]){var l=["Could not find a path from ",e," to ",n,"."].join("");throw new Error(l)}return o},extract_shortest_path_from_predecessor_list:function(t,r){for(var e=[],n=r;n;)e.push(n),n=t[n];return e.reverse(),e},find_path:function(t,e,n){var o=r.single_source_shortest_paths(t,e,n);return r.extract_shortest_path_from_predecessor_list(o,n)},PriorityQueue:{make:function(t){var e,n=r.PriorityQueue,o={};for(e in t=t||{},n)n.hasOwnProperty(e)&&(o[e]=n[e]);return o.queue=[],o.sorter=t.sorter||n.default_sorter,o},default_sorter:function(t,r){return t.cost-r.cost},push:function(t,r){var e={value:t,cost:r};this.queue.push(e),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return 0===this.queue.length}}};t.exports=r})),nt=h((function(t,r){function e(t){return unescape(encodeURIComponent(t)).length}function n(t,r,e){for(var n,o=[];null!==(n=t.exec(e));)o.push({data:n[0],index:n.index,mode:r,length:n[0].length});return o}function o(t){var r,e,o=n(J.NUMERIC,K.NUMERIC,t),a=n(J.ALPHANUMERIC,K.ALPHANUMERIC,t);return s()?(r=n(J.BYTE,K.BYTE,t),e=n(J.KANJI,K.KANJI,t)):(r=n(J.BYTE_KANJI,K.BYTE,t),e=[]),o.concat(a,r,e).sort((function(t,r){return t.index-r.index})).map((function(t){return{data:t.data,mode:t.mode,length:t.length}}))}function a(t,r){switch(r){case K.NUMERIC:return j.getBitsLength(t);case K.ALPHANUMERIC:return Z.getBitsLength(t);case K.KANJI:return rt.getBitsLength(t);case K.BYTE:return G.getBitsLength(t)}}function i(t,r){var e,n=K.getBestModeForData(t);if((e=K.from(r,n))!==K.BYTE&&e.bit<n.bit)throw new Error('"'+t+'" cannot be encoded with mode '+K.toString(e)+".\\n Suggested mode is: "+K.toString(n));switch(e!==K.KANJI||s()||(e=K.BYTE),e){case K.NUMERIC:return new j(t);case K.ALPHANUMERIC:return new Z(t);case K.KANJI:return new rt(t);case K.BYTE:return new G(t)}}r.fromArray=function(t){return t.reduce((function(t,r){return"string"==typeof r?t.push(i(r,null)):r.data&&t.push(i(r.data,r.mode)),t}),[])},r.fromString=function(t,n){for(var i=function(t,r){for(var e={},n={start:{}},o=["start"],i=0;i<t.length;i++){for(var u=t[i],s=[],f=0;f<u.length;f++){var h=u[f],c=""+i+f;s.push(c),e[c]={node:h,lastCount:0},n[c]={};for(var g=0;g<o.length;g++){var d=o[g];e[d]&&e[d].node.mode===h.mode?(n[d][c]=a(e[d].lastCount+h.length,h.mode)-a(e[d].lastCount,h.mode),e[d].lastCount+=h.length):(e[d]&&(e[d].lastCount=h.length),n[d][c]=a(h.length,h.mode)+4+K.getCharCountIndicator(h.mode,r))}}o=s}for(var l=0;l<o.length;l++)n[o[l]].end=0;return{map:n,table:e}}(function(t){for(var r=[],n=0;n<t.length;n++){var o=t[n];switch(o.mode){case K.NUMERIC:r.push([o,{data:o.data,mode:K.ALPHANUMERIC,length:o.length},{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.ALPHANUMERIC:r.push([o,{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.KANJI:r.push([o,{data:o.data,mode:K.BYTE,length:e(o.data)}]);break;case K.BYTE:r.push([{data:o.data,mode:K.BYTE,length:e(o.data)}])}}return r}(o(t)),n),u=et.find_path(i.map,"start","end"),s=[],f=1;f<u.length-1;f++)s.push(i.table[u[f]].node);return r.fromArray(function(t){return t.reduce((function(t,r){var e=t.length-1>=0?t[t.length-1]:null;return e&&e.mode===r.mode?(t[t.length-1].data+=r.data,t):(t.push(r),t)}),[])}(s))},r.rawSplit=function(t){return r.fromArray(o(t))}}));function ot(t,r,e){var n,o,a=t.size,i=V(r,e);for(n=0;n<15;n++)o=1==(i>>n&1),n<6?t.set(n,8,o,!0):n<8?t.set(n+1,8,o,!0):t.set(a-15+n,8,o,!0),n<8?t.set(8,a-n-1,o,!0):n<9?t.set(8,15-n-1+1,o,!0):t.set(8,15-n-1,o,!0);t.set(a-8,8,1,!0)}function at(t,r,e){var n=new d;e.forEach((function(r){n.put(r.mode.bit,4),n.put(r.getLength(),K.getCharCountIndicator(r.mode,t)),r.write(n)}));var o=8*(a(t)-M(t,r));for(n.getLengthInBits()+4<=o&&n.put(0,4);n.getLengthInBits()%8!=0;)n.putBit(0);for(var i=(o-n.getLengthInBits())/8,u=0;u<i;u++)n.put(u%2?17:236,8);return function(t,r,e){for(var n=a(r),o=M(r,e),i=n-o,u=I(r,e),s=u-n%u,f=Math.floor(n/u),h=Math.floor(i/u),c=h+1,g=f-h,d=new L(g),l=0,v=new Array(u),p=new Array(u),w=0,m=new Uint8Array(t.buffer),E=0;E<u;E++){var y=E<s?h:c;v[E]=m.slice(l,l+y),p[E]=d.encode(v[E]),l+=y,w=Math.max(w,y)}var A,N,B=new Uint8Array(n),C=0;for(A=0;A<w;A++)for(N=0;N<u;N++)A<v[N].length&&(B[C++]=v[N][A]);for(A=0;A<g;A++)for(N=0;N<u;N++)B[C++]=p[N][A];return B}(n,t,r)}function it(t,r,e,n){var a;if(Array.isArray(t))a=nt.fromArray(t);else{if("string"!=typeof t)throw new Error("Invalid data");var i=r;if(!i){var u=nt.rawSplit(t);i=O.getBestVersionForData(u,e)}a=nt.fromString(t,i||40)}var s=O.getBestVersionForData(a,e);if(!s)throw new Error("The amount of data is too big to be stored in a QR Code");if(r){if(r<s)throw new Error("\\nThe chosen QR Code version cannot contain this amount of data.\\nMinimum version required to store current data is: "+s+".\\n")}else r=s;var f=at(r,e,a),h=o(r),c=new v(h);return function(t,r){for(var e=t.size,n=m(r),o=0;o<n.length;o++)for(var a=n[o][0],i=n[o][1],u=-1;u<=7;u++)if(!(a+u<=-1||e<=a+u))for(var s=-1;s<=7;s++)i+s<=-1||e<=i+s||(u>=0&&u<=6&&(0===s||6===s)||s>=0&&s<=6&&(0===u||6===u)||u>=2&&u<=4&&s>=2&&s<=4?t.set(a+u,i+s,!0,!0):t.set(a+u,i+s,!1,!0))}(c,r),function(t){for(var r=t.size,e=8;e<r-8;e++){var n=e%2==0;t.set(e,6,n,!0),t.set(6,e,n,!0)}}(c),function(t,r){for(var e=p.getPositions(r),n=0;n<e.length;n++)for(var o=e[n][0],a=e[n][1],i=-2;i<=2;i++)for(var u=-2;u<=2;u++)-2===i||2===i||-2===u||2===u||0===i&&0===u?t.set(o+i,a+u,!0,!0):t.set(o+i,a+u,!1,!0)}(c,r),ot(c,e,0),r>=7&&function(t,r){for(var e,n,o,a=t.size,i=O.getEncodedBits(r),u=0;u<18;u++)e=Math.floor(u/3),n=u%3+a-8-3,o=1==(i>>u&1),t.set(e,n,o,!0),t.set(n,e,o,!0)}(c,r),function(t,r){for(var e=t.size,n=-1,o=e-1,a=7,i=0,u=e-1;u>0;u-=2)for(6===u&&u--;;){for(var s=0;s<2;s++)if(!t.isReserved(o,u-s)){var f=!1;i<r.length&&(f=1==(r[i]>>>a&1)),t.set(o,u-s,f),-1===--a&&(i++,a=7)}if((o+=n)<0||e<=o){o-=n,n=-n;break}}}(c,f),isNaN(n)&&(n=E.getBestMask(c,ot.bind(null,c,e))),E.applyMask(n,c),ot(c,e,n),{modules:c,version:r,errorCorrectionLevel:e,maskPattern:n,segments:a}}nt.fromArray,nt.fromString,nt.rawSplit;var ut=function(t,r){if(void 0===t||""===t)throw new Error("No input text");var e,n,o=c.M;return void 0!==r&&(o=c.from(r.errorCorrectionLevel,c.M),e=O.from(r.version),n=E.from(r.maskPattern),r.toSJISFunc&&u(r.toSJISFunc)),it(t,e,o,n)},st=h((function(t,r){function e(t){if("number"==typeof t&&(t=t.toString()),"string"!=typeof t)throw new Error("Color should be defined as hex string");var r=t.slice().replace("#","").split("");if(r.length<3||5===r.length||r.length>8)throw new Error("Invalid hex color: "+t);3!==r.length&&4!==r.length||(r=Array.prototype.concat.apply([],r.map((function(t){return[t,t]})))),6===r.length&&r.push("F","F");var e=parseInt(r.join(""),16);return{r:e>>24&255,g:e>>16&255,b:e>>8&255,a:255&e,hex:"#"+r.slice(0,6).join("")}}r.getOptions=function(t){t||(t={}),t.color||(t.color={});var r=void 0===t.margin||null===t.margin||t.margin<0?4:t.margin,n=t.width&&t.width>=21?t.width:void 0,o=t.scale||4;return{width:n,scale:n?4:o,margin:r,color:{dark:e(t.color.dark||"#000000ff"),light:e(t.color.light||"#ffffffff")},type:t.type,rendererOpts:t.rendererOpts||{}}},r.getScale=function(t,r){return r.width&&r.width>=t+2*r.margin?r.width/(t+2*r.margin):r.scale},r.getImageWidth=function(t,e){var n=r.getScale(t,e);return Math.floor((t+2*e.margin)*n)},r.qrToImageData=function(t,e,n){for(var o=e.modules.size,a=e.modules.data,i=r.getScale(o,n),u=Math.floor((o+2*n.margin)*i),s=n.margin*i,f=[n.color.light,n.color.dark],h=0;h<u;h++)for(var c=0;c<u;c++){var g=4*(h*u+c),d=n.color.light;if(h>=s&&c>=s&&h<u-s&&c<u-s)d=f[a[Math.floor((h-s)/i)*o+Math.floor((c-s)/i)]?1:0];t[g++]=d.r,t[g++]=d.g,t[g++]=d.b,t[g]=d.a}}}));st.getOptions,st.getScale,st.getImageWidth,st.qrToImageData;var ft=h((function(t,r){r.render=function(t,r,e){var n=e,o=r;void 0!==n||r&&r.getContext||(n=r,r=void 0),r||(o=function(){try{return document.createElement("canvas")}catch(t){throw new Error("You need to specify a canvas element")}}()),n=st.getOptions(n);var a=st.getImageWidth(t.modules.size,n),i=o.getContext("2d"),u=i.createImageData(a,a);return st.qrToImageData(u.data,t,n),function(t,r,e){t.clearRect(0,0,r.width,r.height),r.style||(r.style={}),r.height=e,r.width=e,r.style.height=e+"px",r.style.width=e+"px"}(i,o,a),i.putImageData(u,0,0),o},r.renderToDataURL=function(t,e,n){var o=n;void 0!==o||e&&e.getContext||(o=e,e=void 0),o||(o={});var a=r.render(t,e,o),i=o.type||"image/png",u=o.rendererOpts||{};return a.toDataURL(i,u.quality)}}));function ht(t,r){var e=t.a/255,n=r+'="'+t.hex+'"';return e<1?n+" "+r+'-opacity="'+e.toFixed(2).slice(1)+'"':n}function ct(t,r,e){var n=t+r;return void 0!==e&&(n+=" "+e),n}ft.render,ft.renderToDataURL;var gt=function(t,r,e){var n=st.getOptions(r),o=t.modules.size,a=t.modules.data,i=o+2*n.margin,u=n.color.light.a?"<path "+ht(n.color.light,"fill")+' d="M0 0h'+i+"v"+i+'H0z"/>':"",s="<path "+ht(n.color.dark,"stroke")+' d="'+function(t,r,e){for(var n="",o=0,a=!1,i=0,u=0;u<t.length;u++){var s=Math.floor(u%r),f=Math.floor(u/r);s||a||(a=!0),t[u]?(i++,u>0&&s>0&&t[u-1]||(n+=a?ct("M",s+e,.5+f+e):ct("m",o,0),o=0,a=!1),s+1<r&&t[u+1]||(n+=ct("h",i),i=0)):o++}return n}(a,o,n.margin)+'"/>',f='viewBox="0 0 '+i+" "+i+'"',h='<svg xmlns="http://www.w3.org/2000/svg" '+(n.width?'width="'+n.width+'" height="'+n.width+'" ':"")+f+' shape-rendering="crispEdges">'+u+s+"</svg>\\n";return"function"==typeof e&&e(null,h),h};function dt(t,r,n,o,a){var i=[].slice.call(arguments,1),u=i.length,s="function"==typeof i[u-1];if(!s&&!e())throw new Error("Callback required as last argument");if(!s){if(u<1)throw new Error("Too few arguments provided");return 1===u?(n=r,r=o=void 0):2!==u||r.getContext||(o=n,n=r,r=void 0),new Promise((function(e,a){try{var i=ut(n,o);e(t(i,r,o))}catch(t){a(t)}}))}if(u<2)throw new Error("Too few arguments provided");2===u?(a=n,n=r,r=o=void 0):3===u&&(r.getContext&&void 0===a?(a=o,o=void 0):(a=o,o=n,n=r,r=void 0));try{var f=ut(n,o);a(null,t(f,r,o))}catch(t){a(t)}}var lt=ut,vt=dt.bind(null,ft.render),pt=dt.bind(null,ft.renderToDataURL),wt=dt.bind(null,(function(t,r,e){return gt(t,e)})),mt={create:lt,toCanvas:vt,toDataURL:pt,toString:wt};return t.create=lt,t.default=mt,t.toCanvas=vt,t.toDataURL=pt,t.toString=wt,Object.defineProperty(t,"__esModule",{value:!0}),t}({});</script>
  <style>
    *{box-sizing:border-box;}
    body{margin:0;background:#F4F1EA;font-family:'Quicksand',sans-serif;padding:24px;color:#2B2320;}
    .wrap{max-width:1040px;margin:0 auto;display:flex;gap:24px;align-items:flex-start;}
    .form-col{flex:1;min-width:0;}
    h1{font-family:'Baloo 2',sans-serif;font-size:20px;}
    .card{background:white;border:2px solid #2B2320;border-radius:16px;padding:20px;margin-top:12px;}
    label{display:block;font-size:12px;font-weight:700;margin:10px 0 4px;}
    input[type=text], input[type=number]{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:14px;font-family:'Quicksand',sans-serif;}
    input[type=color]{width:46px;height:42px;border:2px solid #2B2320;border-radius:10px;padding:2px;flex-shrink:0;}
    input[type=file]{width:100%;font-size:12px;margin-top:4px;}
    select{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:14px;font-family:'Quicksand',sans-serif;background:white;}
    .color-field{display:flex;gap:6px;}
    .color-field input.colorHex{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:13px;font-family:monospace;text-transform:uppercase;}
    .color-row{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid #EEE9DF;}
    .color-row-label{flex:1;font-size:13px;color:#2B2320;}
    .color-row input[type=color]{width:38px;height:34px;flex-shrink:0;padding:2px;}
    .color-row input.colorHex{width:100px;flex-shrink:0;padding:7px 8px;border:2px solid #2B2320;border-radius:8px;font-size:12px;font-family:monospace;text-transform:uppercase;}
    .colors{display:flex;flex-direction:column;gap:0;}
    .sellos{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .current-img{width:40px;height:40px;object-fit:contain;background:#F4F1EA;border-radius:8px;padding:4px;vertical-align:middle;margin-right:8px;}
    .hint{font-size:11px;color:#8A6F4E;margin-top:2px;}
    button{margin-top:18px;width:100%;padding:14px;border:2px solid #2B2320;border-radius:12px;background:#000000;color:#FFFFFF;font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;}
    .msg{text-align:center;font-size:13px;margin-top:12px;}
    .msg.ok{color:#215A34;} .msg.err{color:#B23A3A;}
    a.back{display:inline-block;margin-bottom:14px;color:#2B2320;font-weight:700;text-decoration:none;}
    .pw-wrap{position:relative;}
    .pw-wrap input{padding-right:44px;}
    .pw-toggle{position:absolute;right:8px;top:8px;background:none!important;border:none!important;width:auto!important;padding:2px!important;font-size:17px;cursor:pointer;line-height:1;color:#2B2320!important;}
    ${previewStyles()}
    ${passwordModalStyles()}
  </style></head>
  <body>
    <div class="wrap">
      <div class="form-col">
      <a class="back" href="/admin">← Volver al panel</a>
      <h1>Editar ${escapeHtml(b.name)}</h1>
      <div class="card">
        <form id="editForm">
          <label>Nombre del negocio</label>
          <input type="text" id="name" value="${escapeHtml(b.name)}" required>

          <p class="hint">El slug (${escapeHtml(b.slug)}) no se puede cambiar, para no romper los links que tus clientes ya tienen guardados.</p>

          <label>Logo actual</label>
          <img class="current-img" src="data:image/png;base64,${b.logo_base64}">
          <input type="file" id="logo" accept="image/*">
          <p class="hint">Deja vacío para mantener el logo actual.</p>

          <label>Sellos actuales</label>
          <div class="sellos">
            <div><img class="current-img" src="data:image/png;base64,${b.sello_1_base64}"><input type="file" id="sello1" accept="image/*"></div>
            <div><img class="current-img" src="data:image/png;base64,${b.sello_2_base64}"><input type="file" id="sello2" accept="image/*"></div>
            <div><img class="current-img" src="data:image/png;base64,${b.sello_3_base64}"><input type="file" id="sello3" accept="image/*"></div>
            <div><img class="current-img" src="data:image/png;base64,${b.sello_4_base64}"><input type="file" id="sello4" accept="image/*"></div>
          </div>
          <p class="hint">Deja vacíos los que no quieras cambiar.</p>

          <label>Tipografía</label>
          <select id="font_family">${fontOptions}</select>

          <label>Estilo del saludo (ej. "¡Hello!")</label>
          <div style="display:flex;gap:16px;margin-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="eyebrow_bold" ${b.eyebrow_bold ? 'checked' : ''} style="width:auto;margin:0;"> Negrita</label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="eyebrow_italic" ${b.eyebrow_italic ? 'checked' : ''} style="width:auto;margin:0;"> Cursiva</label>
          </div>

          <label>Estilo del nombre del cliente</label>
          <div style="display:flex;gap:16px;margin-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="font_bold" ${b.font_bold ? 'checked' : ''} style="width:auto;margin:0;"> Negrita</label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="font_italic" ${b.font_italic ? 'checked' : ''} style="width:auto;margin:0;"> Cursiva</label>
          </div>

          <label>Estilo del bloque "Tu premio"</label>
          <div style="display:flex;gap:16px;margin-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="reward_bold" ${b.reward_bold ? 'checked' : ''} style="width:auto;margin:0;"> Negrita</label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin:0;"><input type="checkbox" id="reward_italic" ${b.reward_italic ? 'checked' : ''} style="width:auto;margin:0;"> Cursiva</label>
          </div>

          <label>Colores de marca</label>
          ${colorGroupsHtml(b)}

          <label>Cuántos sellos para el premio</label>
          <input type="number" id="total_stamps" value="${b.total_stamps}" min="3" max="30" required>

          <label>Saludo (arriba del nombre)</label>
          <input type="text" id="greeting_eyebrow" value="${escapeHtml(b.greeting_eyebrow)}">

          <label>Título del premio</label>
          <input type="text" id="reward_heading" value="${escapeHtml(b.reward_heading)}">

          <label>Texto del premio</label>
          <input type="text" id="reward_text" value="${escapeHtml(b.reward_text)}" required>

          <label>Instrucción para sumar sellos</label>
          <select id="instruction_text">
            <option value="Muestra este código en caja para sumar tu sello en cada compra."${b.instruction_text === 'Muestra este código en caja para sumar tu sello en cada compra.' ? ' selected' : ''}>Negocio físico: mostrar en caja</option>
            <option value="Muestra este código al momento de pagar para sumar tu sello."${b.instruction_text === 'Muestra este código al momento de pagar para sumar tu sello.' ? ' selected' : ''}>Negocio físico: mostrar al pagar</option>
            <option value="Envía este código al confirmar tu pedido para sumar tu sello."${b.instruction_text === 'Envía este código al confirmar tu pedido para sumar tu sello.' ? ' selected' : ''}>Negocio digital: al confirmar pedido</option>
            <option value="Pega este código en el chat al hacer tu compra."${b.instruction_text === 'Pega este código en el chat al hacer tu compra.' ? ' selected' : ''}>Negocio digital: pegar en el chat</option>
            <option value="Envía una captura de este código junto a tu comprobante de pago."${b.instruction_text === 'Envía una captura de este código junto a tu comprobante de pago.' ? ' selected' : ''}>Negocio digital: junto al comprobante</option>
          </select>

          <label>Instagram (usuario)</label>
          <input type="text" id="instagram_handle" value="${escapeHtml(b.instagram_handle || '')}">

          <label>Instagram (link completo)</label>
          <input type="text" id="instagram_url" value="${escapeHtml(b.instagram_url || '')}">

          <button type="submit">Guardar cambios</button>
        </form>

        <div class="card" style="margin-top:20px;">
          <label>Tu recordatorio del PIN</label>
          <p class="hint" style="margin-top:0;">Protegido con tu contraseña, igual que en el panel principal.</p>
          <div id="pinNoteBox">
            <span id="pinNoteDisplay">🔒 ••••</span>
            <button type="button" id="pinNoteViewBtn" style="width:auto;margin:0 0 0 10px;padding:6px 12px;font-size:12px;">Ver</button>
            <button type="button" id="pinNoteEditBtn" style="width:auto;margin:0 0 0 6px;padding:6px 12px;font-size:12px;">Cambiar</button>
          </div>
          <div id="pinNoteEditForm" style="display:none;margin-top:10px;">
            <input type="text" id="pinNoteNewValue" placeholder="Nuevo recordatorio del PIN">
            <button type="button" id="pinNoteSaveBtn" style="margin-top:8px;">Guardar recordatorio</button>
          </div>
        </div>

        <p class="msg" id="msg"></p>
      </div>
      </div>

      ${previewPanelHtml(b.logo_base64, b.sello_1_base64)}
    </div>
    ${passwordModalHtml()}
    <script>
      document.querySelectorAll('.colorPicker').forEach(picker => {
        const hexInput = document.getElementById(picker.id + '_hex');
        picker.addEventListener('input', () => { hexInput.value = picker.value.toUpperCase(); });
        hexInput.addEventListener('input', () => {
          let v = hexInput.value.trim();
          if (v && v[0] !== '#') v = '#' + v;
          if (/^#[0-9A-Fa-f]{6}$/.test(v)) { picker.value = v; hexInput.style.borderColor = '#2B2320'; }
          else { hexInput.style.borderColor = '#B23A3A'; }
        });
        hexInput.addEventListener('blur', () => { hexInput.value = picker.value.toUpperCase(); hexInput.style.borderColor = '#2B2320'; });
      });
      function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg');
        msg.textContent = 'Guardando...'; msg.className = 'msg';
        try {
          const logoFile = document.getElementById('logo').files[0];
          const s1 = document.getElementById('sello1').files[0];
          const s2 = document.getElementById('sello2').files[0];
          const s3 = document.getElementById('sello3').files[0];
          const s4 = document.getElementById('sello4').files[0];
          const payload = {
            name: document.getElementById('name').value.trim(),
            logo_base64: logoFile ? await fileToBase64(logoFile) : null,
            sello_1_base64: s1 ? await fileToBase64(s1) : null,
            sello_2_base64: s2 ? await fileToBase64(s2) : null,
            sello_3_base64: s3 ? await fileToBase64(s3) : null,
            sello_4_base64: s4 ? await fileToBase64(s4) : null,
            font_family: document.getElementById('font_family').value,
            font_bold: document.getElementById('font_bold').checked,
            font_italic: document.getElementById('font_italic').checked,
            eyebrow_bold: document.getElementById('eyebrow_bold').checked,
            eyebrow_italic: document.getElementById('eyebrow_italic').checked,
            reward_bold: document.getElementById('reward_bold').checked,
            reward_italic: document.getElementById('reward_italic').checked,
            instruction_text: document.getElementById('instruction_text').value,
            total_stamps: Number(document.getElementById('total_stamps').value),
            greeting_eyebrow: document.getElementById('greeting_eyebrow').value,
            reward_heading: document.getElementById('reward_heading').value,
            reward_text: document.getElementById('reward_text').value,
            instagram_handle: document.getElementById('instagram_handle').value,
            instagram_url: document.getElementById('instagram_url').value
          };
          document.querySelectorAll('.colorPicker').forEach(picker => { payload[picker.id] = picker.value; });
          const res = await fetch('/admin/business/${slug}/update', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
          const data = await res.json();
          if (res.ok) { msg.textContent = '✅ Cambios guardados'; msg.className = 'msg ok'; }
          else { msg.textContent = data.error || 'No se pudo guardar'; msg.className = 'msg err'; }
        } catch (err) {
          msg.textContent = 'Error: ' + err.message; msg.className = 'msg err';
        }
      });
      ${previewScript(b.sello_1_base64)}
      ${passwordModalScript()}
      document.getElementById('pinNoteViewBtn').addEventListener('click', async () => {
        const password = await askPassword('Escribe tu contraseña de administradora para ver el recordatorio del PIN:');
        if (password === null) return;
        const res = await fetch('/admin/business/${slug}/reveal-pin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password }) });
        const data = await res.json();
        if (res.ok) {
          document.getElementById('pinNoteDisplay').textContent = '🔓 ' + data.pin;
        } else {
          alert(data.error || 'No se pudo ver el recordatorio');
        }
      });
      document.getElementById('pinNoteEditBtn').addEventListener('click', () => {
        document.getElementById('pinNoteEditForm').style.display = 'block';
        document.getElementById('pinNoteNewValue').focus();
      });
      document.getElementById('pinNoteSaveBtn').addEventListener('click', async () => {
        const note = document.getElementById('pinNoteNewValue').value;
        const password = await askPassword('Escribe tu contraseña de administradora para guardar este recordatorio:');
        if (password === null) return;
        const res = await fetch('/admin/business/${slug}/update-pin-note', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password, note }) });
        const data = await res.json();
        if (res.ok) {
          document.getElementById('pinNoteDisplay').textContent = '🔒 ••••';
          document.getElementById('pinNoteEditForm').style.display = 'none';
          document.getElementById('pinNoteNewValue').value = '';
          alert('Recordatorio guardado.');
        } else {
          alert(data.error || 'No se pudo guardar');
        }
      });
    </script>
  </body></html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function handleUpdateBusiness(request, env, slug) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const body = await request.json();
  const fontFamily = FONTS[body.font_family] ? body.font_family : business.font_family;

  // campos con imagen: si no se subió una nueva, se mantiene la actual (COALESCE en SQL)
  const imageFields = { logo_base64: body.logo_base64 || null, sello_1_base64: body.sello_1_base64 || null,
    sello_2_base64: body.sello_2_base64 || null, sello_3_base64: body.sello_3_base64 || null, sello_4_base64: body.sello_4_base64 || null };

  const fixedFields = {
    name: body.name, font_family: fontFamily, total_stamps: sanitizeTotalStamps(body.total_stamps, business.total_stamps),
    greeting_eyebrow: body.greeting_eyebrow, reward_heading: body.reward_heading, reward_text: body.reward_text,
    instagram_handle: body.instagram_handle || null, instagram_url: normalizeExternalUrl(body.instagram_url),
    instruction_text: body.instruction_text || business.instruction_text,
  };
  const boldFieldNames = ['font_bold', 'font_italic', 'eyebrow_bold', 'eyebrow_italic', 'reward_bold', 'reward_italic'];
  for (const key of boldFieldNames) fixedFields[key] = body[key] ? 1 : 0;
  const colorFieldNames = [
    'color_page_bg', 'color_card_bg', 'color_brown', 'color_brown_deep', 'color_brown_soft', 'color_pink', 'color_butter_mid', 'color_butter_light',
    'color_stamp_bg', 'color_qr_bg', 'color_instagram_bg', 'color_reward_text', 'color_reward_heading',
    'color_border_card', 'color_border_progress', 'color_border_stamp_ring', 'color_border_reward', 'color_border_qr',
    'color_text_progress_pct', 'color_text_progress_label', 'color_text_progress_number',
    'color_text_qr_code', 'color_text_qr_instruction', 'color_text_instagram', 'color_text_credit',
    'color_qr_pattern_dark', 'color_qr_pattern_light',
  ];
  for (const key of colorFieldNames) fixedFields[key] = sanitizeColor(body[key], business[key]);

  const setClauses = Object.keys(imageFields).map(c => `${c} = COALESCE(?, ${c})`)
    .concat(Object.keys(fixedFields).map(c => `${c} = ?`));
  const values = [...Object.values(imageFields), ...Object.values(fixedFields)];

  await env.DB.prepare(`UPDATE businesses SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values, business.id)
    .run();

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePublicRegisterForm(env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });

  const font = getFontConfig(business.font_family);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido · ${escapeHtml(business.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=${font.google}&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${business.color_page_bg};font-family:'Quicksand',sans-serif;padding:24px;}
    .box{width:100%;max-width:360px;background:${business.color_card_bg};border:2.5px solid ${business.color_brown};border-radius:24px;padding:28px 24px;box-shadow:0 10px 0 ${business.color_brown_deep};text-align:center;}
    .brand-logo{max-width:140px;width:60%;margin:0 auto 18px;display:block;}
    h1{font-family:'${business.font_family}',${font.fallback};font-size:19px;color:${business.color_brown};margin:0 0 6px;}
    p.sub{font-size:13px;color:${business.color_brown_soft};margin:0 0 20px;}
    input{width:100%;padding:12px 14px;border:2px solid ${business.color_brown};border-radius:12px;font-size:15px;margin-bottom:10px;font-family:'Quicksand',sans-serif;text-align:center;}
    button{width:100%;padding:13px;border:2px solid ${business.color_brown};border-radius:12px;background:${business.color_pink};color:${business.color_brown};font-weight:800;font-size:15px;cursor:pointer;font-family:'${business.font_family}',${font.fallback};margin-top:6px;}
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
        <input type="text" id="cedula" placeholder="Cédula (10 dígitos)" required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" minlength="10">
        <button type="submit">Continuar</button>
      </form>
      <p class="msg" id="msg"></p>
    </div>
    <script>
      document.getElementById('cedula').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
      });
      document.getElementById('regForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nombre').value.trim();
        const apellido = document.getElementById('apellido').value.trim();
        const cedula = document.getElementById('cedula').value.trim();
        const msg = document.getElementById('msg');
        if (!nombre || !apellido || !cedula) { msg.textContent = 'Completa los 3 campos'; return; }
        if (!/^[0-9]{10}$/.test(cedula)) { msg.textContent = 'La cédula debe tener exactamente 10 números'; return; }
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
  if (!/^[0-9]{10}$/.test(String(cedula).trim())) {
    return new Response(JSON.stringify({ error: 'La cédula debe tener exactamente 10 números' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const fullName = `${nombre.trim()} ${apellido.trim()}`;
  const cedulaLimpia = cedula.trim();

  // si ya existe un cliente con esta cédula en este negocio, no se crea uno nuevo:
  // se le manda derechito a SU tarjeta real, para no perder los sellos que ya tenía
  const existing = await env.DB.prepare('SELECT code FROM customers WHERE business_id = ? AND cedula = ?')
    .bind(business.id, cedulaLimpia).first();

  const url = new URL(request.url);
  if (existing) {
    return new Response(JSON.stringify({ ok: true, code: existing.code, url: `${url.origin}/${slug}/${existing.code}`, existing: true }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  const code = await generateUniqueCode(env, slug);
  await env.DB.prepare('INSERT INTO customers (business_id, code, name, cedula, stamps) VALUES (?, ?, ?, ?, 0)')
    .bind(business.id, code, fullName, cedulaLimpia).run();

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
      ${isReward ? '<span class="reward-tag">PREMIO</span>' : ''}
    </div>`;
  }

  const progressText = left === 0
    ? `<b>${total}</b> de ${total} sellos. <b>¡Ya tienes tu premio! 🎉</b>`
    : `<b>${filled}</b> de ${total} sellos, te faltan <b>${left}</b> para tu premio.`;

  const font = getFontConfig(b.font_family);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(b.name)} — Tarjeta de sellos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=${font.google}&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --page-bg:${b.color_page_bg}; --card-bg:${b.color_card_bg};
    --brown:${b.color_brown}; --brown-deep:${b.color_brown_deep}; --brown-soft:${b.color_brown_soft};
    --pink:${b.color_pink}; --butter-mid:${b.color_butter_mid}; --butter-light:${b.color_butter_light};
    --stamp-bg:${b.color_stamp_bg}; --qr-bg:${b.color_qr_bg}; --instagram-bg:${b.color_instagram_bg};
    --reward-body:${b.color_reward_text}; --reward-heading:${b.color_reward_heading};
    --border-card:${b.color_border_card}; --border-progress:${b.color_border_progress};
    --border-stamp-ring:${b.color_border_stamp_ring}; --border-reward:${b.color_border_reward}; --border-qr:${b.color_border_qr};
    --text-progress-pct:${b.color_text_progress_pct}; --text-progress-label:${b.color_text_progress_label}; --text-progress-number:${b.color_text_progress_number};
    --text-qr-code:${b.color_text_qr_code}; --text-qr-instruction:${b.color_text_qr_instruction};
    --text-instagram:${b.color_text_instagram}; --text-credit:${b.color_text_credit};
    --font-display:'${b.font_family}',${font.fallback};
    --font-weight-name:${b.font_bold ? '700' : '400'};
    --font-style-name:${b.font_italic ? 'italic' : 'normal'};
    --font-weight-eyebrow:${b.eyebrow_bold ? '700' : '400'};
    --font-style-eyebrow:${b.eyebrow_italic ? 'italic' : 'normal'};
    --font-weight-reward:${b.reward_bold ? '700' : '400'};
    --font-style-reward:${b.reward_italic ? 'italic' : 'normal'};
    --img-s1:url("data:image/png;base64,${sellos[0]}");
    --img-s2:url("data:image/png;base64,${sellos[1]}");
    --img-s3:url("data:image/png;base64,${sellos[2]}");
    --img-s4:url("data:image/png;base64,${sellos[3]}");
  }
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--page-bg);font-family:'Quicksand','Segoe UI',sans-serif;padding:36px 16px;}
  .wrap{width:100%;max-width:380px;}
  .card{background:var(--card-bg);border-radius:32px;border:2.5px solid var(--border-card);box-shadow:0 12px 0 var(--brown-deep);overflow:hidden;}
  .card-top{padding:30px 24px 22px;text-align:center;border-bottom:2px solid var(--border-card);}
  .brand-logo{max-width:150px;width:56%;height:auto;display:block;margin:0 auto;}
  .card-body{padding:20px 24px 22px;}
  .greeting-eyebrow{font-family:var(--font-display);font-weight:var(--font-weight-eyebrow);font-style:var(--font-style-eyebrow);font-size:16px;letter-spacing:.3px;color:var(--brown-soft);margin:0;line-height:1.15;text-transform:uppercase;}
  .greeting-name{font-family:var(--font-display);font-weight:var(--font-weight-name);font-style:var(--font-style-name);font-size:21px;color:var(--brown);margin:1px 0 16px;line-height:1.15;}
  .progress-row{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
  .progress-track{flex:1;height:20px;border-radius:99px;background:#FFFFFF;border:2px solid var(--border-progress);overflow:hidden;}
  .progress-fill{height:100%;border-radius:99px;background:var(--pink);}
  .progress-pct{font-family:var(--font-display);font-weight:var(--font-weight-name);font-style:var(--font-style-name);font-size:13px;color:var(--text-progress-pct);min-width:34px;text-align:right;}
  .progress-text{font-size:12.5px;color:var(--text-progress-label);margin:0 0 26px;}
  .progress-text b{color:var(--text-progress-number);}
  .stamp-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:14px;}
  .stamp{aspect-ratio:1;border-radius:50%;background:var(--stamp-bg);display:flex;align-items:center;justify-content:center;position:relative;}
  .stamp-img{width:84%;height:84%;background-size:contain;background-position:center;background-repeat:no-repeat;opacity:0;}
  .stamp[data-sello="s1"] .stamp-img{background-image:var(--img-s1);} .stamp[data-sello="s2"] .stamp-img{background-image:var(--img-s2);}
  .stamp[data-sello="s3"] .stamp-img{background-image:var(--img-s3);} .stamp[data-sello="s4"] .stamp-img{background-image:var(--img-s4);}
  .stamp::before{content:"";position:absolute;inset:3px;border-radius:50%;border:1.5px solid var(--border-stamp-ring);}
  .stamp.filled{box-shadow:0 3px 8px rgba(89,50,18,.3);}
  .stamp.filled::before{border:none;}
  .stamp.filled .stamp-img{opacity:1;}
  .stamp.reward::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2.5px solid var(--butter-mid);opacity:0;z-index:1;}
  .stamp.reward:not(.filled)::after{opacity:1;animation:pulse 1.8s ease-in-out infinite;}
  @keyframes pulse{0%,100%{transform:scale(1);opacity:.55;}50%{transform:scale(1.04);opacity:1;}}
  .reward-tag{position:absolute;bottom:-15px;left:0;right:0;width:max-content;margin:0 auto;background:var(--butter-mid);border:1.5px solid var(--border-reward);color:var(--reward-heading);font-family:var(--font-display);font-size:9.5px;font-weight:700;letter-spacing:.5px;padding:2px 7px;border-radius:8px;white-space:nowrap;text-align:center;z-index:3;}
  .reward-note{margin-top:26px;background:var(--butter-mid);border:2px solid var(--border-reward);border-radius:16px;padding:10px 14px;display:flex;align-items:center;gap:10px;color:var(--reward-body);font-size:12px;}
  .reward-note .r-emoji{font-size:24px;flex-shrink:0;}
  .reward-note strong{display:block;font-family:var(--font-display);font-weight:var(--font-weight-reward);font-style:var(--font-style-reward);font-size:13.5px;margin-bottom:1px;color:var(--reward-heading);}
  .qr-section{margin-top:20px;border-top:2px dashed var(--page-bg);padding-top:18px;display:flex;align-items:center;gap:14px;}
  .qr-box{width:86px;height:86px;background:var(--qr-bg);border:2px solid var(--border-qr);border-radius:14px;padding:6px;flex-shrink:0;}
  .qr-box canvas{width:100%!important;height:100%!important;border-radius:6px;display:block;}
  .qr-copy{font-size:11.5px;color:var(--text-qr-instruction);line-height:1.45;}
  .qr-copy b{display:block;font-family:var(--font-display);font-weight:700;font-style:normal;font-size:13.5px;color:var(--text-qr-code);letter-spacing:.3px;margin-bottom:2px;}
  .social-link{display:flex;align-items:center;justify-content:center;gap:7px;width:fit-content;margin:16px auto 0;padding:7px 14px;background:var(--instagram-bg);border-radius:99px;color:var(--text-instagram);text-decoration:none;font-size:12px;font-weight:700;}
  .credit{text-align:center;font-size:13px;color:var(--text-credit);margin:18px 0 0;}
  .credit a{color:var(--text-credit);font-weight:700;text-decoration:underline;}
</style>
<script>var QRCode=function(t){"use strict";var r,e=function(){return"function"==typeof Promise&&Promise.prototype&&Promise.prototype.then},n=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706],o=function(t){if(!t)throw new Error('"version" cannot be null or undefined');if(t<1||t>40)throw new Error('"version" should be in range from 1 to 40');return 4*t+17},a=function(t){return n[t]},i=function(t){for(var r=0;0!==t;)r++,t>>>=1;return r},u=function(t){if("function"!=typeof t)throw new Error('"toSJISFunc" is not a valid function.');r=t},s=function(){return void 0!==r},f=function(t){return r(t)};function h(t,r){return t(r={exports:{}},r.exports),r.exports}var c=h((function(t,r){r.L={bit:1},r.M={bit:0},r.Q={bit:3},r.H={bit:2},r.isValid=function(t){return t&&void 0!==t.bit&&t.bit>=0&&t.bit<4},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"l":case"low":return r.L;case"m":case"medium":return r.M;case"q":case"quartile":return r.Q;case"h":case"high":return r.H;default:throw new Error("Unknown EC Level: "+t)}}(t)}catch(t){return e}}}));function g(){this.buffer=[],this.length=0}c.L,c.M,c.Q,c.H,c.isValid,g.prototype={get:function(t){var r=Math.floor(t/8);return 1==(this.buffer[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e++)this.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return this.length},putBit:function(t){var r=Math.floor(this.length/8);this.buffer.length<=r&&this.buffer.push(0),t&&(this.buffer[r]|=128>>>this.length%8),this.length++}};var d=g;function l(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}l.prototype.set=function(t,r,e,n){var o=t*this.size+r;this.data[o]=e,n&&(this.reservedBit[o]=!0)},l.prototype.get=function(t,r){return this.data[t*this.size+r]},l.prototype.xor=function(t,r,e){this.data[t*this.size+r]^=e},l.prototype.isReserved=function(t,r){return this.reservedBit[t*this.size+r]};var v=l,p=h((function(t,r){var e=o;r.getRowColCoords=function(t){if(1===t)return[];for(var r=Math.floor(t/7)+2,n=e(t),o=145===n?26:2*Math.ceil((n-13)/(2*r-2)),a=[n-7],i=1;i<r-1;i++)a[i]=a[i-1]-o;return a.push(6),a.reverse()},r.getPositions=function(t){for(var e=[],n=r.getRowColCoords(t),o=n.length,a=0;a<o;a++)for(var i=0;i<o;i++)0===a&&0===i||0===a&&i===o-1||a===o-1&&0===i||e.push([n[a],n[i]]);return e}}));p.getRowColCoords,p.getPositions;var w=o,m=function(t){var r=w(t);return[[0,0],[r-7,0],[0,r-7]]},E=h((function(t,r){r.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var e=3,n=3,o=40,a=10;function i(t,e,n){switch(t){case r.Patterns.PATTERN000:return(e+n)%2==0;case r.Patterns.PATTERN001:return e%2==0;case r.Patterns.PATTERN010:return n%3==0;case r.Patterns.PATTERN011:return(e+n)%3==0;case r.Patterns.PATTERN100:return(Math.floor(e/2)+Math.floor(n/3))%2==0;case r.Patterns.PATTERN101:return e*n%2+e*n%3==0;case r.Patterns.PATTERN110:return(e*n%2+e*n%3)%2==0;case r.Patterns.PATTERN111:return(e*n%3+(e+n)%2)%2==0;default:throw new Error("bad maskPattern:"+t)}}r.isValid=function(t){return null!=t&&""!==t&&!isNaN(t)&&t>=0&&t<=7},r.from=function(t){return r.isValid(t)?parseInt(t,10):void 0},r.getPenaltyN1=function(t){for(var r=t.size,n=0,o=0,a=0,i=null,u=null,s=0;s<r;s++){o=a=0,i=u=null;for(var f=0;f<r;f++){var h=t.get(s,f);h===i?o++:(o>=5&&(n+=e+(o-5)),i=h,o=1),(h=t.get(f,s))===u?a++:(a>=5&&(n+=e+(a-5)),u=h,a=1)}o>=5&&(n+=e+(o-5)),a>=5&&(n+=e+(a-5))}return n},r.getPenaltyN2=function(t){for(var r=t.size,e=0,o=0;o<r-1;o++)for(var a=0;a<r-1;a++){var i=t.get(o,a)+t.get(o,a+1)+t.get(o+1,a)+t.get(o+1,a+1);4!==i&&0!==i||e++}return e*n},r.getPenaltyN3=function(t){for(var r=t.size,e=0,n=0,a=0,i=0;i<r;i++){n=a=0;for(var u=0;u<r;u++)n=n<<1&2047|t.get(i,u),u>=10&&(1488===n||93===n)&&e++,a=a<<1&2047|t.get(u,i),u>=10&&(1488===a||93===a)&&e++}return e*o},r.getPenaltyN4=function(t){for(var r=0,e=t.data.length,n=0;n<e;n++)r+=t.data[n];return Math.abs(Math.ceil(100*r/e/5)-10)*a},r.applyMask=function(t,r){for(var e=r.size,n=0;n<e;n++)for(var o=0;o<e;o++)r.isReserved(o,n)||r.xor(o,n,i(t,o,n))},r.getBestMask=function(t,e){for(var n=Object.keys(r.Patterns).length,o=0,a=1/0,i=0;i<n;i++){e(i),r.applyMask(i,t);var u=r.getPenaltyN1(t)+r.getPenaltyN2(t)+r.getPenaltyN3(t)+r.getPenaltyN4(t);r.applyMask(i,t),u<a&&(a=u,o=i)}return o}}));E.Patterns,E.isValid,E.getPenaltyN1,E.getPenaltyN2,E.getPenaltyN3,E.getPenaltyN4,E.applyMask,E.getBestMask;var y=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],A=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430],I=function(t,r){switch(r){case c.L:return y[4*(t-1)+0];case c.M:return y[4*(t-1)+1];case c.Q:return y[4*(t-1)+2];case c.H:return y[4*(t-1)+3];default:return}},M=function(t,r){switch(r){case c.L:return A[4*(t-1)+0];case c.M:return A[4*(t-1)+1];case c.Q:return A[4*(t-1)+2];case c.H:return A[4*(t-1)+3];default:return}},N=new Uint8Array(512),B=new Uint8Array(256);!function(){for(var t=1,r=0;r<255;r++)N[r]=t,B[t]=r,256&(t<<=1)&&(t^=285);for(var e=255;e<512;e++)N[e]=N[e-255]}();var C=function(t){return N[t]},P=function(t,r){return 0===t||0===r?0:N[B[t]+B[r]]},R=h((function(t,r){r.mul=function(t,r){for(var e=new Uint8Array(t.length+r.length-1),n=0;n<t.length;n++)for(var o=0;o<r.length;o++)e[n+o]^=P(t[n],r[o]);return e},r.mod=function(t,r){for(var e=new Uint8Array(t);e.length-r.length>=0;){for(var n=e[0],o=0;o<r.length;o++)e[o]^=P(r[o],n);for(var a=0;a<e.length&&0===e[a];)a++;e=e.slice(a)}return e},r.generateECPolynomial=function(t){for(var e=new Uint8Array([1]),n=0;n<t;n++)e=r.mul(e,new Uint8Array([1,C(n)]));return e}}));function T(t){this.genPoly=void 0,this.degree=t,this.degree&&this.initialize(this.degree)}R.mul,R.mod,R.generateECPolynomial,T.prototype.initialize=function(t){this.degree=t,this.genPoly=R.generateECPolynomial(this.degree)},T.prototype.encode=function(t){if(!this.genPoly)throw new Error("Encoder not initialized");var r=new Uint8Array(t.length+this.degree);r.set(t);var e=R.mod(r,this.genPoly),n=this.degree-e.length;if(n>0){var o=new Uint8Array(this.degree);return o.set(e,n),o}return e};var L=T,b=function(t){return!isNaN(t)&&t>=1&&t<=40},U="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+",x="(?:(?![A-Z0-9 $%*+\\\\-./:]|"+(U=U.replace(/u/g,"\\\\u"))+")(?:.|[\\r\\n]))+",k=new RegExp(U,"g"),F=new RegExp("[^A-Z0-9 $%*+\\\\-./:]+","g"),S=new RegExp(x,"g"),D=new RegExp("[0-9]+","g"),Y=new RegExp("[A-Z $%*+\\\\-./:]+","g"),_=new RegExp("^"+U+"$"),z=new RegExp("^[0-9]+$"),H=new RegExp("^[A-Z0-9 $%*+\\\\-./:]+$"),J={KANJI:k,BYTE_KANJI:F,BYTE:S,NUMERIC:D,ALPHANUMERIC:Y,testKanji:function(t){return _.test(t)},testNumeric:function(t){return z.test(t)},testAlphanumeric:function(t){return H.test(t)}},K=h((function(t,r){r.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},r.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},r.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},r.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},r.MIXED={bit:-1},r.getCharCountIndicator=function(t,r){if(!t.ccBits)throw new Error("Invalid mode: "+t);if(!b(r))throw new Error("Invalid version: "+r);return r>=1&&r<10?t.ccBits[0]:r<27?t.ccBits[1]:t.ccBits[2]},r.getBestModeForData=function(t){return J.testNumeric(t)?r.NUMERIC:J.testAlphanumeric(t)?r.ALPHANUMERIC:J.testKanji(t)?r.KANJI:r.BYTE},r.toString=function(t){if(t&&t.id)return t.id;throw new Error("Invalid mode")},r.isValid=function(t){return t&&t.bit&&t.ccBits},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return r.NUMERIC;case"alphanumeric":return r.ALPHANUMERIC;case"kanji":return r.KANJI;case"byte":return r.BYTE;default:throw new Error("Unknown mode: "+t)}}(t)}catch(t){return e}}}));K.NUMERIC,K.ALPHANUMERIC,K.BYTE,K.KANJI,K.MIXED,K.getCharCountIndicator,K.getBestModeForData,K.isValid;var O=h((function(t,r){var e=i(7973);function n(t,r){return K.getCharCountIndicator(t,r)+4}function o(t,r){var e=0;return t.forEach((function(t){var o=n(t.mode,r);e+=o+t.getBitsLength()})),e}r.from=function(t,r){return b(t)?parseInt(t,10):r},r.getCapacity=function(t,r,e){if(!b(t))throw new Error("Invalid QR Code version");void 0===e&&(e=K.BYTE);var o=8*(a(t)-M(t,r));if(e===K.MIXED)return o;var i=o-n(e,t);switch(e){case K.NUMERIC:return Math.floor(i/10*3);case K.ALPHANUMERIC:return Math.floor(i/11*2);case K.KANJI:return Math.floor(i/13);case K.BYTE:default:return Math.floor(i/8)}},r.getBestVersionForData=function(t,e){var n,a=c.from(e,c.M);if(Array.isArray(t)){if(t.length>1)return function(t,e){for(var n=1;n<=40;n++){if(o(t,n)<=r.getCapacity(n,e,K.MIXED))return n}}(t,a);if(0===t.length)return 1;n=t[0]}else n=t;return function(t,e,n){for(var o=1;o<=40;o++)if(e<=r.getCapacity(o,n,t))return o}(n.mode,n.getLength(),a)},r.getEncodedBits=function(t){if(!b(t)||t<7)throw new Error("Invalid QR Code version");for(var r=t<<12;i(r)-e>=0;)r^=7973<<i(r)-e;return t<<12|r}}));O.getCapacity,O.getBestVersionForData,O.getEncodedBits;var Q=i(1335),V=function(t,r){for(var e=t.bit<<3|r,n=e<<10;i(n)-Q>=0;)n^=1335<<i(n)-Q;return 21522^(e<<10|n)};function q(t){this.mode=K.NUMERIC,this.data=t.toString()}q.getBitsLength=function(t){return 10*Math.floor(t/3)+(t%3?t%3*3+1:0)},q.prototype.getLength=function(){return this.data.length},q.prototype.getBitsLength=function(){return q.getBitsLength(this.data.length)},q.prototype.write=function(t){var r,e,n;for(r=0;r+3<=this.data.length;r+=3)e=this.data.substr(r,3),n=parseInt(e,10),t.put(n,10);var o=this.data.length-r;o>0&&(e=this.data.substr(r),n=parseInt(e,10),t.put(n,3*o+1))};var j=q,$=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function X(t){this.mode=K.ALPHANUMERIC,this.data=t}X.getBitsLength=function(t){return 11*Math.floor(t/2)+t%2*6},X.prototype.getLength=function(){return this.data.length},X.prototype.getBitsLength=function(){return X.getBitsLength(this.data.length)},X.prototype.write=function(t){var r;for(r=0;r+2<=this.data.length;r+=2){var e=45*$.indexOf(this.data[r]);e+=$.indexOf(this.data[r+1]),t.put(e,11)}this.data.length%2&&t.put($.indexOf(this.data[r]),6)};var Z=X;function W(t){this.mode=K.BYTE,"string"==typeof t&&(t=function(t){for(var r=[],e=t.length,n=0;n<e;n++){var o=t.charCodeAt(n);if(o>=55296&&o<=56319&&e>n+1){var a=t.charCodeAt(n+1);a>=56320&&a<=57343&&(o=1024*(o-55296)+a-56320+65536,n+=1)}o<128?r.push(o):o<2048?(r.push(o>>6|192),r.push(63&o|128)):o<55296||o>=57344&&o<65536?(r.push(o>>12|224),r.push(o>>6&63|128),r.push(63&o|128)):o>=65536&&o<=1114111?(r.push(o>>18|240),r.push(o>>12&63|128),r.push(o>>6&63|128),r.push(63&o|128)):r.push(239,191,189)}return new Uint8Array(r).buffer}(t)),this.data=new Uint8Array(t)}W.getBitsLength=function(t){return 8*t},W.prototype.getLength=function(){return this.data.length},W.prototype.getBitsLength=function(){return W.getBitsLength(this.data.length)},W.prototype.write=function(t){for(var r=0,e=this.data.length;r<e;r++)t.put(this.data[r],8)};var G=W;function tt(t){this.mode=K.KANJI,this.data=t}tt.getBitsLength=function(t){return 13*t},tt.prototype.getLength=function(){return this.data.length},tt.prototype.getBitsLength=function(){return tt.getBitsLength(this.data.length)},tt.prototype.write=function(t){var r;for(r=0;r<this.data.length;r++){var e=f(this.data[r]);if(e>=33088&&e<=40956)e-=33088;else{if(!(e>=57408&&e<=60351))throw new Error("Invalid SJIS character: "+this.data[r]+"\\nMake sure your charset is UTF-8");e-=49472}e=192*(e>>>8&255)+(255&e),t.put(e,13)}};var rt=tt,et=h((function(t){var r={single_source_shortest_paths:function(t,e,n){var o={},a={};a[e]=0;var i,u,s,f,h,c,g,d=r.PriorityQueue.make();for(d.push(e,0);!d.empty();)for(s in u=(i=d.pop()).value,f=i.cost,h=t[u]||{})h.hasOwnProperty(s)&&(c=f+h[s],g=a[s],(void 0===a[s]||g>c)&&(a[s]=c,d.push(s,c),o[s]=u));if(void 0!==n&&void 0===a[n]){var l=["Could not find a path from ",e," to ",n,"."].join("");throw new Error(l)}return o},extract_shortest_path_from_predecessor_list:function(t,r){for(var e=[],n=r;n;)e.push(n),n=t[n];return e.reverse(),e},find_path:function(t,e,n){var o=r.single_source_shortest_paths(t,e,n);return r.extract_shortest_path_from_predecessor_list(o,n)},PriorityQueue:{make:function(t){var e,n=r.PriorityQueue,o={};for(e in t=t||{},n)n.hasOwnProperty(e)&&(o[e]=n[e]);return o.queue=[],o.sorter=t.sorter||n.default_sorter,o},default_sorter:function(t,r){return t.cost-r.cost},push:function(t,r){var e={value:t,cost:r};this.queue.push(e),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return 0===this.queue.length}}};t.exports=r})),nt=h((function(t,r){function e(t){return unescape(encodeURIComponent(t)).length}function n(t,r,e){for(var n,o=[];null!==(n=t.exec(e));)o.push({data:n[0],index:n.index,mode:r,length:n[0].length});return o}function o(t){var r,e,o=n(J.NUMERIC,K.NUMERIC,t),a=n(J.ALPHANUMERIC,K.ALPHANUMERIC,t);return s()?(r=n(J.BYTE,K.BYTE,t),e=n(J.KANJI,K.KANJI,t)):(r=n(J.BYTE_KANJI,K.BYTE,t),e=[]),o.concat(a,r,e).sort((function(t,r){return t.index-r.index})).map((function(t){return{data:t.data,mode:t.mode,length:t.length}}))}function a(t,r){switch(r){case K.NUMERIC:return j.getBitsLength(t);case K.ALPHANUMERIC:return Z.getBitsLength(t);case K.KANJI:return rt.getBitsLength(t);case K.BYTE:return G.getBitsLength(t)}}function i(t,r){var e,n=K.getBestModeForData(t);if((e=K.from(r,n))!==K.BYTE&&e.bit<n.bit)throw new Error('"'+t+'" cannot be encoded with mode '+K.toString(e)+".\\n Suggested mode is: "+K.toString(n));switch(e!==K.KANJI||s()||(e=K.BYTE),e){case K.NUMERIC:return new j(t);case K.ALPHANUMERIC:return new Z(t);case K.KANJI:return new rt(t);case K.BYTE:return new G(t)}}r.fromArray=function(t){return t.reduce((function(t,r){return"string"==typeof r?t.push(i(r,null)):r.data&&t.push(i(r.data,r.mode)),t}),[])},r.fromString=function(t,n){for(var i=function(t,r){for(var e={},n={start:{}},o=["start"],i=0;i<t.length;i++){for(var u=t[i],s=[],f=0;f<u.length;f++){var h=u[f],c=""+i+f;s.push(c),e[c]={node:h,lastCount:0},n[c]={};for(var g=0;g<o.length;g++){var d=o[g];e[d]&&e[d].node.mode===h.mode?(n[d][c]=a(e[d].lastCount+h.length,h.mode)-a(e[d].lastCount,h.mode),e[d].lastCount+=h.length):(e[d]&&(e[d].lastCount=h.length),n[d][c]=a(h.length,h.mode)+4+K.getCharCountIndicator(h.mode,r))}}o=s}for(var l=0;l<o.length;l++)n[o[l]].end=0;return{map:n,table:e}}(function(t){for(var r=[],n=0;n<t.length;n++){var o=t[n];switch(o.mode){case K.NUMERIC:r.push([o,{data:o.data,mode:K.ALPHANUMERIC,length:o.length},{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.ALPHANUMERIC:r.push([o,{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.KANJI:r.push([o,{data:o.data,mode:K.BYTE,length:e(o.data)}]);break;case K.BYTE:r.push([{data:o.data,mode:K.BYTE,length:e(o.data)}])}}return r}(o(t)),n),u=et.find_path(i.map,"start","end"),s=[],f=1;f<u.length-1;f++)s.push(i.table[u[f]].node);return r.fromArray(function(t){return t.reduce((function(t,r){var e=t.length-1>=0?t[t.length-1]:null;return e&&e.mode===r.mode?(t[t.length-1].data+=r.data,t):(t.push(r),t)}),[])}(s))},r.rawSplit=function(t){return r.fromArray(o(t))}}));function ot(t,r,e){var n,o,a=t.size,i=V(r,e);for(n=0;n<15;n++)o=1==(i>>n&1),n<6?t.set(n,8,o,!0):n<8?t.set(n+1,8,o,!0):t.set(a-15+n,8,o,!0),n<8?t.set(8,a-n-1,o,!0):n<9?t.set(8,15-n-1+1,o,!0):t.set(8,15-n-1,o,!0);t.set(a-8,8,1,!0)}function at(t,r,e){var n=new d;e.forEach((function(r){n.put(r.mode.bit,4),n.put(r.getLength(),K.getCharCountIndicator(r.mode,t)),r.write(n)}));var o=8*(a(t)-M(t,r));for(n.getLengthInBits()+4<=o&&n.put(0,4);n.getLengthInBits()%8!=0;)n.putBit(0);for(var i=(o-n.getLengthInBits())/8,u=0;u<i;u++)n.put(u%2?17:236,8);return function(t,r,e){for(var n=a(r),o=M(r,e),i=n-o,u=I(r,e),s=u-n%u,f=Math.floor(n/u),h=Math.floor(i/u),c=h+1,g=f-h,d=new L(g),l=0,v=new Array(u),p=new Array(u),w=0,m=new Uint8Array(t.buffer),E=0;E<u;E++){var y=E<s?h:c;v[E]=m.slice(l,l+y),p[E]=d.encode(v[E]),l+=y,w=Math.max(w,y)}var A,N,B=new Uint8Array(n),C=0;for(A=0;A<w;A++)for(N=0;N<u;N++)A<v[N].length&&(B[C++]=v[N][A]);for(A=0;A<g;A++)for(N=0;N<u;N++)B[C++]=p[N][A];return B}(n,t,r)}function it(t,r,e,n){var a;if(Array.isArray(t))a=nt.fromArray(t);else{if("string"!=typeof t)throw new Error("Invalid data");var i=r;if(!i){var u=nt.rawSplit(t);i=O.getBestVersionForData(u,e)}a=nt.fromString(t,i||40)}var s=O.getBestVersionForData(a,e);if(!s)throw new Error("The amount of data is too big to be stored in a QR Code");if(r){if(r<s)throw new Error("\\nThe chosen QR Code version cannot contain this amount of data.\\nMinimum version required to store current data is: "+s+".\\n")}else r=s;var f=at(r,e,a),h=o(r),c=new v(h);return function(t,r){for(var e=t.size,n=m(r),o=0;o<n.length;o++)for(var a=n[o][0],i=n[o][1],u=-1;u<=7;u++)if(!(a+u<=-1||e<=a+u))for(var s=-1;s<=7;s++)i+s<=-1||e<=i+s||(u>=0&&u<=6&&(0===s||6===s)||s>=0&&s<=6&&(0===u||6===u)||u>=2&&u<=4&&s>=2&&s<=4?t.set(a+u,i+s,!0,!0):t.set(a+u,i+s,!1,!0))}(c,r),function(t){for(var r=t.size,e=8;e<r-8;e++){var n=e%2==0;t.set(e,6,n,!0),t.set(6,e,n,!0)}}(c),function(t,r){for(var e=p.getPositions(r),n=0;n<e.length;n++)for(var o=e[n][0],a=e[n][1],i=-2;i<=2;i++)for(var u=-2;u<=2;u++)-2===i||2===i||-2===u||2===u||0===i&&0===u?t.set(o+i,a+u,!0,!0):t.set(o+i,a+u,!1,!0)}(c,r),ot(c,e,0),r>=7&&function(t,r){for(var e,n,o,a=t.size,i=O.getEncodedBits(r),u=0;u<18;u++)e=Math.floor(u/3),n=u%3+a-8-3,o=1==(i>>u&1),t.set(e,n,o,!0),t.set(n,e,o,!0)}(c,r),function(t,r){for(var e=t.size,n=-1,o=e-1,a=7,i=0,u=e-1;u>0;u-=2)for(6===u&&u--;;){for(var s=0;s<2;s++)if(!t.isReserved(o,u-s)){var f=!1;i<r.length&&(f=1==(r[i]>>>a&1)),t.set(o,u-s,f),-1===--a&&(i++,a=7)}if((o+=n)<0||e<=o){o-=n,n=-n;break}}}(c,f),isNaN(n)&&(n=E.getBestMask(c,ot.bind(null,c,e))),E.applyMask(n,c),ot(c,e,n),{modules:c,version:r,errorCorrectionLevel:e,maskPattern:n,segments:a}}nt.fromArray,nt.fromString,nt.rawSplit;var ut=function(t,r){if(void 0===t||""===t)throw new Error("No input text");var e,n,o=c.M;return void 0!==r&&(o=c.from(r.errorCorrectionLevel,c.M),e=O.from(r.version),n=E.from(r.maskPattern),r.toSJISFunc&&u(r.toSJISFunc)),it(t,e,o,n)},st=h((function(t,r){function e(t){if("number"==typeof t&&(t=t.toString()),"string"!=typeof t)throw new Error("Color should be defined as hex string");var r=t.slice().replace("#","").split("");if(r.length<3||5===r.length||r.length>8)throw new Error("Invalid hex color: "+t);3!==r.length&&4!==r.length||(r=Array.prototype.concat.apply([],r.map((function(t){return[t,t]})))),6===r.length&&r.push("F","F");var e=parseInt(r.join(""),16);return{r:e>>24&255,g:e>>16&255,b:e>>8&255,a:255&e,hex:"#"+r.slice(0,6).join("")}}r.getOptions=function(t){t||(t={}),t.color||(t.color={});var r=void 0===t.margin||null===t.margin||t.margin<0?4:t.margin,n=t.width&&t.width>=21?t.width:void 0,o=t.scale||4;return{width:n,scale:n?4:o,margin:r,color:{dark:e(t.color.dark||"#000000ff"),light:e(t.color.light||"#ffffffff")},type:t.type,rendererOpts:t.rendererOpts||{}}},r.getScale=function(t,r){return r.width&&r.width>=t+2*r.margin?r.width/(t+2*r.margin):r.scale},r.getImageWidth=function(t,e){var n=r.getScale(t,e);return Math.floor((t+2*e.margin)*n)},r.qrToImageData=function(t,e,n){for(var o=e.modules.size,a=e.modules.data,i=r.getScale(o,n),u=Math.floor((o+2*n.margin)*i),s=n.margin*i,f=[n.color.light,n.color.dark],h=0;h<u;h++)for(var c=0;c<u;c++){var g=4*(h*u+c),d=n.color.light;if(h>=s&&c>=s&&h<u-s&&c<u-s)d=f[a[Math.floor((h-s)/i)*o+Math.floor((c-s)/i)]?1:0];t[g++]=d.r,t[g++]=d.g,t[g++]=d.b,t[g]=d.a}}}));st.getOptions,st.getScale,st.getImageWidth,st.qrToImageData;var ft=h((function(t,r){r.render=function(t,r,e){var n=e,o=r;void 0!==n||r&&r.getContext||(n=r,r=void 0),r||(o=function(){try{return document.createElement("canvas")}catch(t){throw new Error("You need to specify a canvas element")}}()),n=st.getOptions(n);var a=st.getImageWidth(t.modules.size,n),i=o.getContext("2d"),u=i.createImageData(a,a);return st.qrToImageData(u.data,t,n),function(t,r,e){t.clearRect(0,0,r.width,r.height),r.style||(r.style={}),r.height=e,r.width=e,r.style.height=e+"px",r.style.width=e+"px"}(i,o,a),i.putImageData(u,0,0),o},r.renderToDataURL=function(t,e,n){var o=n;void 0!==o||e&&e.getContext||(o=e,e=void 0),o||(o={});var a=r.render(t,e,o),i=o.type||"image/png",u=o.rendererOpts||{};return a.toDataURL(i,u.quality)}}));function ht(t,r){var e=t.a/255,n=r+'="'+t.hex+'"';return e<1?n+" "+r+'-opacity="'+e.toFixed(2).slice(1)+'"':n}function ct(t,r,e){var n=t+r;return void 0!==e&&(n+=" "+e),n}ft.render,ft.renderToDataURL;var gt=function(t,r,e){var n=st.getOptions(r),o=t.modules.size,a=t.modules.data,i=o+2*n.margin,u=n.color.light.a?"<path "+ht(n.color.light,"fill")+' d="M0 0h'+i+"v"+i+'H0z"/>':"",s="<path "+ht(n.color.dark,"stroke")+' d="'+function(t,r,e){for(var n="",o=0,a=!1,i=0,u=0;u<t.length;u++){var s=Math.floor(u%r),f=Math.floor(u/r);s||a||(a=!0),t[u]?(i++,u>0&&s>0&&t[u-1]||(n+=a?ct("M",s+e,.5+f+e):ct("m",o,0),o=0,a=!1),s+1<r&&t[u+1]||(n+=ct("h",i),i=0)):o++}return n}(a,o,n.margin)+'"/>',f='viewBox="0 0 '+i+" "+i+'"',h='<svg xmlns="http://www.w3.org/2000/svg" '+(n.width?'width="'+n.width+'" height="'+n.width+'" ':"")+f+' shape-rendering="crispEdges">'+u+s+"</svg>\\n";return"function"==typeof e&&e(null,h),h};function dt(t,r,n,o,a){var i=[].slice.call(arguments,1),u=i.length,s="function"==typeof i[u-1];if(!s&&!e())throw new Error("Callback required as last argument");if(!s){if(u<1)throw new Error("Too few arguments provided");return 1===u?(n=r,r=o=void 0):2!==u||r.getContext||(o=n,n=r,r=void 0),new Promise((function(e,a){try{var i=ut(n,o);e(t(i,r,o))}catch(t){a(t)}}))}if(u<2)throw new Error("Too few arguments provided");2===u?(a=n,n=r,r=o=void 0):3===u&&(r.getContext&&void 0===a?(a=o,o=void 0):(a=o,o=n,n=r,r=void 0));try{var f=ut(n,o);a(null,t(f,r,o))}catch(t){a(t)}}var lt=ut,vt=dt.bind(null,ft.render),pt=dt.bind(null,ft.renderToDataURL),wt=dt.bind(null,(function(t,r,e){return gt(t,e)})),mt={create:lt,toCanvas:vt,toDataURL:pt,toString:wt};return t.create=lt,t.default=mt,t.toCanvas=vt,t.toDataURL=pt,t.toString=wt,Object.defineProperty(t,"__esModule",{value:!0}),t}({});</script>
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
            ${escapeHtml(b.instruction_text)}
          </div>
        </div>
        ${b.instagram_url ? `<a class="social-link" href="${escapeHtml(b.instagram_url)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
          <span>${escapeHtml(b.instagram_handle || '')}</span>
        </a>` : ''}
      </div>
    </div>
    <p class="credit">My Tapp, una marca de <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">Anaelí Brand</a></p>
  </div>
  <script>
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(document.getElementById('qrCanvas'), ${JSON.stringify(cardUrl)}, {
        width: 300, margin: 1,
        color: { dark: ${JSON.stringify(b.color_qr_pattern_dark)}, light: ${JSON.stringify(b.color_qr_pattern_light)} }
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

  if (business.is_suspended) {
    return new Response(renderSuspendedPage(business), { status: 402, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }

  const cookieVal = getCookie(request, 'staff_session');
  const isLoggedIn = cookieVal === business.staff_pin_hash;

  const html = isLoggedIn ? renderStaffPanel(business) : renderStaffLogin(business);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function renderSuspendedPage(b) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff · ${escapeHtml(b.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F1EA;font-family:'Quicksand',sans-serif;padding:24px;}
    .box{width:100%;max-width:360px;background:white;border:2.5px solid #2B2320;border-radius:24px;padding:32px 24px;box-shadow:0 10px 0 #2B2320;text-align:center;}
    p{font-size:15px;color:#2B2320;line-height:1.5;}
    a{color:#593212;font-weight:700;}
  </style></head>
  <body>
    <div class="box">
      <p><b>Ups! ¿Olvidaste pagar tu suscripción? 😴</b><br><br>Por favor envíanos el comprobante a "<a href="mailto:mytapp.ec@gmail.com">mytapp.ec@gmail.com</a>" con el nombre de tu negocio y continúa disfrutando de <span style="white-space:nowrap;">My Tapp</span>.</p>
    </div>
  </body></html>`;
}

function baseStaffStyles(b) {
  const font = getFontConfig(b.font_family);
  return `
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${b.color_page_bg};font-family:'Quicksand',sans-serif;padding:24px;}
  .box{width:100%;max-width:340px;background:${b.color_card_bg};border:2.5px solid ${b.color_brown};border-radius:24px;padding:28px 22px;box-shadow:0 10px 0 ${b.color_brown_deep};}
  h1{font-family:'${b.font_family}',${font.fallback};font-size:19px;color:${b.color_brown};margin:0 0 4px;text-align:center;}
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
  const font = getFontConfig(b.font_family);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff · ${escapeHtml(b.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=${font.google}&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
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
  const font = getFontConfig(b.font_family);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff · ${escapeHtml(b.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=${font.google}&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.umd.min.js"></script>
  <style>${baseStaffStyles(b)}
    .scan-btn{background:${b.color_pink};margin-bottom:12px;}
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

  if (business.is_suspended) {
    return new Response(JSON.stringify({ error: 'Este negocio está suspendido. Contacta a la administradora de My Tapp.' }), { status: 402, headers: { 'Content-Type': 'application/json' } });
  }

  // si está bloqueado por demasiados intentos fallidos, ni siquiera se revisa el PIN
  if (business.staff_login_locked_until) {
    const lockedUntil = new Date(business.staff_login_locked_until + 'Z');
    const now = new Date();
    if (lockedUntil > now) {
      const minutesLeft = Math.ceil((lockedUntil - now) / 60000);
      return new Response(JSON.stringify({ error: `Demasiados intentos fallidos. Espera ${minutesLeft} minuto${minutesLeft === 1 ? '' : 's'}, o pide a la administradora que lo desbloquee.` }),
        { status: 429, headers: { 'Content-Type': 'application/json' } });
    }
  }

  const { pin } = await request.json();
  const hash = await sha256Hex(String(pin || ''));
  if (hash !== business.staff_pin_hash) {
    const fails = (business.staff_login_fails || 0) + 1;
    if (fails >= 4) {
      const lockedUntil = new Date(Date.now() + 15 * 60000).toISOString().slice(0, 19);
      await env.DB.prepare('UPDATE businesses SET staff_login_fails = ?, staff_login_locked_until = ? WHERE id = ?')
        .bind(fails, lockedUntil, business.id).run();
      return new Response(JSON.stringify({ error: 'Demasiados intentos fallidos. Queda bloqueado 15 minutos, o pide a la administradora que lo desbloquee.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } });
    }
    await env.DB.prepare('UPDATE businesses SET staff_login_fails = ? WHERE id = ?').bind(fails, business.id).run();
    return new Response(JSON.stringify({ error: `PIN incorrecto (${4 - fails} intento${4 - fails === 1 ? '' : 's'} antes de bloquearse)` }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // PIN correcto: se limpian los intentos fallidos
  await env.DB.prepare('UPDATE businesses SET staff_login_fails = 0, staff_login_locked_until = NULL WHERE id = ?').bind(business.id).run();

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

  const code = await generateUniqueCode(env, slug);
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
      <td><input type="checkbox" class="row-check" value="${escapeHtml(c.code)}"></td>
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
    .toolbar{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
    button#deleteSelectedBtn{background:#B23A3A;color:white;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Quicksand',sans-serif;}
    button#deleteSelectedBtn:disabled{background:#ccc;cursor:not-allowed;}
    .msg{font-size:13px;margin:0;}
    .msg.err{color:#B23A3A;}
  </style></head>
  <body>
    <a class="back" href="/staff/${slug}">← Volver al panel</a>
    <h1>Clientes de ${escapeHtml(business.name)} (${results.length})</h1>
    <div class="toolbar">
      <button type="button" id="deleteSelectedBtn" disabled>Borrar seleccionados (0)</button>
      <p class="msg" id="deleteMsg"></p>
    </div>
    <table>
      <tr><th><input type="checkbox" id="selectAll"></th><th>Nombre</th><th>Cédula</th><th>Celular</th><th>Código</th><th>Sellos</th><th>Ciclo</th><th>Historial</th></tr>
      ${rows || '<tr><td colspan="8">Todavía no hay clientes registrados</td></tr>'}
    </table>
    <script>
      const checkboxes = () => Array.from(document.querySelectorAll('.row-check'));
      const deleteBtn = document.getElementById('deleteSelectedBtn');
      function updateButton() {
        const n = checkboxes().filter(c => c.checked).length;
        deleteBtn.textContent = 'Borrar seleccionados (' + n + ')';
        deleteBtn.disabled = n === 0;
      }
      checkboxes().forEach(c => c.addEventListener('change', updateButton));
      const selectAll = document.getElementById('selectAll');
      if (selectAll) selectAll.addEventListener('change', () => {
        checkboxes().forEach(c => { c.checked = selectAll.checked; });
        updateButton();
      });
      deleteBtn.addEventListener('click', async () => {
        const codes = checkboxes().filter(c => c.checked).map(c => c.value);
        if (codes.length === 0) return;
        const sure = confirm('¿Seguro que quieres borrar ' + codes.length + ' cliente(s)? Esto borra también su historial de compras y no se puede deshacer.');
        if (!sure) return;
        const msg = document.getElementById('deleteMsg');
        msg.textContent = 'Borrando...'; msg.className = 'msg';
        const res = await fetch('/staff/${slug}/clientes/borrar-varios', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ codes })
        });
        if (res.ok) { location.reload(); }
        else { const d = await res.json(); msg.textContent = d.error || 'No se pudo borrar'; msg.className = 'msg err'; }
      });
    </script>
  </body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function handleDeleteCustomer(request, env, slug, code) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const cookieVal = getCookie(request, 'staff_session');
  if (cookieVal !== business.staff_pin_hash) {
    return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const customer = await env.DB.prepare('SELECT id FROM customers WHERE code = ? AND business_id = ?')
    .bind(code, business.id).first();
  if (!customer) return new Response(JSON.stringify({ error: 'Cliente no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  await env.DB.prepare('DELETE FROM visits WHERE customer_id = ?').bind(customer.id).run();
  await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(customer.id).run();

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleBulkDeleteCustomers(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const cookieVal = getCookie(request, 'staff_session');
  if (cookieVal !== business.staff_pin_hash) {
    return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { codes } = await request.json();
  if (!Array.isArray(codes) || codes.length === 0) {
    return new Response(JSON.stringify({ error: 'No se seleccionó ningún cliente' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let deletedCount = 0;
  for (const code of codes) {
    // se busca uno por uno, siempre exigiendo que pertenezca a ESTE negocio,
    // así nadie puede colar el código de un cliente de otro negocio en la lista
    const customer = await env.DB.prepare('SELECT id FROM customers WHERE code = ? AND business_id = ?')
      .bind(code, business.id).first();
    if (!customer) continue;
    await env.DB.prepare('DELETE FROM visits WHERE customer_id = ?').bind(customer.id).run();
    await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(customer.id).run();
    deletedCount++;
  }

  return new Response(JSON.stringify({ ok: true, deletedCount }), { headers: { 'Content-Type': 'application/json' } });
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

  if (business.is_suspended) {
    return new Response(JSON.stringify({ error: 'Este negocio está suspendido. Contacta a la administradora de My Tapp.' }), { status: 402, headers: { 'Content-Type': 'application/json' } });
  }

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
    const newCode = await generateUniqueCode(env, slug);
    await env.DB.prepare("UPDATE customers SET stamps = 0, cycle = cycle + 1, redeemed_at = datetime('now'), code = ? WHERE id = ?")
      .bind(newCode, customer.id).run();
    return new Response(JSON.stringify({ ok: true, redeemed: true, stamps: business.total_stamps, total: business.total_stamps, newCode }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  await env.DB.prepare('UPDATE customers SET stamps = ? WHERE id = ?').bind(newStamps, customer.id).run();
  return new Response(JSON.stringify({ ok: true, redeemed: false, stamps: newStamps, total: business.total_stamps }),
    { headers: { 'Content-Type': 'application/json' } });
}
