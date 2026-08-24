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
      // ---- página de inicio de heytapp.com ----
      if (parts.length === 0) {
        return renderLandingPage();
      }
      if (parts.length === 1 && parts[0] === 'contacto' && request.method === 'POST') {
        return handleCreateLead(request, env);
      }
      if (parts.length === 1 && parts[0] === 'site-manifest.json') {
        const manifest = {
          name: 'Hey Tapp', short_name: 'Hey Tapp', start_url: '/', display: 'standalone',
          background_color: '#FDFBF2', theme_color: '#42281B',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        };
        return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json' } });
      }

      // ---- ícono de la app (para "agregar a inicio" en el celular) ----
      if (parts[0] === 'apple-touch-icon.png' || url.pathname === '/apple-touch-icon.png') {
        return servePngIcon(HEY_TAPP_ICON_180);
      }
      if (url.pathname === '/icon-192.png') return servePngIcon(HEY_TAPP_ICON_192);
      if (url.pathname === '/icon-512.png') return servePngIcon(HEY_TAPP_ICON_512);
      // manifest específico de la tarjeta de un cliente (para que "abrir" desde el
      // ícono lleve directo a SU tarjeta, con el nombre de SU negocio)
      if (parts.length === 3 && parts[2] === 'manifest.json') {
        return handleCardManifest(env, parts[0], parts[1]);
      }
      // manifest genérico (para el panel de staff)
      if (parts.length === 2 && parts[1] === 'manifest.json') {
        return handleStaffManifest(env, parts[0]);
      }

      // ---- tu panel de administración (My Tapp) ----
      if (parts[0] === 'admin') {
        if (parts[1] === 'leads') return handleLeadsList(request, env);
        if (parts[1] === 'signup' && request.method === 'POST') return handleAdminSignup(request, env);
        if (parts[1] === 'login' && request.method === 'POST') return handleAdminLogin(request, env);
        if (parts[1] === 'logout') return handleAdminLogout();
        if (parts[1] === 'recuperar' && request.method === 'POST') return handleAdminRecover(request, env);
        if (parts[1] === 'recuperar') { const pname = await getPlatformName(env); return new Response(renderAdminRecoverForm(pname), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }); }
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
        if (parts[1] === 'update-platform-name' && request.method === 'POST') return handleUpdatePlatformName(request, env);
        if (parts[1] === 'appearance' && request.method === 'POST') return handleUpdateAppearance(request, env);
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

// ------------------------------------------------------------
// activos de marca de Hey Tapp (logo e ilustración), embebidos
// para no depender de un hosting aparte de imágenes
// ------------------------------------------------------------
const HEY_TAPP_LOGO_BASE64 = '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';
const HEY_TAPP_MASCOT_BASE64 = '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';

// paleta oficial de marca de Hey Tapp (uso interno: panel admin, staff, créditos),
// nunca para personalizar la tarjeta de un negocio cliente
const HEY_TAPP_ICON_180 = 'iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAAozUlEQVR42u19d3xc1ZX/Offe9950jUbNsuXecQHTwRhsTCeEhRDgF0I2hCyQEEIgm7bpWZLNbnZTdlMglYQ4tBASAgRCN7ENtrEx2Mbg3mW10fR57917z++PkRvMjEa2NJLtdz/6+KOPLM28ufd7Tz/fg0+81gbe8tZ7FkNk3i54qyQ+vC3wlgcOb3ng8JYHDm954PCWBw5vDckljqSHJQIiANr/E0QA3PuNt44pcOxHAwLnIAzgBjHeAwWtkRQoBaSB9IGY8VYlmwtERyA4SAMRIIIwwbCIcdQSsmmM78H4buzcjfE9mGzHdDfkUujkQUlQLmjtyY+KFiLYORo7w/nIv4PrlNk0McTkhAZkYPrJsFC62L0Hd7zNtqxm299irZsx0QbZNEq7B/KIgIwQ9ysXb1VkZzLIpbU/2OtdGhrg0AoAwfSR6UM7h9vXiXWvsHWv8G1vQaINpQuMETdAGGBaZPkPko0AnkLpMzi0BsMa8jaHVsA4BSIAwHZtEK8/z19/jm1bi7kUME6mD6wg+XCvrilIF+Wd72EaGz2Ke+iCQyvggkJRzGfF68/xRY/ytxZjqouEAaafQrU9FpNnaR5b3kpBWoRqMdNtvPgAf+lBvnkVaE2+IIVqewChPfFwrIGDNBBQoAbtrHjxD8azv2Xb1hI3yR8CQNAeJo5ZcCgJVgCEIVY+Ix7/Kd+wggyLgrVABFp7J3GsgoM0AFK4ju1823j0B2L5U4SsR4N4ouKYBoeWYAaAofH0L4zHfoypLgrW7HVfvXXsgoNAawrWstZN5oJv8defo0CYglEPFsc8OAqqJBQTr/7VXPAN7G6nSB1o5SHjmAeH1iAMEIb58HeNx+8m06JgDSjpbfcxDw6twAqAnTV/fodY+gSFYp6F4YFjr7/qD2N8t/nT2/iGFRSp9wSGB44eZFAwwnZtsv73JtyzhcIxDxkeOHpcVgpG2PZ11o/+BeN7wDMyPHDstzP8YbZzg/WDj2OiHXxhDxlHwWL9gwwrgB07rf+9CRPt4A+C9pDhgaMQzzAsyKWsH38S27eDPwTKc0w8cAAAECADZNYv/pVteRMCEU+beODYp1A0BcLGQ9/lK5/xfBMPHAc7rqFasfAh4++/pnCdhwwPHPtlBvhDbMtq8/5vky8I5BVkeODYZ2owBtIx7/sa5FLAjUqqVb11bIBDaQrUGE/czd9+FQIRL2/igeMghcLXLxdP/ZKCUc/U8MBx4F8gaGX88Xvg2sC4t4MeOPaJDUWBGr7oEb52EfjDnkLxwLHPDCUQJna3GU/eQ6bf81A8cBwIDk2+oPHCArZ7E1h+z0PxwHGA2DAs1r6dv/QA+UOeQvHAcbDYsILi5YdZ504Qpic2PHDshwYIE+O7+KI/keXFQz1wHOSkaPIFxfKnWNtWMCxPbAzyQkTO93+xgWL9q6wSjHHMp/niP5OnUAYdGJxr25a57D6hzkyL+wNE1O9HIyoSG/4QX/MPtmU1WAFPpwymwEB0E/HAyDH1c84PjR2vlczv2hFfuTS5ZhWzfChE/+KjEslBwLhY/jeULvnQo1IZLGQAkcykR1/38bEfu92INu0/HpXd8/Rjb3//myqfQ9GfSdDewEEEwmTde9iaRWQNduALERkDItK6IGD3fX/0IwNA5XJTvnhXywduBJ3Rdtd+jjyGwy651qyLvX7nTf0rOXqzZUiT5Wfrl7OOHWAMpsGBnGvXcbu7ZDYLAKSUm+iWmczAmWNDCRtMppKTP/uVlg/cqPNdpCRysd8gRaZynbHTLmh+35UynUTOqyU5Cufy5sJCY/Qg69pRY5svviI661Szto5cJ7N1y87H7o8vf4UHQ0cx/Qty7nbHWz744ZHXfELbcRSi6O8AyWEXXLbzLw9VUa1wgek427CCDGtwdAoiALip5Khrbxh302eNmkYACaAAMDz1lGEXXP7Gl25ue/5pEQodlfoFGVPZbHjycZNu/wrJdCkxiYgATnDMeKuuwU1095dlysr7KWD42M712L5tkMIbCAAqm5nyuW9M/tx/GuGgtru0k9ZOTjtZlesAxsbd+ClmmnT0OthEetIdX+aBKCm3JK0sAmklQmEjUkP91xrCenkwYbBNr6Odg8GYBoecyWRi4m1fGHnNLdqO9+haxgpfTBig875hw62GRipL03wEK5REovniy2OnnqedRFljYu90AC56qOIHHhwIWrHNbwwSMoSbiI/4p6tHX3+7tuPIWLHjxwP+PepkhpRGTc3Yj90K5PTyGYkAgLQm6QJgf3E6lz11zjGbZLvWVz8wioypXDY4dtKkO75OMlMCGQCMu6mkTCePvpo05FymU83v+0Bg1DTt9O6UIeMql5HpVD96K6wcGLmB8T3YtQfEINSXk5KT7vg3Ea4nVVxlkNYAZmbzBjfRzfo7OFipG3VAjqNf9RqSlEa0dtTVHwHK9yq5iQhQuF2dMpUshH8GHBwkDNa+DXIp4Lya7PPIuZtMNJ1/af3si7TTXfYqsK6li7SU1Tc4kHOS0k10O/EuJ97lJuKkZH8FXZAzmUk1nnuRf+QU7eZ6f1kiAJHduV1l+zPwU8aVJWAc27ahcqm6Sp2UFKHwuI/fBuSW1LVEKAyV7ehYspD7/VX2Y5ExN9Htax7RNP8S/4gWYDy/a2fH4ufd7jj3Bw7/YUhrZvlbrrgWQFZsUbH0hnX9e096iXNgx/bq30inOz76QzcEx87UdryU2CCtmRHpXPJ0ZvOG/vXfKoGGm06NvOYj4268w6xr3nd4uZ0b3/zSJ1LvvHWYYEXGZCYdO3V25LgTya1MEiACyOS61ch5P4p4Vu4NlcKuVqhmfBqRpDSjsVHX3gA6X+YSIGNAzo5HH0Bk1bQ2kHOZSoz/l9umfP57Ziyq7W5tx7UdV7kO/4jxk+74co8FcJiboFTzJVcAWqQreCkiJgyZ7kxveJtbFvVfrJKVA6N0MNVFjFdt95ExmU4Nu/Ayf0s5XUtaoxGKr1wcX75EBKsXG+0xhuZfPO6mL2qnm1xnnzXKhEEqFZ441dc8Qh9O0AVR27Z/xMj62XNBVyQ2iAiYldm0Pt+6C/s1/1X6vRkDN4/ZJGD1vERSSoTCI6+6Dqj8/hIAbXvgt1pKYFg1qaZd16ytm3THl0E7PVv0rl8Rglk+0HQ410PlsvWz5xo1wysFGRGAiK9cpnK5/k1DspLvhwxdG+wsMFYdV6Xg2defNS84foYurWtJa2aGE2++0vHy8yIUrpq1UZBqI6/5iK95onaz7308ZFzlsuow86JEaBiN8y4CUBWKH2QI4MSXL2GGUa2UPSJIB1y7el4iEQox4opre0RD2bXld7/UrlO9fD2idhzfsOEtV1xLOovvibkREaCZ3bHV7uo49LwXosrng2PGR2eeSCpb0acjQsPKt25NrlvDLB/p6oHDRSUBqlH9hYzJbKZm2gm1s84gmSntpChmhrtX/qPj5WeNcKSqYiObGXbeJWbdaCp6YQqyfcWrhyPbkTFl5+tOn8N8MZIVdaiT1gC++GtLnc52Zhj9K+PLeSugZPWGtSJq12m+9AoUwTJHjohAestv79FKVTOlQlqLQHD4+68qZQwh5yQz7S89y8xDT18TETOM+tlzK9cpgAigOxa9MBBO5dAoo0LUjuNvbmmcdyHokuKUlEIj3LX0+Y7FLxmhMFWr6w6FkMlE0/mXhCbOKmoMkdIogt0rX0mseUMEDjUIhqhtOzBiVGTa8aBzyCoyRZlhOp074iuXcV//RwKHBDiQMZXNNMyZb8ZG6tJWDjJG2t38259X+dm0bZv1jeNvuoO0jUXTHAwAaPvD95E69AAlMqbtfPSEk0WwQbtuJXKRtAb0dy1dbLe1MrP/k6NDQ3JozSxr2EXvByi5uQWx0bn42fiyxSIYrlJsgzEiUrns1C9809c8nmSRuBxpzYxgat2KjkUvHr73FDt1dp+EDYBqe+HpAVL9bCiIDZnLRabOqJl+EsmSOgUZI2Vv/f2vAKvmWguSUiYTUz73jcb5V2q7G4sWBhABGLueeFTlsofhPSFJ16yNRWfOArAr9FOY4cvv3hRfsbRfEjpDUnIgasduOu/SMqZoj7Xx6gvx114RwWDJjUBExpBxZBwZ62uNUk+NWSH/DuAmuphhTL/rRyOvvaVkIVYh/5fr6Fq6iPsDhVc54AsrfmtUth0cN8k3bBRVFj4grQF97Quftwt+ygBEsQd/lr2W0qqrb5x7HlC+tNhAILntwftKbi1D0ppcV0mXtAYiREQhmGGiEIWf9CKftVa5LGlNShFpIxJtvuQD4z7+6cDoKdopITN6BIxht2/Nbt0MQCp/0BuhMCqtrkDUjhM9/kRgfnLzlYTRkDNSuT3PPjkQ1saQAAcyLlOJ+jPO9g2foJ1UUXCQ1swMJtcs71q2mB+cSUHGAFDls8rOc5/fqm+yGocZNTWIXDu23dGW273D6e7iPj/3+UtaA4ikFBMiPHk69/t9Tc2R42bGTpsTHDMVwNV22YISRJKO1TB82MWXJ1e/jvvOiQAYs9tbVSaDlVxrIiZEdOZJALoSD71nT1YvS6xZNUA6ZQhIDgQgajr/UoDSyVUiAGP3E4/qfI77fD1njFjwcbSU4UnHNc69MHbq7OCYcUZNFNAAQACt7Wxu147OJQt3/vn+9Ma3jUi01CaSdKd+/b+azrsCKA/oB2AAtnYSiFjBJdbcMqZ9/fvayRzwM0JhpTeuXfnpG2Q224v8QNRSmrG68KSpACUcomJ70vr0X3U+u39PjipwFDKQLaPqTp1dMrxBxAzTTe5q/8fz+64IMkZKucnumhmzRn/45oazz2NWDYAEskm5pJ2CokDBg2MnBsdOH375tRvv/u9tD/xGBEPvPiRk2s4Hx0xoOvciUlnQisgBAmSIldalImkFKov8gM3kQMoNTz4ldtpZu5941KiJlo/sKccOTJ1uNTSTrCDZVtiTxK62l57h/uDAOW5iUHUKk7ls/ZnniEhzqboe0hoNf/fKZ3O7dhjhGtIKuZCZNPf7J935tZHX3MCMIKmUtrsAGSIC4v7wERG5OdIZ7jMnf/Y7Ziy24Sf/XXiRA40NUtKM1QET4OSBsUPyCrHQ6Hzgg4MmIPING9774SFq141MmQ4sQG68V1lFWqMRbH/pkdyObUa0duByCIPqrRQykOcWMpDlHrJr2RLSGhBQCDcRD0+cfPI9D43+8G2IWtvdQFDoZyly55AhF6CVtrvH3vCvwy58v5t6t9+BjMl0kpTbrxFoBCxYM7oyGYqRqTMqdNGRM9K53U/8CQe48HvwwIGo8rnQuEnRmSeRypaS4cgYUDb1zlpmmMi409XZNP/ik+55ODx5hs53QaFNtJJgEQLo/IRP3mnUROmAQkvSmplWdvvW/O6dwMz+FtHabmvtNWhBSolAMDRhMoDbq04hrVEEE28s6171mggEBzQYOGjgQMZUPl8/51xm1ZbMQBIh5yqXdjrakXO7Y8/ID3545n/+XPgt7aSKthSXC067Of+IyQ1nz5eZg5pOUQi3O77r8T8i85GS/XUXUXDtJNMb32GmWS6Tjqhd12po8g9vAe1g71qNAPiuvzykXWegC50GDRyFPGfj3PPLXRfEgs9mxurIdSZ88vNT/+2/SNkkXTy0LiaC+jPnvSttQUqLcGTrgl93vvI099ejYRx+upe0QuZPrVuT2byBWb4yPeiISK4TGDmGB6O9144TMcOf2/l228JnRTBUoc46wgxSZExmszXTZoYnzyBZtgCCCDib9s3/0flccPzx5KZ6BnockiIDdELjJ4pQ6GAjjgrm5BtfvHXsR28dduHlZl0dIlRcolesolgToLH9j/dp1+Z+fzmbEVErGRw3EcAEyvSuU9C366+POF2dZm1soMtZBslbQdSO3XDOeciDZfoP9sYuHf+IUQBsb6TyUNOeiEDKiMZEKPxungIiFAK0Xv9/391y3z3hiccd/18/EaFIySwrEWmNjCEXwBgCA8ADHowAzNa//aH16b+KUO9tE4gYHDehMvvddBO7dz/554G2NgYTHKSUEalpmDMfoJI8ApLrEBEefkMsETMMZhbjGiECxsxYnd3RbkSjItJYKmILpFEYiEGAvEx1y3RK5XMkJUlJSgECKehY/MLWBb/gltWrA0JaM9MXHDW2TEZ6/28awdan78vu2GJGY1WoghsEcPQ07Zx8RnDsZHLzFTbtYL9kpRFIKZIl2siISEpmGMPfdxUAFrdMSaPhdxPxnY/e0/nqP/KtO2U6rV2HlAIqJFaQtNaOLULh9wQ/ihlVShnhiDVsOIBb/jOiECof3/mnB3h/14oOJcmBqF234ZzzAX2kc/3YFV5JiECmUzKbhqJviqjsfGDU2NoTTyWdRc6KuZG+3M5tr995Y2rdaubzMyGAcSww2QHvockA6LEzKnB8SEqzrt6sjZUvFCKlmFXb9vSC1Pq1Rk1tdYpnq++tIElp1tbVzz4HIF9NujciAjByu3bIdIoVS3YgYyqfa5hzLg/UU7FarMLNXvfdL6feXms1DhOBIBrmAf31BNTzVeHhISJJ19fUzMxg+T9BzrWT2v7g71gVafuqDQ5kqHLZ6PEn+VsmaCdf1e54IgCeXLtKOyU5Hbgv0Dj/4qLeNWmFRqjr1Rc7lrxsxuq14/RUAhzOUSGSUr5hwwHKHTkphSLcvvCpxOrXeVVM0UGSHIikVOPc8wGM6hPCANldy4o3/yBjKpeLTJ0emXp86YI03P3UY0C6H0vRiMg3bERvypCTm9m24NdYXaIUVmVkaNe16hvrTp8DlKuqTtEaDV926zuJNauKF2ojasdunHch8mCR4BIRMyy3e3d8xav9Wz+BjFmNw8qgrSA29jz/ePcbr5WrgjvSwYHIVC4bPfEUq2m0PuReOiLSuvfiriI6xWp74e89EY6ihmFtrOGcQkFakSpiQF/izZV2667+rMkjQiGsunqAkv1ByLm2k1vv+wWrOqFjlSUHAFHj3AsBDqVzn7QC0miYzAwxM4SGQVpVmskUXDvJPc/9jVs+KqZTZC4bnXVKYORE7ZaiWWJdSxdppfrRTiKtmWka0RhAqeJZiSKy+8lHkmvf5IFAlTlqRDXlhnYcX1Nz7NQz+6xTiIiImTUAKt+6Nb9nNwAERow060eRyvTKrkxaMTMSX/FCav264k1HiKBV0/xLAIq3uSLnpNKJ1a/zfnQWEEFrZvlFKAygsViLJQpTpvZs+d3PWdXZi6oKjsLtbDz3IjPWop1EH8KdpIEJxgMdi/++/cHfJte+ITMpABChcPPFV0z45OeRM6CybZsEALz9hb+T6wAGi6O2eUT9GWcDFTNFidAw7bbW3O6daBr9SIhLWgvL4v4AgC6OaaNm2wM/zmzZaNbWUdXnO1c3CIbYOO+CPnVmk9ZMWMpx3v6PO3f95QEAZD4/My0A0Pn8pp//kJnmhFu/Wr4MGIXQdjy+YmnRPnRkTOYywy68zKgdUfR1iAiBO10dPUSO/QoO7vMxy3ovdztpzYxAbse6bfffa4QjNBgTF6tIYWDb/hEjYyedXqYb9r2bh9yU2ezrd9yw4+HfiXCNCEd6jocIOTfrGvY887jMlGvcIK2RW9ntW3K7tjPTLJpVQS6a5l8MUIYZj6l8jg7J4EDGe0gp323KIJBmlsWEQUTveWUCZm742ffdRBwHhUizauAoENbUnXaWiAyrmLCm8Hi4+muf7lyy0GpoIqUOjEkXNlRmszKZACbK+ilGdsdWmStWb7aPEmPWqWUpMYgZZp99b0QAclMJ7ThuslvZB0WEEQFob2/Le9xXZkY7Fj6+5++PVZsObxDUChEK0Tj3grK3811/oZhZu/Geb7c995RV36hdt8gvac19fh4IApXfPnTjXaCKVKoWQub1s+dxf12p4gFEBJBWfYMIhmQuW3mfEhCR0pNu/1L0hDMyW9ZvXXBPZvPGA7PthVQzMnaQsVmwQ5Pt7/zwP9AwB5HyvyqSY29CK3rCKaCzlfRlkNbMDCVWL95y7z1GbUxLt+iZadfxjxhpRGIke893l9T6fn/jvAvKZcwRyXWshhHBsRO0Y1eYH2ZcON3xsTfeOvr622tmzBx+2XUn3/1wZPK0A1tqEZGUooNJUEhr5MH1//edzJaN3DeYQ/WqAY5CuWjd6XN4oF67biU6BRFJ6413/4CkW1KYI2rXrT3hZEBfr26eCIWL8LsxpvO58MSpZUPme7HFrOHvu1Lbdu9+FiIKI9+xZ/ilV4z96G3a7tZOTmU7jGjT+E/ceZDY4FwmEyqbwb3JfZIus2p3P/mHHX+634jWVt9DqbrkIGJC1M+eW2mvn1JohLqWvtC5dJEIleR2Iq25P1A/e24vRduIAE5o/ETu8xfpaHKc+rPORSPca1KU3NSwi69qOPtcu6ONGWbxd0RELkBru2PP8EuvnPb1H5ByC/1RKASQZKYFjO0zmphh5PfszmzdBMyvpatdl/nqEquXrPvPr1WTQnPwwIGoHds/vKVm+gmgcxX1+iEC0I5H7gddEkwFWyE8+bjwlJnlq1CRMXKzofHTYqfNtjvaCgYgco5CkFIojIaz5wNUYiMTMJj2zR/WnTHHbm/Vjv1eYnztOG53J3Ix+Y6vzvj2T1Ag0AHaCmH7w/eRlPsVEyJpteXeu0lL7q/n/rrEm6+s+twt2nX712ceogYpMibz+ZoZs0S4saLYF2lm+rPb3o4vXyICwTLdz9q2m869CEWolypUAAAk0lM+f5dKp+OvvUJaExACIhfNl14ZmjC1lyLnfZBVjhmtnfW/v9v+4G92PfbH7M6t2rYLjMGIjPl8/uaW+rPmtVx5XWD0VHIThc+/34R685X2l545kOCFtBbBUPs/nl/xiasbzr7Q6Wrf8egClc9zyzcUppKJ6qiV2ElnALBKYl+kCcHqWLzQ6Y6XLrBGktKM1Teee2EZ4oaDz9X2NTWd+NMFXcsWpde/JdMpo6a2ZuasmumzSlYNFkM6SRs5H3397S0fvD79zlvZbZvdRBwYM6Mx/8gxobETebAeIP8evBIAbvvDvdpxuD9w4IcqtGjEX1/euXQxIopQeIggoxrgIKVEOFIz44TKaokLOsWNL11UZoQKcuYmU03nneMfMbFkGfB7z9W1AVnd6fPrTr9g709dcrN9i2shA621jDPDqJl5Ws3MA1maXNC2tuPIDurNJ62ZEUquWdq+8BlRjB6zgA8IhgrfD51JhgMMDmTazgXHTvSPHEPKqWRuCDMMN9Ge2rCOmVbJLAYBAAy74H3liBuKniuAdlL7/6Sn9rPPVhRyDlprlT7o3RFLUDYQINu64FcqbxtWcbqEoTnaUgwwNlA7TnjiFGZGtJ3ovX+cCNHM7djqdLaX5HhH1E4+0DI6dsqZfYjEH2AD9ZehjZWRMzEzlFz9atuLz4hweLBinUPUWyGtw1OmV/pGhYlD27eqfBkKKKZyudjpZ4lwkz4yhkLi5nvv1o59xA3PHmC1QsRMMzRhch8oeQHzrbvKiVki4Lx+9rxqThY7ZHuLWZGuZS+0v/xcDxk3IiKD/cXqGobwRNyBBAeiltII1wRGjOy1Y+fA5cS7sHQkW7uOr6k5Ov2EivyUwZUYjJFyNv3yx4V2OgTUTl7adk+CnjFmmtzyHZs2B5KU5vB6M1YPyq28xVXlsqXxxpRthydNNWqbKhmoOahiQzIrtvvJBfHlS8xYnZtMkpKBltGh8ZOtxiZkzO5oT296J7t1ExCIUHgIShExkIIDSLpWQxPzBcntp5nWCFrKyHEzq9/Z0Fd9itySyT2bfvF/3O934l3RGbNGfehfYqfONmrq9m67Upnu7teXb3vgVx1LFopgqPf2yaNJrZDWVkMTgEk625eBT+UK/pDz0ITJRevqhhA2tGJWzeZ7v5vduolZ1riPfWrcTXei8IPOaGevA4zIfGbd7PPrZp+7/cFfr//Rd1AIYNUaWVcBX4EY4D3SZqyuj6QJRKpkIo204v6Av7mlLxbuoCAjknhz0faHfo+cT7zt86M+dBu5SW3He6iV9y2ttUwA4shrbjZjdau/egfz+aoj2ICJnnKjMtVvA/0YRjjS5wcvwyartQgEjGgtgMShCQ4iRKHt7Dvfv8uJd4644tpRH7pN23EAQi7eDehC6o4xne9sOv+qsR//lEwmBr6zHBGAhNGroh9gcCAwn78/X1BrZvl4WSKlQRcbaIQ3/fIHXSteDY2dMP6mz5DOFTgwy+0TFyRTY66/JVyoBkI24JLD8hP2ku0acMlxEHVrf+F+yCoUJZkV61j05Nbf/4oJo3H+xWb9aHJzUEFqkJTLrJoRl39Q2fkBH3lJGvyRXkc7DnzizXX6KvDKjTcrsK/0y3CxvVZhv5oaodzO9Wvv+hIKgaTrzjgbSFXqpjEGYMdOObM6s+soFO39iQb4EUBm0n38G+WmkyWNdsZ0PqeymcN9ctJoGCj6b2Ke1shNlcuu/sqnnc4O5EIEw4GW0YCVRv8QELRrNQ236hqpsmLKw9qAmoZBBgci2u17Kj8AZIxk3unqYKWGmzAuMxm7ow1AHHLnGSmJRiS5etW2+3+Noj+q8UgD48jEmq9/pnvVayIcIelwn4/7/H1wuRGJiJkmCwSotwbPw5WZXFBtE/T2wQcSHEQoRHb7FqBKRw+hMJyuTntPKxrFuw4LwzXTG98GOsQ+H1KKWUEn3vbmVz6z49EHSB5uDJ60BuQofGu+dWfrM08Y0QKBE9PS1ZWXEfW4OUBKUQ+3zIBFO7QG00e1w1D3UrLPBhIbxCwrs3mj3dlaCesIkQYy0xvWOfFOVur3CZCx+LIlgOoQrhYpyayATCVXffaG3O4duR3bupa/jCJ0yDqelGLCBGau+eZndv75wZ6O1kJZeSppt7f2TcIx4cQ7na5OxgfMFkQEJSkYpZpGUL2MGRxYycEM027fE1/+CmAFTeJEgLz95efKNKEQaR4Idi1bnN+9EUXfyulISmbVOB3tKz59ffcbK41IDSm55Td3k3YBDyEuSaQks8Iyk131uRt3/eWhA3udC3UF3SuXARgVet2F8cHJNauceBcaA5ccQFAuxZopXAtq8CRHj6jkYuejD5Sa1Xvg1qDht9s27XnuKV6mKp+ICeF0dW5d8BtkfqisvZi0Iq2ZL5Z8a+XyW65Orl5lRKIFNsiu5Yu3LfgZM2v6xHpOSgEgs2LJt1Ytv/mD7S8+Y0TrDqoMJeI+3+6nH9NOElllGhABQO16/BFkA5lhQUQlqXk8mf5BtTn2Vld3vfbKzkfvY2ZUu27Ra0RaASAy/4Yff8/pbZwdKSUiNTse+X3Hy39lvjoqDHUrpdiUIq2ZGWFmYPvDv3jtE/8vt3O7CEdISQAssJ5v+Mn/tD71APPVFfROubfWuiAbmBUljVt++8PXbrk6s2m9UfOe7iOtuT+QWrd6559+j0ZE99abRNJlZm37i493Ll4oQgM8GJVIj55WiTfEr7v5cyX+R2AmIV7+I+jDzWIwYXQseTk4dnR44onICZTcz8NHhAyZEUTu2/izu7Y99DsjUlPJ9BoAaFv4bGjsmNCEE5Dju16zZwCgYaAIIzfiK5a89e0vbH/g18wwmXnw3AxEZKztuaeQ6egJpzGzBpkipeDgVwMgRMYMH4owKaft+Sfeuuvzu/76EDMtZlql+BGYYXYtW1I768RAyxRy0lh0XiQRKcl8sey2t9/80qdIujDQdQiMy0tuhmgjqHIOMyLiE6+1FVf/hoVtW33fuQakc7ijXAsdoUqOvPqfW666PtAyGsA6QHNnk2vf3HLvT9peesYIRyq9NMhIuSTliMuvafnA9aHxE4EFDv4N225vja9Y2vrUnztffZmk7LmR7xUMiAAgU4maGSeOvPqjdafPMWONAMa7TXw3nd26qXPJwtZnHk+ufYMJ0cP6WFrSIGPacXgwOP1bP6w7/XyArHbsd20kM0xgwdS61974t1vzu3YM3DS/nk/qOlTfkv/yQ2D4gFS5rFuVwFF4LAKZSpixuvCUGcEx40Q4AlrbnR3pjW+n31mrHUeE+khRsvdQRSgcnjQtNH6y1dDILEvbebujPbN1c2bzeru9FZHxYKjQfFvuxTiX2Qy5rq+5JTxpanD0OLOugfv92nHc7nhu147M5g3Z7ZtlKsFMi/uDAFTJKRbwQUCjrrlh5NUf9Q0bBVDYTCp848Rbdz324JZ7f6ryuXe1tAyEzMBMtzzzCvvmH2AmAWUbzKoIjr0HQFL20MgTAQAyRMPkPj8iOzTyGuSclFL5HLkuEUGB9KIwVNa0mGFWeIqFgyw0b2rbLlgJCEhABf+ZGSazrEKXYt8uNyIQyVTSamiKnTK7ZvoJVtOwQiVYcu2bXUv/kdu5TYTCyPmAFwsyjplu+8bvybOvxkx3r+CoKu0TKQWM9ZQ8Hah0tSY69EgDAIhA8N3qk4iI+gS4ntGTwhCGVUTcFp7zEG42EQAY0VqZzez+26O7n3wEGAfEAl8I9wWMaG1VepkQlEuRej3pZCzJmHjQqjoxPhENgJ/WnztLdMhILQ9i5NyoiRZCeT0TgHo8oKo0szDEbE5OPYMaR0E+MyTBcSyvignzB0pykFazzicukCriV2LekR0TCxGkreuG6+lz0M5WWEXggeMYAQfDfFbNnKfrW6DiNkEPHMeIRtNk+dWZ/4SyD5UiHjiOgcU45DN6yul6/CywM5U3EHngOCbkBgLIeR8i1jcqKQ8cR73YYJDLqEmnqBnnYC4NfZmw6YHjGDBGgeQFHyNh9bWfwwPHUW5tYDalpp+tTjgXc0no42BeDxxHu5NimO5ltxYSn32GlreBR+3iAjMJOedqNflUyKUPoUzEA8fRamgwcHK6cbR72a2Yzxwa/4UHjqMVHIiO7V71rxQbBvIQmdM8cBylCiUdl2d9QJ7+fkx399UO9cBxFHsoDPIZPXyCc/UX0T4sQiUPHEebNgGtgXHno9+GSN0hKxQPHEenHYrZpHv1F9TU2dBblagHjmPM1Eh1yvkfcc+/AdNdcNg9lR44jiZkdKkTL3A+9FXMpfqFu9EDx1HjnnSriSfbN30fSPUygtkDx7GFjExCjzrO/tTPwPSD60A/UYp54DjikQGZbt0y2b795xCuBSd3mEaoB46jyc6I67HH25/9DUWbwM72IzLAa004cn1WYByTnWrmXPuWH4EvCHamf5HhgeMIBQYDIEx1ynOuca7/FiD2rzbxwHHELibAyYFWzjVfci+9Be0sKDUQyPDAcWQJDARkmOnWdcPdf/53Oet8TMcBEAaM7tgDx5EiMDhIF/MJedKF7nVf0/UtmOyCAWZJ98BxJFgYiJjppkidc/UX5LzrQEnMJGDA+fM9cAx5PQL5DGolT73UvfJOPXwiZrp7BMnALw8cQ1dagJNDJ6/GHS8vu1WeeAFKF9NdwKp3ZB44hpptwQAQ7Cy6th4xyT3vn+XsK8gXxEwSEKqJDA8cQ0xUaAXZNJLWo6a651wjT38/heswm8TDrszwwHHEYoI0ODl0bAqE9PQ5cvaV6vh5FKzBXArTcWB8UJDhgWMwbEzYO0xIS7CzKB0yLBo+Qc6YK0++kEZPI25gPo3pODA2WLCoDByFsUhHwEjwIYoFQNjP9UkalATponQAkQI1eswMPeVUNW2OHjuDglGUDthZJBpEadEXcCgJSvYX1eSxsogKs8hBa9AKC9OEEcnwUShK9S3UMlmNO16PmUFNo8kXQiXByWE63uO7DpmbKHoRG4FIP/KQHivY4AK4AMNHviAEo1RTR7XNuqGFGkZR3XCK1JMvAADoOuDaPSHwwdYgxc+/OEntXjGImaQHiz4vLogLEGbhiwoTQ4lQS5AuKNkz7AEHMC3SDz51LyS1yKmm3jvrw1ArCuwM7iPT2WeNDj0hcQg2B4F0vbM+ZGO0J2V6xFrzFXgr3jpWl1dD6i0PHN7ywOEtDxze8sDhLQ8c3hqirizznFVvFRUbCP8fD754aN7g628AAAAASUVORK5CYII=';
const HEY_TAPP_ICON_192 = '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';
const HEY_TAPP_ICON_512 = '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';

const HEY_TAPP_LOGO_CREAM_BASE64 = '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';
const HEY_TAPP_MONO_CREAM_BASE64 = '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';
const HEY_TAPP_MONO_BROWN_BASE64 = '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';
const HEY_TAPP_MONO_TERRACOTTA_BASE64 = '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';

const HEY_TAPP_BRAND = {
  blue: '#BACCE7', cream: '#FDFBF2', brown: '#42281B',
  mustard: '#EBDA8B', terracotta: '#B0472E', paleBlue: '#DAE7F1',
};

// ------------------------------------------------------------
// contraste automático: elige, entre los colores YA definidos por
// el negocio cliente, el par fondo/texto que más contrasta entre sí.
// así los botones de registro/staff/datos nunca quedan claro-sobre-claro
// sin que la administradora tenga que configurar cada ventana a mano.
// ------------------------------------------------------------
function hexToRgbParts(hex) {
  const c = String(hex || '').replace('#', '');
  return {
    r: parseInt(c.substr(0, 2), 16) / 255,
    g: parseInt(c.substr(2, 2), 16) / 255,
    b: parseInt(c.substr(4, 2), 16) / 255,
  };
}
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgbParts(hex);
  const lin = v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA), b = relativeLuminance(hexB);
  const lighter = Math.max(a, b), darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
// devuelve { bg, text } tomando el par de colores propios del negocio con mejor contraste,
// para usar en los botones de las ventanas de registro/staff/datos
function getContrastButtonColors(b) {
  const candidates = [
    b.color_brown, b.color_brown_deep, b.color_brown_soft,
    b.color_page_bg, b.color_card_bg,
    b.color_pink, b.color_butter_mid, b.color_butter_light,
  ].filter(v => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v));

  let best = null, bestRatio = 0;
  for (const bg of candidates) {
    for (const text of candidates) {
      if (bg === text) continue;
      const ratio = contrastRatio(bg, text);
      if (ratio > bestRatio) { bestRatio = ratio; best = { bg, text }; }
    }
  }
  if (!best || bestRatio < 2.5) return { bg: b.color_brown || '#593212', text: '#FFFFFF' };
  return best;
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
    <div class="quick-palette">
      <label style="margin-top:0;">⚡ Paleta rápida — elige estos 5 y genera el resto</label>
      <p class="hint" style="margin:-2px 0 10px;">Elige el fondo, la tarjeta, el color principal (texto/marco) y dos acentos. Después dale a "Generar paleta completa" y se acomodan solos los otros 24 campos de abajo — igual puedes afinar cualquiera a mano después.</p>
      <div class="quick-grid">
        ${colorField('qp_page_bg', 'Fondo de pantalla', v('color_page_bg', '#DCEAF4'))}
        ${colorField('qp_card_bg', 'Fondo de la tarjeta', v('color_card_bg', '#FFFCF5'))}
        ${colorField('qp_brown', 'Color principal (texto y marco)', v('color_brown', '#593212'))}
        ${colorField('qp_pink', 'Color de acento 1', v('color_pink', '#F4D3DF'))}
        ${colorField('qp_butter_mid', 'Color de acento 2', v('color_butter_mid', '#F9E6B2'))}
      </div>
      <button type="button" id="quickPaletteBtn" style="margin-top:10px;background:#2B2320;color:white;">🪄 Generar paleta completa</button>
      <p class="hint" id="quickPaletteMsg" style="min-height:14px;"></p>
    </div>

    <label style="margin-top:22px;">🔤 Textos</label>
    <div class="colors">
      ${colorField('color_brown_soft', 'Título bienvenida: "¡Hello!"', v('color_brown_soft', '#8A5A34'))}
      ${colorField('color_brown', 'Nombre del cliente', v('color_brown', '#593212'))}
      ${colorField('color_text_progress_pct', 'Porcentaje al lado de la barra (ej. 40%)', v('color_text_progress_pct', '#593212'))}
      ${colorField('color_text_progress_label', 'Texto debajo de la barra: "X de 10 sellos..."', v('color_text_progress_label', '#8A5A34'))}
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
      ${colorField('color_border_qr', 'Contorno del recuadro del código QR', v('color_border_qr', '#593212'))}
      ${colorField('color_qr_pattern_dark', 'Color del QR: cuadritos del código', v('color_qr_pattern_dark', '#593212'))}
    </div>
  `;
}

// ---- botón "Generar paleta completa": a partir de 5 colores base, calcula
// tonos derivados (más claros/oscuros) y llena TODOS los demás campos de color
// de forma coherente, para no tener que elegir uno por uno. ----
function quickPaletteScript() {
  return `
    function hexMix(hex1, hex2, weight) {
      const c1 = hex1.replace('#',''), c2 = hex2.replace('#','');
      const r1=parseInt(c1.substr(0,2),16), g1=parseInt(c1.substr(2,2),16), b1=parseInt(c1.substr(4,2),16);
      const r2=parseInt(c2.substr(0,2),16), g2=parseInt(c2.substr(2,2),16), b2=parseInt(c2.substr(4,2),16);
      const r=Math.round(r1+(r2-r1)*weight), g=Math.round(g1+(g2-g1)*weight), b=Math.round(b1+(b2-b1)*weight);
      return '#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
    }
    function setColorField(id, hex) {
      const picker = document.getElementById(id);
      const hexInput = document.getElementById(id + '_hex');
      if (!picker) return;
      picker.value = hex;
      if (hexInput) hexInput.value = hex;
      picker.dispatchEvent(new Event('input'));
    }
    const quickBtn = document.getElementById('quickPaletteBtn');
    if (quickBtn) quickBtn.addEventListener('click', () => {
      const pageBg = document.getElementById('qp_page_bg').value;
      const cardBg = document.getElementById('qp_card_bg').value;
      const brown = document.getElementById('qp_brown').value;
      const pink = document.getElementById('qp_pink').value;
      const butterMid = document.getElementById('qp_butter_mid').value;
      const brownSoft = hexMix(brown, '#FFFFFF', 0.35);
      const brownDeep = hexMix(brown, '#000000', 0.30);
      const butterLight = hexMix(butterMid, '#FFFFFF', 0.45);
      const stampRing = hexMix(cardBg, '#FFFFFF', 0.5);
      [
        ['color_page_bg', pageBg], ['color_card_bg', cardBg], ['color_brown', brown],
        ['color_pink', pink], ['color_butter_mid', butterMid],
        ['color_brown_soft', brownSoft], ['color_brown_deep', brownDeep],
        ['color_text_progress_pct', brown], ['color_text_progress_label', brownSoft],
        ['color_reward_heading', brown], ['color_reward_text', brown],
        ['color_text_qr_code', brown], ['color_text_qr_instruction', brownSoft],
        ['color_text_instagram', brown], ['color_text_credit', brown],
        ['color_stamp_bg', brown], ['color_qr_bg', pink], ['color_qr_pattern_light', pink],
        ['color_instagram_bg', pageBg], ['color_butter_light', butterLight],
        ['color_border_card', brown], ['color_border_progress', brown],
        ['color_border_stamp_ring', stampRing], ['color_border_qr', brown], ['color_qr_pattern_dark', brown],
      ].forEach(([id, hex]) => setColorField(id, hex));
      const msg = document.getElementById('quickPaletteMsg');
      if (msg) { msg.textContent = '✅ Listo — se acomodaron los demás colores. Revisa la vista previa.'; msg.style.color = '#215A34'; }
    });
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
        QRCode.toCanvas(document.getElementById('prevQrCanvas'), 'https://tudominio.com/ejemplo/EJ-0001', { width: 44, margin: 1, color: { dark: qrDark, light: qrLight } });
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

// el nombre de la marca (ej. "Hey Tap") lo puede cambiar la administradora
// desde su panel, sin depender de que se edite el código cada vez
async function getPlatformName(env) {
  const row = await env.DB.prepare('SELECT platform_name FROM admins LIMIT 1').first();
  return (row && row.platform_name) || 'My Tapp';
}

async function handleAdminPage(request, env) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (admin) return renderAdminDashboard(env, admin);

  const row = await env.DB.prepare('SELECT COUNT(*) as count FROM admins').first();
  const hasAdmin = Number(row.count) > 0;
  const platformName = hasAdmin ? await getPlatformName(env) : 'My Tapp';
  return new Response(hasAdmin ? renderAdminLogin(platformName) : renderAdminSignup(platformName), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function adminBaseStyles() {
  return `
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;background:linear-gradient(160deg,#DAE7F1 0%,#F4F1EA 42%);font-family:'Quicksand',sans-serif;padding:24px;}
  .box{width:100%;max-width:380px;margin:60px auto;background:white;border:1px solid #EDE4D3;border-radius:24px;padding:32px 28px;box-shadow:0 10px 30px rgba(66,40,27,.12);}
  h1{font-family:'Baloo 2',sans-serif;font-size:22px;color:#42281B;margin:0 0 4px;text-align:center;}
  p.sub{font-size:13px;color:#6B6259;text-align:center;margin:0 0 20px;}
  input{width:100%;padding:12px 14px;border:1.5px solid #E2D9C8;border-radius:12px;font-size:15px;margin-bottom:10px;font-family:'Quicksand',sans-serif;background:#FEFDFB;transition:border-color .15s ease,box-shadow .15s ease;}
  input:focus{outline:none;border-color:#B0472E;box-shadow:0 0 0 3px rgba(176,71,46,.12);}
  .pw-wrap{position:relative;}
  .pw-wrap input{padding-right:44px;}
  .pw-toggle{position:absolute;right:10px;top:11px;background:none!important;border:none!important;width:auto!important;padding:2px!important;font-size:18px;cursor:pointer;line-height:1;box-shadow:none!important;margin-top:0!important;}
  button{width:100%;padding:13px;border:none;border-radius:13px;background:#472619;color:#B5CDEA;font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;box-shadow:0 3px 10px rgba(66,40,27,.25);transition:transform .12s ease,box-shadow .12s ease;}
  button:hover{box-shadow:0 5px 14px rgba(66,40,27,.32);}
  button:active{transform:translateY(1px);box-shadow:0 2px 6px rgba(66,40,27,.25);}
  .msg{text-align:center;font-size:13px;margin-top:12px;min-height:18px;}
  .msg.ok{color:#215A34;} .msg.err{color:#B23A3A;}
  a{color:#42281B;font-weight:600;}
  `;
}

function renderAdminSignup(platformName) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Crear cuenta · ${escapeHtml(platformName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${adminBaseStyles()}
    .recovery-box{background:#FFF3CD;border:2px solid #856404;border-radius:12px;padding:16px;text-align:center;margin-top:14px;}
    .recovery-code{font-family:monospace;font-size:17px;font-weight:700;color:#2B2320;letter-spacing:1px;margin:8px 0;word-break:break-all;}
    .warn{font-size:12px;color:#856404;}
  </style></head>
  <body>
    <div class="box">
      <h1>${escapeHtml(platformName)}</h1>
      <p class="sub">Primera vez aquí. Crea tu cuenta de administradora con tu propio correo y contraseña.</p>
      <form id="f">
        <input type="email" id="email" placeholder="Tu correo" required>
        <div class="pw-wrap">
          <input type="password" id="password" placeholder="Contraseña (mín. 6 caracteres)" required minlength="6">
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

function renderAdminLogin(platformName) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Entrar · ${escapeHtml(platformName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${adminBaseStyles()}</style></head>
  <body>
    <div class="box">
      <h1>${escapeHtml(platformName)}</h1>
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
  const platformName = admin.platform_name || 'My Tapp';
  const adminBtnBg = admin.ui_btn_bg || '#472619';
  const adminBtnText = admin.ui_btn_text || '#B5CDEA';
  const adminLogo = admin.ui_logo_base64 || HEY_TAPP_LOGO_BASE64;
  const { results } = await env.DB.prepare('SELECT slug, name, created_at, staff_login_locked_until, last_payment_date, next_payment_date, is_suspended FROM businesses ORDER BY id DESC').all();
  const leadsCountRow = await env.DB.prepare('SELECT COUNT(*) as n FROM leads').first().catch(() => null);
  const leadsCount = leadsCountRow ? leadsCountRow.n : 0;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const rows = results.map(b => {
    const isLocked = b.staff_login_locked_until && new Date(b.staff_login_locked_until + 'Z') > now;
    const isOverdue = b.next_payment_date && b.next_payment_date < today;
    return `
    <tr>
      <td data-label="Editar tarjeta" style="white-space:nowrap;"><a href="/admin/business/${escapeHtml(b.slug)}/edit">Editar</a></td>
      <td data-label="Negocio" style="white-space:nowrap;">${escapeHtml(b.name)}</td>
      <td data-label="Slug" style="white-space:nowrap;">${escapeHtml(b.slug)}</td>
      <td data-label="Código QR" style="white-space:nowrap;"><a href="#" class="download-qr" data-slug="${escapeHtml(b.slug)}" data-name="${escapeHtml(b.name)}">Descargar QR</a></td>
      <td data-label="PIN" style="white-space:nowrap;"><span class="pin-cell" data-slug="${escapeHtml(b.slug)}">🔒 <a href="#" class="reveal-pin">Ver PIN</a></span></td>
      <td data-label="Ver PIN" style="white-space:nowrap;">${isLocked ? `<a href="#" class="unlock-biz" data-slug="${escapeHtml(b.slug)}" style="color:#B26A00;font-weight:700;">🔒 Desbloquear</a>` : '—'}</td>
      <td data-label="Panel staff" style="white-space:nowrap;"><a href="/staff/${escapeHtml(b.slug)}" target="_blank">Link para staff</a></td>
      <td data-label="Link registro" style="white-space:nowrap;"><a href="/${escapeHtml(b.slug)}/nuevo" target="_blank">Link para clientes</a></td>
      <td data-label="Suscripción" style="white-space:nowrap;">
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
      <td data-label="Estado de pago" style="white-space:nowrap;">
        <a href="#" class="toggle-suspend" data-slug="${escapeHtml(b.slug)}" data-suspended="${b.is_suspended}" style="color:${b.is_suspended ? '#215A34' : '#B26A00'};font-weight:700;">
          ${b.is_suspended ? '▶️ Activar' : '⏸️ Suspender'}
        </a>
      </td>
      <td data-label="Borrar" style="white-space:nowrap;"><a href="#" class="delete-biz" data-slug="${escapeHtml(b.slug)}" data-name="${escapeHtml(b.name)}" style="color:#B23A3A;">Borrar</a></td>
    </tr>`;
  }).join('');

  return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Panel · ${escapeHtml(platformName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Poppins:wght@600;700;800&family=Playfair+Display:wght@600;700;800&family=Montserrat:wght@600;700;800&family=Caveat:wght@600;700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<script>var QRCode=function(t){"use strict";var r,e=function(){return"function"==typeof Promise&&Promise.prototype&&Promise.prototype.then},n=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706],o=function(t){if(!t)throw new Error('"version" cannot be null or undefined');if(t<1||t>40)throw new Error('"version" should be in range from 1 to 40');return 4*t+17},a=function(t){return n[t]},i=function(t){for(var r=0;0!==t;)r++,t>>>=1;return r},u=function(t){if("function"!=typeof t)throw new Error('"toSJISFunc" is not a valid function.');r=t},s=function(){return void 0!==r},f=function(t){return r(t)};function h(t,r){return t(r={exports:{}},r.exports),r.exports}var c=h((function(t,r){r.L={bit:1},r.M={bit:0},r.Q={bit:3},r.H={bit:2},r.isValid=function(t){return t&&void 0!==t.bit&&t.bit>=0&&t.bit<4},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"l":case"low":return r.L;case"m":case"medium":return r.M;case"q":case"quartile":return r.Q;case"h":case"high":return r.H;default:throw new Error("Unknown EC Level: "+t)}}(t)}catch(t){return e}}}));function g(){this.buffer=[],this.length=0}c.L,c.M,c.Q,c.H,c.isValid,g.prototype={get:function(t){var r=Math.floor(t/8);return 1==(this.buffer[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e++)this.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return this.length},putBit:function(t){var r=Math.floor(this.length/8);this.buffer.length<=r&&this.buffer.push(0),t&&(this.buffer[r]|=128>>>this.length%8),this.length++}};var d=g;function l(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}l.prototype.set=function(t,r,e,n){var o=t*this.size+r;this.data[o]=e,n&&(this.reservedBit[o]=!0)},l.prototype.get=function(t,r){return this.data[t*this.size+r]},l.prototype.xor=function(t,r,e){this.data[t*this.size+r]^=e},l.prototype.isReserved=function(t,r){return this.reservedBit[t*this.size+r]};var v=l,p=h((function(t,r){var e=o;r.getRowColCoords=function(t){if(1===t)return[];for(var r=Math.floor(t/7)+2,n=e(t),o=145===n?26:2*Math.ceil((n-13)/(2*r-2)),a=[n-7],i=1;i<r-1;i++)a[i]=a[i-1]-o;return a.push(6),a.reverse()},r.getPositions=function(t){for(var e=[],n=r.getRowColCoords(t),o=n.length,a=0;a<o;a++)for(var i=0;i<o;i++)0===a&&0===i||0===a&&i===o-1||a===o-1&&0===i||e.push([n[a],n[i]]);return e}}));p.getRowColCoords,p.getPositions;var w=o,m=function(t){var r=w(t);return[[0,0],[r-7,0],[0,r-7]]},E=h((function(t,r){r.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var e=3,n=3,o=40,a=10;function i(t,e,n){switch(t){case r.Patterns.PATTERN000:return(e+n)%2==0;case r.Patterns.PATTERN001:return e%2==0;case r.Patterns.PATTERN010:return n%3==0;case r.Patterns.PATTERN011:return(e+n)%3==0;case r.Patterns.PATTERN100:return(Math.floor(e/2)+Math.floor(n/3))%2==0;case r.Patterns.PATTERN101:return e*n%2+e*n%3==0;case r.Patterns.PATTERN110:return(e*n%2+e*n%3)%2==0;case r.Patterns.PATTERN111:return(e*n%3+(e+n)%2)%2==0;default:throw new Error("bad maskPattern:"+t)}}r.isValid=function(t){return null!=t&&""!==t&&!isNaN(t)&&t>=0&&t<=7},r.from=function(t){return r.isValid(t)?parseInt(t,10):void 0},r.getPenaltyN1=function(t){for(var r=t.size,n=0,o=0,a=0,i=null,u=null,s=0;s<r;s++){o=a=0,i=u=null;for(var f=0;f<r;f++){var h=t.get(s,f);h===i?o++:(o>=5&&(n+=e+(o-5)),i=h,o=1),(h=t.get(f,s))===u?a++:(a>=5&&(n+=e+(a-5)),u=h,a=1)}o>=5&&(n+=e+(o-5)),a>=5&&(n+=e+(a-5))}return n},r.getPenaltyN2=function(t){for(var r=t.size,e=0,o=0;o<r-1;o++)for(var a=0;a<r-1;a++){var i=t.get(o,a)+t.get(o,a+1)+t.get(o+1,a)+t.get(o+1,a+1);4!==i&&0!==i||e++}return e*n},r.getPenaltyN3=function(t){for(var r=t.size,e=0,n=0,a=0,i=0;i<r;i++){n=a=0;for(var u=0;u<r;u++)n=n<<1&2047|t.get(i,u),u>=10&&(1488===n||93===n)&&e++,a=a<<1&2047|t.get(u,i),u>=10&&(1488===a||93===a)&&e++}return e*o},r.getPenaltyN4=function(t){for(var r=0,e=t.data.length,n=0;n<e;n++)r+=t.data[n];return Math.abs(Math.ceil(100*r/e/5)-10)*a},r.applyMask=function(t,r){for(var e=r.size,n=0;n<e;n++)for(var o=0;o<e;o++)r.isReserved(o,n)||r.xor(o,n,i(t,o,n))},r.getBestMask=function(t,e){for(var n=Object.keys(r.Patterns).length,o=0,a=1/0,i=0;i<n;i++){e(i),r.applyMask(i,t);var u=r.getPenaltyN1(t)+r.getPenaltyN2(t)+r.getPenaltyN3(t)+r.getPenaltyN4(t);r.applyMask(i,t),u<a&&(a=u,o=i)}return o}}));E.Patterns,E.isValid,E.getPenaltyN1,E.getPenaltyN2,E.getPenaltyN3,E.getPenaltyN4,E.applyMask,E.getBestMask;var y=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],A=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430],I=function(t,r){switch(r){case c.L:return y[4*(t-1)+0];case c.M:return y[4*(t-1)+1];case c.Q:return y[4*(t-1)+2];case c.H:return y[4*(t-1)+3];default:return}},M=function(t,r){switch(r){case c.L:return A[4*(t-1)+0];case c.M:return A[4*(t-1)+1];case c.Q:return A[4*(t-1)+2];case c.H:return A[4*(t-1)+3];default:return}},N=new Uint8Array(512),B=new Uint8Array(256);!function(){for(var t=1,r=0;r<255;r++)N[r]=t,B[t]=r,256&(t<<=1)&&(t^=285);for(var e=255;e<512;e++)N[e]=N[e-255]}();var C=function(t){return N[t]},P=function(t,r){return 0===t||0===r?0:N[B[t]+B[r]]},R=h((function(t,r){r.mul=function(t,r){for(var e=new Uint8Array(t.length+r.length-1),n=0;n<t.length;n++)for(var o=0;o<r.length;o++)e[n+o]^=P(t[n],r[o]);return e},r.mod=function(t,r){for(var e=new Uint8Array(t);e.length-r.length>=0;){for(var n=e[0],o=0;o<r.length;o++)e[o]^=P(r[o],n);for(var a=0;a<e.length&&0===e[a];)a++;e=e.slice(a)}return e},r.generateECPolynomial=function(t){for(var e=new Uint8Array([1]),n=0;n<t;n++)e=r.mul(e,new Uint8Array([1,C(n)]));return e}}));function T(t){this.genPoly=void 0,this.degree=t,this.degree&&this.initialize(this.degree)}R.mul,R.mod,R.generateECPolynomial,T.prototype.initialize=function(t){this.degree=t,this.genPoly=R.generateECPolynomial(this.degree)},T.prototype.encode=function(t){if(!this.genPoly)throw new Error("Encoder not initialized");var r=new Uint8Array(t.length+this.degree);r.set(t);var e=R.mod(r,this.genPoly),n=this.degree-e.length;if(n>0){var o=new Uint8Array(this.degree);return o.set(e,n),o}return e};var L=T,b=function(t){return!isNaN(t)&&t>=1&&t<=40},U="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+",x="(?:(?![A-Z0-9 $%*+\\\\-./:]|"+(U=U.replace(/u/g,"\\\\u"))+")(?:.|[\\r\\n]))+",k=new RegExp(U,"g"),F=new RegExp("[^A-Z0-9 $%*+\\\\-./:]+","g"),S=new RegExp(x,"g"),D=new RegExp("[0-9]+","g"),Y=new RegExp("[A-Z $%*+\\\\-./:]+","g"),_=new RegExp("^"+U+"$"),z=new RegExp("^[0-9]+$"),H=new RegExp("^[A-Z0-9 $%*+\\\\-./:]+$"),J={KANJI:k,BYTE_KANJI:F,BYTE:S,NUMERIC:D,ALPHANUMERIC:Y,testKanji:function(t){return _.test(t)},testNumeric:function(t){return z.test(t)},testAlphanumeric:function(t){return H.test(t)}},K=h((function(t,r){r.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},r.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},r.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},r.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},r.MIXED={bit:-1},r.getCharCountIndicator=function(t,r){if(!t.ccBits)throw new Error("Invalid mode: "+t);if(!b(r))throw new Error("Invalid version: "+r);return r>=1&&r<10?t.ccBits[0]:r<27?t.ccBits[1]:t.ccBits[2]},r.getBestModeForData=function(t){return J.testNumeric(t)?r.NUMERIC:J.testAlphanumeric(t)?r.ALPHANUMERIC:J.testKanji(t)?r.KANJI:r.BYTE},r.toString=function(t){if(t&&t.id)return t.id;throw new Error("Invalid mode")},r.isValid=function(t){return t&&t.bit&&t.ccBits},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return r.NUMERIC;case"alphanumeric":return r.ALPHANUMERIC;case"kanji":return r.KANJI;case"byte":return r.BYTE;default:throw new Error("Unknown mode: "+t)}}(t)}catch(t){return e}}}));K.NUMERIC,K.ALPHANUMERIC,K.BYTE,K.KANJI,K.MIXED,K.getCharCountIndicator,K.getBestModeForData,K.isValid;var O=h((function(t,r){var e=i(7973);function n(t,r){return K.getCharCountIndicator(t,r)+4}function o(t,r){var e=0;return t.forEach((function(t){var o=n(t.mode,r);e+=o+t.getBitsLength()})),e}r.from=function(t,r){return b(t)?parseInt(t,10):r},r.getCapacity=function(t,r,e){if(!b(t))throw new Error("Invalid QR Code version");void 0===e&&(e=K.BYTE);var o=8*(a(t)-M(t,r));if(e===K.MIXED)return o;var i=o-n(e,t);switch(e){case K.NUMERIC:return Math.floor(i/10*3);case K.ALPHANUMERIC:return Math.floor(i/11*2);case K.KANJI:return Math.floor(i/13);case K.BYTE:default:return Math.floor(i/8)}},r.getBestVersionForData=function(t,e){var n,a=c.from(e,c.M);if(Array.isArray(t)){if(t.length>1)return function(t,e){for(var n=1;n<=40;n++){if(o(t,n)<=r.getCapacity(n,e,K.MIXED))return n}}(t,a);if(0===t.length)return 1;n=t[0]}else n=t;return function(t,e,n){for(var o=1;o<=40;o++)if(e<=r.getCapacity(o,n,t))return o}(n.mode,n.getLength(),a)},r.getEncodedBits=function(t){if(!b(t)||t<7)throw new Error("Invalid QR Code version");for(var r=t<<12;i(r)-e>=0;)r^=7973<<i(r)-e;return t<<12|r}}));O.getCapacity,O.getBestVersionForData,O.getEncodedBits;var Q=i(1335),V=function(t,r){for(var e=t.bit<<3|r,n=e<<10;i(n)-Q>=0;)n^=1335<<i(n)-Q;return 21522^(e<<10|n)};function q(t){this.mode=K.NUMERIC,this.data=t.toString()}q.getBitsLength=function(t){return 10*Math.floor(t/3)+(t%3?t%3*3+1:0)},q.prototype.getLength=function(){return this.data.length},q.prototype.getBitsLength=function(){return q.getBitsLength(this.data.length)},q.prototype.write=function(t){var r,e,n;for(r=0;r+3<=this.data.length;r+=3)e=this.data.substr(r,3),n=parseInt(e,10),t.put(n,10);var o=this.data.length-r;o>0&&(e=this.data.substr(r),n=parseInt(e,10),t.put(n,3*o+1))};var j=q,$=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function X(t){this.mode=K.ALPHANUMERIC,this.data=t}X.getBitsLength=function(t){return 11*Math.floor(t/2)+t%2*6},X.prototype.getLength=function(){return this.data.length},X.prototype.getBitsLength=function(){return X.getBitsLength(this.data.length)},X.prototype.write=function(t){var r;for(r=0;r+2<=this.data.length;r+=2){var e=45*$.indexOf(this.data[r]);e+=$.indexOf(this.data[r+1]),t.put(e,11)}this.data.length%2&&t.put($.indexOf(this.data[r]),6)};var Z=X;function W(t){this.mode=K.BYTE,"string"==typeof t&&(t=function(t){for(var r=[],e=t.length,n=0;n<e;n++){var o=t.charCodeAt(n);if(o>=55296&&o<=56319&&e>n+1){var a=t.charCodeAt(n+1);a>=56320&&a<=57343&&(o=1024*(o-55296)+a-56320+65536,n+=1)}o<128?r.push(o):o<2048?(r.push(o>>6|192),r.push(63&o|128)):o<55296||o>=57344&&o<65536?(r.push(o>>12|224),r.push(o>>6&63|128),r.push(63&o|128)):o>=65536&&o<=1114111?(r.push(o>>18|240),r.push(o>>12&63|128),r.push(o>>6&63|128),r.push(63&o|128)):r.push(239,191,189)}return new Uint8Array(r).buffer}(t)),this.data=new Uint8Array(t)}W.getBitsLength=function(t){return 8*t},W.prototype.getLength=function(){return this.data.length},W.prototype.getBitsLength=function(){return W.getBitsLength(this.data.length)},W.prototype.write=function(t){for(var r=0,e=this.data.length;r<e;r++)t.put(this.data[r],8)};var G=W;function tt(t){this.mode=K.KANJI,this.data=t}tt.getBitsLength=function(t){return 13*t},tt.prototype.getLength=function(){return this.data.length},tt.prototype.getBitsLength=function(){return tt.getBitsLength(this.data.length)},tt.prototype.write=function(t){var r;for(r=0;r<this.data.length;r++){var e=f(this.data[r]);if(e>=33088&&e<=40956)e-=33088;else{if(!(e>=57408&&e<=60351))throw new Error("Invalid SJIS character: "+this.data[r]+"\\nMake sure your charset is UTF-8");e-=49472}e=192*(e>>>8&255)+(255&e),t.put(e,13)}};var rt=tt,et=h((function(t){var r={single_source_shortest_paths:function(t,e,n){var o={},a={};a[e]=0;var i,u,s,f,h,c,g,d=r.PriorityQueue.make();for(d.push(e,0);!d.empty();)for(s in u=(i=d.pop()).value,f=i.cost,h=t[u]||{})h.hasOwnProperty(s)&&(c=f+h[s],g=a[s],(void 0===a[s]||g>c)&&(a[s]=c,d.push(s,c),o[s]=u));if(void 0!==n&&void 0===a[n]){var l=["Could not find a path from ",e," to ",n,"."].join("");throw new Error(l)}return o},extract_shortest_path_from_predecessor_list:function(t,r){for(var e=[],n=r;n;)e.push(n),n=t[n];return e.reverse(),e},find_path:function(t,e,n){var o=r.single_source_shortest_paths(t,e,n);return r.extract_shortest_path_from_predecessor_list(o,n)},PriorityQueue:{make:function(t){var e,n=r.PriorityQueue,o={};for(e in t=t||{},n)n.hasOwnProperty(e)&&(o[e]=n[e]);return o.queue=[],o.sorter=t.sorter||n.default_sorter,o},default_sorter:function(t,r){return t.cost-r.cost},push:function(t,r){var e={value:t,cost:r};this.queue.push(e),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return 0===this.queue.length}}};t.exports=r})),nt=h((function(t,r){function e(t){return unescape(encodeURIComponent(t)).length}function n(t,r,e){for(var n,o=[];null!==(n=t.exec(e));)o.push({data:n[0],index:n.index,mode:r,length:n[0].length});return o}function o(t){var r,e,o=n(J.NUMERIC,K.NUMERIC,t),a=n(J.ALPHANUMERIC,K.ALPHANUMERIC,t);return s()?(r=n(J.BYTE,K.BYTE,t),e=n(J.KANJI,K.KANJI,t)):(r=n(J.BYTE_KANJI,K.BYTE,t),e=[]),o.concat(a,r,e).sort((function(t,r){return t.index-r.index})).map((function(t){return{data:t.data,mode:t.mode,length:t.length}}))}function a(t,r){switch(r){case K.NUMERIC:return j.getBitsLength(t);case K.ALPHANUMERIC:return Z.getBitsLength(t);case K.KANJI:return rt.getBitsLength(t);case K.BYTE:return G.getBitsLength(t)}}function i(t,r){var e,n=K.getBestModeForData(t);if((e=K.from(r,n))!==K.BYTE&&e.bit<n.bit)throw new Error('"'+t+'" cannot be encoded with mode '+K.toString(e)+".\\n Suggested mode is: "+K.toString(n));switch(e!==K.KANJI||s()||(e=K.BYTE),e){case K.NUMERIC:return new j(t);case K.ALPHANUMERIC:return new Z(t);case K.KANJI:return new rt(t);case K.BYTE:return new G(t)}}r.fromArray=function(t){return t.reduce((function(t,r){return"string"==typeof r?t.push(i(r,null)):r.data&&t.push(i(r.data,r.mode)),t}),[])},r.fromString=function(t,n){for(var i=function(t,r){for(var e={},n={start:{}},o=["start"],i=0;i<t.length;i++){for(var u=t[i],s=[],f=0;f<u.length;f++){var h=u[f],c=""+i+f;s.push(c),e[c]={node:h,lastCount:0},n[c]={};for(var g=0;g<o.length;g++){var d=o[g];e[d]&&e[d].node.mode===h.mode?(n[d][c]=a(e[d].lastCount+h.length,h.mode)-a(e[d].lastCount,h.mode),e[d].lastCount+=h.length):(e[d]&&(e[d].lastCount=h.length),n[d][c]=a(h.length,h.mode)+4+K.getCharCountIndicator(h.mode,r))}}o=s}for(var l=0;l<o.length;l++)n[o[l]].end=0;return{map:n,table:e}}(function(t){for(var r=[],n=0;n<t.length;n++){var o=t[n];switch(o.mode){case K.NUMERIC:r.push([o,{data:o.data,mode:K.ALPHANUMERIC,length:o.length},{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.ALPHANUMERIC:r.push([o,{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.KANJI:r.push([o,{data:o.data,mode:K.BYTE,length:e(o.data)}]);break;case K.BYTE:r.push([{data:o.data,mode:K.BYTE,length:e(o.data)}])}}return r}(o(t)),n),u=et.find_path(i.map,"start","end"),s=[],f=1;f<u.length-1;f++)s.push(i.table[u[f]].node);return r.fromArray(function(t){return t.reduce((function(t,r){var e=t.length-1>=0?t[t.length-1]:null;return e&&e.mode===r.mode?(t[t.length-1].data+=r.data,t):(t.push(r),t)}),[])}(s))},r.rawSplit=function(t){return r.fromArray(o(t))}}));function ot(t,r,e){var n,o,a=t.size,i=V(r,e);for(n=0;n<15;n++)o=1==(i>>n&1),n<6?t.set(n,8,o,!0):n<8?t.set(n+1,8,o,!0):t.set(a-15+n,8,o,!0),n<8?t.set(8,a-n-1,o,!0):n<9?t.set(8,15-n-1+1,o,!0):t.set(8,15-n-1,o,!0);t.set(a-8,8,1,!0)}function at(t,r,e){var n=new d;e.forEach((function(r){n.put(r.mode.bit,4),n.put(r.getLength(),K.getCharCountIndicator(r.mode,t)),r.write(n)}));var o=8*(a(t)-M(t,r));for(n.getLengthInBits()+4<=o&&n.put(0,4);n.getLengthInBits()%8!=0;)n.putBit(0);for(var i=(o-n.getLengthInBits())/8,u=0;u<i;u++)n.put(u%2?17:236,8);return function(t,r,e){for(var n=a(r),o=M(r,e),i=n-o,u=I(r,e),s=u-n%u,f=Math.floor(n/u),h=Math.floor(i/u),c=h+1,g=f-h,d=new L(g),l=0,v=new Array(u),p=new Array(u),w=0,m=new Uint8Array(t.buffer),E=0;E<u;E++){var y=E<s?h:c;v[E]=m.slice(l,l+y),p[E]=d.encode(v[E]),l+=y,w=Math.max(w,y)}var A,N,B=new Uint8Array(n),C=0;for(A=0;A<w;A++)for(N=0;N<u;N++)A<v[N].length&&(B[C++]=v[N][A]);for(A=0;A<g;A++)for(N=0;N<u;N++)B[C++]=p[N][A];return B}(n,t,r)}function it(t,r,e,n){var a;if(Array.isArray(t))a=nt.fromArray(t);else{if("string"!=typeof t)throw new Error("Invalid data");var i=r;if(!i){var u=nt.rawSplit(t);i=O.getBestVersionForData(u,e)}a=nt.fromString(t,i||40)}var s=O.getBestVersionForData(a,e);if(!s)throw new Error("The amount of data is too big to be stored in a QR Code");if(r){if(r<s)throw new Error("\\nThe chosen QR Code version cannot contain this amount of data.\\nMinimum version required to store current data is: "+s+".\\n")}else r=s;var f=at(r,e,a),h=o(r),c=new v(h);return function(t,r){for(var e=t.size,n=m(r),o=0;o<n.length;o++)for(var a=n[o][0],i=n[o][1],u=-1;u<=7;u++)if(!(a+u<=-1||e<=a+u))for(var s=-1;s<=7;s++)i+s<=-1||e<=i+s||(u>=0&&u<=6&&(0===s||6===s)||s>=0&&s<=6&&(0===u||6===u)||u>=2&&u<=4&&s>=2&&s<=4?t.set(a+u,i+s,!0,!0):t.set(a+u,i+s,!1,!0))}(c,r),function(t){for(var r=t.size,e=8;e<r-8;e++){var n=e%2==0;t.set(e,6,n,!0),t.set(6,e,n,!0)}}(c),function(t,r){for(var e=p.getPositions(r),n=0;n<e.length;n++)for(var o=e[n][0],a=e[n][1],i=-2;i<=2;i++)for(var u=-2;u<=2;u++)-2===i||2===i||-2===u||2===u||0===i&&0===u?t.set(o+i,a+u,!0,!0):t.set(o+i,a+u,!1,!0)}(c,r),ot(c,e,0),r>=7&&function(t,r){for(var e,n,o,a=t.size,i=O.getEncodedBits(r),u=0;u<18;u++)e=Math.floor(u/3),n=u%3+a-8-3,o=1==(i>>u&1),t.set(e,n,o,!0),t.set(n,e,o,!0)}(c,r),function(t,r){for(var e=t.size,n=-1,o=e-1,a=7,i=0,u=e-1;u>0;u-=2)for(6===u&&u--;;){for(var s=0;s<2;s++)if(!t.isReserved(o,u-s)){var f=!1;i<r.length&&(f=1==(r[i]>>>a&1)),t.set(o,u-s,f),-1===--a&&(i++,a=7)}if((o+=n)<0||e<=o){o-=n,n=-n;break}}}(c,f),isNaN(n)&&(n=E.getBestMask(c,ot.bind(null,c,e))),E.applyMask(n,c),ot(c,e,n),{modules:c,version:r,errorCorrectionLevel:e,maskPattern:n,segments:a}}nt.fromArray,nt.fromString,nt.rawSplit;var ut=function(t,r){if(void 0===t||""===t)throw new Error("No input text");var e,n,o=c.M;return void 0!==r&&(o=c.from(r.errorCorrectionLevel,c.M),e=O.from(r.version),n=E.from(r.maskPattern),r.toSJISFunc&&u(r.toSJISFunc)),it(t,e,o,n)},st=h((function(t,r){function e(t){if("number"==typeof t&&(t=t.toString()),"string"!=typeof t)throw new Error("Color should be defined as hex string");var r=t.slice().replace("#","").split("");if(r.length<3||5===r.length||r.length>8)throw new Error("Invalid hex color: "+t);3!==r.length&&4!==r.length||(r=Array.prototype.concat.apply([],r.map((function(t){return[t,t]})))),6===r.length&&r.push("F","F");var e=parseInt(r.join(""),16);return{r:e>>24&255,g:e>>16&255,b:e>>8&255,a:255&e,hex:"#"+r.slice(0,6).join("")}}r.getOptions=function(t){t||(t={}),t.color||(t.color={});var r=void 0===t.margin||null===t.margin||t.margin<0?4:t.margin,n=t.width&&t.width>=21?t.width:void 0,o=t.scale||4;return{width:n,scale:n?4:o,margin:r,color:{dark:e(t.color.dark||"#000000ff"),light:e(t.color.light||"#ffffffff")},type:t.type,rendererOpts:t.rendererOpts||{}}},r.getScale=function(t,r){return r.width&&r.width>=t+2*r.margin?r.width/(t+2*r.margin):r.scale},r.getImageWidth=function(t,e){var n=r.getScale(t,e);return Math.floor((t+2*e.margin)*n)},r.qrToImageData=function(t,e,n){for(var o=e.modules.size,a=e.modules.data,i=r.getScale(o,n),u=Math.floor((o+2*n.margin)*i),s=n.margin*i,f=[n.color.light,n.color.dark],h=0;h<u;h++)for(var c=0;c<u;c++){var g=4*(h*u+c),d=n.color.light;if(h>=s&&c>=s&&h<u-s&&c<u-s)d=f[a[Math.floor((h-s)/i)*o+Math.floor((c-s)/i)]?1:0];t[g++]=d.r,t[g++]=d.g,t[g++]=d.b,t[g]=d.a}}}));st.getOptions,st.getScale,st.getImageWidth,st.qrToImageData;var ft=h((function(t,r){r.render=function(t,r,e){var n=e,o=r;void 0!==n||r&&r.getContext||(n=r,r=void 0),r||(o=function(){try{return document.createElement("canvas")}catch(t){throw new Error("You need to specify a canvas element")}}()),n=st.getOptions(n);var a=st.getImageWidth(t.modules.size,n),i=o.getContext("2d"),u=i.createImageData(a,a);return st.qrToImageData(u.data,t,n),function(t,r,e){t.clearRect(0,0,r.width,r.height),r.style||(r.style={}),r.height=e,r.width=e,r.style.height=e+"px",r.style.width=e+"px"}(i,o,a),i.putImageData(u,0,0),o},r.renderToDataURL=function(t,e,n){var o=n;void 0!==o||e&&e.getContext||(o=e,e=void 0),o||(o={});var a=r.render(t,e,o),i=o.type||"image/png",u=o.rendererOpts||{};return a.toDataURL(i,u.quality)}}));function ht(t,r){var e=t.a/255,n=r+'="'+t.hex+'"';return e<1?n+" "+r+'-opacity="'+e.toFixed(2).slice(1)+'"':n}function ct(t,r,e){var n=t+r;return void 0!==e&&(n+=" "+e),n}ft.render,ft.renderToDataURL;var gt=function(t,r,e){var n=st.getOptions(r),o=t.modules.size,a=t.modules.data,i=o+2*n.margin,u=n.color.light.a?"<path "+ht(n.color.light,"fill")+' d="M0 0h'+i+"v"+i+'H0z"/>':"",s="<path "+ht(n.color.dark,"stroke")+' d="'+function(t,r,e){for(var n="",o=0,a=!1,i=0,u=0;u<t.length;u++){var s=Math.floor(u%r),f=Math.floor(u/r);s||a||(a=!0),t[u]?(i++,u>0&&s>0&&t[u-1]||(n+=a?ct("M",s+e,.5+f+e):ct("m",o,0),o=0,a=!1),s+1<r&&t[u+1]||(n+=ct("h",i),i=0)):o++}return n}(a,o,n.margin)+'"/>',f='viewBox="0 0 '+i+" "+i+'"',h='<svg xmlns="http://www.w3.org/2000/svg" '+(n.width?'width="'+n.width+'" height="'+n.width+'" ':"")+f+' shape-rendering="crispEdges">'+u+s+"</svg>\\n";return"function"==typeof e&&e(null,h),h};function dt(t,r,n,o,a){var i=[].slice.call(arguments,1),u=i.length,s="function"==typeof i[u-1];if(!s&&!e())throw new Error("Callback required as last argument");if(!s){if(u<1)throw new Error("Too few arguments provided");return 1===u?(n=r,r=o=void 0):2!==u||r.getContext||(o=n,n=r,r=void 0),new Promise((function(e,a){try{var i=ut(n,o);e(t(i,r,o))}catch(t){a(t)}}))}if(u<2)throw new Error("Too few arguments provided");2===u?(a=n,n=r,r=o=void 0):3===u&&(r.getContext&&void 0===a?(a=o,o=void 0):(a=o,o=n,n=r,r=void 0));try{var f=ut(n,o);a(null,t(f,r,o))}catch(t){a(t)}}var lt=ut,vt=dt.bind(null,ft.render),pt=dt.bind(null,ft.renderToDataURL),wt=dt.bind(null,(function(t,r,e){return gt(t,e)})),mt={create:lt,toCanvas:vt,toDataURL:pt,toString:wt};return t.create=lt,t.default=mt,t.toCanvas=vt,t.toDataURL=pt,t.toString=wt,Object.defineProperty(t,"__esModule",{value:!0}),t}({});</script>
  <style>
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;background:linear-gradient(160deg,#DAE7F1 0%,#F4F1EA 42%);font-family:'Quicksand',sans-serif;padding:32px 24px;color:#42281B;}
    .wrap{max-width:1040px;margin:0 auto;}
    .create-flex{display:flex;gap:24px;align-items:flex-start;}
    .form-col{flex:1;min-width:0;}
    ${previewStyles()}
    ${passwordModalStyles()}
    h1{font-family:'Baloo 2',sans-serif;font-size:25px;color:#42281B;letter-spacing:.2px;}
    h2{font-family:'Baloo 2',sans-serif;font-size:17px;margin-top:34px;color:#42281B;display:flex;align-items:center;gap:8px;}
    h2::before{content:'';width:5px;height:16px;border-radius:3px;background:#B0472E;display:inline-block;}
    table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;font-size:13px;margin-bottom:10px;}
    th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #eee;white-space:nowrap;}
    @media (max-width: 900px) {
      .create-flex{flex-direction:column;}
      .preview-col{width:100%;position:static;}
    }
    @media (max-width: 760px) {
      table, thead, tbody, th, td, tr { display:block; }
      thead { display:none; }
      table{background:none;}
      tr{background:white;border:2px solid #2B2320;border-radius:14px;margin-bottom:14px;padding:10px 4px;}
      td{border:none;padding:7px 12px;white-space:normal;}
      td::before{content:attr(data-label);display:block;font-size:10px;font-weight:700;color:#8A6F4E;text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px;}
    }
    th{font-size:12px;}
    th{background:#2B2320;color:white;}
    .card{background:white;border:1px solid #EDE4D3;border-radius:20px;padding:24px;margin-top:14px;box-shadow:0 4px 20px rgba(66,40,27,.07);}
    label{display:block;font-size:12px;font-weight:700;margin:10px 0 4px;}
    input[type=text], input[type=number], input[type=email]{width:100%;padding:11px 13px;border:1.5px solid #E2D9C8;border-radius:11px;font-size:14px;font-family:'Quicksand',sans-serif;transition:border-color .15s ease,box-shadow .15s ease;background:#FEFDFB;}
    input[type=text]:focus, input[type=number]:focus, input[type=email]:focus{outline:none;border-color:#B0472E;box-shadow:0 0 0 3px rgba(176,71,46,.12);}
    input[type=password]{width:100%;padding:11px 13px;border:1.5px solid #E2D9C8;border-radius:11px;font-size:14px;font-family:'Quicksand',sans-serif;background:#FEFDFB;}
    .pw-wrap{position:relative;}
    .pw-wrap input{padding-right:44px;}
    .pw-toggle{position:absolute;right:8px;top:8px;background:none!important;border:none!important;width:auto!important;padding:2px!important;font-size:17px;cursor:pointer;line-height:1;color:#2B2320!important;box-shadow:none!important;margin-top:0!important;}
    input[type=color]{width:46px;height:42px;border:2px solid #2B2320;border-radius:10px;padding:2px;flex-shrink:0;}
    .color-field{display:flex;gap:6px;}
    .color-field input.colorHex{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:13px;font-family:monospace;text-transform:uppercase;}
    .color-row{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid #EEE9DF;}
    .color-row-label{flex:1;font-size:13px;color:#2B2320;}
    .color-row input[type=color]{width:38px;height:34px;flex-shrink:0;padding:2px;}
    .color-row input.colorHex{width:100px;flex-shrink:0;padding:7px 8px;border:2px solid #2B2320;border-radius:8px;font-size:12px;font-family:monospace;text-transform:uppercase;}
    input[type=file]{width:100%;font-size:12px;margin-top:4px;}
    select{width:100%;padding:11px 13px;border:1.5px solid #E2D9C8;border-radius:11px;font-size:14px;font-family:'Quicksand',sans-serif;background:#FEFDFB;}
    .colors{display:flex;flex-direction:column;gap:0;}
    .quick-palette{background:#FBF7EE;border:2px dashed #C9A46A;border-radius:14px;padding:14px 16px;margin-top:16px;}
    .quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;}
    .quick-grid .color-row{border-bottom:none;padding:5px 0;}
    @media (max-width:520px){ .quick-grid{grid-template-columns:1fr;} }
    .sellos{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    button{margin-top:18px;width:100%;padding:14px;border:none;border-radius:14px;background:${adminBtnBg};color:${adminBtnText};font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;box-shadow:0 3px 10px rgba(66,40,27,.25);transition:transform .12s ease,box-shadow .12s ease;}
    button:hover{box-shadow:0 5px 14px rgba(66,40,27,.32);}
    button:active{transform:translateY(1px);box-shadow:0 2px 6px rgba(66,40,27,.25);}
    .msg{text-align:center;font-size:13px;margin-top:12px;}
    .msg.ok{color:#215A34;} .msg.err{color:#B23A3A;}
    a.logout{float:right;font-size:12px;}
    a{color:#2B2320;}
    .panel-logo{height:34px;width:auto;display:block;}
  </style></head>
  <body>
    <div class="wrap">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img class="panel-logo" src="data:image/png;base64,${adminLogo}" alt="${escapeHtml(platformName)}">
          <h1 style="white-space:nowrap;margin:0;">${escapeHtml(platformName)} by Anaelí Brand</h1>
        </div>
        <div style="display:flex;align-items:center;gap:14px;">
          <a href="/admin/leads" style="text-decoration:none;font-size:12px;font-weight:700;color:#42281B;background:#EBDA8B;padding:8px 14px;border-radius:8px;">📬 Solicitudes${leadsCount > 0 ? ` (${leadsCount})` : ''}</a>
          <button type="button" id="toggleSettingsBtn" style="width:auto;margin:0;padding:8px 14px;font-size:12px;background:#F4F1EA;color:#2B2320;">⚙️ Configuración</button>
          <a class="logout" href="/admin/logout" style="float:none;">Cerrar sesión</a>
        </div>
      </div>
      <div class="card" id="settingsCard" style="display:none;margin-top:14px;">
        <form id="nameForm">
          <label>Nombre de la marca (aparece en todo el sitio)</label>
          <input type="text" id="platformNameInput" value="${escapeHtml(platformName)}" required>
          <button type="submit">Guardar nombre</button>
        </form>
        <p class="msg" id="nameMsg"></p>
        <hr style="margin:20px 0;border:none;border-top:1px solid #EEE9DF;">
        <form id="appearanceForm">
          <label>🎨 Apariencia de TU panel (esto no lo ven tus clientes)</label>
          <label style="font-weight:400;">Logo</label>
          <img id="adminLogoPreview" class="current-img" src="data:image/png;base64,${adminLogo}" style="width:60px;height:60px;object-fit:contain;background:#F4F1EA;border-radius:8px;padding:4px;display:block;margin-bottom:6px;">
          <input type="file" id="adminLogoInput" accept="image/*">
          <p class="hint" style="font-size:11px;color:#8A6F4E;margin-top:2px;">Deja vacío para mantener el logo actual.</p>
          <label style="font-weight:400;margin-top:14px;">Color de fondo de los botones</label>
          <div class="color-field" style="display:flex;gap:6px;">
            <input type="color" id="adminBtnBg" value="${adminBtnBg}">
            <input type="text" class="colorHex" id="adminBtnBg_hex" value="${adminBtnBg}">
          </div>
          <label style="font-weight:400;margin-top:10px;">Color de texto de los botones</label>
          <div class="color-field" style="display:flex;gap:6px;">
            <input type="color" id="adminBtnText" value="${adminBtnText}">
            <input type="text" class="colorHex" id="adminBtnText_hex" value="${adminBtnText}">
          </div>
          <button type="submit">Guardar apariencia</button>
        </form>
        <p class="msg" id="appearanceMsg"></p>
        <hr style="margin:20px 0;border:none;border-top:1px solid #EEE9DF;">
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
        <thead>
        <tr><th>Editar<br>tarjeta</th><th>Negocio</th><th>Slug</th><th>Código<br>QR</th><th>PIN</th><th>Ver<br>PIN</th><th>Panel<br>staff</th><th>Link<br>registro</th><th>Suscripción</th><th>Estado<br>de pago</th><th>Borrar</th></tr>
        </thead>
        <tbody>
        ${rows || '<tr><td colspan="11">Todavía no has creado ningún negocio</td></tr>'}
        </tbody>
      </table>
      </div>
      <p id="deleteMsg" class="msg"></p>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:34px;">
        <h2 style="margin:0;">Crear negocio nuevo</h2>
        <button type="button" id="toggleCreateBtn" style="width:auto;margin:0;padding:10px 18px;font-size:13px;">+ Nuevo negocio</button>
      </div>
      <div id="createBusinessPanel" style="display:none;margin-top:10px;">
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
            <option value="Muestra este código en caja para sumar tu sello en tu compra.">Negocio físico: mostrar en caja</option>
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
    </div>
    ${passwordModalHtml()}
    <script>
      document.getElementById('toggleCreateBtn').addEventListener('click', () => {
        const panel = document.getElementById('createBusinessPanel');
        const showing = panel.style.display !== 'none';
        panel.style.display = showing ? 'none' : 'block';
        document.getElementById('toggleCreateBtn').textContent = showing ? '+ Nuevo negocio' : '– Ocultar formulario';
      });
      document.getElementById('toggleSettingsBtn').addEventListener('click', () => {
        const card = document.getElementById('settingsCard');
        const showing = card.style.display !== 'none';
        card.style.display = showing ? 'none' : 'block';
      });
      document.getElementById('nameForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('platformNameInput').value.trim();
        const nameMsg = document.getElementById('nameMsg');
        nameMsg.textContent = 'Guardando...'; nameMsg.className = 'msg';
        const res = await fetch('/admin/update-platform-name', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
        const data = await res.json();
        if (res.ok) { nameMsg.textContent = '✅ Guardado. Recargando...'; nameMsg.className = 'msg ok'; setTimeout(() => location.reload(), 800); }
        else { nameMsg.textContent = data.error || 'No se pudo guardar'; nameMsg.className = 'msg err'; }
      });
      function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      document.querySelectorAll('#appearanceForm .colorHex, #appearanceForm input[type=color]').forEach(() => {});
      ['adminBtnBg', 'adminBtnText'].forEach(id => {
        const picker = document.getElementById(id);
        const hexInput = document.getElementById(id + '_hex');
        picker.addEventListener('input', () => { hexInput.value = picker.value.toUpperCase(); });
        hexInput.addEventListener('input', () => {
          let v = hexInput.value.trim();
          if (v && v[0] !== '#') v = '#' + v;
          if (/^#[0-9A-Fa-f]{6}$/.test(v)) { picker.value = v; hexInput.style.borderColor = '#2B2320'; }
          else { hexInput.style.borderColor = '#B23A3A'; }
        });
        hexInput.addEventListener('blur', () => { hexInput.value = picker.value.toUpperCase(); hexInput.style.borderColor = '#2B2320'; });
      });
      const adminLogoInput = document.getElementById('adminLogoInput');
      adminLogoInput.addEventListener('change', () => {
        if (adminLogoInput.files[0]) document.getElementById('adminLogoPreview').src = URL.createObjectURL(adminLogoInput.files[0]);
      });
      document.getElementById('appearanceForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const appearanceMsg = document.getElementById('appearanceMsg');
        appearanceMsg.textContent = 'Guardando...'; appearanceMsg.className = 'msg';
        try {
          const logoFile = adminLogoInput.files[0];
          const payload = {
            ui_logo_base64: logoFile ? await fileToBase64(logoFile) : null,
            ui_btn_bg: document.getElementById('adminBtnBg').value,
            ui_btn_text: document.getElementById('adminBtnText').value,
          };
          const res = await fetch('/admin/appearance', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
          const data = await res.json();
          if (res.ok) { appearanceMsg.textContent = '✅ Guardado. Recargando...'; appearanceMsg.className = 'msg ok'; setTimeout(() => location.reload(), 800); }
          else { appearanceMsg.textContent = data.error || 'No se pudo guardar'; appearanceMsg.className = 'msg err'; }
        } catch (err) {
          appearanceMsg.textContent = 'Error: ' + err.message; appearanceMsg.className = 'msg err';
        }
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
      ${quickPaletteScript()}
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

function renderAdminRecoverForm(platformName) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Recuperar cuenta · ${escapeHtml(platformName)}</title>
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
    instruction_text: body.instruction_text || 'Muestra este código en caja para sumar tu sello en tu compra.',
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

async function handleUpdatePlatformName(request, env) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const { name } = await request.json().catch(() => ({}));
  const cleanName = (name || '').trim();
  if (!cleanName) {
    return new Response(JSON.stringify({ error: 'El nombre no puede quedar vacío' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  await env.DB.prepare('UPDATE admins SET platform_name = ? WHERE id = ?').bind(cleanName, admin.id).run();
  return new Response(JSON.stringify({ ok: true, name: cleanName }), { headers: { 'Content-Type': 'application/json' } });
}

// logo y colores de botones DE TU PANEL (nunca de las tarjetas de los negocios clientes)
async function handleUpdateAppearance(request, env) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) return new Response(JSON.stringify({ error: 'Sesión vencida, vuelve a entrar' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const body = await request.json().catch(() => ({}));
  const uiBtnBg = sanitizeColor(body.ui_btn_bg, admin.ui_btn_bg || '#472619');
  const uiBtnText = sanitizeColor(body.ui_btn_text, admin.ui_btn_text || '#B5CDEA');
  const uiLogo = body.ui_logo_base64 || null; // null = no se subió una nueva, se mantiene la actual

  await env.DB.prepare('UPDATE admins SET ui_logo_base64 = COALESCE(?, ui_logo_base64), ui_btn_bg = ?, ui_btn_text = ? WHERE id = ?')
    .bind(uiLogo, uiBtnBg, uiBtnText, admin.id).run();

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

// ------------------------------------------------------------
// formulario de contacto de la página de inicio (heytapp.com)
// ------------------------------------------------------------
async function handleCreateLead(request, env) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  const instagram = String(body.instagram || '').trim();
  const businessType = ['digital', 'fisico'].includes(body.business_type) ? body.business_type : null;

  if (!name || !phone || !email) {
    return new Response(JSON.stringify({ error: 'Faltan datos: nombre, celular y correo son obligatorios' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Ese correo no parece válido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // se guarda SIEMPRE en la base de datos, pase lo que pase con el correo —
  // así nunca se pierde una solicitud aunque el envío de email falle
  const { meta } = await env.DB.prepare(
    'INSERT INTO leads (name, phone, email, instagram, business_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(name, phone, email, instagram || null, businessType).run();

  const planLabel = businessType === 'digital' ? 'Plan Emprende Digital'
    : businessType === 'fisico' ? 'Plan Emprende Físico' : 'No especificó';

  // envío automático a hola@heytapp.com — tres formas posibles, de la más
  // simple a la más avanzada. No hace falta configurar las tres.
  let emailed = false;

  // opción 1: FormSubmit (la misma que ya usas en anaelidesign.com) — no
  // necesita cuenta ni configuración, va directo a hola@heytapp.com.
  // OJO: la primera vez que se use un correo nuevo en FormSubmit, ellos
  // mandan un correo de confirmación a hola@heytapp.com que hay que
  // aceptar UNA sola vez — después ya llegan todos los envíos derecho.
  try {
    const res = await fetch('https://formsubmit.co/ajax/hola@heytapp.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        nombre: name, celular: phone, correo: email, instagram: instagram || '—', interesado_en: planLabel,
        _subject: `Nueva solicitud de info — ${name}`,
        _template: 'table',
      }),
    });
    emailed = res.ok;
  } catch (err) {
    emailed = false;
  }

  // opción 2: Formspree (por si prefieres esa en vez de FormSubmit — solo
  // se usa si configuras la variable FORMSPREE_FORM_ID)
  if (!emailed && env.FORMSPREE_FORM_ID) {
    try {
      const res = await fetch(`https://formspree.io/f/${env.FORMSPREE_FORM_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name, phone, email, instagram: instagram || '—', interesado_en: planLabel,
          _subject: `Nueva solicitud de info — ${name}`,
          _replyto: email,
        }),
      });
      emailed = res.ok;
    } catch (err) {
      emailed = false;
    }
  }

  // opción 3: Resend (necesita dominio heytapp.com verificado en resend.com)
  if (!emailed && env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Hey Tapp <hola@heytapp.com>',
          to: ['hola@heytapp.com'],
          reply_to: email,
          subject: `Nueva solicitud de info — ${name}`,
          text: `Nueva solicitud desde heytapp.com\n\nNombre: ${name}\nCelular: ${phone}\nCorreo: ${email}\nInstagram del negocio: ${instagram || '—'}\nInteresado en: ${planLabel}`,
        }),
      });
      emailed = res.ok;
    } catch (err) {
      emailed = false;
    }
  }

  if (emailed) {
    await env.DB.prepare('UPDATE leads SET emailed = 1 WHERE id = ?').bind(meta.last_row_id).run();
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

// lista de solicitudes recibidas, para cuando no tengas el correo automático
// configurado (o como respaldo aunque sí lo tengas)
async function handleLeadsList(request, env) {
  const cookieVal = getCookie(request, 'admin_session');
  const admin = await getAdminFromSession(env, cookieVal);
  if (!admin) { const pname = await getPlatformName(env); return new Response(renderAdminLogin(pname), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }); }

  const { results } = await env.DB.prepare('SELECT * FROM leads ORDER BY id DESC').all();

  const rows = results.map(l => {
    const planLabel = l.business_type === 'digital' ? 'Emprende Digital'
      : l.business_type === 'fisico' ? 'Emprende Físico' : '—';
    return `
    <tr>
      <td data-label="Nombre">${escapeHtml(l.name)}</td>
      <td data-label="Celular"><a href="tel:${escapeHtml(l.phone)}">${escapeHtml(l.phone)}</a></td>
      <td data-label="Correo"><a href="mailto:${escapeHtml(l.email)}">${escapeHtml(l.email)}</a></td>
      <td data-label="Instagram">${l.instagram ? escapeHtml(l.instagram) : '—'}</td>
      <td data-label="Interesado en">${planLabel}</td>
      <td data-label="Fecha">${escapeHtml(l.created_at)}</td>
      <td data-label="Correo enviado">${l.emailed ? '✅' : '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Solicitudes · Hey Tapp</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{color-scheme:light;}
    *{box-sizing:border-box;color-scheme:light;}
    body{margin:0;padding:24px;font-family:'Quicksand',sans-serif;background:linear-gradient(160deg,#DAE7F1 0%,#F4F1EA 42%);color:#42281B;}
    h1{font-family:'Baloo 2',sans-serif;font-size:24px;margin:0 0 4px;}
    p.sub{color:#6B6259;font-size:14px;margin:0 0 20px;}
    a.back{display:inline-block;margin-bottom:16px;color:#42281B;font-weight:700;text-decoration:none;}
    table{width:100%;border-collapse:collapse;background:#FDFBF2;border-radius:14px;overflow:hidden;font-size:14px;box-shadow:0 4px 16px rgba(66,40,27,.08);}
    th,td{padding:12px 14px;text-align:left;border-bottom:1px solid #DAE7F1;color:#42281B;}
    th{background:#42281B;color:#FFFFFF;font-size:13px;}
    tr:nth-child(even) td{background:#F5F0E4;}
    a{color:#B0472E;font-weight:700;}
    .empty{padding:30px;text-align:center;color:#6B6259;background:#FDFBF2;border-radius:14px;}
    @media (max-width:760px) {
      table, thead, tbody, tr { display:block; }
      thead { display:none; }
      table{background:none;box-shadow:none;}
      tbody tr{background:#FDFBF2;border:2px solid #42281B;border-radius:14px;margin-bottom:14px;padding:12px 14px;}
      td{border:none;padding:6px 4px;}
      td::before{content:attr(data-label);display:block;font-size:10px;font-weight:700;color:#42281B;opacity:.6;text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px;}
    }
  </style></head>
  <body>
    <a class="back" href="/admin">← Volver al panel</a>
    <h1>Solicitudes de info (${results.length})</h1>
    <p class="sub">El correo automático a hola@heytapp.com está activo por FormSubmit — esto es tu respaldo, revísalo si algún correo no llegó.</p>
    ${results.length ? `<table><thead><tr><th>Nombre</th><th>Celular</th><th>Correo</th><th>Instagram</th><th>Interesado en</th><th>Fecha</th><th>Correo enviado</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Todavía no hay solicitudes.</div>'}
  </body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
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
  if (!admin) { const pname = await getPlatformName(env); return new Response(renderAdminLogin(pname), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }); }
  const platformName = admin.platform_name || 'My Tapp';
  const adminBtnBg = admin.ui_btn_bg || '#472619';
  const adminBtnText = admin.ui_btn_text || '#B5CDEA';

  const b = await getBusiness(env, slug);
  if (!b) return new Response('Negocio no encontrado', { status: 404 });

  const fontOptions = Object.keys(FONTS).map(key =>
    `<option value="${key}" style="font-family:'${key}',${FONTS[key].fallback};"${b.font_family === key ? ' selected' : ''}>${key} — ${FONTS[key].label}</option>`
  ).join('');
  const allFontsGoogleParams = Object.values(FONTS).map(f => f.google).join('&family=');

  return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Editar ${escapeHtml(b.name)} · ${escapeHtml(platformName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=${allFontsGoogleParams}&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<script>var QRCode=function(t){"use strict";var r,e=function(){return"function"==typeof Promise&&Promise.prototype&&Promise.prototype.then},n=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706],o=function(t){if(!t)throw new Error('"version" cannot be null or undefined');if(t<1||t>40)throw new Error('"version" should be in range from 1 to 40');return 4*t+17},a=function(t){return n[t]},i=function(t){for(var r=0;0!==t;)r++,t>>>=1;return r},u=function(t){if("function"!=typeof t)throw new Error('"toSJISFunc" is not a valid function.');r=t},s=function(){return void 0!==r},f=function(t){return r(t)};function h(t,r){return t(r={exports:{}},r.exports),r.exports}var c=h((function(t,r){r.L={bit:1},r.M={bit:0},r.Q={bit:3},r.H={bit:2},r.isValid=function(t){return t&&void 0!==t.bit&&t.bit>=0&&t.bit<4},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"l":case"low":return r.L;case"m":case"medium":return r.M;case"q":case"quartile":return r.Q;case"h":case"high":return r.H;default:throw new Error("Unknown EC Level: "+t)}}(t)}catch(t){return e}}}));function g(){this.buffer=[],this.length=0}c.L,c.M,c.Q,c.H,c.isValid,g.prototype={get:function(t){var r=Math.floor(t/8);return 1==(this.buffer[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e++)this.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return this.length},putBit:function(t){var r=Math.floor(this.length/8);this.buffer.length<=r&&this.buffer.push(0),t&&(this.buffer[r]|=128>>>this.length%8),this.length++}};var d=g;function l(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}l.prototype.set=function(t,r,e,n){var o=t*this.size+r;this.data[o]=e,n&&(this.reservedBit[o]=!0)},l.prototype.get=function(t,r){return this.data[t*this.size+r]},l.prototype.xor=function(t,r,e){this.data[t*this.size+r]^=e},l.prototype.isReserved=function(t,r){return this.reservedBit[t*this.size+r]};var v=l,p=h((function(t,r){var e=o;r.getRowColCoords=function(t){if(1===t)return[];for(var r=Math.floor(t/7)+2,n=e(t),o=145===n?26:2*Math.ceil((n-13)/(2*r-2)),a=[n-7],i=1;i<r-1;i++)a[i]=a[i-1]-o;return a.push(6),a.reverse()},r.getPositions=function(t){for(var e=[],n=r.getRowColCoords(t),o=n.length,a=0;a<o;a++)for(var i=0;i<o;i++)0===a&&0===i||0===a&&i===o-1||a===o-1&&0===i||e.push([n[a],n[i]]);return e}}));p.getRowColCoords,p.getPositions;var w=o,m=function(t){var r=w(t);return[[0,0],[r-7,0],[0,r-7]]},E=h((function(t,r){r.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var e=3,n=3,o=40,a=10;function i(t,e,n){switch(t){case r.Patterns.PATTERN000:return(e+n)%2==0;case r.Patterns.PATTERN001:return e%2==0;case r.Patterns.PATTERN010:return n%3==0;case r.Patterns.PATTERN011:return(e+n)%3==0;case r.Patterns.PATTERN100:return(Math.floor(e/2)+Math.floor(n/3))%2==0;case r.Patterns.PATTERN101:return e*n%2+e*n%3==0;case r.Patterns.PATTERN110:return(e*n%2+e*n%3)%2==0;case r.Patterns.PATTERN111:return(e*n%3+(e+n)%2)%2==0;default:throw new Error("bad maskPattern:"+t)}}r.isValid=function(t){return null!=t&&""!==t&&!isNaN(t)&&t>=0&&t<=7},r.from=function(t){return r.isValid(t)?parseInt(t,10):void 0},r.getPenaltyN1=function(t){for(var r=t.size,n=0,o=0,a=0,i=null,u=null,s=0;s<r;s++){o=a=0,i=u=null;for(var f=0;f<r;f++){var h=t.get(s,f);h===i?o++:(o>=5&&(n+=e+(o-5)),i=h,o=1),(h=t.get(f,s))===u?a++:(a>=5&&(n+=e+(a-5)),u=h,a=1)}o>=5&&(n+=e+(o-5)),a>=5&&(n+=e+(a-5))}return n},r.getPenaltyN2=function(t){for(var r=t.size,e=0,o=0;o<r-1;o++)for(var a=0;a<r-1;a++){var i=t.get(o,a)+t.get(o,a+1)+t.get(o+1,a)+t.get(o+1,a+1);4!==i&&0!==i||e++}return e*n},r.getPenaltyN3=function(t){for(var r=t.size,e=0,n=0,a=0,i=0;i<r;i++){n=a=0;for(var u=0;u<r;u++)n=n<<1&2047|t.get(i,u),u>=10&&(1488===n||93===n)&&e++,a=a<<1&2047|t.get(u,i),u>=10&&(1488===a||93===a)&&e++}return e*o},r.getPenaltyN4=function(t){for(var r=0,e=t.data.length,n=0;n<e;n++)r+=t.data[n];return Math.abs(Math.ceil(100*r/e/5)-10)*a},r.applyMask=function(t,r){for(var e=r.size,n=0;n<e;n++)for(var o=0;o<e;o++)r.isReserved(o,n)||r.xor(o,n,i(t,o,n))},r.getBestMask=function(t,e){for(var n=Object.keys(r.Patterns).length,o=0,a=1/0,i=0;i<n;i++){e(i),r.applyMask(i,t);var u=r.getPenaltyN1(t)+r.getPenaltyN2(t)+r.getPenaltyN3(t)+r.getPenaltyN4(t);r.applyMask(i,t),u<a&&(a=u,o=i)}return o}}));E.Patterns,E.isValid,E.getPenaltyN1,E.getPenaltyN2,E.getPenaltyN3,E.getPenaltyN4,E.applyMask,E.getBestMask;var y=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],A=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430],I=function(t,r){switch(r){case c.L:return y[4*(t-1)+0];case c.M:return y[4*(t-1)+1];case c.Q:return y[4*(t-1)+2];case c.H:return y[4*(t-1)+3];default:return}},M=function(t,r){switch(r){case c.L:return A[4*(t-1)+0];case c.M:return A[4*(t-1)+1];case c.Q:return A[4*(t-1)+2];case c.H:return A[4*(t-1)+3];default:return}},N=new Uint8Array(512),B=new Uint8Array(256);!function(){for(var t=1,r=0;r<255;r++)N[r]=t,B[t]=r,256&(t<<=1)&&(t^=285);for(var e=255;e<512;e++)N[e]=N[e-255]}();var C=function(t){return N[t]},P=function(t,r){return 0===t||0===r?0:N[B[t]+B[r]]},R=h((function(t,r){r.mul=function(t,r){for(var e=new Uint8Array(t.length+r.length-1),n=0;n<t.length;n++)for(var o=0;o<r.length;o++)e[n+o]^=P(t[n],r[o]);return e},r.mod=function(t,r){for(var e=new Uint8Array(t);e.length-r.length>=0;){for(var n=e[0],o=0;o<r.length;o++)e[o]^=P(r[o],n);for(var a=0;a<e.length&&0===e[a];)a++;e=e.slice(a)}return e},r.generateECPolynomial=function(t){for(var e=new Uint8Array([1]),n=0;n<t;n++)e=r.mul(e,new Uint8Array([1,C(n)]));return e}}));function T(t){this.genPoly=void 0,this.degree=t,this.degree&&this.initialize(this.degree)}R.mul,R.mod,R.generateECPolynomial,T.prototype.initialize=function(t){this.degree=t,this.genPoly=R.generateECPolynomial(this.degree)},T.prototype.encode=function(t){if(!this.genPoly)throw new Error("Encoder not initialized");var r=new Uint8Array(t.length+this.degree);r.set(t);var e=R.mod(r,this.genPoly),n=this.degree-e.length;if(n>0){var o=new Uint8Array(this.degree);return o.set(e,n),o}return e};var L=T,b=function(t){return!isNaN(t)&&t>=1&&t<=40},U="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+",x="(?:(?![A-Z0-9 $%*+\\\\-./:]|"+(U=U.replace(/u/g,"\\\\u"))+")(?:.|[\\r\\n]))+",k=new RegExp(U,"g"),F=new RegExp("[^A-Z0-9 $%*+\\\\-./:]+","g"),S=new RegExp(x,"g"),D=new RegExp("[0-9]+","g"),Y=new RegExp("[A-Z $%*+\\\\-./:]+","g"),_=new RegExp("^"+U+"$"),z=new RegExp("^[0-9]+$"),H=new RegExp("^[A-Z0-9 $%*+\\\\-./:]+$"),J={KANJI:k,BYTE_KANJI:F,BYTE:S,NUMERIC:D,ALPHANUMERIC:Y,testKanji:function(t){return _.test(t)},testNumeric:function(t){return z.test(t)},testAlphanumeric:function(t){return H.test(t)}},K=h((function(t,r){r.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},r.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},r.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},r.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},r.MIXED={bit:-1},r.getCharCountIndicator=function(t,r){if(!t.ccBits)throw new Error("Invalid mode: "+t);if(!b(r))throw new Error("Invalid version: "+r);return r>=1&&r<10?t.ccBits[0]:r<27?t.ccBits[1]:t.ccBits[2]},r.getBestModeForData=function(t){return J.testNumeric(t)?r.NUMERIC:J.testAlphanumeric(t)?r.ALPHANUMERIC:J.testKanji(t)?r.KANJI:r.BYTE},r.toString=function(t){if(t&&t.id)return t.id;throw new Error("Invalid mode")},r.isValid=function(t){return t&&t.bit&&t.ccBits},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return r.NUMERIC;case"alphanumeric":return r.ALPHANUMERIC;case"kanji":return r.KANJI;case"byte":return r.BYTE;default:throw new Error("Unknown mode: "+t)}}(t)}catch(t){return e}}}));K.NUMERIC,K.ALPHANUMERIC,K.BYTE,K.KANJI,K.MIXED,K.getCharCountIndicator,K.getBestModeForData,K.isValid;var O=h((function(t,r){var e=i(7973);function n(t,r){return K.getCharCountIndicator(t,r)+4}function o(t,r){var e=0;return t.forEach((function(t){var o=n(t.mode,r);e+=o+t.getBitsLength()})),e}r.from=function(t,r){return b(t)?parseInt(t,10):r},r.getCapacity=function(t,r,e){if(!b(t))throw new Error("Invalid QR Code version");void 0===e&&(e=K.BYTE);var o=8*(a(t)-M(t,r));if(e===K.MIXED)return o;var i=o-n(e,t);switch(e){case K.NUMERIC:return Math.floor(i/10*3);case K.ALPHANUMERIC:return Math.floor(i/11*2);case K.KANJI:return Math.floor(i/13);case K.BYTE:default:return Math.floor(i/8)}},r.getBestVersionForData=function(t,e){var n,a=c.from(e,c.M);if(Array.isArray(t)){if(t.length>1)return function(t,e){for(var n=1;n<=40;n++){if(o(t,n)<=r.getCapacity(n,e,K.MIXED))return n}}(t,a);if(0===t.length)return 1;n=t[0]}else n=t;return function(t,e,n){for(var o=1;o<=40;o++)if(e<=r.getCapacity(o,n,t))return o}(n.mode,n.getLength(),a)},r.getEncodedBits=function(t){if(!b(t)||t<7)throw new Error("Invalid QR Code version");for(var r=t<<12;i(r)-e>=0;)r^=7973<<i(r)-e;return t<<12|r}}));O.getCapacity,O.getBestVersionForData,O.getEncodedBits;var Q=i(1335),V=function(t,r){for(var e=t.bit<<3|r,n=e<<10;i(n)-Q>=0;)n^=1335<<i(n)-Q;return 21522^(e<<10|n)};function q(t){this.mode=K.NUMERIC,this.data=t.toString()}q.getBitsLength=function(t){return 10*Math.floor(t/3)+(t%3?t%3*3+1:0)},q.prototype.getLength=function(){return this.data.length},q.prototype.getBitsLength=function(){return q.getBitsLength(this.data.length)},q.prototype.write=function(t){var r,e,n;for(r=0;r+3<=this.data.length;r+=3)e=this.data.substr(r,3),n=parseInt(e,10),t.put(n,10);var o=this.data.length-r;o>0&&(e=this.data.substr(r),n=parseInt(e,10),t.put(n,3*o+1))};var j=q,$=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function X(t){this.mode=K.ALPHANUMERIC,this.data=t}X.getBitsLength=function(t){return 11*Math.floor(t/2)+t%2*6},X.prototype.getLength=function(){return this.data.length},X.prototype.getBitsLength=function(){return X.getBitsLength(this.data.length)},X.prototype.write=function(t){var r;for(r=0;r+2<=this.data.length;r+=2){var e=45*$.indexOf(this.data[r]);e+=$.indexOf(this.data[r+1]),t.put(e,11)}this.data.length%2&&t.put($.indexOf(this.data[r]),6)};var Z=X;function W(t){this.mode=K.BYTE,"string"==typeof t&&(t=function(t){for(var r=[],e=t.length,n=0;n<e;n++){var o=t.charCodeAt(n);if(o>=55296&&o<=56319&&e>n+1){var a=t.charCodeAt(n+1);a>=56320&&a<=57343&&(o=1024*(o-55296)+a-56320+65536,n+=1)}o<128?r.push(o):o<2048?(r.push(o>>6|192),r.push(63&o|128)):o<55296||o>=57344&&o<65536?(r.push(o>>12|224),r.push(o>>6&63|128),r.push(63&o|128)):o>=65536&&o<=1114111?(r.push(o>>18|240),r.push(o>>12&63|128),r.push(o>>6&63|128),r.push(63&o|128)):r.push(239,191,189)}return new Uint8Array(r).buffer}(t)),this.data=new Uint8Array(t)}W.getBitsLength=function(t){return 8*t},W.prototype.getLength=function(){return this.data.length},W.prototype.getBitsLength=function(){return W.getBitsLength(this.data.length)},W.prototype.write=function(t){for(var r=0,e=this.data.length;r<e;r++)t.put(this.data[r],8)};var G=W;function tt(t){this.mode=K.KANJI,this.data=t}tt.getBitsLength=function(t){return 13*t},tt.prototype.getLength=function(){return this.data.length},tt.prototype.getBitsLength=function(){return tt.getBitsLength(this.data.length)},tt.prototype.write=function(t){var r;for(r=0;r<this.data.length;r++){var e=f(this.data[r]);if(e>=33088&&e<=40956)e-=33088;else{if(!(e>=57408&&e<=60351))throw new Error("Invalid SJIS character: "+this.data[r]+"\\nMake sure your charset is UTF-8");e-=49472}e=192*(e>>>8&255)+(255&e),t.put(e,13)}};var rt=tt,et=h((function(t){var r={single_source_shortest_paths:function(t,e,n){var o={},a={};a[e]=0;var i,u,s,f,h,c,g,d=r.PriorityQueue.make();for(d.push(e,0);!d.empty();)for(s in u=(i=d.pop()).value,f=i.cost,h=t[u]||{})h.hasOwnProperty(s)&&(c=f+h[s],g=a[s],(void 0===a[s]||g>c)&&(a[s]=c,d.push(s,c),o[s]=u));if(void 0!==n&&void 0===a[n]){var l=["Could not find a path from ",e," to ",n,"."].join("");throw new Error(l)}return o},extract_shortest_path_from_predecessor_list:function(t,r){for(var e=[],n=r;n;)e.push(n),n=t[n];return e.reverse(),e},find_path:function(t,e,n){var o=r.single_source_shortest_paths(t,e,n);return r.extract_shortest_path_from_predecessor_list(o,n)},PriorityQueue:{make:function(t){var e,n=r.PriorityQueue,o={};for(e in t=t||{},n)n.hasOwnProperty(e)&&(o[e]=n[e]);return o.queue=[],o.sorter=t.sorter||n.default_sorter,o},default_sorter:function(t,r){return t.cost-r.cost},push:function(t,r){var e={value:t,cost:r};this.queue.push(e),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return 0===this.queue.length}}};t.exports=r})),nt=h((function(t,r){function e(t){return unescape(encodeURIComponent(t)).length}function n(t,r,e){for(var n,o=[];null!==(n=t.exec(e));)o.push({data:n[0],index:n.index,mode:r,length:n[0].length});return o}function o(t){var r,e,o=n(J.NUMERIC,K.NUMERIC,t),a=n(J.ALPHANUMERIC,K.ALPHANUMERIC,t);return s()?(r=n(J.BYTE,K.BYTE,t),e=n(J.KANJI,K.KANJI,t)):(r=n(J.BYTE_KANJI,K.BYTE,t),e=[]),o.concat(a,r,e).sort((function(t,r){return t.index-r.index})).map((function(t){return{data:t.data,mode:t.mode,length:t.length}}))}function a(t,r){switch(r){case K.NUMERIC:return j.getBitsLength(t);case K.ALPHANUMERIC:return Z.getBitsLength(t);case K.KANJI:return rt.getBitsLength(t);case K.BYTE:return G.getBitsLength(t)}}function i(t,r){var e,n=K.getBestModeForData(t);if((e=K.from(r,n))!==K.BYTE&&e.bit<n.bit)throw new Error('"'+t+'" cannot be encoded with mode '+K.toString(e)+".\\n Suggested mode is: "+K.toString(n));switch(e!==K.KANJI||s()||(e=K.BYTE),e){case K.NUMERIC:return new j(t);case K.ALPHANUMERIC:return new Z(t);case K.KANJI:return new rt(t);case K.BYTE:return new G(t)}}r.fromArray=function(t){return t.reduce((function(t,r){return"string"==typeof r?t.push(i(r,null)):r.data&&t.push(i(r.data,r.mode)),t}),[])},r.fromString=function(t,n){for(var i=function(t,r){for(var e={},n={start:{}},o=["start"],i=0;i<t.length;i++){for(var u=t[i],s=[],f=0;f<u.length;f++){var h=u[f],c=""+i+f;s.push(c),e[c]={node:h,lastCount:0},n[c]={};for(var g=0;g<o.length;g++){var d=o[g];e[d]&&e[d].node.mode===h.mode?(n[d][c]=a(e[d].lastCount+h.length,h.mode)-a(e[d].lastCount,h.mode),e[d].lastCount+=h.length):(e[d]&&(e[d].lastCount=h.length),n[d][c]=a(h.length,h.mode)+4+K.getCharCountIndicator(h.mode,r))}}o=s}for(var l=0;l<o.length;l++)n[o[l]].end=0;return{map:n,table:e}}(function(t){for(var r=[],n=0;n<t.length;n++){var o=t[n];switch(o.mode){case K.NUMERIC:r.push([o,{data:o.data,mode:K.ALPHANUMERIC,length:o.length},{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.ALPHANUMERIC:r.push([o,{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.KANJI:r.push([o,{data:o.data,mode:K.BYTE,length:e(o.data)}]);break;case K.BYTE:r.push([{data:o.data,mode:K.BYTE,length:e(o.data)}])}}return r}(o(t)),n),u=et.find_path(i.map,"start","end"),s=[],f=1;f<u.length-1;f++)s.push(i.table[u[f]].node);return r.fromArray(function(t){return t.reduce((function(t,r){var e=t.length-1>=0?t[t.length-1]:null;return e&&e.mode===r.mode?(t[t.length-1].data+=r.data,t):(t.push(r),t)}),[])}(s))},r.rawSplit=function(t){return r.fromArray(o(t))}}));function ot(t,r,e){var n,o,a=t.size,i=V(r,e);for(n=0;n<15;n++)o=1==(i>>n&1),n<6?t.set(n,8,o,!0):n<8?t.set(n+1,8,o,!0):t.set(a-15+n,8,o,!0),n<8?t.set(8,a-n-1,o,!0):n<9?t.set(8,15-n-1+1,o,!0):t.set(8,15-n-1,o,!0);t.set(a-8,8,1,!0)}function at(t,r,e){var n=new d;e.forEach((function(r){n.put(r.mode.bit,4),n.put(r.getLength(),K.getCharCountIndicator(r.mode,t)),r.write(n)}));var o=8*(a(t)-M(t,r));for(n.getLengthInBits()+4<=o&&n.put(0,4);n.getLengthInBits()%8!=0;)n.putBit(0);for(var i=(o-n.getLengthInBits())/8,u=0;u<i;u++)n.put(u%2?17:236,8);return function(t,r,e){for(var n=a(r),o=M(r,e),i=n-o,u=I(r,e),s=u-n%u,f=Math.floor(n/u),h=Math.floor(i/u),c=h+1,g=f-h,d=new L(g),l=0,v=new Array(u),p=new Array(u),w=0,m=new Uint8Array(t.buffer),E=0;E<u;E++){var y=E<s?h:c;v[E]=m.slice(l,l+y),p[E]=d.encode(v[E]),l+=y,w=Math.max(w,y)}var A,N,B=new Uint8Array(n),C=0;for(A=0;A<w;A++)for(N=0;N<u;N++)A<v[N].length&&(B[C++]=v[N][A]);for(A=0;A<g;A++)for(N=0;N<u;N++)B[C++]=p[N][A];return B}(n,t,r)}function it(t,r,e,n){var a;if(Array.isArray(t))a=nt.fromArray(t);else{if("string"!=typeof t)throw new Error("Invalid data");var i=r;if(!i){var u=nt.rawSplit(t);i=O.getBestVersionForData(u,e)}a=nt.fromString(t,i||40)}var s=O.getBestVersionForData(a,e);if(!s)throw new Error("The amount of data is too big to be stored in a QR Code");if(r){if(r<s)throw new Error("\\nThe chosen QR Code version cannot contain this amount of data.\\nMinimum version required to store current data is: "+s+".\\n")}else r=s;var f=at(r,e,a),h=o(r),c=new v(h);return function(t,r){for(var e=t.size,n=m(r),o=0;o<n.length;o++)for(var a=n[o][0],i=n[o][1],u=-1;u<=7;u++)if(!(a+u<=-1||e<=a+u))for(var s=-1;s<=7;s++)i+s<=-1||e<=i+s||(u>=0&&u<=6&&(0===s||6===s)||s>=0&&s<=6&&(0===u||6===u)||u>=2&&u<=4&&s>=2&&s<=4?t.set(a+u,i+s,!0,!0):t.set(a+u,i+s,!1,!0))}(c,r),function(t){for(var r=t.size,e=8;e<r-8;e++){var n=e%2==0;t.set(e,6,n,!0),t.set(6,e,n,!0)}}(c),function(t,r){for(var e=p.getPositions(r),n=0;n<e.length;n++)for(var o=e[n][0],a=e[n][1],i=-2;i<=2;i++)for(var u=-2;u<=2;u++)-2===i||2===i||-2===u||2===u||0===i&&0===u?t.set(o+i,a+u,!0,!0):t.set(o+i,a+u,!1,!0)}(c,r),ot(c,e,0),r>=7&&function(t,r){for(var e,n,o,a=t.size,i=O.getEncodedBits(r),u=0;u<18;u++)e=Math.floor(u/3),n=u%3+a-8-3,o=1==(i>>u&1),t.set(e,n,o,!0),t.set(n,e,o,!0)}(c,r),function(t,r){for(var e=t.size,n=-1,o=e-1,a=7,i=0,u=e-1;u>0;u-=2)for(6===u&&u--;;){for(var s=0;s<2;s++)if(!t.isReserved(o,u-s)){var f=!1;i<r.length&&(f=1==(r[i]>>>a&1)),t.set(o,u-s,f),-1===--a&&(i++,a=7)}if((o+=n)<0||e<=o){o-=n,n=-n;break}}}(c,f),isNaN(n)&&(n=E.getBestMask(c,ot.bind(null,c,e))),E.applyMask(n,c),ot(c,e,n),{modules:c,version:r,errorCorrectionLevel:e,maskPattern:n,segments:a}}nt.fromArray,nt.fromString,nt.rawSplit;var ut=function(t,r){if(void 0===t||""===t)throw new Error("No input text");var e,n,o=c.M;return void 0!==r&&(o=c.from(r.errorCorrectionLevel,c.M),e=O.from(r.version),n=E.from(r.maskPattern),r.toSJISFunc&&u(r.toSJISFunc)),it(t,e,o,n)},st=h((function(t,r){function e(t){if("number"==typeof t&&(t=t.toString()),"string"!=typeof t)throw new Error("Color should be defined as hex string");var r=t.slice().replace("#","").split("");if(r.length<3||5===r.length||r.length>8)throw new Error("Invalid hex color: "+t);3!==r.length&&4!==r.length||(r=Array.prototype.concat.apply([],r.map((function(t){return[t,t]})))),6===r.length&&r.push("F","F");var e=parseInt(r.join(""),16);return{r:e>>24&255,g:e>>16&255,b:e>>8&255,a:255&e,hex:"#"+r.slice(0,6).join("")}}r.getOptions=function(t){t||(t={}),t.color||(t.color={});var r=void 0===t.margin||null===t.margin||t.margin<0?4:t.margin,n=t.width&&t.width>=21?t.width:void 0,o=t.scale||4;return{width:n,scale:n?4:o,margin:r,color:{dark:e(t.color.dark||"#000000ff"),light:e(t.color.light||"#ffffffff")},type:t.type,rendererOpts:t.rendererOpts||{}}},r.getScale=function(t,r){return r.width&&r.width>=t+2*r.margin?r.width/(t+2*r.margin):r.scale},r.getImageWidth=function(t,e){var n=r.getScale(t,e);return Math.floor((t+2*e.margin)*n)},r.qrToImageData=function(t,e,n){for(var o=e.modules.size,a=e.modules.data,i=r.getScale(o,n),u=Math.floor((o+2*n.margin)*i),s=n.margin*i,f=[n.color.light,n.color.dark],h=0;h<u;h++)for(var c=0;c<u;c++){var g=4*(h*u+c),d=n.color.light;if(h>=s&&c>=s&&h<u-s&&c<u-s)d=f[a[Math.floor((h-s)/i)*o+Math.floor((c-s)/i)]?1:0];t[g++]=d.r,t[g++]=d.g,t[g++]=d.b,t[g]=d.a}}}));st.getOptions,st.getScale,st.getImageWidth,st.qrToImageData;var ft=h((function(t,r){r.render=function(t,r,e){var n=e,o=r;void 0!==n||r&&r.getContext||(n=r,r=void 0),r||(o=function(){try{return document.createElement("canvas")}catch(t){throw new Error("You need to specify a canvas element")}}()),n=st.getOptions(n);var a=st.getImageWidth(t.modules.size,n),i=o.getContext("2d"),u=i.createImageData(a,a);return st.qrToImageData(u.data,t,n),function(t,r,e){t.clearRect(0,0,r.width,r.height),r.style||(r.style={}),r.height=e,r.width=e,r.style.height=e+"px",r.style.width=e+"px"}(i,o,a),i.putImageData(u,0,0),o},r.renderToDataURL=function(t,e,n){var o=n;void 0!==o||e&&e.getContext||(o=e,e=void 0),o||(o={});var a=r.render(t,e,o),i=o.type||"image/png",u=o.rendererOpts||{};return a.toDataURL(i,u.quality)}}));function ht(t,r){var e=t.a/255,n=r+'="'+t.hex+'"';return e<1?n+" "+r+'-opacity="'+e.toFixed(2).slice(1)+'"':n}function ct(t,r,e){var n=t+r;return void 0!==e&&(n+=" "+e),n}ft.render,ft.renderToDataURL;var gt=function(t,r,e){var n=st.getOptions(r),o=t.modules.size,a=t.modules.data,i=o+2*n.margin,u=n.color.light.a?"<path "+ht(n.color.light,"fill")+' d="M0 0h'+i+"v"+i+'H0z"/>':"",s="<path "+ht(n.color.dark,"stroke")+' d="'+function(t,r,e){for(var n="",o=0,a=!1,i=0,u=0;u<t.length;u++){var s=Math.floor(u%r),f=Math.floor(u/r);s||a||(a=!0),t[u]?(i++,u>0&&s>0&&t[u-1]||(n+=a?ct("M",s+e,.5+f+e):ct("m",o,0),o=0,a=!1),s+1<r&&t[u+1]||(n+=ct("h",i),i=0)):o++}return n}(a,o,n.margin)+'"/>',f='viewBox="0 0 '+i+" "+i+'"',h='<svg xmlns="http://www.w3.org/2000/svg" '+(n.width?'width="'+n.width+'" height="'+n.width+'" ':"")+f+' shape-rendering="crispEdges">'+u+s+"</svg>\\n";return"function"==typeof e&&e(null,h),h};function dt(t,r,n,o,a){var i=[].slice.call(arguments,1),u=i.length,s="function"==typeof i[u-1];if(!s&&!e())throw new Error("Callback required as last argument");if(!s){if(u<1)throw new Error("Too few arguments provided");return 1===u?(n=r,r=o=void 0):2!==u||r.getContext||(o=n,n=r,r=void 0),new Promise((function(e,a){try{var i=ut(n,o);e(t(i,r,o))}catch(t){a(t)}}))}if(u<2)throw new Error("Too few arguments provided");2===u?(a=n,n=r,r=o=void 0):3===u&&(r.getContext&&void 0===a?(a=o,o=void 0):(a=o,o=n,n=r,r=void 0));try{var f=ut(n,o);a(null,t(f,r,o))}catch(t){a(t)}}var lt=ut,vt=dt.bind(null,ft.render),pt=dt.bind(null,ft.renderToDataURL),wt=dt.bind(null,(function(t,r,e){return gt(t,e)})),mt={create:lt,toCanvas:vt,toDataURL:pt,toString:wt};return t.create=lt,t.default=mt,t.toCanvas=vt,t.toDataURL=pt,t.toString=wt,Object.defineProperty(t,"__esModule",{value:!0}),t}({});</script>
  <style>
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;background:linear-gradient(160deg,#DAE7F1 0%,#F4F1EA 42%);font-family:'Quicksand',sans-serif;padding:32px 24px;color:#42281B;}
    .wrap{max-width:1040px;margin:0 auto;display:flex;gap:24px;align-items:flex-start;}
    .form-col{flex:1;min-width:0;}
    @media (max-width: 900px) {
      .wrap{flex-direction:column;}
      .preview-col{width:100%;position:static;}
    }
    h1{font-family:'Baloo 2',sans-serif;font-size:22px;color:#42281B;letter-spacing:.2px;}
    .card{background:white;border:1px solid #EDE4D3;border-radius:20px;padding:24px;margin-top:14px;box-shadow:0 4px 20px rgba(66,40,27,.07);}
    label{display:block;font-size:12px;font-weight:700;margin:10px 0 4px;}
    input[type=text], input[type=number]{width:100%;padding:11px 13px;border:1.5px solid #E2D9C8;border-radius:11px;font-size:14px;font-family:'Quicksand',sans-serif;transition:border-color .15s ease,box-shadow .15s ease;background:#FEFDFB;}
    input[type=text]:focus, input[type=number]:focus{outline:none;border-color:#B0472E;box-shadow:0 0 0 3px rgba(176,71,46,.12);}
    input[type=color]{width:46px;height:42px;border:2px solid #2B2320;border-radius:10px;padding:2px;flex-shrink:0;}
    input[type=file]{width:100%;font-size:12px;margin-top:4px;}
    select{width:100%;padding:11px 13px;border:1.5px solid #E2D9C8;border-radius:11px;font-size:14px;font-family:'Quicksand',sans-serif;background:#FEFDFB;}
    .color-field{display:flex;gap:6px;}
    .color-field input.colorHex{width:100%;padding:10px 12px;border:2px solid #2B2320;border-radius:10px;font-size:13px;font-family:monospace;text-transform:uppercase;}
    .color-row{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid #EEE9DF;}
    .color-row-label{flex:1;font-size:13px;color:#2B2320;}
    .color-row input[type=color]{width:38px;height:34px;flex-shrink:0;padding:2px;}
    .color-row input.colorHex{width:100px;flex-shrink:0;padding:7px 8px;border:2px solid #2B2320;border-radius:8px;font-size:12px;font-family:monospace;text-transform:uppercase;}
    .colors{display:flex;flex-direction:column;gap:0;}
    .quick-palette{background:#FBF7EE;border:2px dashed #C9A46A;border-radius:14px;padding:14px 16px;margin-top:16px;}
    .quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;}
    .quick-grid .color-row{border-bottom:none;padding:5px 0;}
    @media (max-width:520px){ .quick-grid{grid-template-columns:1fr;} }
    .sellos{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .current-img{width:40px;height:40px;object-fit:contain;background:#F4F1EA;border-radius:8px;padding:4px;vertical-align:middle;margin-right:8px;}
    .hint{font-size:11px;color:#8A6F4E;margin-top:2px;}
    button{margin-top:18px;width:100%;padding:14px;border:none;border-radius:14px;background:${adminBtnBg};color:${adminBtnText};font-weight:800;font-size:15px;cursor:pointer;font-family:'Baloo 2',sans-serif;box-shadow:0 3px 10px rgba(66,40,27,.25);transition:transform .12s ease,box-shadow .12s ease;}
    button:hover{box-shadow:0 5px 14px rgba(66,40,27,.32);}
    button:active{transform:translateY(1px);box-shadow:0 2px 6px rgba(66,40,27,.25);}
    .undo-btn{margin-top:8px;background:#F4F1EA!important;color:#2B2320!important;font-size:13px!important;padding:9px!important;}
    .undo-btn:disabled{opacity:.45;cursor:not-allowed;}
    .msg{text-align:center;font-size:13px;margin-top:12px;}
    .msg.ok{color:#215A34;} .msg.err{color:#B23A3A;}
    a.back{display:inline-block;margin-bottom:14px;color:#2B2320;font-weight:700;text-decoration:none;}
    .pw-wrap{position:relative;}
    .pw-wrap input{padding-right:44px;}
    .pw-toggle{position:absolute;right:8px;top:8px;background:none!important;border:none!important;width:auto!important;padding:2px!important;font-size:17px;cursor:pointer;line-height:1;color:#2B2320!important;box-shadow:none!important;margin-top:0!important;}
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

          <p class="hint">El slug (${escapeHtml(b.slug)}) es la parte del link que va después de tu dominio.</p>
          <input type="text" id="slug" value="${escapeHtml(b.slug)}" required pattern="[a-z0-9-]+">
          <p class="hint" style="color:#B23A3A;">⚠️ Si lo cambias, los links y códigos QR que tus clientes ya tienen guardados (con el slug anterior) van a dejar de funcionar. Solo cámbialo si sabes lo que haces.</p>

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
            <option value="Muestra este código en caja para sumar tu sello en tu compra."${b.instruction_text === 'Muestra este código en caja para sumar tu sello en tu compra.' ? ' selected' : ''}>Negocio físico: mostrar en caja</option>
            <option value="Muestra este código al momento de pagar para sumar tu sello."${b.instruction_text === 'Muestra este código al momento de pagar para sumar tu sello.' ? ' selected' : ''}>Negocio físico: mostrar al pagar</option>
            <option value="Envía este código al confirmar tu pedido para sumar tu sello."${b.instruction_text === 'Envía este código al confirmar tu pedido para sumar tu sello.' ? ' selected' : ''}>Negocio digital: al confirmar pedido</option>
            <option value="Pega este código en el chat al hacer tu compra."${b.instruction_text === 'Pega este código en el chat al hacer tu compra.' ? ' selected' : ''}>Negocio digital: pegar en el chat</option>
            <option value="Envía una captura de este código junto a tu comprobante de pago."${b.instruction_text === 'Envía una captura de este código junto a tu comprobante de pago.' ? ' selected' : ''}>Negocio digital: junto al comprobante</option>
          </select>

          <label>Instagram (usuario)</label>
          <input type="text" id="instagram_handle" value="${escapeHtml(b.instagram_handle || '')}">

          <label>Instagram (link completo)</label>
          <input type="text" id="instagram_url" value="${escapeHtml(b.instagram_url || '')}">

          <div style="display:flex;gap:8px;align-items:flex-end;">
            <button type="submit" style="flex:1;">Guardar cambios</button>
            <button type="button" id="undoBtn" class="undo-btn" style="flex:0 0 auto;width:auto;padding:14px 16px;" disabled title="Deshacer último cambio (Ctrl+Z)">↩️ Deshacer</button>
          </div>
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
            slug: document.getElementById('slug').value.trim(),
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
          if (res.ok) {
            if (data.slug && data.slug !== '${slug}') {
              msg.textContent = '✅ Guardado. El slug cambió, redirigiendo...'; msg.className = 'msg ok';
              setTimeout(() => { location.href = '/admin/business/' + data.slug + '/edit'; }, 900);
            } else {
              msg.textContent = '✅ Cambios guardados'; msg.className = 'msg ok';
            }
          }
          else { msg.textContent = data.error || 'No se pudo guardar'; msg.className = 'msg err'; }
        } catch (err) {
          msg.textContent = 'Error: ' + err.message; msg.className = 'msg err';
        }
      });
      ${previewScript(b.sello_1_base64)}
      ${quickPaletteScript()}
      ${passwordModalScript()}
      // ---- deshacer cambios (estilo Ctrl+Z) mientras se edita este formulario ----
      (function () {
        const form = document.getElementById('editForm');
        const undoBtn = document.getElementById('undoBtn');
        let history = [];
        let historyIndex = -1;
        let suppress = false;

        function snapshot() {
          const data = {};
          form.querySelectorAll('input, select').forEach(el => {
            if (el.type === 'file') return;
            data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
          });
          return data;
        }
        function applySnapshot(snap) {
          suppress = true;
          Object.keys(snap).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = snap[id]; else el.value = snap[id];
            el.dispatchEvent(new Event('input'));
            el.dispatchEvent(new Event('change'));
          });
          suppress = false;
        }
        function pushHistory() {
          if (suppress) return;
          history = history.slice(0, historyIndex + 1);
          history.push(snapshot());
          historyIndex = history.length - 1;
          undoBtn.disabled = historyIndex <= 0;
        }
        function undo() {
          if (historyIndex <= 0) return;
          historyIndex--;
          applySnapshot(history[historyIndex]);
          undoBtn.disabled = historyIndex <= 0;
        }
        form.querySelectorAll('input, select').forEach(el => {
          el.addEventListener('change', pushHistory);
        });
        pushHistory(); // estado inicial, tal como llegó la página
        undoBtn.addEventListener('click', undo);
        document.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        });
      })();
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

  // slug: si lo cambiaron, validar formato y que no choque con otro negocio existente
  let newSlug = business.slug;
  if (typeof body.slug === 'string') {
    const cleanSlug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSlug) {
      return new Response(JSON.stringify({ error: 'El slug no puede quedar vacío' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (['admin', 'staff', 'nuevo', 'api', 'www', 'null', 'undefined'].includes(cleanSlug)) {
      return new Response(JSON.stringify({ error: 'Ese slug está reservado, usa otro' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (cleanSlug !== business.slug) {
      const existing = await env.DB.prepare('SELECT id FROM businesses WHERE slug = ? AND id != ?').bind(cleanSlug, business.id).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'Ya existe otro negocio con ese slug' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }
    newSlug = cleanSlug;
  }

  // campos con imagen: si no se subió una nueva, se mantiene la actual (COALESCE en SQL)
  const imageFields = { logo_base64: body.logo_base64 || null, sello_1_base64: body.sello_1_base64 || null,
    sello_2_base64: body.sello_2_base64 || null, sello_3_base64: body.sello_3_base64 || null, sello_4_base64: body.sello_4_base64 || null };

  const fixedFields = {
    slug: newSlug, name: body.name, font_family: fontFamily, total_stamps: sanitizeTotalStamps(body.total_stamps, business.total_stamps),
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

  return new Response(JSON.stringify({ ok: true, slug: newSlug }), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePublicRegisterForm(env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });

  const font = getFontConfig(business.font_family);
  const btnColors = getContrastButtonColors(business);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Bienvenido · ${escapeHtml(business.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=${font.google}&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;background:${business.color_page_bg};font-family:'Quicksand',sans-serif;padding:24px;}
    .box{width:100%;max-width:420px;margin:0 auto;background:${business.color_card_bg};border:2.5px solid ${business.color_brown};border-radius:28px;padding:44px 34px;box-shadow:0 10px 0 ${business.color_brown_deep};text-align:center;}
    .brand-logo{max-width:190px;width:66%;margin:0 auto 24px;display:block;}
    h1{font-family:'${business.font_family}',${font.fallback};font-size:23px;color:${business.color_brown};margin:0 0 8px;}
    p.sub{font-size:14.5px;color:${business.color_brown_soft};margin:0 0 28px;line-height:1.4;}
    input{width:100%;padding:16px 16px;border:2px solid ${business.color_brown};border-radius:14px;font-size:16px;margin-bottom:14px;font-family:'Quicksand',sans-serif;text-align:center;}
    button{width:100%;padding:16px;border:2px solid ${business.color_brown};border-radius:14px;background:${btnColors.bg};color:${btnColors.text};font-weight:800;font-size:16px;cursor:pointer;font-family:'${business.font_family}',${font.fallback};margin-top:8px;}
    button:active{transform:scale(.98);}
    .msg{text-align:center;font-size:13px;margin-top:12px;min-height:18px;color:#B23A3A;}
    .credit{text-align:center;font-size:12.5px;color:${business.color_brown};margin:22px 0 0;}
    .credit a{color:${business.color_brown};font-weight:700;text-decoration:underline;}
    .footer-brand{text-align:center;margin:16px 0 0;}
    .footer-brand a{display:inline-block;}
    .footer-brand img{width:26%;min-width:95px;max-width:150px;height:auto;display:block;margin:0 auto;}
  </style></head>
  <body>
    <div class="box">
      <img class="brand-logo" src="data:image/png;base64,${business.logo_base64}" alt="${escapeHtml(business.name)}">
      <h1>¡Bienvenido!</h1>
      <p class="sub">Aquí te recompensamos por tus compras. Regístrate para empezar a juntar tus sellos.</p>
      <form id="regForm">
        <input type="text" id="nombre" placeholder="Nombre completo" required>
        <input type="text" id="cedula" placeholder="Cédula (10 dígitos)" required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" minlength="10">
        <button type="submit">Continuar</button>
      </form>
      <p class="msg" id="msg"></p>
      <p class="credit">Hey! Tapp, una marca de <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">Anaelí Brand</a></p>
    </div>
    <div class="footer-brand">
      <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">
        <img src="data:image/png;base64,${HEY_TAPP_LOGO_BASE64}" alt="Hey Tapp — Anaelí Brand">
      </a>
    </div>
    <script>
      document.getElementById('cedula').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
      });
      document.getElementById('regForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nombre').value.trim();
        const cedula = document.getElementById('cedula').value.trim();
        const msg = document.getElementById('msg');
        if (!nombre || !cedula) { msg.textContent = 'Completa los 2 campos'; return; }
        if (!/^[0-9]{10}$/.test(cedula)) { msg.textContent = 'La cédula debe tener exactamente 10 números'; return; }
        msg.textContent = 'Creando tu tarjeta...';
        const res = await fetch(location.pathname, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ nombre, cedula })
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

  const { nombre, cedula } = await request.json();
  if (!nombre || !cedula) {
    return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!/^[0-9]{10}$/.test(String(cedula).trim())) {
    return new Response(JSON.stringify({ error: 'La cédula debe tener exactamente 10 números' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const fullName = String(nombre).trim();
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

  const platformName = await getPlatformName(env);
  return new Response(renderCustomerCard(business, customer, slug, origin, platformName), {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

function renderCustomerCard(b, customer, slug, origin, platformName) {
  const sellos = [b.sello_1_base64, b.sello_2_base64, b.sello_3_base64, b.sello_4_base64];
  const selloNames = ['s1', 's2', 's3', 's4'];
  const total = b.total_stamps;
  const filled = Math.min(customer.stamps, total);
  const pct = Math.round((filled / total) * 100);
  const left = total - filled;

  const cardUrl = `${origin}/${slug}/${customer.code}`;

  // repartimos los sellos en 2 filas: si el total es par, mitad y mitad;
  // si es impar, la fila de arriba lleva uno más que la de abajo.
  const topCount = Math.ceil(total / 2);
  const bottomCount = total - topCount;
  const buildStamp = (i) => {
    const isReward = i === total;
    const selloKey = selloNames[(i - 1) % 4];
    const isFilled = i <= filled;
    return `<div class="stamp${isFilled ? ' filled' : ''}${isReward ? ' reward' : ''}" data-sello="${selloKey}">
      <div class="stamp-img"></div>
      ${isReward ? '<span class="reward-tag">PREMIO</span>' : ''}
    </div>`;
  };
  let stampsTopHtml = '';
  for (let i = 1; i <= topCount; i++) stampsTopHtml += buildStamp(i);
  let stampsBottomHtml = '';
  for (let i = topCount + 1; i <= total; i++) stampsBottomHtml += buildStamp(i);

  const progressText = left === 0
    ? `<b>${total}</b> de ${total} sellos. <b>¡Ya tienes tu premio! 🎉</b>`
    : `<b>${filled}</b> de ${total} sellos, te faltan <b>${left}</b> para tu premio.`;

  const font = getFontConfig(b.font_family);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
<title>${escapeHtml(b.name)} — Tarjeta de sellos</title>
<link rel="manifest" href="/${slug}/${customer.code}/manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${escapeHtml(b.name)}">
<meta name="theme-color" content="${b.color_brown}">
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
  body{margin:0;min-height:100vh;background:var(--page-bg);font-family:'Quicksand','Segoe UI',sans-serif;padding:18px 14px 78px;overflow-x:hidden;}
  .wrap{width:100%;max-width:430px;margin:0 auto;position:relative;}
  .card{background:var(--card-bg);border-radius:32px;border:2.5px solid var(--border-card);box-shadow:0 12px 0 var(--brown-deep);overflow:visible;position:relative;}
  .card-inner{border-radius:29.5px;overflow:hidden;}
  .card-top{padding:20px 24px 14px;text-align:center;border-bottom:2px solid var(--border-card);}
  .brand-logo{max-width:145px;width:50%;height:auto;display:block;margin:0 auto;}
  .card-body{padding:16px 26px 18px;}
  .greeting-eyebrow{font-family:var(--font-display);font-weight:var(--font-weight-eyebrow);font-style:var(--font-style-eyebrow);font-size:17px;letter-spacing:.3px;color:var(--brown-soft);margin:0;line-height:1.15;text-transform:uppercase;}
  .greeting-name{font-family:var(--font-display);font-weight:var(--font-weight-name);font-style:var(--font-style-name);font-size:24px;color:var(--brown);margin:2px 0 12px;line-height:1.15;}
  .progress-row{display:flex;align-items:center;gap:6px;margin-bottom:5px;}
  .progress-track{flex:1;height:22px;border-radius:99px;background:#FFFFFF;border:2px solid var(--border-progress);overflow:hidden;}
  .progress-fill{height:100%;border-radius:99px;background:var(--pink);}
  .progress-pct{font-family:var(--font-display);font-weight:var(--font-weight-name);font-style:var(--font-style-name);font-size:14px;color:var(--text-progress-pct);min-width:0;text-align:right;flex-shrink:0;}
  .progress-text{font-size:13.5px;color:var(--text-progress-label);margin:0 0 14px;}
  .progress-text b{color:inherit;font-weight:800;}
  .stamp-rows{margin-bottom:12px;}
  .stamp-row{display:flex;justify-content:center;gap:10px;}
  .stamp-row + .stamp-row{margin-top:10px;}
  .stamp-row .stamp{width:calc((100% - (var(--stamp-cols) - 1)*10px)/var(--stamp-cols));flex:0 0 auto;}
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
  .reward-tag{position:absolute;bottom:-13px;left:0;right:0;width:max-content;margin:0 auto;background:var(--butter-mid);border:1.5px solid var(--border-reward);color:var(--reward-heading);font-family:var(--font-display);font-size:9px;font-weight:700;letter-spacing:.5px;padding:2px 7px;border-radius:8px;white-space:nowrap;text-align:center;z-index:3;}
  .reward-note{margin-top:27px;background:var(--butter-mid);border-radius:12px;padding:9px 14px;color:var(--reward-body);font-size:14px;line-height:1.35;}
  .reward-note strong{display:block;font-family:var(--font-display);font-weight:var(--font-weight-reward);font-style:var(--font-style-reward);font-size:14.5px;margin-bottom:1px;color:var(--reward-heading);}
  .qr-section{margin-top:10px;border-top:2px dashed var(--page-bg);padding-top:10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;}
  .qr-box{width:136px;height:136px;background:var(--qr-bg);border:2px solid var(--border-qr);border-radius:16px;padding:8px;}
  .qr-box canvas{width:100%!important;height:100%!important;border-radius:8px;display:block;}
  .qr-copy{font-size:13px;color:var(--text-qr-instruction);line-height:1.4;max-width:290px;}
  .qr-copy b{display:block;font-family:var(--font-display);font-weight:700;font-style:normal;font-size:16px;color:var(--text-qr-code);letter-spacing:.3px;margin-bottom:4px;}
  .social-link{display:flex;align-items:center;justify-content:center;gap:7px;width:fit-content;margin:12px auto 0;padding:7px 14px;background:var(--instagram-bg);border-radius:99px;color:var(--text-instagram);text-decoration:none;font-size:12px;font-weight:700;}
  .card{opacity:0;transform:translateY(10px);}
  .intro-bg{position:fixed;inset:0;background:#FDFBF2;z-index:100;}
  .intro-mascot{position:fixed;top:44%;left:50%;width:180px;height:auto;z-index:101;filter:drop-shadow(0 10px 18px rgba(0,0,0,.18));animation:introWiggle .6s ease-in-out 1 forwards;}
  @keyframes introWiggle{
    0%{transform:translate(-50%,-50%) translateX(0) rotate(0deg);}
    25%{transform:translate(-50%,-50%) translateX(-9px) rotate(-4deg);}
    75%{transform:translate(-50%,-50%) translateX(9px) rotate(4deg);}
    100%{transform:translate(-50%,-50%) translateX(0) rotate(0deg);}
  }
  .footer-brand{text-align:center;margin:22px 0 0;}
  .footer-brand a{display:inline-block;}
  .footer-brand img{width:30%;min-width:105px;max-width:160px;height:auto;display:block;margin:0 auto;}
  @media (max-width:460px){ .intro-mascot{width:150px;} .footer-brand img{width:34%;min-width:98px;} }
</style>
<script>var QRCode=function(t){"use strict";var r,e=function(){return"function"==typeof Promise&&Promise.prototype&&Promise.prototype.then},n=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706],o=function(t){if(!t)throw new Error('"version" cannot be null or undefined');if(t<1||t>40)throw new Error('"version" should be in range from 1 to 40');return 4*t+17},a=function(t){return n[t]},i=function(t){for(var r=0;0!==t;)r++,t>>>=1;return r},u=function(t){if("function"!=typeof t)throw new Error('"toSJISFunc" is not a valid function.');r=t},s=function(){return void 0!==r},f=function(t){return r(t)};function h(t,r){return t(r={exports:{}},r.exports),r.exports}var c=h((function(t,r){r.L={bit:1},r.M={bit:0},r.Q={bit:3},r.H={bit:2},r.isValid=function(t){return t&&void 0!==t.bit&&t.bit>=0&&t.bit<4},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"l":case"low":return r.L;case"m":case"medium":return r.M;case"q":case"quartile":return r.Q;case"h":case"high":return r.H;default:throw new Error("Unknown EC Level: "+t)}}(t)}catch(t){return e}}}));function g(){this.buffer=[],this.length=0}c.L,c.M,c.Q,c.H,c.isValid,g.prototype={get:function(t){var r=Math.floor(t/8);return 1==(this.buffer[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e++)this.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return this.length},putBit:function(t){var r=Math.floor(this.length/8);this.buffer.length<=r&&this.buffer.push(0),t&&(this.buffer[r]|=128>>>this.length%8),this.length++}};var d=g;function l(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}l.prototype.set=function(t,r,e,n){var o=t*this.size+r;this.data[o]=e,n&&(this.reservedBit[o]=!0)},l.prototype.get=function(t,r){return this.data[t*this.size+r]},l.prototype.xor=function(t,r,e){this.data[t*this.size+r]^=e},l.prototype.isReserved=function(t,r){return this.reservedBit[t*this.size+r]};var v=l,p=h((function(t,r){var e=o;r.getRowColCoords=function(t){if(1===t)return[];for(var r=Math.floor(t/7)+2,n=e(t),o=145===n?26:2*Math.ceil((n-13)/(2*r-2)),a=[n-7],i=1;i<r-1;i++)a[i]=a[i-1]-o;return a.push(6),a.reverse()},r.getPositions=function(t){for(var e=[],n=r.getRowColCoords(t),o=n.length,a=0;a<o;a++)for(var i=0;i<o;i++)0===a&&0===i||0===a&&i===o-1||a===o-1&&0===i||e.push([n[a],n[i]]);return e}}));p.getRowColCoords,p.getPositions;var w=o,m=function(t){var r=w(t);return[[0,0],[r-7,0],[0,r-7]]},E=h((function(t,r){r.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var e=3,n=3,o=40,a=10;function i(t,e,n){switch(t){case r.Patterns.PATTERN000:return(e+n)%2==0;case r.Patterns.PATTERN001:return e%2==0;case r.Patterns.PATTERN010:return n%3==0;case r.Patterns.PATTERN011:return(e+n)%3==0;case r.Patterns.PATTERN100:return(Math.floor(e/2)+Math.floor(n/3))%2==0;case r.Patterns.PATTERN101:return e*n%2+e*n%3==0;case r.Patterns.PATTERN110:return(e*n%2+e*n%3)%2==0;case r.Patterns.PATTERN111:return(e*n%3+(e+n)%2)%2==0;default:throw new Error("bad maskPattern:"+t)}}r.isValid=function(t){return null!=t&&""!==t&&!isNaN(t)&&t>=0&&t<=7},r.from=function(t){return r.isValid(t)?parseInt(t,10):void 0},r.getPenaltyN1=function(t){for(var r=t.size,n=0,o=0,a=0,i=null,u=null,s=0;s<r;s++){o=a=0,i=u=null;for(var f=0;f<r;f++){var h=t.get(s,f);h===i?o++:(o>=5&&(n+=e+(o-5)),i=h,o=1),(h=t.get(f,s))===u?a++:(a>=5&&(n+=e+(a-5)),u=h,a=1)}o>=5&&(n+=e+(o-5)),a>=5&&(n+=e+(a-5))}return n},r.getPenaltyN2=function(t){for(var r=t.size,e=0,o=0;o<r-1;o++)for(var a=0;a<r-1;a++){var i=t.get(o,a)+t.get(o,a+1)+t.get(o+1,a)+t.get(o+1,a+1);4!==i&&0!==i||e++}return e*n},r.getPenaltyN3=function(t){for(var r=t.size,e=0,n=0,a=0,i=0;i<r;i++){n=a=0;for(var u=0;u<r;u++)n=n<<1&2047|t.get(i,u),u>=10&&(1488===n||93===n)&&e++,a=a<<1&2047|t.get(u,i),u>=10&&(1488===a||93===a)&&e++}return e*o},r.getPenaltyN4=function(t){for(var r=0,e=t.data.length,n=0;n<e;n++)r+=t.data[n];return Math.abs(Math.ceil(100*r/e/5)-10)*a},r.applyMask=function(t,r){for(var e=r.size,n=0;n<e;n++)for(var o=0;o<e;o++)r.isReserved(o,n)||r.xor(o,n,i(t,o,n))},r.getBestMask=function(t,e){for(var n=Object.keys(r.Patterns).length,o=0,a=1/0,i=0;i<n;i++){e(i),r.applyMask(i,t);var u=r.getPenaltyN1(t)+r.getPenaltyN2(t)+r.getPenaltyN3(t)+r.getPenaltyN4(t);r.applyMask(i,t),u<a&&(a=u,o=i)}return o}}));E.Patterns,E.isValid,E.getPenaltyN1,E.getPenaltyN2,E.getPenaltyN3,E.getPenaltyN4,E.applyMask,E.getBestMask;var y=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],A=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430],I=function(t,r){switch(r){case c.L:return y[4*(t-1)+0];case c.M:return y[4*(t-1)+1];case c.Q:return y[4*(t-1)+2];case c.H:return y[4*(t-1)+3];default:return}},M=function(t,r){switch(r){case c.L:return A[4*(t-1)+0];case c.M:return A[4*(t-1)+1];case c.Q:return A[4*(t-1)+2];case c.H:return A[4*(t-1)+3];default:return}},N=new Uint8Array(512),B=new Uint8Array(256);!function(){for(var t=1,r=0;r<255;r++)N[r]=t,B[t]=r,256&(t<<=1)&&(t^=285);for(var e=255;e<512;e++)N[e]=N[e-255]}();var C=function(t){return N[t]},P=function(t,r){return 0===t||0===r?0:N[B[t]+B[r]]},R=h((function(t,r){r.mul=function(t,r){for(var e=new Uint8Array(t.length+r.length-1),n=0;n<t.length;n++)for(var o=0;o<r.length;o++)e[n+o]^=P(t[n],r[o]);return e},r.mod=function(t,r){for(var e=new Uint8Array(t);e.length-r.length>=0;){for(var n=e[0],o=0;o<r.length;o++)e[o]^=P(r[o],n);for(var a=0;a<e.length&&0===e[a];)a++;e=e.slice(a)}return e},r.generateECPolynomial=function(t){for(var e=new Uint8Array([1]),n=0;n<t;n++)e=r.mul(e,new Uint8Array([1,C(n)]));return e}}));function T(t){this.genPoly=void 0,this.degree=t,this.degree&&this.initialize(this.degree)}R.mul,R.mod,R.generateECPolynomial,T.prototype.initialize=function(t){this.degree=t,this.genPoly=R.generateECPolynomial(this.degree)},T.prototype.encode=function(t){if(!this.genPoly)throw new Error("Encoder not initialized");var r=new Uint8Array(t.length+this.degree);r.set(t);var e=R.mod(r,this.genPoly),n=this.degree-e.length;if(n>0){var o=new Uint8Array(this.degree);return o.set(e,n),o}return e};var L=T,b=function(t){return!isNaN(t)&&t>=1&&t<=40},U="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+",x="(?:(?![A-Z0-9 $%*+\\\\-./:]|"+(U=U.replace(/u/g,"\\\\u"))+")(?:.|[\\r\\n]))+",k=new RegExp(U,"g"),F=new RegExp("[^A-Z0-9 $%*+\\\\-./:]+","g"),S=new RegExp(x,"g"),D=new RegExp("[0-9]+","g"),Y=new RegExp("[A-Z $%*+\\\\-./:]+","g"),_=new RegExp("^"+U+"$"),z=new RegExp("^[0-9]+$"),H=new RegExp("^[A-Z0-9 $%*+\\\\-./:]+$"),J={KANJI:k,BYTE_KANJI:F,BYTE:S,NUMERIC:D,ALPHANUMERIC:Y,testKanji:function(t){return _.test(t)},testNumeric:function(t){return z.test(t)},testAlphanumeric:function(t){return H.test(t)}},K=h((function(t,r){r.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},r.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},r.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},r.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},r.MIXED={bit:-1},r.getCharCountIndicator=function(t,r){if(!t.ccBits)throw new Error("Invalid mode: "+t);if(!b(r))throw new Error("Invalid version: "+r);return r>=1&&r<10?t.ccBits[0]:r<27?t.ccBits[1]:t.ccBits[2]},r.getBestModeForData=function(t){return J.testNumeric(t)?r.NUMERIC:J.testAlphanumeric(t)?r.ALPHANUMERIC:J.testKanji(t)?r.KANJI:r.BYTE},r.toString=function(t){if(t&&t.id)return t.id;throw new Error("Invalid mode")},r.isValid=function(t){return t&&t.bit&&t.ccBits},r.from=function(t,e){if(r.isValid(t))return t;try{return function(t){if("string"!=typeof t)throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return r.NUMERIC;case"alphanumeric":return r.ALPHANUMERIC;case"kanji":return r.KANJI;case"byte":return r.BYTE;default:throw new Error("Unknown mode: "+t)}}(t)}catch(t){return e}}}));K.NUMERIC,K.ALPHANUMERIC,K.BYTE,K.KANJI,K.MIXED,K.getCharCountIndicator,K.getBestModeForData,K.isValid;var O=h((function(t,r){var e=i(7973);function n(t,r){return K.getCharCountIndicator(t,r)+4}function o(t,r){var e=0;return t.forEach((function(t){var o=n(t.mode,r);e+=o+t.getBitsLength()})),e}r.from=function(t,r){return b(t)?parseInt(t,10):r},r.getCapacity=function(t,r,e){if(!b(t))throw new Error("Invalid QR Code version");void 0===e&&(e=K.BYTE);var o=8*(a(t)-M(t,r));if(e===K.MIXED)return o;var i=o-n(e,t);switch(e){case K.NUMERIC:return Math.floor(i/10*3);case K.ALPHANUMERIC:return Math.floor(i/11*2);case K.KANJI:return Math.floor(i/13);case K.BYTE:default:return Math.floor(i/8)}},r.getBestVersionForData=function(t,e){var n,a=c.from(e,c.M);if(Array.isArray(t)){if(t.length>1)return function(t,e){for(var n=1;n<=40;n++){if(o(t,n)<=r.getCapacity(n,e,K.MIXED))return n}}(t,a);if(0===t.length)return 1;n=t[0]}else n=t;return function(t,e,n){for(var o=1;o<=40;o++)if(e<=r.getCapacity(o,n,t))return o}(n.mode,n.getLength(),a)},r.getEncodedBits=function(t){if(!b(t)||t<7)throw new Error("Invalid QR Code version");for(var r=t<<12;i(r)-e>=0;)r^=7973<<i(r)-e;return t<<12|r}}));O.getCapacity,O.getBestVersionForData,O.getEncodedBits;var Q=i(1335),V=function(t,r){for(var e=t.bit<<3|r,n=e<<10;i(n)-Q>=0;)n^=1335<<i(n)-Q;return 21522^(e<<10|n)};function q(t){this.mode=K.NUMERIC,this.data=t.toString()}q.getBitsLength=function(t){return 10*Math.floor(t/3)+(t%3?t%3*3+1:0)},q.prototype.getLength=function(){return this.data.length},q.prototype.getBitsLength=function(){return q.getBitsLength(this.data.length)},q.prototype.write=function(t){var r,e,n;for(r=0;r+3<=this.data.length;r+=3)e=this.data.substr(r,3),n=parseInt(e,10),t.put(n,10);var o=this.data.length-r;o>0&&(e=this.data.substr(r),n=parseInt(e,10),t.put(n,3*o+1))};var j=q,$=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function X(t){this.mode=K.ALPHANUMERIC,this.data=t}X.getBitsLength=function(t){return 11*Math.floor(t/2)+t%2*6},X.prototype.getLength=function(){return this.data.length},X.prototype.getBitsLength=function(){return X.getBitsLength(this.data.length)},X.prototype.write=function(t){var r;for(r=0;r+2<=this.data.length;r+=2){var e=45*$.indexOf(this.data[r]);e+=$.indexOf(this.data[r+1]),t.put(e,11)}this.data.length%2&&t.put($.indexOf(this.data[r]),6)};var Z=X;function W(t){this.mode=K.BYTE,"string"==typeof t&&(t=function(t){for(var r=[],e=t.length,n=0;n<e;n++){var o=t.charCodeAt(n);if(o>=55296&&o<=56319&&e>n+1){var a=t.charCodeAt(n+1);a>=56320&&a<=57343&&(o=1024*(o-55296)+a-56320+65536,n+=1)}o<128?r.push(o):o<2048?(r.push(o>>6|192),r.push(63&o|128)):o<55296||o>=57344&&o<65536?(r.push(o>>12|224),r.push(o>>6&63|128),r.push(63&o|128)):o>=65536&&o<=1114111?(r.push(o>>18|240),r.push(o>>12&63|128),r.push(o>>6&63|128),r.push(63&o|128)):r.push(239,191,189)}return new Uint8Array(r).buffer}(t)),this.data=new Uint8Array(t)}W.getBitsLength=function(t){return 8*t},W.prototype.getLength=function(){return this.data.length},W.prototype.getBitsLength=function(){return W.getBitsLength(this.data.length)},W.prototype.write=function(t){for(var r=0,e=this.data.length;r<e;r++)t.put(this.data[r],8)};var G=W;function tt(t){this.mode=K.KANJI,this.data=t}tt.getBitsLength=function(t){return 13*t},tt.prototype.getLength=function(){return this.data.length},tt.prototype.getBitsLength=function(){return tt.getBitsLength(this.data.length)},tt.prototype.write=function(t){var r;for(r=0;r<this.data.length;r++){var e=f(this.data[r]);if(e>=33088&&e<=40956)e-=33088;else{if(!(e>=57408&&e<=60351))throw new Error("Invalid SJIS character: "+this.data[r]+"\\nMake sure your charset is UTF-8");e-=49472}e=192*(e>>>8&255)+(255&e),t.put(e,13)}};var rt=tt,et=h((function(t){var r={single_source_shortest_paths:function(t,e,n){var o={},a={};a[e]=0;var i,u,s,f,h,c,g,d=r.PriorityQueue.make();for(d.push(e,0);!d.empty();)for(s in u=(i=d.pop()).value,f=i.cost,h=t[u]||{})h.hasOwnProperty(s)&&(c=f+h[s],g=a[s],(void 0===a[s]||g>c)&&(a[s]=c,d.push(s,c),o[s]=u));if(void 0!==n&&void 0===a[n]){var l=["Could not find a path from ",e," to ",n,"."].join("");throw new Error(l)}return o},extract_shortest_path_from_predecessor_list:function(t,r){for(var e=[],n=r;n;)e.push(n),n=t[n];return e.reverse(),e},find_path:function(t,e,n){var o=r.single_source_shortest_paths(t,e,n);return r.extract_shortest_path_from_predecessor_list(o,n)},PriorityQueue:{make:function(t){var e,n=r.PriorityQueue,o={};for(e in t=t||{},n)n.hasOwnProperty(e)&&(o[e]=n[e]);return o.queue=[],o.sorter=t.sorter||n.default_sorter,o},default_sorter:function(t,r){return t.cost-r.cost},push:function(t,r){var e={value:t,cost:r};this.queue.push(e),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return 0===this.queue.length}}};t.exports=r})),nt=h((function(t,r){function e(t){return unescape(encodeURIComponent(t)).length}function n(t,r,e){for(var n,o=[];null!==(n=t.exec(e));)o.push({data:n[0],index:n.index,mode:r,length:n[0].length});return o}function o(t){var r,e,o=n(J.NUMERIC,K.NUMERIC,t),a=n(J.ALPHANUMERIC,K.ALPHANUMERIC,t);return s()?(r=n(J.BYTE,K.BYTE,t),e=n(J.KANJI,K.KANJI,t)):(r=n(J.BYTE_KANJI,K.BYTE,t),e=[]),o.concat(a,r,e).sort((function(t,r){return t.index-r.index})).map((function(t){return{data:t.data,mode:t.mode,length:t.length}}))}function a(t,r){switch(r){case K.NUMERIC:return j.getBitsLength(t);case K.ALPHANUMERIC:return Z.getBitsLength(t);case K.KANJI:return rt.getBitsLength(t);case K.BYTE:return G.getBitsLength(t)}}function i(t,r){var e,n=K.getBestModeForData(t);if((e=K.from(r,n))!==K.BYTE&&e.bit<n.bit)throw new Error('"'+t+'" cannot be encoded with mode '+K.toString(e)+".\\n Suggested mode is: "+K.toString(n));switch(e!==K.KANJI||s()||(e=K.BYTE),e){case K.NUMERIC:return new j(t);case K.ALPHANUMERIC:return new Z(t);case K.KANJI:return new rt(t);case K.BYTE:return new G(t)}}r.fromArray=function(t){return t.reduce((function(t,r){return"string"==typeof r?t.push(i(r,null)):r.data&&t.push(i(r.data,r.mode)),t}),[])},r.fromString=function(t,n){for(var i=function(t,r){for(var e={},n={start:{}},o=["start"],i=0;i<t.length;i++){for(var u=t[i],s=[],f=0;f<u.length;f++){var h=u[f],c=""+i+f;s.push(c),e[c]={node:h,lastCount:0},n[c]={};for(var g=0;g<o.length;g++){var d=o[g];e[d]&&e[d].node.mode===h.mode?(n[d][c]=a(e[d].lastCount+h.length,h.mode)-a(e[d].lastCount,h.mode),e[d].lastCount+=h.length):(e[d]&&(e[d].lastCount=h.length),n[d][c]=a(h.length,h.mode)+4+K.getCharCountIndicator(h.mode,r))}}o=s}for(var l=0;l<o.length;l++)n[o[l]].end=0;return{map:n,table:e}}(function(t){for(var r=[],n=0;n<t.length;n++){var o=t[n];switch(o.mode){case K.NUMERIC:r.push([o,{data:o.data,mode:K.ALPHANUMERIC,length:o.length},{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.ALPHANUMERIC:r.push([o,{data:o.data,mode:K.BYTE,length:o.length}]);break;case K.KANJI:r.push([o,{data:o.data,mode:K.BYTE,length:e(o.data)}]);break;case K.BYTE:r.push([{data:o.data,mode:K.BYTE,length:e(o.data)}])}}return r}(o(t)),n),u=et.find_path(i.map,"start","end"),s=[],f=1;f<u.length-1;f++)s.push(i.table[u[f]].node);return r.fromArray(function(t){return t.reduce((function(t,r){var e=t.length-1>=0?t[t.length-1]:null;return e&&e.mode===r.mode?(t[t.length-1].data+=r.data,t):(t.push(r),t)}),[])}(s))},r.rawSplit=function(t){return r.fromArray(o(t))}}));function ot(t,r,e){var n,o,a=t.size,i=V(r,e);for(n=0;n<15;n++)o=1==(i>>n&1),n<6?t.set(n,8,o,!0):n<8?t.set(n+1,8,o,!0):t.set(a-15+n,8,o,!0),n<8?t.set(8,a-n-1,o,!0):n<9?t.set(8,15-n-1+1,o,!0):t.set(8,15-n-1,o,!0);t.set(a-8,8,1,!0)}function at(t,r,e){var n=new d;e.forEach((function(r){n.put(r.mode.bit,4),n.put(r.getLength(),K.getCharCountIndicator(r.mode,t)),r.write(n)}));var o=8*(a(t)-M(t,r));for(n.getLengthInBits()+4<=o&&n.put(0,4);n.getLengthInBits()%8!=0;)n.putBit(0);for(var i=(o-n.getLengthInBits())/8,u=0;u<i;u++)n.put(u%2?17:236,8);return function(t,r,e){for(var n=a(r),o=M(r,e),i=n-o,u=I(r,e),s=u-n%u,f=Math.floor(n/u),h=Math.floor(i/u),c=h+1,g=f-h,d=new L(g),l=0,v=new Array(u),p=new Array(u),w=0,m=new Uint8Array(t.buffer),E=0;E<u;E++){var y=E<s?h:c;v[E]=m.slice(l,l+y),p[E]=d.encode(v[E]),l+=y,w=Math.max(w,y)}var A,N,B=new Uint8Array(n),C=0;for(A=0;A<w;A++)for(N=0;N<u;N++)A<v[N].length&&(B[C++]=v[N][A]);for(A=0;A<g;A++)for(N=0;N<u;N++)B[C++]=p[N][A];return B}(n,t,r)}function it(t,r,e,n){var a;if(Array.isArray(t))a=nt.fromArray(t);else{if("string"!=typeof t)throw new Error("Invalid data");var i=r;if(!i){var u=nt.rawSplit(t);i=O.getBestVersionForData(u,e)}a=nt.fromString(t,i||40)}var s=O.getBestVersionForData(a,e);if(!s)throw new Error("The amount of data is too big to be stored in a QR Code");if(r){if(r<s)throw new Error("\\nThe chosen QR Code version cannot contain this amount of data.\\nMinimum version required to store current data is: "+s+".\\n")}else r=s;var f=at(r,e,a),h=o(r),c=new v(h);return function(t,r){for(var e=t.size,n=m(r),o=0;o<n.length;o++)for(var a=n[o][0],i=n[o][1],u=-1;u<=7;u++)if(!(a+u<=-1||e<=a+u))for(var s=-1;s<=7;s++)i+s<=-1||e<=i+s||(u>=0&&u<=6&&(0===s||6===s)||s>=0&&s<=6&&(0===u||6===u)||u>=2&&u<=4&&s>=2&&s<=4?t.set(a+u,i+s,!0,!0):t.set(a+u,i+s,!1,!0))}(c,r),function(t){for(var r=t.size,e=8;e<r-8;e++){var n=e%2==0;t.set(e,6,n,!0),t.set(6,e,n,!0)}}(c),function(t,r){for(var e=p.getPositions(r),n=0;n<e.length;n++)for(var o=e[n][0],a=e[n][1],i=-2;i<=2;i++)for(var u=-2;u<=2;u++)-2===i||2===i||-2===u||2===u||0===i&&0===u?t.set(o+i,a+u,!0,!0):t.set(o+i,a+u,!1,!0)}(c,r),ot(c,e,0),r>=7&&function(t,r){for(var e,n,o,a=t.size,i=O.getEncodedBits(r),u=0;u<18;u++)e=Math.floor(u/3),n=u%3+a-8-3,o=1==(i>>u&1),t.set(e,n,o,!0),t.set(n,e,o,!0)}(c,r),function(t,r){for(var e=t.size,n=-1,o=e-1,a=7,i=0,u=e-1;u>0;u-=2)for(6===u&&u--;;){for(var s=0;s<2;s++)if(!t.isReserved(o,u-s)){var f=!1;i<r.length&&(f=1==(r[i]>>>a&1)),t.set(o,u-s,f),-1===--a&&(i++,a=7)}if((o+=n)<0||e<=o){o-=n,n=-n;break}}}(c,f),isNaN(n)&&(n=E.getBestMask(c,ot.bind(null,c,e))),E.applyMask(n,c),ot(c,e,n),{modules:c,version:r,errorCorrectionLevel:e,maskPattern:n,segments:a}}nt.fromArray,nt.fromString,nt.rawSplit;var ut=function(t,r){if(void 0===t||""===t)throw new Error("No input text");var e,n,o=c.M;return void 0!==r&&(o=c.from(r.errorCorrectionLevel,c.M),e=O.from(r.version),n=E.from(r.maskPattern),r.toSJISFunc&&u(r.toSJISFunc)),it(t,e,o,n)},st=h((function(t,r){function e(t){if("number"==typeof t&&(t=t.toString()),"string"!=typeof t)throw new Error("Color should be defined as hex string");var r=t.slice().replace("#","").split("");if(r.length<3||5===r.length||r.length>8)throw new Error("Invalid hex color: "+t);3!==r.length&&4!==r.length||(r=Array.prototype.concat.apply([],r.map((function(t){return[t,t]})))),6===r.length&&r.push("F","F");var e=parseInt(r.join(""),16);return{r:e>>24&255,g:e>>16&255,b:e>>8&255,a:255&e,hex:"#"+r.slice(0,6).join("")}}r.getOptions=function(t){t||(t={}),t.color||(t.color={});var r=void 0===t.margin||null===t.margin||t.margin<0?4:t.margin,n=t.width&&t.width>=21?t.width:void 0,o=t.scale||4;return{width:n,scale:n?4:o,margin:r,color:{dark:e(t.color.dark||"#000000ff"),light:e(t.color.light||"#ffffffff")},type:t.type,rendererOpts:t.rendererOpts||{}}},r.getScale=function(t,r){return r.width&&r.width>=t+2*r.margin?r.width/(t+2*r.margin):r.scale},r.getImageWidth=function(t,e){var n=r.getScale(t,e);return Math.floor((t+2*e.margin)*n)},r.qrToImageData=function(t,e,n){for(var o=e.modules.size,a=e.modules.data,i=r.getScale(o,n),u=Math.floor((o+2*n.margin)*i),s=n.margin*i,f=[n.color.light,n.color.dark],h=0;h<u;h++)for(var c=0;c<u;c++){var g=4*(h*u+c),d=n.color.light;if(h>=s&&c>=s&&h<u-s&&c<u-s)d=f[a[Math.floor((h-s)/i)*o+Math.floor((c-s)/i)]?1:0];t[g++]=d.r,t[g++]=d.g,t[g++]=d.b,t[g]=d.a}}}));st.getOptions,st.getScale,st.getImageWidth,st.qrToImageData;var ft=h((function(t,r){r.render=function(t,r,e){var n=e,o=r;void 0!==n||r&&r.getContext||(n=r,r=void 0),r||(o=function(){try{return document.createElement("canvas")}catch(t){throw new Error("You need to specify a canvas element")}}()),n=st.getOptions(n);var a=st.getImageWidth(t.modules.size,n),i=o.getContext("2d"),u=i.createImageData(a,a);return st.qrToImageData(u.data,t,n),function(t,r,e){t.clearRect(0,0,r.width,r.height),r.style||(r.style={}),r.height=e,r.width=e,r.style.height=e+"px",r.style.width=e+"px"}(i,o,a),i.putImageData(u,0,0),o},r.renderToDataURL=function(t,e,n){var o=n;void 0!==o||e&&e.getContext||(o=e,e=void 0),o||(o={});var a=r.render(t,e,o),i=o.type||"image/png",u=o.rendererOpts||{};return a.toDataURL(i,u.quality)}}));function ht(t,r){var e=t.a/255,n=r+'="'+t.hex+'"';return e<1?n+" "+r+'-opacity="'+e.toFixed(2).slice(1)+'"':n}function ct(t,r,e){var n=t+r;return void 0!==e&&(n+=" "+e),n}ft.render,ft.renderToDataURL;var gt=function(t,r,e){var n=st.getOptions(r),o=t.modules.size,a=t.modules.data,i=o+2*n.margin,u=n.color.light.a?"<path "+ht(n.color.light,"fill")+' d="M0 0h'+i+"v"+i+'H0z"/>':"",s="<path "+ht(n.color.dark,"stroke")+' d="'+function(t,r,e){for(var n="",o=0,a=!1,i=0,u=0;u<t.length;u++){var s=Math.floor(u%r),f=Math.floor(u/r);s||a||(a=!0),t[u]?(i++,u>0&&s>0&&t[u-1]||(n+=a?ct("M",s+e,.5+f+e):ct("m",o,0),o=0,a=!1),s+1<r&&t[u+1]||(n+=ct("h",i),i=0)):o++}return n}(a,o,n.margin)+'"/>',f='viewBox="0 0 '+i+" "+i+'"',h='<svg xmlns="http://www.w3.org/2000/svg" '+(n.width?'width="'+n.width+'" height="'+n.width+'" ':"")+f+' shape-rendering="crispEdges">'+u+s+"</svg>\\n";return"function"==typeof e&&e(null,h),h};function dt(t,r,n,o,a){var i=[].slice.call(arguments,1),u=i.length,s="function"==typeof i[u-1];if(!s&&!e())throw new Error("Callback required as last argument");if(!s){if(u<1)throw new Error("Too few arguments provided");return 1===u?(n=r,r=o=void 0):2!==u||r.getContext||(o=n,n=r,r=void 0),new Promise((function(e,a){try{var i=ut(n,o);e(t(i,r,o))}catch(t){a(t)}}))}if(u<2)throw new Error("Too few arguments provided");2===u?(a=n,n=r,r=o=void 0):3===u&&(r.getContext&&void 0===a?(a=o,o=void 0):(a=o,o=n,n=r,r=void 0));try{var f=ut(n,o);a(null,t(f,r,o))}catch(t){a(t)}}var lt=ut,vt=dt.bind(null,ft.render),pt=dt.bind(null,ft.renderToDataURL),wt=dt.bind(null,(function(t,r,e){return gt(t,e)})),mt={create:lt,toCanvas:vt,toDataURL:pt,toString:wt};return t.create=lt,t.default=mt,t.toCanvas=vt,t.toDataURL=pt,t.toString=wt,Object.defineProperty(t,"__esModule",{value:!0}),t}({});</script>
</head>
<body>
  <div id="introBg" class="intro-bg"></div>
  <img id="introMascot" class="intro-mascot" src="data:image/png;base64,${HEY_TAPP_MASCOT_BASE64}" alt="">
  <noscript><style>.card{opacity:1!important;transform:none!important;} #introBg,#introMascot{display:none!important;}</style></noscript>
  <div class="wrap">
    <div class="card" id="mainCard">
      <div class="card-inner">
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
        <div class="stamp-rows" style="--stamp-cols:${topCount};">
          <div class="stamp-row">${stampsTopHtml}</div>
          ${bottomCount > 0 ? `<div class="stamp-row">${stampsBottomHtml}</div>` : ''}
        </div>
        <div class="reward-note">
          <strong>${escapeHtml(b.reward_heading)}</strong>${escapeHtml(b.reward_text)}
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
    </div>
    <div class="footer-brand">
      <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">
        <img src="data:image/png;base64,${HEY_TAPP_LOGO_BASE64}" alt="Hey Tapp — Anaelí Brand">
      </a>
    </div>
  </div>
  <script>
    // ---- animación de entrada: la muñequita aparece unos segundos y se
    // desvanece POR COMPLETO primero; recién ahí aparece la tarjeta, para que
    // no se vean las dos a la vez ni quede un instante de transparencia. ----
    (function () {
      var introBg = document.getElementById('introBg');
      var introMascot = document.getElementById('introMascot');
      var card = document.getElementById('mainCard');
      setTimeout(function () {
        // la animación de bamboleo (CSS) se queda "agarrando" el transform aunque
        // ya haya terminado (por el fill-mode "forwards"), así que hay que quitarla
        // explícitamente antes de tocarla con JS, o si no se congela.
        introMascot.style.animation = 'none';
        void introMascot.offsetWidth; // fuerza al navegador a "aceptar" el cambio antes de animar
        introMascot.style.transition = 'opacity .4s ease, transform .4s ease';
        introMascot.style.transform = 'translate(-50%,-50%) scale(.9)';
        introMascot.style.opacity = '0';
        setTimeout(function () {
          // la muñequita ya está 100% invisible: recién ahora aparece la tarjeta
          introMascot.style.display = 'none';
          introBg.style.transition = 'opacity .5s ease';
          introBg.style.opacity = '0';
          card.style.transition = 'opacity .5s ease, transform .5s ease';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
          setTimeout(function () {
            introBg.style.display = 'none';
          }, 520);
        }, 420);
      }, 680);
    })();
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
// página de inicio de heytapp.com — presentación de la marca,
// sin precios, con formulario para pedir información
// ------------------------------------------------------------
function renderLandingPage() {
  const icons = {
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.2-1.9-.3-.6-.1-1.3.5-1.6.4-.2.9-.2 1.3 0 1.6.8 3.4-.4 3.9-2.1.6-2-.2-4.1-1.8-5.5A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1.1" fill="currentColor" stroke="none"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15.5" r="4"/><path d="m11 12.5 8.5-8.5M16.5 6 19 8.5M14 8.5 16 10.5"/></svg>',
    staff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8" r="3"/><path d="M3.5 19c0-3 2.2-5 5-5s5 2 5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M14.8 19c.2-2.3 1.9-4 4.2-4 1.4 0 2.6.6 3.4 1.6"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-7"/><path d="M3 20h18"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
    cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 9.5 9.5-4 9.5 4-9.5 4-9.5-4Z"/><path d="M6.5 11.5v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4M21 9.5v6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>',
    brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c0-3 1.5-4.5 3.5-4.5S11 17 11 20"/><path d="m10.5 13.5 7-7a2.1 2.1 0 0 1 3 3l-7 7-4-4Z"/></svg>',
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5 5 4h14l1 5.5"/><path d="M4 9.5a2.3 2.3 0 0 0 4.4 1 2.3 2.3 0 0 0 4.4 0 2.3 2.3 0 0 0 4.4 0 2.3 2.3 0 0 0 4.4-1"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5h5v5"/></svg>',
  };

  const beneficios = [
    [icons.palette, 'Tarjeta 100% personalizada', 'Con el branding, colores y logo de tu marca — no una plantilla genérica.'],
    [icons.target, 'Tu negocio, tus reglas', 'Elige el premio y la cantidad de sellos que quieres ofrecer.'],
    [icons.scan, 'Registro fácil y rápido', 'Escaneando el QR del cliente o escribiendo su código a mano.'],
    [icons.key, 'Código único por cliente', 'Para llevar su progreso de forma individual, sin confusiones.'],
    [icons.staff, 'Panel exclusivo para tu staff', 'Desde donde podrán registrar y gestionar los sellos.'],
    [icons.chart, 'Registro de clientes y compras', 'Para identificar quiénes compran y quiénes están regresando.'],
    [icons.instagram, 'Botón directo a tu Instagram', 'Para llevar más clientes a tu perfil y mantenerlos conectados.'],
    [icons.cap, 'Capacitación + mejoras incluidas', 'Te enseñamos a usarla y recibes actualizaciones sin costo extra.'],
  ];

  const beneficiosHtml = beneficios.map(([icon, titulo, texto], i) => `
        <div class="benefit reveal" style="--d:${(i % 4) * 70}ms">
          <div class="benefit-icon">${icon}</div>
          <h3>${titulo}</h3>
          <p>${texto}</p>
        </div>`).join('');

  return new Response(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
<title>Hey Tapp — Dale a tus clientes una razón para volver</title>
<meta name="description" content="Tarjetas de sellos digitales, 100% personalizadas para tu marca. Un producto de Anaelí Brand.">
<link rel="manifest" href="/site-manifest.json">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#42281B">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    color-scheme:light;
    --cream:#FDFBF2; --paper:#FFFFFF; --brown:#42281B; --brown-soft:#6B5645;
    --blue:#BACCE7; --pale-blue:#DAE7F1; --mustard:#EBDA8B; --terracotta:#B0472E;
    --terracotta-deep:#8F3821;
    --shadow-sm:0 2px 10px rgba(66,40,27,.08);
    --shadow-md:0 10px 30px rgba(66,40,27,.12);
    --shadow-lg:0 20px 50px rgba(66,40,27,.18);
    --ease:cubic-bezier(.22,1,.36,1);
  }
  *{box-sizing:border-box;color-scheme:light;}
  html{scroll-behavior:smooth;}
  @media (prefers-reduced-motion: reduce){ html{scroll-behavior:auto;} *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important;} }
  body{margin:0;font-family:'Manrope',sans-serif;background:var(--cream);color:var(--brown);-webkit-font-smoothing:antialiased;overflow-x:hidden;}
  a{color:inherit;}
  img{max-width:100%;display:block;}
  .wrap{max-width:1120px;margin:0 auto;padding:0 28px;}
  h1,h2,h3{font-family:'Baloo 2',sans-serif;margin:0;color:var(--brown);}
  .eyebrow{font-family:'Manrope',sans-serif;font-weight:800;font-size:11.5px;letter-spacing:2px;text-transform:uppercase;color:var(--terracotta);display:flex;align-items:center;gap:9px;justify-content:center;margin-bottom:14px;}
  .eyebrow::before,.eyebrow::after{content:'';width:22px;height:1.5px;background:var(--terracotta);opacity:.55;}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:'Baloo 2',sans-serif;font-weight:700;font-size:16px;padding:15px 30px;border-radius:99px;text-decoration:none;border:none;cursor:pointer;transition:transform .18s var(--ease),box-shadow .18s var(--ease);}
  .btn:active{transform:translateY(1px) scale(.99);}
  .btn-primary{background:var(--terracotta);color:var(--cream);box-shadow:0 8px 22px rgba(176,71,46,.32);}
  .btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(176,71,46,.4);background:var(--terracotta-deep);}
  .btn-ghost{background:transparent;color:var(--brown);border:1.5px solid rgba(66,40,27,.25);}
  .btn-ghost:hover{border-color:var(--brown);background:rgba(66,40,27,.05);}
  .btn-light{background:var(--cream);color:var(--brown);box-shadow:0 8px 22px rgba(0,0,0,.18);}
  .btn-light:hover{transform:translateY(-2px);}

  /* ---------- nav ---------- */
  .nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:16px 0;transition:background .3s var(--ease),box-shadow .3s var(--ease),padding .3s var(--ease);}
  .nav-inner{max-width:1120px;margin:0 auto;padding:0 28px;display:flex;align-items:center;justify-content:space-between;}
  .nav.scrolled{background:rgba(253,251,242,.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 2px 18px rgba(66,40,27,.08);padding:10px 0;}
  .nav-logo{height:34px;width:auto;transition:height .3s var(--ease);}
  .nav.scrolled .nav-logo{height:28px;}
  .nav-links{display:flex;align-items:center;gap:34px;list-style:none;margin:0;padding:0;}
  .nav-links a{font-family:'Manrope',sans-serif;font-weight:700;font-size:14.5px;text-decoration:none;color:var(--brown);position:relative;padding:4px 0;}
  .nav-links a::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:2px;background:var(--terracotta);transform:scaleX(0);transform-origin:right;transition:transform .25s var(--ease);}
  .nav-links a:hover::after{transform:scaleX(1);transform-origin:left;}
  .nav-cta{display:flex;align-items:center;gap:18px;}
  .nav-cta .btn{padding:11px 22px;font-size:14px;}
  .nav-burger{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:8px;}
  .nav-burger span{width:22px;height:2px;background:var(--brown);border-radius:2px;transition:transform .25s var(--ease),opacity .25s var(--ease);}
  .nav-burger.open span:nth-child(1){transform:translateY(7px) rotate(45deg);}
  .nav-burger.open span:nth-child(2){opacity:0;}
  .nav-burger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg);}
  .mobile-menu{position:fixed;inset:0;background:var(--cream);z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;opacity:0;pointer-events:none;transition:opacity .3s var(--ease);}
  .mobile-menu.open{opacity:1;pointer-events:auto;}
  .mobile-menu a{font-family:'Baloo 2',sans-serif;font-size:26px;text-decoration:none;color:var(--brown);}
  .mobile-menu .btn{margin-top:10px;}
  @media (max-width:860px){
    .nav-links,.nav-cta .btn-ghost{display:none;}
    .nav-burger{display:flex;}
  }

  /* ---------- hero ---------- */
  .hero{position:relative;padding:150px 0 70px;overflow:hidden;text-align:center;}
  .hero-blob{position:absolute;border-radius:50%;filter:blur(2px);z-index:0;}
  .hero-blob.b1{width:480px;height:480px;background:radial-gradient(circle at 30% 30%,var(--pale-blue),transparent 72%);top:-160px;right:-140px;}
  .hero-blob.b2{width:320px;height:320px;background:radial-gradient(circle at 60% 40%,var(--mustard),transparent 70%);opacity:.55;bottom:-60px;left:-100px;}
  .hero-top{position:relative;z-index:1;max-width:700px;margin:0 auto;}
  .hero-badge{display:inline-flex;align-items:center;gap:8px;background:var(--paper);border:1px solid rgba(66,40,27,.1);padding:7px 16px 7px 8px;border-radius:99px;font-size:12.5px;font-weight:700;box-shadow:var(--shadow-sm);margin-bottom:22px;}
  .hero-badge img{height:20px;width:20px;border-radius:50%;}
  .hero h1{font-size:clamp(36px,5.6vw,60px);line-height:1.06;letter-spacing:-.5px;margin-bottom:20px;}
  .hero h1 .accent{color:var(--terracotta);position:relative;white-space:nowrap;}
  .hero-lead{font-size:17.5px;line-height:1.6;color:var(--brown-soft);max-width:500px;margin:0 auto 30px;}
  .hero-ctas{display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;}

  .hero-stage{position:relative;z-index:1;max-width:880px;height:400px;margin:54px auto 0;}
  .stage-card{position:absolute;top:10%;left:4%;width:230px;background:var(--brown);border-radius:24px;padding:20px;box-shadow:var(--shadow-lg);transform:rotate(-10deg);z-index:1;}
  .stage-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;}
  .stage-card-top span{color:var(--pale-blue);font-family:'Baloo 2',sans-serif;font-size:12.5px;}
  .stage-stamps{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-bottom:13px;}
  .stage-stamps i{display:block;aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.14);}
  .stage-stamps i.on{background:var(--mustard);}
  .stage-card-bar{height:7px;border-radius:99px;background:rgba(255,255,255,.16);overflow:hidden;}
  .stage-card-bar b{display:block;width:60%;height:100%;background:var(--terracotta);border-radius:99px;}
  .stage-mascot{position:absolute;top:-18px;left:38%;width:300px;z-index:3;filter:drop-shadow(0 22px 30px rgba(66,40,27,.28));}
  .stage-dot{position:absolute;border-radius:50%;z-index:2;}
  .stage-dot.d1{width:24px;height:24px;background:var(--mustard);top:6%;right:22%;}
  .stage-dot.d2{width:15px;height:15px;background:var(--terracotta);bottom:24%;left:1%;}
  .stage-dot.d3{width:38px;height:38px;border:3px solid var(--pale-blue);top:14%;right:4%;}
  .stage-dot.d4{width:12px;height:12px;background:var(--pale-blue);bottom:8%;left:24%;}
  .stage-mono{position:absolute;width:64px;bottom:2%;right:10%;transform:rotate(11deg);opacity:.95;z-index:2;filter:drop-shadow(0 6px 10px rgba(66,40,27,.15));}
  .hero-trust{position:relative;z-index:1;margin-top:30px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:13px;color:var(--brown-soft);font-weight:600;}
  .hero-trust img{height:16px;width:auto;opacity:.85;}
  @media (max-width:940px){
    .hero{padding:120px 0 50px;}
    .hero-stage{height:300px;max-width:320px;}
    .stage-card{width:170px;left:2%;top:16%;padding:15px;}
    .stage-mascot{width:210px;left:34%;top:-10px;}
    .stage-dot.d3{width:28px;height:28px;}
    .stage-mono{width:48px;}
  }
  @media (max-width:420px){
    .hero-stage{max-width:280px;height:270px;}
    .stage-card{width:150px;}
    .stage-mascot{width:185px;left:32%;}
  }

  /* ---------- process (dark band) ---------- */
  .process{background:var(--brown);color:var(--cream);padding:88px 0;position:relative;overflow:hidden;}
  .process::before{content:'';position:absolute;inset:0;background-image:radial-gradient(rgba(253,251,242,.05) 1.4px, transparent 1.4px);background-size:26px 26px;opacity:.5;}
  .process .wrap{position:relative;}
  .process h2{color:var(--cream);text-align:center;font-size:clamp(26px,3.4vw,36px);margin-bottom:12px;}
  .process-sub{text-align:center;color:rgba(253,251,242,.68);max-width:480px;margin:0 auto 56px;font-size:15.5px;line-height:1.55;}
  .process-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;}
  .process-step{position:relative;padding:30px 24px;background:rgba(253,251,242,.05);border:1px solid rgba(253,251,242,.12);border-radius:20px;}
  .process-num{font-family:'Baloo 2',sans-serif;font-size:44px;color:var(--mustard);opacity:.9;line-height:1;margin-bottom:14px;}
  .process-step h3{color:var(--cream);font-size:18.5px;margin-bottom:8px;}
  .process-step p{margin:0;color:rgba(253,251,242,.68);font-size:14.5px;line-height:1.55;}
  .process-arrow{position:absolute;top:50%;right:-24px;transform:translateY(-50%);color:rgba(253,251,242,.3);font-size:22px;}
  @media (max-width:820px){ .process-steps{grid-template-columns:1fr;} .process-arrow{display:none;} }

  /* ---------- benefits ---------- */
  .benefits{padding:96px 0;}
  .benefits h2{text-align:center;font-size:clamp(26px,3.4vw,36px);margin-bottom:12px;}
  .benefits-sub{text-align:center;color:var(--brown-soft);max-width:480px;margin:0 auto 60px;font-size:15.5px;line-height:1.55;}
  .benefits-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;}
  .benefit{background:var(--paper);border:1px solid rgba(66,40,27,.07);border-radius:20px;padding:26px 22px;transition:transform .3s var(--ease),box-shadow .3s var(--ease);}
  .benefit:hover{transform:translateY(-5px);box-shadow:var(--shadow-md);}
  .benefit-icon{width:46px;height:46px;border-radius:14px;background:var(--pale-blue);color:var(--terracotta);display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
  .benefit-icon svg{width:23px;height:23px;}
  .benefit h3{font-size:15.5px;font-family:'Manrope',sans-serif;font-weight:800;margin-bottom:6px;line-height:1.3;}
  .benefit p{margin:0;font-size:13.5px;color:var(--brown-soft);line-height:1.5;}
  @media (max-width:940px){ .benefits-grid{grid-template-columns:1fr 1fr;} }
  @media (max-width:560px){ .benefits-grid{grid-template-columns:1fr;} }

  /* ---------- plans ---------- */
  .plans{background:var(--pale-blue);padding:96px 0;position:relative;overflow:hidden;}
  .plans-mono{position:absolute;opacity:.4;pointer-events:none;}
  .plans-mono.p1{width:110px;top:40px;left:-20px;transform:rotate(-12deg);}
  .plans-mono.p2{width:90px;bottom:60px;right:-10px;transform:rotate(10deg);}
  .plans .wrap{position:relative;}
  .plans h2{text-align:center;font-size:clamp(26px,3.4vw,36px);margin-bottom:12px;}
  .plans-sub{text-align:center;color:var(--brown-soft);max-width:480px;margin:0 auto 56px;font-size:15.5px;line-height:1.55;}
  .plans-grid{display:grid;grid-template-columns:1fr 1fr;gap:26px;max-width:820px;margin:0 auto;}
  .plan-card{background:var(--cream);border-radius:26px;padding:34px 30px;box-shadow:var(--shadow-md);position:relative;overflow:hidden;transition:transform .3s var(--ease),box-shadow .3s var(--ease);}
  .plan-card:hover{transform:translateY(-6px);box-shadow:var(--shadow-lg);}
  .plan-icon{width:48px;height:48px;border-radius:14px;background:var(--brown);color:var(--mustard);display:flex;align-items:center;justify-content:center;margin-bottom:20px;}
  .plan-icon svg{width:24px;height:24px;}
  .plan-tag{display:inline-block;background:var(--mustard);color:var(--brown);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;padding:4px 12px;border-radius:99px;margin-bottom:14px;}
  .plan-card h3{color:var(--terracotta);font-size:21px;margin-bottom:10px;}
  .plan-card p{margin:0 0 22px;font-size:14.5px;line-height:1.55;color:var(--brown-soft);}
  .plan-card .btn{width:100%;}
  @media (max-width:760px){ .plans-grid{grid-template-columns:1fr;} }

  /* ---------- contact ---------- */
  .contact{padding:96px 0 110px;position:relative;}
  .contact h2{text-align:center;font-size:clamp(26px,3.4vw,36px);margin-bottom:12px;}
  .contact-sub{text-align:center;color:var(--brown-soft);max-width:460px;margin:0 auto 46px;font-size:15.5px;line-height:1.55;}
  .contact-shell{max-width:620px;margin:0 auto;background:var(--paper);border-radius:28px;box-shadow:var(--shadow-lg);overflow:hidden;display:grid;grid-template-columns:1fr;}
  .contact-form{padding:40px 40px 36px;}
  .field{position:relative;margin-bottom:18px;}
  .field label{display:block;font-size:12.5px;font-weight:800;color:var(--brown);margin-bottom:6px;letter-spacing:.2px;}
  .field input,.field select{width:100%;padding:13px 15px;border:1.6px solid rgba(66,40,27,.15);border-radius:12px;font-size:15px;font-family:'Manrope',sans-serif;background:var(--cream);transition:border-color .2s ease,box-shadow .2s ease;}
  .field input:focus,.field select:focus{outline:none;border-color:var(--terracotta);box-shadow:0 0 0 4px rgba(176,71,46,.12);}
  .field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .contact-form .btn{width:100%;margin-top:6px;}
  .form-msg{text-align:center;font-size:13.5px;margin-top:14px;min-height:18px;}
  .form-msg.ok{color:#215A34;font-weight:700;}
  .form-msg.err{color:#B23A3A;font-weight:700;}
  @media (max-width:560px){ .field-row{grid-template-columns:1fr;} .contact-form{padding:30px 22px;} }

  /* ---------- footer ---------- */
  footer{background:var(--brown);color:rgba(253,251,242,.7);padding:56px 0 32px;position:relative;overflow:hidden;}
  .footer-mono{position:absolute;top:-30px;right:-30px;width:220px;opacity:.06;}
  footer .wrap{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px;}
  footer img.footer-logo{height:32px;width:auto;}
  .footer-links{display:flex;gap:26px;flex-wrap:wrap;justify-content:center;font-size:13.5px;font-weight:600;}
  .footer-links a{text-decoration:none;color:rgba(253,251,242,.75);}
  .footer-links a:hover{color:var(--mustard);}
  .footer-credit{font-size:12.5px;color:rgba(253,251,242,.5);}
  .footer-credit a{font-weight:800;color:var(--mustard);text-decoration:none;}

  /* ---------- reveal animation ---------- */
  .reveal{opacity:0;transform:translateY(22px);transition:opacity .7s var(--ease),transform .7s var(--ease);transition-delay:var(--d,0ms);}
  .reveal.in-view{opacity:1;transform:translateY(0);}
</style>
</head>
<body>

  <nav class="nav" id="siteNav">
    <div class="nav-inner">
      <a href="#inicio"><img class="nav-logo" src="data:image/png;base64,${HEY_TAPP_LOGO_BASE64}" alt="Hey Tapp"></a>
      <ul class="nav-links">
        <li><a href="#beneficios">Beneficios</a></li>
        <li><a href="#como-funciona">Cómo funciona</a></li>
        <li><a href="#planes">Planes</a></li>
        <li><a href="#contacto">Contacto</a></li>
      </ul>
      <div class="nav-cta">
        <a href="#contacto" class="btn btn-primary">Pide información</a>
      </div>
      <button class="nav-burger" id="burgerBtn" aria-label="Abrir menú"><span></span><span></span><span></span></button>
    </div>
  </nav>

  <div class="mobile-menu" id="mobileMenu">
    <a href="#beneficios">Beneficios</a>
    <a href="#como-funciona">Cómo funciona</a>
    <a href="#planes">Planes</a>
    <a href="#contacto">Contacto</a>
    <a href="#contacto" class="btn btn-primary">Pide información</a>
  </div>

  <header class="hero" id="inicio">
    <div class="hero-blob b1"></div>
    <div class="hero-blob b2"></div>
    <div class="wrap">
      <div class="hero-top reveal">
        <div class="hero-badge"><img src="data:image/png;base64,${HEY_TAPP_MONO_TERRACOTTA_BASE64}" alt="">Un producto de Anaelí Brand</div>
        <h1>Dale a tus clientes una <span class="accent">razón para volver</span></h1>
        <p class="hero-lead">Haz que esa primera compra no sea la última. Con Hey Tapp conviertes cada compra en una oportunidad para que tus clientes vuelvan, acumulen beneficios y sigan eligiendo tu marca — con una tarjeta de sellos digital creada completamente para ti.</p>
        <div class="hero-ctas">
          <a href="#contacto" class="btn btn-primary">Quiero mi tarjeta digital</a>
          <a href="#como-funciona" class="btn btn-ghost">Ver cómo funciona</a>
        </div>
      </div>
      <div class="hero-stage reveal" style="--d:140ms">
        <div class="stage-dot d3"></div>
        <div class="stage-card">
          <div class="stage-card-top"><span>¡Hello!</span><span>7/10</span></div>
          <div class="stage-stamps">
            <i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i>
            <i class="on"></i><i class="on"></i><i></i><i></i><i></i>
          </div>
          <div class="stage-card-bar"><b></b></div>
        </div>
        <img class="stage-mascot" id="heroMascot" src="data:image/png;base64,${HEY_TAPP_MASCOT_BASE64}" alt="Mascota Hey Tapp">
        <div class="stage-dot d1"></div>
        <div class="stage-dot d2"></div>
        <div class="stage-dot d4"></div>
        <img class="stage-mono" src="data:image/png;base64,${HEY_TAPP_MONO_BROWN_BASE64}" alt="">
      </div>
      <div class="hero-trust reveal"><img src="data:image/png;base64,${HEY_TAPP_MONO_BROWN_BASE64}" alt="">Diseñada y desarrollada por Anaelí Brand</div>
    </div>
  </header>

  <section class="process" id="como-funciona">
    <div class="wrap">
      <div class="eyebrow reveal">Así de simple</div>
      <h2 class="reveal">Cómo funciona Hey Tapp</h2>
      <p class="process-sub reveal">Tres pasos, y tu negocio ya tiene su propio sistema de fidelización.</p>
      <div class="process-steps">
        <div class="process-step reveal">
          <div class="process-num">01</div>
          <h3>Creamos tu tarjeta</h3>
          <p>La diseñamos con tu logo, colores y el premio que tú decidas ofrecer.</p>
          <span class="process-arrow">→</span>
        </div>
        <div class="process-step reveal" style="--d:110ms">
          <div class="process-num">02</div>
          <h3>Tus clientes juntan sellos</h3>
          <p>Escaneas su QR (o escribes su código) en cada compra, desde tu panel.</p>
          <span class="process-arrow">→</span>
        </div>
        <div class="process-step reveal" style="--d:220ms">
          <div class="process-num">03</div>
          <h3>Vuelven por su premio</h3>
          <p>Y siguen eligiendo tu marca — con datos reales de quién regresa.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="benefits" id="beneficios">
    <div class="wrap">
      <div class="eyebrow reveal">Todo incluido</div>
      <h2 class="reveal">¿Qué incluye Hey Tapp?</h2>
      <p class="benefits-sub reveal">Tus clientes ya te eligieron una vez. Hey Tapp te ayuda a que lo hagan de nuevo.</p>
      <div class="benefits-grid">${beneficiosHtml}</div>
    </div>
  </section>

  <section class="plans" id="planes">
    <img class="plans-mono p1" src="data:image/png;base64,${HEY_TAPP_MONO_BROWN_BASE64}" alt="">
    <img class="plans-mono p2" src="data:image/png;base64,${HEY_TAPP_MONO_BROWN_BASE64}" alt="">
    <div class="wrap">
      <div class="eyebrow reveal">Elige tu camino</div>
      <h2 class="reveal">Un plan para cada tipo de negocio</h2>
      <p class="plans-sub reveal">Hecho especialmente para tu marca, desde cero.</p>
      <div class="plans-grid">
        <div class="plan-card reveal">
          <div class="plan-icon">${icons.instagram}</div>
          <span class="plan-tag">Digital</span>
          <h3>Plan Emprende Digital</h3>
          <p>Para marcas que venden por Instagram, WhatsApp o canales digitales.</p>
          <a href="#contacto" class="btn btn-primary">Pedir información</a>
        </div>
        <div class="plan-card reveal" style="--d:110ms">
          <div class="plan-icon">${icons.shop}</div>
          <span class="plan-tag">Físico</span>
          <h3>Plan Emprende Físico</h3>
          <p>Para marcas con tienda, local o punto de venta. Incluye hablador con QR para tu mostrador.</p>
          <a href="#contacto" class="btn btn-primary">Pedir información</a>
        </div>
      </div>
    </div>
  </section>

  <section class="contact" id="contacto">
    <div class="wrap">
      <div class="eyebrow reveal">Hablemos</div>
      <h2 class="reveal">Pide información</h2>
      <p class="contact-sub reveal">Déjanos tus datos y te respondemos por correo con los precios y todos los detalles.</p>
      <div class="contact-shell reveal">
        <div class="contact-form">
          <form id="leadForm">
            <div class="field">
              <label for="lf_name">Tu nombre</label>
              <input type="text" id="lf_name" required>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="lf_phone">Celular</label>
                <input type="tel" id="lf_phone" required>
              </div>
              <div class="field">
                <label for="lf_email">Correo</label>
                <input type="email" id="lf_email" required>
              </div>
            </div>
            <div class="field">
              <label for="lf_instagram">Instagram de tu negocio (opcional)</label>
              <input type="text" id="lf_instagram" placeholder="@tunegocio">
            </div>
            <div class="field">
              <label for="lf_type">¿Cuál te interesa más?</label>
              <select id="lf_type">
                <option value="">Todavía no sé</option>
                <option value="digital">Plan Emprende Digital</option>
                <option value="fisico">Plan Emprende Físico</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary">Enviar</button>
          </form>
          <p class="form-msg" id="formMsg"></p>
        </div>
      </div>
    </div>
  </section>

  <footer>
    <img class="footer-mono" src="data:image/png;base64,${HEY_TAPP_MONO_CREAM_BASE64}" alt="">
    <div class="wrap">
      <img class="footer-logo" src="data:image/png;base64,${HEY_TAPP_LOGO_CREAM_BASE64}" alt="Hey Tapp">
      <div class="footer-links">
        <a href="#inicio">Inicio</a>
        <a href="#beneficios">Beneficios</a>
        <a href="#planes">Planes</a>
        <a href="#contacto">Contacto</a>
      </div>
      <p class="footer-credit">Una marca de <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">Anaelí Brand</a></p>
    </div>
  </footer>

  <script>
    // nav: fondo sólido + blur al hacer scroll
    const nav = document.getElementById('siteNav');
    const onScroll = () => { nav.classList.toggle('scrolled', window.scrollY > 30); };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // menú móvil
    const burger = document.getElementById('burgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    burger.addEventListener('click', () => { mobileMenu.classList.toggle('open'); burger.classList.toggle('open'); });
    mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { mobileMenu.classList.remove('open'); burger.classList.remove('open'); }));

    // aparición al hacer scroll (respeta "reducir movimiento")
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); io.unobserve(entry.target); } });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      document.querySelectorAll('.reveal').forEach(el => io.observe(el));

      // paralaje muy sutil en la mascota del hero
      const mascot = document.getElementById('heroMascot');
      document.addEventListener('scroll', () => {
        const y = Math.min(window.scrollY, 500) * 0.06;
        mascot.style.transform = 'translateY(' + y + 'px)';
      }, { passive: true });
    }

    // formulario de contacto
    document.getElementById('leadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('formMsg');
      const payload = {
        name: document.getElementById('lf_name').value.trim(),
        phone: document.getElementById('lf_phone').value.trim(),
        email: document.getElementById('lf_email').value.trim(),
        instagram: document.getElementById('lf_instagram').value.trim(),
        business_type: document.getElementById('lf_type').value,
      };
      if (!payload.name || !payload.phone || !payload.email) {
        msg.textContent = 'Completa nombre, celular y correo'; msg.className = 'form-msg err';
        return;
      }
      msg.textContent = 'Enviando...'; msg.className = 'form-msg';
      try {
        const res = await fetch('/contacto', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const data = await res.json();
        if (res.ok) {
          msg.textContent = '✅ ¡Listo! Te escribimos pronto a tu correo.'; msg.className = 'form-msg ok';
          document.getElementById('leadForm').reset();
        } else {
          msg.textContent = data.error || 'No se pudo enviar, intenta de nuevo'; msg.className = 'form-msg err';
        }
      } catch (err) {
        msg.textContent = 'Error de conexión, intenta de nuevo'; msg.className = 'form-msg err';
      }
    });
  </script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function servePngIcon(base64Data) {
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

// manifest de la tarjeta de UN cliente: al "agregar a inicio" desde su
// tarjeta, el ícono que sale es el de Hey Tapp, pero el nombre debajo del
// ícono es el del negocio, y al abrirlo vuelve directo a SU tarjeta.
async function handleCardManifest(env, slug, code) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/manifest+json' } });
  const manifest = {
    name: business.name,
    short_name: business.name,
    start_url: `/${slug}/${code}`,
    display: 'standalone',
    background_color: business.color_page_bg || '#FDFBF2',
    theme_color: business.color_brown || '#42281B',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json' } });
}

// manifest del panel de staff de un negocio
async function handleStaffManifest(env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/manifest+json' } });
  const manifest = {
    name: `${business.name} — Staff`,
    short_name: business.name,
    start_url: `/staff/${slug}`,
    display: 'standalone',
    background_color: business.color_page_bg || '#FDFBF2',
    theme_color: business.color_brown || '#42281B',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json' } });
}

// ------------------------------------------------------------
// panel del staff
// ------------------------------------------------------------

async function handleStaffPage(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response('Negocio no encontrado', { status: 404 });

  const platformName = await getPlatformName(env);

  if (business.is_suspended) {
    return new Response(renderSuspendedPage(business, platformName), { status: 402, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }

  const cookieVal = getCookie(request, 'staff_session');
  const isLoggedIn = cookieVal === business.staff_pin_hash;

  const html = isLoggedIn ? renderStaffPanel(business, platformName) : renderStaffLogin(business, platformName);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function renderSuspendedPage(b, platformName) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Staff · ${escapeHtml(b.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;background:#F4F1EA;font-family:'Quicksand',sans-serif;padding:24px;}
    .box{width:100%;max-width:360px;margin:0 auto;background:white;border:2.5px solid #2B2320;border-radius:24px;padding:32px 24px;box-shadow:0 10px 0 #2B2320;text-align:center;}
    p{font-size:15px;color:#2B2320;line-height:1.5;}
    a{color:#593212;font-weight:700;}
  </style></head>
  <body>
    <div class="box">
      <p><b>Ups! ¿Olvidaste pagar tu suscripción? 😴</b><br><br>Por favor envíanos el comprobante a "<a href="mailto:hola@anaelidesign.com">hola@anaelidesign.com</a>" con el nombre de tu negocio y continúa disfrutando de <span style="white-space:nowrap;">${escapeHtml(platformName)}</span>.</p>
    </div>
  </body></html>`;
}

function baseStaffStyles(b) {
  const font = getFontConfig(b.font_family);
  const btnColors = getContrastButtonColors(b);
  return `
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;background:${b.color_page_bg};font-family:'Quicksand',sans-serif;padding:24px;}
  .wrap{width:100%;max-width:420px;margin:0 auto;}
  .box{width:100%;background:${b.color_card_bg};border:2.5px solid ${b.color_brown};border-radius:28px;padding:38px 32px;box-shadow:0 10px 0 ${b.color_brown_deep};}
  h1{font-family:'${b.font_family}',${font.fallback};font-size:23px;color:${b.color_brown};margin:0 0 6px;text-align:center;}
  p.sub{font-size:14px;color:${b.color_brown_soft};text-align:center;margin:0 0 26px;line-height:1.4;}
  input{width:100%;padding:15px 16px;border:2px solid ${b.color_brown};border-radius:14px;font-size:16px;margin-bottom:14px;font-family:'Quicksand',sans-serif;}
  button{width:100%;padding:15px;border:2px solid ${b.color_brown};border-radius:14px;background:${btnColors.bg};color:${btnColors.text};font-weight:700;font-size:16px;cursor:pointer;}
  button:active{transform:scale(.98);}
  .msg{text-align:center;font-size:13px;margin-top:12px;min-height:18px;}
  .msg.ok{color:#215A34;background:#DFF3E4;border:2px solid #3F7D4F;border-radius:12px;padding:14px 10px;font-size:17px;font-weight:800;}
  .msg.err{color:#B23A3A;background:#FBE4E4;border:2px solid #B23A3A;border-radius:12px;padding:14px 10px;font-size:15px;font-weight:700;}
  a.logout{display:block;text-align:center;margin-top:16px;font-size:12px;color:${b.color_brown_soft};}
  .footer-brand{text-align:center;margin:22px 0 0;}
  .footer-brand a{display:inline-block;}
  .footer-brand img{width:26%;min-width:100px;max-width:150px;height:auto;display:block;margin:0 auto;}
  .scan-btn{background:${btnColors.bg}!important;color:${btnColors.text}!important;}
  `;
}

function renderStaffLogin(b, platformName) {
  const font = getFontConfig(b.font_family);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Staff · ${escapeHtml(b.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=${font.google}&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${baseStaffStyles(b)}</style></head>
  <body>
    <div class="wrap">
    <div class="box">
      <h1>${escapeHtml(b.name)}</h1>
      <p class="sub">Ingresa el PIN del local para sumar sellos</p>
      <form id="loginForm">
        <input type="password" inputmode="numeric" id="pin" placeholder="PIN" autofocus>
        <button type="submit">Entrar</button>
      </form>
      <p class="msg" id="msg"></p>
    </div>
    <div class="footer-brand">
      <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">
        <img src="data:image/png;base64,${HEY_TAPP_LOGO_BASE64}" alt="Hey Tapp — Anaelí Brand">
      </a>
    </div>
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

function renderStaffPanel(b, platformName) {
  const font = getFontConfig(b.font_family);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Staff · ${escapeHtml(b.name)}</title>
  <link rel="manifest" href="/${b.slug}/manifest.json">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="icon" href="/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="${escapeHtml(b.name)} Staff">
  <meta name="theme-color" content="${b.color_brown}">
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
    <div class="wrap">
    <div class="box">
      <h1>${escapeHtml(b.name)}</h1>
      <p class="sub">Escanea el QR del cliente, o escribe su código a mano</p>

      <button type="button" id="scanBtn" class="scan-btn">📷 Escanear con cámara</button>
      <video id="preview" muted playsinline></video>
      <p class="scan-hint" id="scanHint"></p>

      <form id="stampForm">
        <input type="text" id="code" placeholder="Código del cliente" autocapitalize="characters">
        <button type="submit">Sumar sello</button>
      </form>
      <p class="msg" id="msg"></p>

      <button type="button" id="toggleRegisterBtn" class="secondary-btn">➕ Registrar cliente nuevo</button>
      <form id="registerForm" style="display:none;">
        <input type="text" id="regName" placeholder="Nombre completo">
        <input type="text" id="regCedula" placeholder="Cédula">
        <button type="submit">Crear tarjeta</button>
      </form>
      <p class="msg" id="regMsg"></p>

      <a class="logout" href="/staff/${b.slug}/clientes">Ver todos los clientes</a>
      <a class="logout" href="/staff/${b.slug}/logout">Cerrar sesión del local</a>
    </div>
    <div class="footer-brand">
      <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">
        <img src="data:image/png;base64,${HEY_TAPP_LOGO_BASE64}" alt="Hey Tapp — Anaelí Brand">
      </a>
    </div>
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
        if (!name) { regMsg.textContent = 'Falta el nombre'; regMsg.className = 'msg err'; return; }
        regMsg.textContent = 'Creando tarjeta...'; regMsg.className = 'msg';
        const res = await fetch(location.pathname + '/register', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name, cedula })
        });
        const data = await res.json();
        if (res.ok) {
          regMsg.innerHTML = '✅ Tarjeta creada.<br>Código: <b>' + data.code + '</b><br><a href="' + data.url + '" target="_blank">Abrir su tarjeta</a>';
          regMsg.className = 'msg ok';
          document.getElementById('regName').value = '';
          document.getElementById('regCedula').value = '';
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
    const platformName = await getPlatformName(env);
    return new Response(JSON.stringify({ error: `Este negocio está suspendido. Contacta a la administradora de ${platformName}.` }), { status: 402, headers: { 'Content-Type': 'application/json' } });
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

  const { name, cedula } = await request.json();
  if (!name) {
    return new Response(JSON.stringify({ error: 'Falta el nombre del cliente' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const code = await generateUniqueCode(env, slug);
  await env.DB.prepare('INSERT INTO customers (business_id, code, name, cedula, stamps) VALUES (?, ?, ?, ?, 0)')
    .bind(business.id, code, name, cedula || null).run();

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
    'SELECT name, cedula, code, stamps, cycle FROM customers WHERE business_id = ? ORDER BY id DESC'
  ).bind(business.id).all();

  const rows = results.map(c => `
    <tr>
      <td data-label="Seleccionar"><input type="checkbox" class="row-check" value="${escapeHtml(c.code)}"></td>
      <td data-label="Nombre">${escapeHtml(c.name)}</td>
      <td data-label="Cédula">${escapeHtml(c.cedula || '—')}</td>
      <td data-label="Código">${escapeHtml(c.code)}</td>
      <td data-label="Sellos">${c.stamps}/${business.total_stamps}</td>
      <td data-label="Ciclo">${c.cycle}</td>
      <td data-label="Historial"><a href="/staff/${slug}/historial/${escapeHtml(c.code)}">Ver fechas</a></td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Clientes · ${escapeHtml(business.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{color-scheme:light;}
    *{color-scheme:light;}
    body{margin:0;padding:24px;font-family:'Quicksand',sans-serif;background:${HEY_TAPP_BRAND.paleBlue};color:${HEY_TAPP_BRAND.brown};font-size:15px;}
    h1{font-family:'Baloo 2',sans-serif;color:${HEY_TAPP_BRAND.brown};font-size:24px;margin:0;}
    table{width:100%;border-collapse:collapse;background:${HEY_TAPP_BRAND.cream};border-radius:12px;overflow:hidden;font-size:15px;box-shadow:0 4px 16px rgba(66,40,27,.08);}
    th,td{padding:12px 14px;text-align:left;border-bottom:1px solid ${HEY_TAPP_BRAND.paleBlue};background:${HEY_TAPP_BRAND.cream};color:${HEY_TAPP_BRAND.brown};}
    th{background:${HEY_TAPP_BRAND.brown};color:#FFFFFF!important;font-size:14px;}
    tr:nth-child(even) td{background:${HEY_TAPP_BRAND.paleBlue};}
    a{color:${HEY_TAPP_BRAND.brown};font-weight:700;}
    a.back{display:inline-block;margin-bottom:16px;color:${HEY_TAPP_BRAND.brown};font-weight:700;text-decoration:none;font-size:15px;}
    .toolbar{display:flex;align-items:center;gap:12px;margin:14px 0;}
    button#deleteSelectedBtn{background:#B23A3A;color:white;border:none;border-radius:10px;padding:11px 16px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Quicksand',sans-serif;}
    button#deleteSelectedBtn:disabled{background:#ccc;cursor:not-allowed;}
    .msg{font-size:14px;margin:0;}
    .msg.err{color:#B23A3A;}
    .clientes-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
    .clientes-header img{height:74px;width:auto;opacity:.95;}
    @media (max-width:760px) {
      table, thead, tbody, tr { display:block; }
      thead { display:none; }
      table{background:none;box-shadow:none;}
      tbody tr{
        display:grid;
        grid-template-columns:28px 1fr 1fr;
        grid-template-areas:
          "check name  name"
          "ced   ced   cod"
          "sellos sellos ciclo"
          "hist  hist  hist";
        column-gap:14px; row-gap:12px;
        align-items:start;
        background:${HEY_TAPP_BRAND.cream};border:2px solid ${HEY_TAPP_BRAND.brown};border-radius:16px;margin-bottom:16px;padding:16px 18px;
      }
      td{border:none;padding:0;white-space:normal;background:transparent!important;font-size:16px;}
      td:nth-child(1){grid-area:check;}
      td:nth-child(2){grid-area:name;}
      td:nth-child(3){grid-area:ced;}
      td:nth-child(4){grid-area:cod;}
      td:nth-child(5){grid-area:sellos;}
      td:nth-child(6){grid-area:ciclo;}
      td:nth-child(7){grid-area:hist;font-size:15px;}
      td::before{content:attr(data-label);display:block;font-size:11px;font-weight:700;color:${HEY_TAPP_BRAND.brown};opacity:.6;text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px;}
      td:nth-child(1)::before{content:none;}
      td:nth-child(1) input{margin-top:2px;width:20px;height:20px;}
      td:nth-child(2){font-size:18px;font-weight:700;}
    }
  </style></head>
  <body>
    <a class="back" href="/staff/${slug}">← Volver al panel</a>
    <div class="clientes-header">
      <h1>Clientes de ${escapeHtml(business.name)} (${results.length})</h1>
      <img src="data:image/png;base64,${HEY_TAPP_LOGO_BASE64}" alt="Hey Tapp">
    </div>
    <div class="toolbar">
      <button type="button" id="deleteSelectedBtn" disabled>Borrar seleccionados (0)</button>
      <p class="msg" id="deleteMsg"></p>
    </div>
    <table>
      <thead><tr><th><input type="checkbox" id="selectAll"></th><th>Nombre</th><th>Cédula</th><th>Código</th><th>Sellos</th><th>Ciclo</th><th>Historial</th></tr></thead>
      <tbody>
      ${rows || '<tr><td colspan="7">Todavía no hay clientes registrados</td></tr>'}
      </tbody>
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

  const rows = results.map(v => `<tr><td data-label="Fecha">${escapeHtml(v.stamped_at)}</td><td data-label="Tarjeta">Tarjeta #${v.cycle}</td></tr>`).join('');
  const premiosGanados = customer.cycle - 1;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only">
  <title>Historial de ${escapeHtml(customer.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{color-scheme:light;}
    *{box-sizing:border-box;color-scheme:light;}
    body{margin:0;padding:24px;font-family:'Quicksand',sans-serif;background:${business.color_page_bg};}
    .wrap{max-width:640px;margin:0 auto;}
    h1{font-family:'Baloo 2',sans-serif;color:${business.color_brown};font-size:23px;margin-bottom:3px;}
    p.sub{color:${business.color_brown_soft};font-size:14.5px;margin-top:0;}
    table{width:100%;border-collapse:collapse;background:${business.color_card_bg};border-radius:12px;overflow:hidden;font-size:15px;box-shadow:0 3px 12px rgba(0,0,0,.06);}
    th,td{padding:12px 14px;text-align:left;border-bottom:1px solid ${business.color_page_bg};color:${business.color_brown};background:${business.color_card_bg};}
    th{background:${business.color_brown};color:#FFFFFF!important;font-size:14px;}
    a.back{display:inline-block;margin-bottom:16px;color:${business.color_brown};font-weight:700;text-decoration:none;font-size:15px;}
    .resumen{background:${business.color_butter_mid};border:2px solid ${business.color_brown};border-radius:12px;padding:14px 18px;margin-bottom:18px;font-size:15px;color:${business.color_brown};line-height:1.7;}
    .footer-brand{text-align:center;margin:24px 0 0;}
    .footer-brand a{display:inline-block;}
    .footer-brand img{width:24%;min-width:90px;max-width:130px;height:auto;display:block;margin:0 auto;}
    @media (max-width:600px) {
      table, thead, tbody, th, td, tr { display:block; }
      thead { display:none; }
      table{background:none;box-shadow:none;}
      tr{background:${business.color_card_bg};border:2px solid ${business.color_brown};border-radius:14px;margin-bottom:12px;padding:10px 6px;}
      td{border:none;padding:8px 14px;font-size:16px;}
      td::before{content:attr(data-label);display:block;font-size:11px;font-weight:700;color:${business.color_brown_soft};text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px;}
    }
  </style></head>
  <body>
    <div class="wrap">
    <a class="back" href="/staff/${slug}/clientes">← Volver a clientes</a>
    <h1>${escapeHtml(customer.name)}</h1>
    <p class="sub">Código actual: ${escapeHtml(customer.code)} · Cédula: ${escapeHtml(customer.cedula || '—')}</p>
    <div class="resumen">
      Sellos en su tarjeta actual: <b>${customer.stamps}/${business.total_stamps}</b><br>
      Premios ganados hasta ahora: <b>${premiosGanados}</b><br>
      Total de compras selladas: <b>${results.length}</b>
    </div>
    <table>
      <thead><tr><th>Fecha</th><th>Tarjeta</th></tr></thead>
      <tbody>
      ${rows || '<tr><td colspan="2">Todavía no tiene compras registradas</td></tr>'}
      </tbody>
    </table>
    <div class="footer-brand">
      <a href="https://www.instagram.com/anaeli.brand" target="_blank" rel="noopener">
        <img src="data:image/png;base64,${HEY_TAPP_LOGO_BASE64}" alt="Hey Tapp — Anaelí Brand">
      </a>
    </div>
    </div>
  </body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

async function handleStamp(request, env, slug) {
  const business = await getBusiness(env, slug);
  if (!business) return new Response(JSON.stringify({ error: 'Negocio no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  if (business.is_suspended) {
    const platformName = await getPlatformName(env);
    return new Response(JSON.stringify({ error: `Este negocio está suspendido. Contacta a la administradora de ${platformName}.` }), { status: 402, headers: { 'Content-Type': 'application/json' } });
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
