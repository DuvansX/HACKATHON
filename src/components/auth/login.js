import {
  iniciarConGoogle,
  iniciarComoInvitado,
  iniciarConCorreo,
  registrarConCorreo,
  enviarCorreoRestablecimiento
} from "../../config/supabase.js";

(function () {
  "use strict";

  const REDIRECT_DESTINATION = "../chat/chat.html";

  const cast = document.getElementById("cast");
  const loginView = document.getElementById("loginView");
  const signupView = document.getElementById("signupView");

  const STATES = ["state-email", "state-password-hidden", "state-password-shown", "state-celebrate", "state-error"];

  function setState(name) {
    STATES.forEach((s) => cast.classList.remove(s));
    if (name) cast.classList.add(name);
    cast.querySelectorAll(".pupil, .eye--dot, .char--orange .eye").forEach((eye) => {
      eye.style.removeProperty("--look-x");
      eye.style.removeProperty("--look-y");
    });
  }

  // ---------------------------------------------------------------------
  // View switching (Log in <-> Sign up), no page reload.
  // ---------------------------------------------------------------------
  function showView(view) {
    const showingSignup = view === "signup";
    loginView.hidden = showingSignup;
    signupView.hidden = !showingSignup;
    const target = showingSignup ? signupView : loginView;
    target.style.animation = "none";
    void target.offsetHeight;
    target.style.animation = "";
    setState(null);
  }

  document.getElementById("goToSignup").addEventListener("click", (e) => {
    e.preventDefault();
    showView("signup");
  });
  document.getElementById("goToLogin").addEventListener("click", (e) => {
    e.preventDefault();
    showView("login");
  });

  // ---------------------------------------------------------------------
  // Character reactions — wired to whichever fields exist on the page.
  // ---------------------------------------------------------------------

  // Any "email" or plain text field: characters glance toward it.
  document.querySelectorAll('input[type="email"], input[type="text"]').forEach((input) => {
    input.addEventListener("focus", () => setState("state-email"));
    input.addEventListener("input", () => setState("state-email"));
    input.addEventListener("blur", () => {
      if (!document.activeElement || document.activeElement.type !== "password") setState(null);
    });
  });

  // Any password field: characters shut their eyes while it's masked,
  // go wide-eyed if it's currently revealed as plain text.
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    const reactToState = () => {
      const revealed = input.type === "text";
      setState(revealed ? "state-password-shown" : "state-password-hidden");
    };
    input.addEventListener("focus", reactToState);
    input.addEventListener("input", reactToState);
    input.addEventListener("blur", () => setState(null));
  });

  // Eye toggles: each is paired with a field via data-toggle-for.
  document.querySelectorAll(".eye-toggle").forEach((toggle) => {
    const fieldId = toggle.getAttribute("data-toggle-for");
    const field = document.getElementById(fieldId);
    if (!field) return;

    toggle.addEventListener("click", () => {
      const isHidden = field.type === "password";
      field.type = isHidden ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(isHidden));
      toggle.setAttribute("aria-label", isHidden ? "Ocultar contraseña" : "Mostrar contraseña");
      if (document.activeElement !== field) field.focus();
      setState(isHidden ? "state-password-shown" : "state-password-hidden");
    });
  });

  // Cada ojo calcula su propia dirección hacia el cursor. Al usar variables CSS
  // evitamos una transición acumulada: responde de inmediato y no "persigue"
  // al mouse con retraso.
  function pointEyesAt(x, y) {
    if (cast.classList.contains("state-email") ||
      cast.classList.contains("state-password-hidden") ||
      cast.classList.contains("state-password-shown")) return;

    cast.querySelectorAll(".pupil, .eye--dot, .char--orange .eye").forEach((target) => {
      // La caja del ojo (o el grupo de ojos) no se mueve con la pupila,
      // por lo que sirve como ancla estable incluso con el cursor encima.
      const anchor = target.classList.contains("pupil")
        ? target.closest(".eye")
        : target.closest(".eyes");
      const rect = anchor.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(y - centerY, x - centerX);
      const distance = target.classList.contains("pupil") ? 2.7 : 1.5;

      target.style.setProperty("--look-x", `${Math.cos(angle) * distance}px`);
      target.style.setProperty("--look-y", `${Math.sin(angle) * distance}px`);
    });
  }

  document.addEventListener("pointermove", (e) => pointEyesAt(e.clientX, e.clientY), { passive: true });

  // La pose especial solo pertenece a los campos donde se escribe. Un clic
  // fuera de ellos devuelve inmediatamente a los personajes a reposo.
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest('input[type="email"], input[type="text"], input[type="password"], .eye-toggle')) {
      setState(null);
    }
  });

  // ---------------------------------------------------------------------
  // Reacción visual de error, reutilizada por el login por correo, Google
  // e invitado si algo falla.
  // ---------------------------------------------------------------------
  function showLoginError() {
    setState("state-error");
    window.setTimeout(() => setState(null), 1200);
  }

  // ---------------------------------------------------------------------
  // Log in form por correo (demo local — no hay backend de correo/clave).
  // ---------------------------------------------------------------------
  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");
  const loginMessage = document.getElementById("loginMessage");

  function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
    element.hidden = false;
  }

  function authErrorMessage(error) {
    const messagesPorCodigo = {
      invalid_credentials: "El correo o la contraseña no son correctos.",
      email_not_confirmed: "Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.",
      user_already_exists: "No es posible realizar esta opción: ese correo ya tiene una cuenta.",
      user_already_registered: "No es posible realizar esta opción: ese correo ya tiene una cuenta.",
      weak_password: "La contraseña debe tener al menos 6 caracteres.",
      email_address_invalid: "Escribe un correo electrónico válido.",
      validation_failed: "Escribe un correo electrónico válido.",
      over_email_send_rate_limit: "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
      over_request_rate_limit: "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
      anonymous_provider_disabled: "El acceso como invitado no está disponible en este momento.",
      signup_disabled: "El registro no está disponible en este momento."
    };
    if (messagesPorCodigo[error.code]) return messagesPorCodigo[error.code];

    const mensaje = String(error.message || "").toLowerCase();
    if (mensaje.includes("invalid login credentials")) return "El correo o la contraseña no son correctos.";
    if (mensaje.includes("already registered") || mensaje.includes("already exists")) return "No es posible realizar esta opción: ese correo ya tiene una cuenta.";
    if (mensaje.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
    if (mensaje.includes("unable to validate email") || mensaje.includes("invalid email")) return "Escribe un correo electrónico válido.";
    if (mensaje.includes("email not confirmed")) return "Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.";
    if (mensaje.includes("rate limit")) return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";

    return "No se pudo completar la operación. Inténtalo de nuevo.";
  }

  loginForm.addEventListener("submit", async (e) => {
/*

  loginForm.addEventListener("submit", (e) => {
*/
    e.preventDefault();
    if (loginBtn.classList.contains("is-loading")) return;

    if (!loginForm.checkValidity()) {
      showLoginError();
      loginForm.reportValidity();
      return;
    }

    setState("state-celebrate");
    loginBtn.classList.add("is-loading");
    try {
      await iniciarConCorreo(loginForm.elements.email.value, loginForm.elements.password.value);
      window.location.href = REDIRECT_DESTINATION;
    } catch (error) {
      console.error("Error al iniciar sesión con correo:", error);
      setState("state-error");
      showMessage(loginMessage, authErrorMessage(error), true);
    } finally {
      loginBtn.classList.remove("is-loading");
      if (!document.body.contains(loginBtn)) return;
    }
  });

  document.getElementById("forgotPassword").addEventListener("click", async (e) => {
    e.preventDefault();
    const correo = loginForm.elements.email.value.trim();
    if (!correo || !loginForm.elements.email.checkValidity()) {
      loginForm.elements.email.focus();
      showMessage(loginMessage, "Escribe tu correo para enviarte el enlace de recuperación.", true);
      return;
    }
    try {
      await enviarCorreoRestablecimiento(correo);
      showMessage(loginMessage, "Te enviamos un correo para restablecer tu contraseña.");
    } catch (error) {
      showMessage(loginMessage, authErrorMessage(error), true);
    }
/*
    window.setTimeout(() => {
      loginBtn.classList.remove("is-loading");
      setState(null);
    }, 1400);
*/
  });

  window.addEventListener("login-error", showLoginError);

  // ---------------------------------------------------------------------
  // Sign up form (demo local — valida coincidencia de contraseña + términos).
  // ---------------------------------------------------------------------
  const signupForm = document.getElementById("signupForm");
  const signupBtn = document.getElementById("signupBtn");
  const signupPassword = document.getElementById("signup-password");
  const signupConfirm = document.getElementById("signup-confirm");
  const signupError = document.getElementById("signupError");
  const signupMessage = document.getElementById("signupMessage");
  const agreeTerms = document.getElementById("agreeTerms");

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (signupBtn.classList.contains("is-loading")) return;

    if (!signupForm.checkValidity()) {
      showMessage(signupMessage, "Completa los campos obligatorios con datos válidos.", true);
      signupForm.reportValidity();
      return;
    }

/*
  const agreeTerms = document.getElementById("agreeTerms");

  signupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (signupBtn.classList.contains("is-loading")) return;

*/
    const mismatch = signupPassword.value !== signupConfirm.value || signupPassword.value === "";
    signupError.hidden = !mismatch;
    if (mismatch) {
      signupConfirm.focus();
      return;
    }
    if (!agreeTerms.checked) {
      agreeTerms.focus();
      return;
    }

    setState("state-celebrate");
    signupBtn.classList.add("is-loading");
    try {
      const { sesionActiva } = await registrarConCorreo(
        document.getElementById("signup-name").value,
        document.getElementById("signup-email").value,
        signupPassword.value
      );

      if (sesionActiva) {
        showMessage(signupMessage, "Cuenta creada. Ya iniciaste sesión.");
        window.setTimeout(() => { window.location.href = REDIRECT_DESTINATION; }, 700);
      } else {
        showMessage(signupMessage, "Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.");
        window.setTimeout(() => showView("login"), 1400);
      }
    } catch (error) {
      console.error("Error al registrar la cuenta:", error);
      setState("state-error");
      showMessage(signupMessage, authErrorMessage(error), true);
    } finally {
      signupBtn.classList.remove("is-loading");
    }
/*
    window.setTimeout(() => {
      signupBtn.classList.remove("is-loading");
      setState(null);
    }, 1400);
*/
  });

  [signupPassword, signupConfirm].forEach((el) => {
    el.addEventListener("input", () => { signupError.hidden = true; });
  });

  // ---------------------------------------------------------------------
  // Google (ambas vistas) — inicia sesión real con Supabase y, si todo
  // sale bien, entra directo al chat conectado a la base de datos.
  // ---------------------------------------------------------------------
  document.querySelectorAll('[id^="googleBtn"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.classList.contains("is-loading")) return;
      setState("state-celebrate");
      btn.classList.add("is-loading");
      btn.disabled = true;

      try {
        await iniciarConGoogle();
        // Si no hubo error, el navegador ya está redirigiendo a Google y
        // luego volverá directo a chat.html: aquí no hay nada más que hacer.
      } catch (error) {
        console.error("Error al iniciar sesión con Google:", error);
        btn.classList.remove("is-loading");
        btn.disabled = false;
        showLoginError();
      }
    });
  });

  // ---------------------------------------------------------------------
  // Acceso de invitado: entra con una cuenta anónima de Supabase, para
  // poder usar el chat con normalidad sin necesitar una cuenta de Google.
  // ---------------------------------------------------------------------
  const guestBtn = document.getElementById("guestBtn");
  guestBtn.addEventListener("click", async () => {
    if (guestBtn.classList.contains("is-loading")) return;
    setState("state-celebrate");
    guestBtn.classList.add("is-loading");
    guestBtn.disabled = true;

    try {
      await iniciarComoInvitado();
      window.location.href = REDIRECT_DESTINATION;
    } catch (error) {
      console.error("Error al iniciar sesión como invitado:", error);
      guestBtn.classList.remove("is-loading");
      guestBtn.disabled = false;
      showLoginError();
    }
  });
})();

// ---------------------------------------------------------------------
// Si ya hay una sesión activa (Google o invitado) al cargar esta pantalla,
// no tiene sentido pedir que inicien sesión otra vez: se pasa directo al chat.
// ---------------------------------------------------------------------
window.addEventListener("ideapro-auth-state", (event) => {
  if (event.detail) {
    window.location.href = REDIRECT_DESTINATION;
  }
});

// ---------------------------------------------------------------------
// Puntitos que brillan al azar, en posiciones distintas cada vez.
// ---------------------------------------------------------------------
const sparkleContainer = document.getElementById("sparkles");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (sparkleContainer && !prefersReducedMotion) {
  function placeRandom(el) {
    el.style.top = `${Math.random() * 92 + 4}%`;
    el.style.left = `${Math.random() * 92 + 4}%`;
  }

  const SPARKLE_COUNT = 10;
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const el = document.createElement("span");
    el.className = "sparkle";
    placeRandom(el);
    el.style.animationDelay = `${Math.random() * 4}s`;
    el.style.animationDuration = `${3 + Math.random() * 3}s`;
    sparkleContainer.appendChild(el);

    // Cada vez que termina un ciclo de brillo, salta a una posición nueva
    // antes de empezar el siguiente. Así nunca se repite el mismo lugar.
    el.addEventListener("animationiteration", () => placeRandom(el));
  }
}

// ---------------------------------------------------------------------
// Modo oscuro: alterna colores y recuerda la preferencia del usuario.
// ---------------------------------------------------------------------
const themeToggle = document.getElementById("themeToggle");

function applyTheme(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
}

const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme === "dark");

themeToggle.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark-mode");
  applyTheme(isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
});
