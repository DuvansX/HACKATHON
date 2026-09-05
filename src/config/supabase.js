import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nsicxoiopomlnejmyten.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGci••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function normalizarUsuario(user) {
  if (!user) return null;

  const metadata = user.user_metadata || {};

  return {
    uid: user.id,
    email: user.email || "",
    displayName: metadata.full_name || metadata.name || "",
    photoURL: metadata.avatar_url || metadata.picture || "",
    isAnonymous: user.is_anonymous === true,
    providerData: [{ providerId: user.app_metadata?.provider || "email" }]
  };
}

let usuarioActual = null;

export const auth = {
  get currentUser() {
    return usuarioActual;
  }
};

supabase.auth.onAuthStateChange((_evento, sesion) => {
  usuarioActual = normalizarUsuario(sesion?.user);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ideapro-auth-state", { detail: usuarioActual }));
  }
});

export function onAuthStateChanged(callback) {
  const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
    callback(normalizarUsuario(sesion?.user));
  });

  return () => suscripcion.subscription.unsubscribe();
}

// Los triggers "handle_new_user" y "handle_user_updated" en auth.users
// (migración auto_provision_profile_on_signup) ya crean y sincronizan
// profiles automáticamente en el servidor, con SECURITY DEFINER (no dependen
// de que exista sesión). Por eso aquí solo actualizamos — nunca insertamos —
// para no chocar con RLS mientras el correo todavía no está confirmado
// (en ese momento no hay sesión, así que un intento de insertar sí falla,
// pero un UPDATE simplemente no afecta filas y no lanza error).
async function guardarPerfil(user, cambios = {}) {
  if (!user || !Object.keys(cambios).length) return;

  const { error } = await supabase
    .from("profiles")
    .update({ ultima_actividad_at: new Date().toISOString(), ...cambios })
    .eq("id", user.id);

  if (error) console.warn("No se pudo actualizar el perfil en Supabase.", error);
}

export async function guardarDatosUsuario() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  try {
    await guardarPerfil(user);
    return true;
  } catch (error) {
    console.error("No se pudo guardar el usuario en Supabase.", error);
    return false;
  }
}

export async function iniciarConCorreo(correo, contrasena) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password: contrasena
  });
  if (error) throw error;

  await guardarPerfil(data.user);
  return normalizarUsuario(data.user);
}

export async function registrarConCorreo(nombre, correo, contrasena) {
  const nombreLimpio = nombre.trim();

  const { data, error } = await supabase.auth.signUp({
    email: correo.trim(),
    password: contrasena,
    options: nombreLimpio ? { data: { full_name: nombreLimpio } } : undefined
  });
  if (error) throw error;

  if (data.user) {
    await guardarPerfil(data.user, nombreLimpio ? { full_name: nombreLimpio } : {});
  }

  return { user: normalizarUsuario(data.user), sesionActiva: Boolean(data.session) };
}

export async function enviarCorreoRestablecimiento(correo) {
  // window.location.origin no sirve aquí: en un sitio publicado bajo una
  // subruta (p. ej. GitHub Pages, https://usuario.github.io/repo/) el
  // origin no incluye "/repo", así que la URL quedaría rota. Se resuelve en
  // cambio contra la página actual, que si funciona sin importar la subruta.
  const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
    redirectTo: window.location.href.split(/[?#]/)[0]
  });
  if (error) throw error;
}

export async function iniciarConGoogle() {
  // Mismo motivo que arriba: se calcula relativo a esta página (login.html)
  // en vez de con window.location.origin, para que funcione tanto en la raíz
  // de un dominio como en una subruta de GitHub Pages.
  const destino = new URL("../chat/chat.html", window.location.href).toString();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: destino
    }
  });
  if (error) throw error;
}

export async function iniciarComoInvitado() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  try {
    await guardarPerfil(data.user, { full_name: "Invitado" });
  } catch (error) {
    console.warn("No se pudo guardar el perfil de invitado en Supabase.", error);
  }

  return normalizarUsuario(data.user);
}

export async function cerrarSesion() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
