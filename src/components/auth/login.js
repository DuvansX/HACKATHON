import {
  iniciarConGoogle,
  iniciarComoInvitado,
  iniciarConCorreo,
  registrarConCorreo,
  enviarCorreoRestablecimiento,
  actualizarContrasena,
  cerrarSesion,
  obtenerUrlDeApp
} from "../../config/supabase.js";

const REDIRECT_DESTINATION = obtenerUrlDeApp("components/chat/chat.html");
let agentNavigationStarted = false;

function esEnlaceDeRecuperacion() {
  const paramsHash = new URLSearchParams(window.location.hash.slice(1));
  const paramsQuery = new URLSearchParams(window.location.search);
  return paramsHash.get("type") === "recovery" || paramsQuery.get("type") === "recovery";
}

let isRecoveryMode = esEnlaceDeRecuperacion();

function redirectToAgentWithLoader() {
  if (agentNavigationStarted) return;
  agentNavigationStarted = true;
  sessionStorage.setItem("ideapro-navigation-direction", "to-chat");

  let loader = document.getElementById("auth-page-loader");
  if (!loader) {
    loader = document.createElement("div");
    loader.className = "auth-page-loader";
    loader.id = "auth-page-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    document.body.append(loader);
  }

  loader.setAttribute("aria-label", "Cargando agente");
  loader.dataset.keepVisible = "true";
  loader.innerHTML = '<div class="auth-page-loader-content"><div class="auth-page-loader-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><p class="auth-page-loader-label">Cargando agente…</p></div>';
  requestAnimationFrame(() => loader.classList.add("is-visible"));
  window.setTimeout(() => { window.location.href = REDIRECT_DESTINATION; }, 180);
}

(function () {
  "use strict";

  const cast = document.getElementById("cast");
  const loginView = document.getElementById("loginView");
  const signupView = document.getElementById("signupView");
  const resetView = document.getElementById("resetView");

  const STATES = ["state-email", "state-password-hidden", "state-password-shown", "state-celebrate", "state-error"];

  function setState(name) {
    STATES.forEach((s) => cast.classList.remove(s));
    if (name) cast.classList.add(name);
    cast.querySelectorAll(".pupil, .eye--dot, .char--orange .eye").forEach((eye) => {
      eye.style.removeProperty("--look-x");
      eye.style.removeProperty("--look-y");
    });
  }

  function showView(view) {
    loginView.hidden = view !== "login";
    signupView.hidden = view !== "signup";
    resetView.hidden = view !== "reset";
    const target = view === "signup" ? signupView : view === "reset" ? resetView : loginView;
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


  const lookTargets = () => cast.querySelectorAll(".pupil, .eye--dot, .char--orange .eye");

  function setLook(target, x, y) {
    target.style.setProperty("--look-x", `${x}px`);
    target.style.setProperty("--look-y", `${y}px`);
  }

  function followEmailText(input) {
    const cursor = input.selectionStart ?? input.value.length;
    const progress = Math.min(cursor / 28, 1);
    const x = 1.65 + progress * 1.15;

    lookTargets().forEach((target) => {
      const distance = target.classList.contains("pupil") ? 1 : 0.68;
      setLook(target, x * distance, 1.15 * distance);
    });
  }

  document.querySelectorAll('input[type="email"], input[type="text"]').forEach((input) => {
    const reactToEmail = () => {
      setState("state-email");
      followEmailText(input);
    };
    input.addEventListener("focus", reactToEmail);
    input.addEventListener("input", reactToEmail);
    input.addEventListener("click", reactToEmail);
    input.addEventListener("keyup", reactToEmail);
    input.addEventListener("blur", () => {
      if (!document.activeElement || document.activeElement.type !== "password") setState(null);
    });
  });

  document.querySelectorAll('input[type="password"]').forEach((input) => {
    const reactToState = () => {
      const revealed = input.type === "text";
      setState(revealed ? "state-password-shown" : "state-password-hidden");
    };
    input.addEventListener("focus", reactToState);
    input.addEventListener("input", reactToState);
    input.addEventListener("blur", () => setState(null));
  });

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

  function pointEyesAt(x, y) {
    if (cast.classList.contains("state-password-hidden") ||
      cast.classList.contains("state-password-shown")) return;

    lookTargets().forEach((target) => {
      const anchor = target.classList.contains("pupil")
        ? target.closest(".eye")
        : target.closest(".eyes");
      const rect = anchor.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(y - centerY, x - centerX);
      const distance = target.classList.contains("pupil") ? 2.7 : 1.5;

      setLook(target, Math.cos(angle) * distance, Math.sin(angle) * distance);
    });
  }

  document.addEventListener("pointermove", (e) => pointEyesAt(e.clientX, e.clientY), { passive: true });

  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest('input[type="email"], input[type="text"], input[type="password"], .eye-toggle')) {
      setState(null);
    }
  });

  function showLoginError() {
    setState("state-error");
    window.setTimeout(() => setState(null), 1200);
  }

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
      redirectToAgentWithLoader();
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

  });

  const resetForm = document.getElementById("resetForm");
  const resetBtn = document.getElementById("resetBtn");
  const resetPassword = document.getElementById("reset-password");
  const resetConfirm = document.getElementById("reset-confirm");
  const resetError = document.getElementById("resetError");
  const resetMessage = document.getElementById("resetMessage");
  const cancelReset = document.getElementById("cancelReset");

  if (isRecoveryMode) {
    showView("reset");
    showMessage(resetMessage, "Escribe tu nueva contraseña para continuar.");
  }

  window.addEventListener("ideapro-password-recovery", () => {
    isRecoveryMode = true;
    resetForm.reset();
    resetError.hidden = true;
    showView("reset");
    showMessage(resetMessage, "Escribe tu nueva contraseña para continuar.");
  });

  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (resetBtn.classList.contains("is-loading")) return;

    const mismatch = resetPassword.value !== resetConfirm.value || resetPassword.value.length < 6;
    resetError.hidden = !mismatch;
    if (mismatch) {
      resetConfirm.focus();
      return;
    }

    setState("state-celebrate");
    resetBtn.classList.add("is-loading");
    try {
      await actualizarContrasena(resetPassword.value);
      showMessage(resetMessage, "Contraseña actualizada. Entrando…");
      isRecoveryMode = false;
      window.setTimeout(redirectToAgentWithLoader, 900);
    } catch (error) {
      console.error("Error al actualizar la contraseña:", error);
      setState("state-error");
      showMessage(resetMessage, authErrorMessage(error), true);
    } finally {
      resetBtn.classList.remove("is-loading");
    }
  });

  [resetPassword, resetConfirm].forEach((el) => {
    el.addEventListener("input", () => { resetError.hidden = true; });
  });

  cancelReset.addEventListener("click", async (e) => {
    e.preventDefault();
    isRecoveryMode = false;
    try {
      await cerrarSesion();
    } catch (error) {
      console.warn("No se pudo cerrar la sesión temporal de recuperación.", error);
    }
    showView("login");
  });

  window.addEventListener("login-error", showLoginError);

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


    const mismatch = signupPassword.value !== signupConfirm.value || signupPassword.value === "";
    signupError.hidden = !mismatch;
    if (mismatch) {
      signupConfirm.focus();
      return;
    }
    if (!agreeTerms.checked) {
      agreeTerms.focus();
      showMessage(signupMessage, "Debes aceptar los Términos y la Política de privacidad para crear tu cuenta.", true);
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
        window.setTimeout(redirectToAgentWithLoader, 700);
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

  });

  [signupPassword, signupConfirm].forEach((el) => {
    el.addEventListener("input", () => { signupError.hidden = true; });
  });

  document.querySelectorAll('[id^="googleBtn"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.classList.contains("is-loading")) return;
      setState("state-celebrate");
      btn.classList.add("is-loading");
      btn.disabled = true;

      try {
        sessionStorage.setItem("ideapro-navigation-direction", "to-chat");
        await iniciarConGoogle();
      } catch (error) {
        sessionStorage.removeItem("ideapro-navigation-direction");
        console.error("Error al iniciar sesión con Google:", error);
        btn.classList.remove("is-loading");
        btn.disabled = false;
        showLoginError();
      }
    });
  });

  const guestBtn = document.getElementById("guestBtn");
  guestBtn.addEventListener("click", async () => {
    if (guestBtn.classList.contains("is-loading")) return;
    setState("state-celebrate");
    guestBtn.classList.add("is-loading");
    guestBtn.disabled = true;

    try {
      await iniciarComoInvitado();
      redirectToAgentWithLoader();
    } catch (error) {
      console.error("Error al iniciar sesión como invitado:", error);
      guestBtn.classList.remove("is-loading");
      guestBtn.disabled = false;
      showLoginError();
    }
  });
})();

window.addEventListener("ideapro-auth-state", (event) => {
  if (isRecoveryMode) return;
  if (event.detail) {
    redirectToAgentWithLoader();
  }
});

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

    el.addEventListener("animationiteration", () => placeRandom(el));
  }
}

const themeToggle = document.getElementById("themeToggle");

function applyTheme(preference) {
  const isDark = preference === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#080d17" : "#ffffff");
  themeToggle.dataset.theme = preference;
  themeToggle.setAttribute("aria-label", `Tema ${isDark ? "oscuro" : "claro"}; cambiar tema`);
  themeToggle.title = `Tema: ${isDark ? "oscuro" : "claro"}`;
}

const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme === "dark" ? "dark" : "light");

themeToggle.addEventListener("click", () => {
  const next = themeToggle.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
});
