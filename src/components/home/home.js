import { auth, iniciarConGoogle } from "../../config/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

function setDiagnosisButtonsState() {
    const buttons = document.querySelectorAll("[data-start-diagnosis]");

    buttons.forEach((button) => {
        button.hidden = false;
        button.disabled = false;
        button.setAttribute("aria-disabled", "false");
    });
}

function cacheLinkedAccount(user) {
    const email = user && user.email ? user.email : "";
    if (!email) return;

    localStorage.setItem("ideapro-gmail-email", email);
    localStorage.setItem("ideapro-gmail-name", user.displayName || email.split("@")[0] || "Google");

    if (user.photoURL) {
        localStorage.setItem("ideapro-gmail-photo", user.photoURL);
    } else {
        localStorage.removeItem("ideapro-gmail-photo");
    }

}

function startDiagnosis() {
    // Si ya hay una sesión activa (Google o invitado) entramos directo al
    // chat. Si no, mandamos a la pantalla de inicio de sesión para que la
    // persona elija cómo quiere entrar.
    const destination = auth.currentUser ? "../src/components/chat/chat.html" : "../src/components/auth/login.html";
    showPageLoader(destination);
}

function getLinkedEmail(user) {
    const directEmail = user && user.email ? user.email.trim() : "";
    if (directEmail) return directEmail;

    const storedEmail = localStorage.getItem("ideapro-gmail-email");
    return storedEmail ? storedEmail.trim() : "";
}

function getLinkedDisplayName(user) {
    if (user && user.isAnonymous) return "Invitado";

    const directName = user && user.displayName ? user.displayName.trim() : "";
    if (directName) return directName;

    const storedName = localStorage.getItem("ideapro-gmail-name");
    if (storedName) return storedName.trim();

    const email = getLinkedEmail(user);
    if (email) return email.split("@")[0] || "Cuenta";

    return "Cuenta";
}

function getLinkedPhoto(user) {
    const directPhoto = user && user.photoURL ? user.photoURL.trim() : "";
    if (directPhoto) return directPhoto;

    const storedPhoto = localStorage.getItem("ideapro-gmail-photo");
    return storedPhoto ? storedPhoto.trim() : "";
}

function updateGmailButtonState(user) {
    const buttons = document.querySelectorAll("[data-gmail-link]");
    const statusLabel = document.getElementById("gmail-status");
    const accountName = document.getElementById("gmail-user-name");
    const accountNameBottom = document.getElementById("gmail-user-name-bottom");
    const accountSubtitle = document.getElementById("gmail-user-subtitle");
    const accountAvatar = document.getElementById("gmail-user-avatar");
    const accountAvatarBottom = document.getElementById("gmail-user-avatar-bottom");
    const accountAvatarFallback = document.getElementById("gmail-user-avatar-fallback");
    const accountAvatarFallbackBottom = document.getElementById("gmail-user-avatar-fallback-bottom");
    const email = getLinkedEmail(user);
    const isLinked = Boolean(email);
    const displayName = getLinkedDisplayName(user);
    const photoURL = getLinkedPhoto(user);

    buttons.forEach((button) => {
        button.classList.toggle("is-linked", isLinked);
        button.disabled = false;
        button.textContent = isLinked ? "Cuenta de Gmail vinculada" : "Vincular con Gmail";
        button.setAttribute("aria-pressed", String(isLinked));
    });

    if (accountName) {
        accountName.textContent = displayName;
    }

    if (accountNameBottom) {
        accountNameBottom.textContent = displayName;
    }

    if (accountSubtitle) {
        accountSubtitle.textContent = user && user.isAnonymous
            ? "Sesión de invitado"
            : (isLinked ? "Cuenta conectada" : "Vincula tu cuenta");
    }

    function updateAvatar(image, fallback) {
        if (!image || !fallback) return;

        image.src = photoURL || "";
        image.hidden = !photoURL;
        fallback.hidden = Boolean(photoURL);
        image.onerror = () => {
            image.hidden = true;
            fallback.hidden = false;
        };
    }

    updateAvatar(accountAvatar, accountAvatarFallback);
    updateAvatar(accountAvatarBottom, accountAvatarFallbackBottom);

    if (statusLabel) {
        statusLabel.textContent = user && user.isAnonymous
            ? "Sesión de invitado"
            : (email ? `Cuenta vinculada correctamente: ${email}` : "Cuenta no vinculada");
    }

    if (typeof window.reloadAccountChats === "function") {
        window.reloadAccountChats();
    }
}

async function vincularConGmail() {
    const buttons = document.querySelectorAll("[data-gmail-link]");
    buttons.forEach((button) => {
        button.disabled = true;
        button.textContent = "Vinculando...";
    });

    try {
        const user = await iniciarConGoogle();
        const email = user && user.email ? user.email : "";

        if (email) {
            cacheLinkedAccount(user);

            alert("La cuenta se ha vinculado correctamente.");
        }

        updateGmailButtonState(user);
    } catch (error) {
        console.error("Error al vincular con Gmail:", error);
        if (document.getElementById("gmail-status")) {
            document.getElementById("gmail-status").textContent = "No se pudo vincular la cuenta Gmail";
        }
        alert("No se pudo vincular la cuenta de Gmail. Inténtalo de nuevo.");
    } finally {
        const buttons = document.querySelectorAll("[data-gmail-link]");
        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
}

document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-gmail-link]");
    if (!trigger) return;
    event.preventDefault();
    vincularConGmail();
});

onAuthStateChanged(auth, (user) => {
    setDiagnosisButtonsState();
    updateGmailButtonState(user);
});

window.addEventListener("ideapro-auth-state", (event) => {
    updateGmailButtonState(event.detail);
});

setDiagnosisButtonsState();
updateGmailButtonState(auth.currentUser);

let navigationInProgress = false;

function revealPageLoader() {
    let loader = document.querySelector(".page-loader");

    if (!loader) {
        loader = document.createElement("div");
        loader.className = "page-loader";
        loader.setAttribute("role", "status");
        loader.setAttribute("aria-label", "Cargando página");
        loader.innerHTML = '<div class="page-loader-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>';
        document.body.append(loader);
    }

    requestAnimationFrame(() => loader.classList.add("is-visible"));
    return loader;
}

function hidePageLoader(immediately = false) {
    document.querySelectorAll(".page-loader").forEach((loader) => {
        if (immediately) {
            loader.remove();
            return;
        }

        loader.classList.remove("is-visible");
        window.setTimeout(() => loader.remove(), 180);
    });
}

function showPageLoader(destination) {
    if (navigationInProgress) return;

    navigationInProgress = true;
    revealPageLoader();
    window.setTimeout(() => { window.location.href = destination; }, 700);
}

// Al volver con las flechas del navegador, la página puede restaurarse desde
// la caché (bfcache) con el cargador que tenía antes de salir.
window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    navigationInProgress = false;
    hidePageLoader(true);
});

window.ideaproPageLoader = {
    show: revealPageLoader,
    hide: hidePageLoader
};

function scrollToSection() {
    document.getElementById("como-funciona").scrollIntoView({
        behavior: "smooth"
    });
}

window.startDiagnosis = startDiagnosis;
window.scrollToSection = scrollToSection;

document.addEventListener("DOMContentLoaded", () => {
    const logoWord = document.querySelector("[data-logo-word]");

    if (!logoWord) {
        return;
    }

    const logoWords = ["PRO", "IA", "SANTOTO",];
    let wordIndex = 0;
    let characterIndex = logoWords[wordIndex].length;
    let isDeleting = true;

    function animateLogoWord() {
        const currentWord = logoWords[wordIndex];
        let delay;

        if (isDeleting) {
            characterIndex -= 1;
            logoWord.textContent = currentWord.slice(0, characterIndex);
            delay = 100;

            if (characterIndex === 0) {
                wordIndex = (wordIndex + 1) % logoWords.length;
                isDeleting = false;
                delay = 350;
            }
        } else {
            characterIndex += 1;
            logoWord.textContent = logoWords[wordIndex].slice(0, characterIndex);
            delay = 120;

            if (characterIndex === logoWords[wordIndex].length) {
                isDeleting = true;
                delay = 3000;
            }
        }

        window.setTimeout(animateLogoWord, delay);
    }

    window.setTimeout(animateLogoWord, 1600);
});
/* ======================================================
   Accesibilidad — panel flotante
   ====================================================== */
(() => {
    const STORAGE_KEY = "ideapro_a11y_prefs";
    const FONT_STEPS = [1, 1.125, 1.25, 1.375];

    const fab = document.getElementById("a11yToggle");
    const panel = document.getElementById("a11yPanel");
    const closeBtn = document.getElementById("a11yClose");
    const resetBtn = document.getElementById("a11yReset");
    const announce = document.getElementById("a11yAnnounce");

    const fontDecBtn = document.getElementById("a11yFontDec");
    const fontIncBtn = document.getElementById("a11yFontInc");
    const fontLevelLabel = document.getElementById("a11yFontLevel");

    const contrastBtn = document.getElementById("a11yContrast");
    const grayscaleBtn = document.getElementById("a11yGrayscale");
    const readableBtn = document.getElementById("a11yReadable");
    const cursorBtn = document.getElementById("a11yCursor");
    const linksBtn = document.getElementById("a11yLinks");
    const readLineBtn = document.getElementById("a11yReadLine");
    const motionBtn = document.getElementById("a11yMotion");
    const narratorBtn = document.getElementById("a11yNarrator");
    const readLineEl = document.getElementById("a11yReadLineEl");

    if (!fab || !panel) {
        return;
    }

    const hasFinePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

    if (cursorBtn && !hasFinePointer) {
        cursorBtn.disabled = true;
        cursorBtn.classList.add("a11y-cursor-unavailable");
        const desc = document.getElementById("a11yCursorDesc");
        if (desc) {
            desc.textContent = "Solo disponible en computadora";
        }
    }

    const defaultPrefs = {
        fontStep: 0,
        contrast: false,
        grayscale: false,
        readable: false,
        bigCursor: false,
        underlineLinks: false,
        readingLine: false,
        reduceMotion: false
    };

    function loadPrefs() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return { ...defaultPrefs, ...(saved || {}) };
        } catch (error) {
            return { ...defaultPrefs };
        }
    }

    function savePrefs(prefs) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        } catch (error) {
            /* almacenamiento no disponible: se ignora */
        }
    }

    function say(message) {
        if (announce) {
            announce.textContent = message;
        }
    }

    /* ---- Línea de lectura: sigue el cursor en el eje Y ---- */
    let readingLineActive = false;

    function onReadLineMove(event) {
        const y = event.touches ? event.touches[0].clientY : event.clientY;
        const height = readLineEl.offsetHeight || 44;
        readLineEl.style.transform = "translateY(" + (y - height / 2) + "px)";
    }

    function setReadingLine(enabled) {
        if (!readLineEl) {
            return;
        }
        document.body.classList.toggle("a11y-reading-line", enabled);

        if (enabled && !readingLineActive) {
            readLineEl.style.transform = "translateY(120px)";
            document.addEventListener("mousemove", onReadLineMove);
            document.addEventListener("touchmove", onReadLineMove, { passive: true });
            readingLineActive = true;
        } else if (!enabled && readingLineActive) {
            document.removeEventListener("mousemove", onReadLineMove);
            document.removeEventListener("touchmove", onReadLineMove);
            readingLineActive = false;
        }
    }

    let prefs = loadPrefs();

    function applyPrefs() {
        document.documentElement.style.setProperty("--a11y-scale", FONT_STEPS[prefs.fontStep]);
        fontLevelLabel.textContent = Math.round(FONT_STEPS[prefs.fontStep] * 100) + "%";
        fontDecBtn.disabled = prefs.fontStep === 0;
        fontIncBtn.disabled = prefs.fontStep === FONT_STEPS.length - 1;

        document.body.classList.toggle("a11y-contrast", prefs.contrast);
        contrastBtn.setAttribute("aria-pressed", String(prefs.contrast));

        document.body.classList.toggle("a11y-grayscale", prefs.grayscale);
        grayscaleBtn.setAttribute("aria-pressed", String(prefs.grayscale));

        document.body.classList.toggle("a11y-readable-font", prefs.readable);
        readableBtn.setAttribute("aria-pressed", String(prefs.readable));

        if (hasFinePointer) {
            document.body.classList.toggle("a11y-big-cursor", prefs.bigCursor);
        }
        if (cursorBtn) {
            cursorBtn.setAttribute("aria-pressed", String(hasFinePointer && prefs.bigCursor));
        }

        document.body.classList.toggle("a11y-underline-links", prefs.underlineLinks);
        linksBtn.setAttribute("aria-pressed", String(prefs.underlineLinks));

        setReadingLine(prefs.readingLine);
        if (readLineBtn) {
            readLineBtn.setAttribute("aria-pressed", String(prefs.readingLine));
        }

        document.body.classList.toggle("a11y-reduce-motion", prefs.reduceMotion);
        motionBtn.setAttribute("aria-pressed", String(prefs.reduceMotion));
    }

    function updatePrefs(partial) {
        prefs = { ...prefs, ...partial };
        savePrefs(prefs);
        applyPrefs();
    }

    applyPrefs();

    /* ---- Abrir / cerrar panel ---- */
    function openPanel() {
        panel.dataset.open = "true";
        fab.setAttribute("aria-expanded", "true");
        closeBtn.focus();
        document.addEventListener("keydown", onKeydown);
        document.addEventListener("click", onClickOutside, true);
    }

    function closePanel({ returnFocus = true } = {}) {
        panel.dataset.open = "false";
        fab.setAttribute("aria-expanded", "false");
        document.removeEventListener("keydown", onKeydown);
        document.removeEventListener("click", onClickOutside, true);
        if (returnFocus) {
            fab.focus();
        }
    }

    function onKeydown(event) {
        if (event.key === "Escape") {
            closePanel();
        }
    }

    function onClickOutside(event) {
        if (!panel.contains(event.target) && event.target !== fab) {
            closePanel({ returnFocus: false });
        }
    }

    fab.addEventListener("click", () => {
        const isOpen = panel.dataset.open === "true";
        if (isOpen) {
            closePanel();
        } else {
            openPanel();
        }
    });

    closeBtn.addEventListener("click", () => closePanel());

    /* ---- Tamaño de texto ---- */
    fontDecBtn.addEventListener("click", () => {
        if (prefs.fontStep > 0) {
            updatePrefs({ fontStep: prefs.fontStep - 1 });
            say("Texto más pequeño: " + fontLevelLabel.textContent);
        }
    });

    fontIncBtn.addEventListener("click", () => {
        if (prefs.fontStep < FONT_STEPS.length - 1) {
            updatePrefs({ fontStep: prefs.fontStep + 1 });
            say("Texto más grande: " + fontLevelLabel.textContent);
        }
    });

    /* ---- Interruptores ---- */
    contrastBtn.addEventListener("click", () => {
        updatePrefs({ contrast: !prefs.contrast });
        say(prefs.contrast ? "Alto contraste activado" : "Alto contraste desactivado");
    });

    grayscaleBtn.addEventListener("click", () => {
        updatePrefs({ grayscale: !prefs.grayscale });
        say(prefs.grayscale ? "Escala de grises activada" : "Escala de grises desactivada");
    });

    readableBtn.addEventListener("click", () => {
        updatePrefs({ readable: !prefs.readable });
        say(prefs.readable ? "Fuente legible activada" : "Fuente legible desactivada");
    });

    if (cursorBtn && hasFinePointer) {
        cursorBtn.addEventListener("click", () => {
            updatePrefs({ bigCursor: !prefs.bigCursor });
            say(prefs.bigCursor ? "Cursor grande activado" : "Cursor grande desactivado");
        });
    }

    linksBtn.addEventListener("click", () => {
        updatePrefs({ underlineLinks: !prefs.underlineLinks });
        say(prefs.underlineLinks ? "Enlaces resaltados" : "Enlaces sin resaltar");
    });

    if (readLineBtn) {
        readLineBtn.addEventListener("click", () => {
            updatePrefs({ readingLine: !prefs.readingLine });
            say(prefs.readingLine ? "Línea de lectura activada" : "Línea de lectura desactivada");
        });
    }

    motionBtn.addEventListener("click", () => {
        updatePrefs({ reduceMotion: !prefs.reduceMotion });
        say(prefs.reduceMotion ? "Movimiento reducido" : "Movimiento normal");
    });

    /* ---- Restablecer ---- */
    resetBtn.addEventListener("click", () => {
        prefs = { ...defaultPrefs };
        savePrefs(prefs);
        applyPrefs();
        say("Preferencias de accesibilidad restablecidas");
    });

    /* ---- Narrador (lectura en voz alta) ---- */
    if ("speechSynthesis" in window && narratorBtn) {
        const contentEl = document.getElementById("contenido");
        let utterance = null;

        function stopNarration() {
            window.speechSynthesis.cancel();
            narratorBtn.setAttribute("aria-pressed", "false");
            if (contentEl) {
                contentEl.classList.remove("a11y-speaking");
            }
        }

        narratorBtn.addEventListener("click", () => {
            const isSpeaking = window.speechSynthesis.speaking;

            if (isSpeaking) {
                stopNarration();
                say("Narrador detenido");
                return;
            }

            if (!contentEl) {
                return;
            }

            const text = contentEl.innerText.replace(/\s+/g, " ").trim();
            if (!text) {
                return;
            }

            utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "es-ES";
            utterance.rate = 1;

            utterance.onend = stopNarration;
            utterance.onerror = stopNarration;

            narratorBtn.setAttribute("aria-pressed", "true");
            contentEl.classList.add("a11y-speaking");
            say("Narrador leyendo el contenido de la página");
            window.speechSynthesis.speak(utterance);
        });
    } else if (narratorBtn) {
        narratorBtn.disabled = true;
        narratorBtn.querySelector("small").textContent = "No disponible en este navegador";
    }
})();
/*
import { auth, iniciarConGoogle } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

function setDiagnosisButtonsState() {
    const buttons = document.querySelectorAll("[data-start-diagnosis]");

    buttons.forEach((button) => {
        button.hidden = false;
        button.disabled = false;
        button.setAttribute("aria-disabled", "false");
    });
}

function cacheLinkedAccount(user) {
    const email = user && user.email ? user.email : "";
    if (!email) return;

    localStorage.setItem("ideapro-gmail-email", email);
    localStorage.setItem("ideapro-gmail-name", user.displayName || email.split("@")[0] || "Google");

    if (user.photoURL) {
        localStorage.setItem("ideapro-gmail-photo", user.photoURL);
    } else {
        localStorage.removeItem("ideapro-gmail-photo");
    }

}

function startDiagnosis() {
    // Si ya hay una sesión activa (Google o invitado) entramos directo al
    // chat. Si no, mandamos a la pantalla de inicio de sesión para que la
    // persona elija cómo quiere entrar.
    const destination = auth.currentUser ? "chat.html" : "login.html";
    showPageLoader(destination);
}

function getLinkedEmail(user) {
    const directEmail = user && user.email ? user.email.trim() : "";
    if (directEmail) return directEmail;

    const storedEmail = localStorage.getItem("ideapro-gmail-email");
    return storedEmail ? storedEmail.trim() : "";
}

function getLinkedDisplayName(user) {
    if (user && user.isAnonymous) return "Invitado";

    const directName = user && user.displayName ? user.displayName.trim() : "";
    if (directName) return directName;

    const storedName = localStorage.getItem("ideapro-gmail-name");
    if (storedName) return storedName.trim();

    const email = getLinkedEmail(user);
    if (email) return email.split("@")[0] || "Cuenta";

    return "Cuenta";
}

function getLinkedPhoto(user) {
    const directPhoto = user && user.photoURL ? user.photoURL.trim() : "";
    if (directPhoto) return directPhoto;

    const storedPhoto = localStorage.getItem("ideapro-gmail-photo");
    return storedPhoto ? storedPhoto.trim() : "";
}

function updateGmailButtonState(user) {
    const buttons = document.querySelectorAll("[data-gmail-link]");
    const statusLabel = document.getElementById("gmail-status");
    const accountName = document.getElementById("gmail-user-name");
    const accountNameBottom = document.getElementById("gmail-user-name-bottom");
    const accountSubtitle = document.getElementById("gmail-user-subtitle");
    const accountAvatar = document.getElementById("gmail-user-avatar");
    const accountAvatarBottom = document.getElementById("gmail-user-avatar-bottom");
    const accountAvatarFallback = document.getElementById("gmail-user-avatar-fallback");
    const accountAvatarFallbackBottom = document.getElementById("gmail-user-avatar-fallback-bottom");
    const email = getLinkedEmail(user);
    const isLinked = Boolean(email);
    const displayName = getLinkedDisplayName(user);
    const photoURL = getLinkedPhoto(user);

    buttons.forEach((button) => {
        button.classList.toggle("is-linked", isLinked);
        button.disabled = false;
        button.textContent = isLinked ? "Cuenta de Gmail vinculada" : "Vincular con Gmail";
        button.setAttribute("aria-pressed", String(isLinked));
    });

    if (accountName) {
        accountName.textContent = displayName;
    }

    if (accountNameBottom) {
        accountNameBottom.textContent = displayName;
    }

    if (accountSubtitle) {
        accountSubtitle.textContent = user && user.isAnonymous
            ? "Sesión de invitado"
            : (isLinked ? "Cuenta conectada" : "Vincula tu cuenta");
    }

    function updateAvatar(image, fallback) {
        if (!image || !fallback) return;

        image.src = photoURL || "";
        image.hidden = !photoURL;
        fallback.hidden = Boolean(photoURL);
        image.onerror = () => {
            image.hidden = true;
            fallback.hidden = false;
        };
    }

    updateAvatar(accountAvatar, accountAvatarFallback);
    updateAvatar(accountAvatarBottom, accountAvatarFallbackBottom);

    if (statusLabel) {
        statusLabel.textContent = user && user.isAnonymous
            ? "Sesión de invitado"
            : (email ? `Cuenta vinculada correctamente: ${email}` : "Cuenta no vinculada");
    }

    if (typeof window.reloadAccountChats === "function") {
        window.reloadAccountChats();
    }
}

async function vincularConGmail() {
    const buttons = document.querySelectorAll("[data-gmail-link]");
    buttons.forEach((button) => {
        button.disabled = true;
        button.textContent = "Vinculando...";
    });

    try {
        const user = await iniciarConGoogle();
        const email = user && user.email ? user.email : "";

        if (email) {
            cacheLinkedAccount(user);

            alert("La cuenta se ha vinculado correctamente.");
        }

        updateGmailButtonState(user);
    } catch (error) {
        console.error("Error al vincular con Gmail:", error);
        if (document.getElementById("gmail-status")) {
            document.getElementById("gmail-status").textContent = "No se pudo vincular la cuenta Gmail";
        }
        alert("No se pudo vincular la cuenta de Gmail. Inténtalo de nuevo.");
    } finally {
        const buttons = document.querySelectorAll("[data-gmail-link]");
        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
}

document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-gmail-link]");
    if (!trigger) return;
    event.preventDefault();
    vincularConGmail();
});

onAuthStateChanged(auth, (user) => {
    setDiagnosisButtonsState();
    updateGmailButtonState(user);
});

window.addEventListener("ideapro-auth-state", (event) => {
    updateGmailButtonState(event.detail);
});

setDiagnosisButtonsState();
updateGmailButtonState(auth.currentUser);

let navigationInProgress = false;

function revealPageLoader() {
    let loader = document.querySelector(".page-loader");

    if (!loader) {
        loader = document.createElement("div");
        loader.className = "page-loader";
        loader.setAttribute("role", "status");
        loader.setAttribute("aria-label", "Cargando página");
        loader.innerHTML = '<div class="page-loader-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>';
        document.body.append(loader);
    }

    requestAnimationFrame(() => loader.classList.add("is-visible"));
    return loader;
}

function hidePageLoader(immediately = false) {
    document.querySelectorAll(".page-loader").forEach((loader) => {
        if (immediately) {
            loader.remove();
            return;
        }

        loader.classList.remove("is-visible");
        window.setTimeout(() => loader.remove(), 180);
    });
}

function showPageLoader(destination) {
    if (navigationInProgress) return;

    navigationInProgress = true;
    revealPageLoader();
    window.setTimeout(() => { window.location.href = destination; }, 700);
}

// Al volver con las flechas del navegador, la página puede restaurarse desde
// la caché (bfcache) con el cargador que tenía antes de salir.
window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    navigationInProgress = false;
    hidePageLoader(true);
});

window.ideaproPageLoader = {
    show: revealPageLoader,
    hide: hidePageLoader
};

function scrollToSection() {
    document.getElementById("como-funciona").scrollIntoView({
        behavior: "smooth"
    });
}

window.startDiagnosis = startDiagnosis;
window.scrollToSection = scrollToSection;

document.addEventListener("DOMContentLoaded", () => {
    const logoWord = document.querySelector("[data-logo-word]");

    if (!logoWord) {
        return;
    }

    const logoWords = ["PRO", "IA", "SANTOTO",];
    let wordIndex = 0;
    let characterIndex = logoWords[wordIndex].length;
    let isDeleting = true;

    function animateLogoWord() {
        const currentWord = logoWords[wordIndex];
        let delay;

        if (isDeleting) {
            characterIndex -= 1;
            logoWord.textContent = currentWord.slice(0, characterIndex);
            delay = 100;

            if (characterIndex === 0) {
                wordIndex = (wordIndex + 1) % logoWords.length;
                isDeleting = false;
                delay = 350;
            }
        } else {
            characterIndex += 1;
            logoWord.textContent = logoWords[wordIndex].slice(0, characterIndex);
            delay = 120;

            if (characterIndex === logoWords[wordIndex].length) {
                isDeleting = true;
                delay = 3000;
            }
        }

        window.setTimeout(animateLogoWord, delay);
    }

    window.setTimeout(animateLogoWord, 1600);
});
/* ======================================================
   Accesibilidad — panel flotante
   ====================================================== */
(() => {
    const STORAGE_KEY = "ideapro_a11y_prefs";
    const FONT_STEPS = [1, 1.125, 1.25, 1.375];

    const fab = document.getElementById("a11yToggle");
    const panel = document.getElementById("a11yPanel");
    const closeBtn = document.getElementById("a11yClose");
    const resetBtn = document.getElementById("a11yReset");
    const announce = document.getElementById("a11yAnnounce");

    const fontDecBtn = document.getElementById("a11yFontDec");
    const fontIncBtn = document.getElementById("a11yFontInc");
    const fontLevelLabel = document.getElementById("a11yFontLevel");

    const contrastBtn = document.getElementById("a11yContrast");
    const grayscaleBtn = document.getElementById("a11yGrayscale");
    const readableBtn = document.getElementById("a11yReadable");
    const cursorBtn = document.getElementById("a11yCursor");
    const linksBtn = document.getElementById("a11yLinks");
    const readLineBtn = document.getElementById("a11yReadLine");
    const motionBtn = document.getElementById("a11yMotion");
    const narratorBtn = document.getElementById("a11yNarrator");
    const readLineEl = document.getElementById("a11yReadLineEl");

    if (!fab || !panel) {
        return;
    }

    const hasFinePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

    if (cursorBtn && !hasFinePointer) {
        cursorBtn.disabled = true;
        cursorBtn.classList.add("a11y-cursor-unavailable");
        const desc = document.getElementById("a11yCursorDesc");
        if (desc) {
            desc.textContent = "Solo disponible en computadora";
        }
    }

    const defaultPrefs = {
        fontStep: 0,
        contrast: false,
        grayscale: false,
        readable: false,
        bigCursor: false,
        underlineLinks: false,
        readingLine: false,
        reduceMotion: false
    };

    function loadPrefs() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return { ...defaultPrefs, ...(saved || {}) };
        } catch (error) {
            return { ...defaultPrefs };
        }
    }

    function savePrefs(prefs) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        } catch (error) {
            /* almacenamiento no disponible: se ignora */
        }
    }

    function say(message) {
        if (announce) {
            announce.textContent = message;
        }
    }

    /* ---- Línea de lectura: sigue el cursor en el eje Y ---- */
    let readingLineActive = false;

    function onReadLineMove(event) {
        const y = event.touches ? event.touches[0].clientY : event.clientY;
        const height = readLineEl.offsetHeight || 44;
        readLineEl.style.transform = "translateY(" + (y - height / 2) + "px)";
    }

    function setReadingLine(enabled) {
        if (!readLineEl) {
            return;
        }
        document.body.classList.toggle("a11y-reading-line", enabled);

        if (enabled && !readingLineActive) {
            readLineEl.style.transform = "translateY(120px)";
            document.addEventListener("mousemove", onReadLineMove);
            document.addEventListener("touchmove", onReadLineMove, { passive: true });
            readingLineActive = true;
        } else if (!enabled && readingLineActive) {
            document.removeEventListener("mousemove", onReadLineMove);
            document.removeEventListener("touchmove", onReadLineMove);
            readingLineActive = false;
        }
    }

    let prefs = loadPrefs();

    function applyPrefs() {
        document.documentElement.style.setProperty("--a11y-scale", FONT_STEPS[prefs.fontStep]);
        fontLevelLabel.textContent = Math.round(FONT_STEPS[prefs.fontStep] * 100) + "%";
        fontDecBtn.disabled = prefs.fontStep === 0;
        fontIncBtn.disabled = prefs.fontStep === FONT_STEPS.length - 1;

        document.body.classList.toggle("a11y-contrast", prefs.contrast);
        contrastBtn.setAttribute("aria-pressed", String(prefs.contrast));

        document.body.classList.toggle("a11y-grayscale", prefs.grayscale);
        grayscaleBtn.setAttribute("aria-pressed", String(prefs.grayscale));

        document.body.classList.toggle("a11y-readable-font", prefs.readable);
        readableBtn.setAttribute("aria-pressed", String(prefs.readable));

        if (hasFinePointer) {
            document.body.classList.toggle("a11y-big-cursor", prefs.bigCursor);
        }
        if (cursorBtn) {
            cursorBtn.setAttribute("aria-pressed", String(hasFinePointer && prefs.bigCursor));
        }

        document.body.classList.toggle("a11y-underline-links", prefs.underlineLinks);
        linksBtn.setAttribute("aria-pressed", String(prefs.underlineLinks));

        setReadingLine(prefs.readingLine);
        if (readLineBtn) {
            readLineBtn.setAttribute("aria-pressed", String(prefs.readingLine));
        }

        document.body.classList.toggle("a11y-reduce-motion", prefs.reduceMotion);
        motionBtn.setAttribute("aria-pressed", String(prefs.reduceMotion));
    }

    function updatePrefs(partial) {
        prefs = { ...prefs, ...partial };
        savePrefs(prefs);
        applyPrefs();
    }

    applyPrefs();

    /* ---- Abrir / cerrar panel ---- */
    function openPanel() {
        panel.dataset.open = "true";
        fab.setAttribute("aria-expanded", "true");
        closeBtn.focus();
        document.addEventListener("keydown", onKeydown);
        document.addEventListener("click", onClickOutside, true);
    }

    function closePanel({ returnFocus = true } = {}) {
        panel.dataset.open = "false";
        fab.setAttribute("aria-expanded", "false");
        document.removeEventListener("keydown", onKeydown);
        document.removeEventListener("click", onClickOutside, true);
        if (returnFocus) {
            fab.focus();
        }
    }

    function onKeydown(event) {
        if (event.key === "Escape") {
            closePanel();
        }
    }

    function onClickOutside(event) {
        if (!panel.contains(event.target) && event.target !== fab) {
            closePanel({ returnFocus: false });
        }
    }

    fab.addEventListener("click", () => {
        const isOpen = panel.dataset.open === "true";
        if (isOpen) {
            closePanel();
        } else {
            openPanel();
        }
    });

    closeBtn.addEventListener("click", () => closePanel());

    /* ---- Tamaño de texto ---- */
    fontDecBtn.addEventListener("click", () => {
        if (prefs.fontStep > 0) {
            updatePrefs({ fontStep: prefs.fontStep - 1 });
            say("Texto más pequeño: " + fontLevelLabel.textContent);
        }
    });

    fontIncBtn.addEventListener("click", () => {
        if (prefs.fontStep < FONT_STEPS.length - 1) {
            updatePrefs({ fontStep: prefs.fontStep + 1 });
            say("Texto más grande: " + fontLevelLabel.textContent);
        }
    });

    /* ---- Interruptores ---- */
    contrastBtn.addEventListener("click", () => {
        updatePrefs({ contrast: !prefs.contrast });
        say(prefs.contrast ? "Alto contraste activado" : "Alto contraste desactivado");
    });

    grayscaleBtn.addEventListener("click", () => {
        updatePrefs({ grayscale: !prefs.grayscale });
        say(prefs.grayscale ? "Escala de grises activada" : "Escala de grises desactivada");
    });

    readableBtn.addEventListener("click", () => {
        updatePrefs({ readable: !prefs.readable });
        say(prefs.readable ? "Fuente legible activada" : "Fuente legible desactivada");
    });

    if (cursorBtn && hasFinePointer) {
        cursorBtn.addEventListener("click", () => {
            updatePrefs({ bigCursor: !prefs.bigCursor });
            say(prefs.bigCursor ? "Cursor grande activado" : "Cursor grande desactivado");
        });
    }

    linksBtn.addEventListener("click", () => {
        updatePrefs({ underlineLinks: !prefs.underlineLinks });
        say(prefs.underlineLinks ? "Enlaces resaltados" : "Enlaces sin resaltar");
    });

    if (readLineBtn) {
        readLineBtn.addEventListener("click", () => {
            updatePrefs({ readingLine: !prefs.readingLine });
            say(prefs.readingLine ? "Línea de lectura activada" : "Línea de lectura desactivada");
        });
    }

    motionBtn.addEventListener("click", () => {
        updatePrefs({ reduceMotion: !prefs.reduceMotion });
        say(prefs.reduceMotion ? "Movimiento reducido" : "Movimiento normal");
    });

    /* ---- Restablecer ---- */
    resetBtn.addEventListener("click", () => {
        prefs = { ...defaultPrefs };
        savePrefs(prefs);
        applyPrefs();
        say("Preferencias de accesibilidad restablecidas");
    });

    /* ---- Narrador (lectura en voz alta) ---- */
    if ("speechSynthesis" in window && narratorBtn) {
        const contentEl = document.getElementById("contenido");
        let utterance = null;

        function stopNarration() {
            window.speechSynthesis.cancel();
            narratorBtn.setAttribute("aria-pressed", "false");
            if (contentEl) {
                contentEl.classList.remove("a11y-speaking");
            }
        }

        narratorBtn.addEventListener("click", () => {
            const isSpeaking = window.speechSynthesis.speaking;

            if (isSpeaking) {
                stopNarration();
                say("Narrador detenido");
                return;
            }

            if (!contentEl) {
                return;
            }

            const text = contentEl.innerText.replace(/\s+/g, " ").trim();
            if (!text) {
                return;
            }

            utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "es-ES";
            utterance.rate = 1;

            utterance.onend = stopNarration;
            utterance.onerror = stopNarration;

            narratorBtn.setAttribute("aria-pressed", "true");
            contentEl.classList.add("a11y-speaking");
            say("Narrador leyendo el contenido de la página");
            window.speechSynthesis.speak(utterance);
        });
    } else if (narratorBtn) {
        narratorBtn.disabled = true;
        narratorBtn.querySelector("small").textContent = "No disponible en este navegador";
    }
})();
*/
