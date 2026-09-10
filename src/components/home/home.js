import { auth, iniciarConGoogle, onAuthStateChanged } from "../../config/supabase.js";

function setDiagnosisButtonsState() {
    const buttons = document.querySelectorAll("[data-start-diagnosis]");

    buttons.forEach((button) => {
        button.hidden = false;
        button.disabled = false;
        button.setAttribute("aria-disabled", "false");
    });
}

function updateStartButtonCopy(user = auth.currentUser) {
    const isAuthenticated = Boolean(user);
    document.querySelectorAll("[data-start-diagnosis]").forEach((button) => {
        const label = button.querySelector(".nav-button-label");
        if (!label) return;

        button.classList.toggle("is-authenticated", isAuthenticated);
        label.textContent = isAuthenticated ? "Continuar al asistente" : "Iniciar sesión";
        button.setAttribute("aria-label", isAuthenticated ? "Continuar al asistente" : "Iniciar sesión");
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
    const destination = auth.currentUser ? "src/components/chat/chat.html" : "src/components/auth/login.html";
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

onAuthStateChanged((user) => {
    setDiagnosisButtonsState();
    updateStartButtonCopy(user);
    updateGmailButtonState(user);
});

window.addEventListener("ideapro-auth-state", (event) => {
    updateGmailButtonState(event.detail);
});

setDiagnosisButtonsState();
updateStartButtonCopy(auth.currentUser);
updateGmailButtonState(auth.currentUser);

function setupThemeToggle() {
    const themeToggle = document.getElementById("themeToggle");
    if (!themeToggle) return;

    function applyTheme(preference) {
        const isDark = preference === "dark";
        document.body.classList.toggle("light-mode", !isDark);
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
}

setupThemeToggle();

let navigationInProgress = false;

function revealPageLoader() {
    let loader = document.querySelector(".page-loader");

    if (!loader) {
        loader = document.createElement("div");
        loader.className = "page-loader";
        loader.setAttribute("role", "status");
        loader.setAttribute("aria-label", "Cargando página");
        loader.innerHTML = '<div class="page-loader-content"><div class="page-loader-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><p class="page-loader-label" hidden>Cargando agente</p></div>';
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
    const isGoingToAgent = destination.includes("components/chat/chat.html");
    if (isGoingToAgent) {
        sessionStorage.setItem("ideapro-navigation-direction", "to-chat");
    } else {
        sessionStorage.removeItem("ideapro-navigation-direction");
    }
    const loader = revealPageLoader();
    const label = loader.querySelector(".page-loader-label");
    if (label) {
        label.hidden = !isGoingToAgent;
    }
    window.setTimeout(() => { window.location.href = destination; }, 700);
}

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

document.querySelectorAll("[data-start-diagnosis]").forEach((button) => {
    button.addEventListener("click", startDiagnosis);
});

document.querySelectorAll("[data-scroll-to]").forEach((button) => {
    button.addEventListener("click", scrollToSection);
});

function setupMunicipalityMap() {
    const municipalities = document.querySelectorAll(".map-hotspots .municipality");
    const name = document.getElementById("municipality-name");
    const project = document.getElementById("municipality-project");
    const description = document.getElementById("municipality-description");
    if (!municipalities.length || !name || !project || !description) return;

    const projects = {
        "Villa de Leyva": {
            title: "Política Pública de Discapacidad e Inclusión Social 2026–2035",
            description: "Construcción de una visión territorial para la población con discapacidad, mediante metodologías novedosas de participación social y un enfoque diferenciado acorde con la normativa vigente."
        },
        "Nuevo Colón": {
            title: "Hermanamiento con Frickingen y Plan de Desarrollo 2025–2027",
            description: "Cooperación internacional con Frickingen, Alemania, para promover el desarrollo tecnológico, económico, ambiental y social; y construcción del Plan de Desarrollo Territorial “Nuevo Colón, Tierra que nos Une”, orientado al turismo, agricultura moderna, deporte, cultura y fortalecimiento institucional."
        },
        "Sáchica": {
            title: "Manual de Procedimientos del Banco de Programas y Proyectos",
            description: "Definición del proceso integral para formular y gestionar proyectos de inversión pública, alineados con las prioridades municipales y la normativa vigente."
        },
        "Miraflores": {
            title: "Manual del Banco de Programas y Proyectos de Inversión",
            description: "Diseño de un sistema eficiente y transparente para identificar, formular, ejecutar y evaluar proyectos de inversión pública orientados al desarrollo sostenible."
        },
        "Somondoco": {
            title: "Manual del Banco de Programas y Proyectos de Inversión",
            description: "Creación de un marco claro para gestionar proyectos de inversión pública, promover el desarrollo local y asegurar el uso efectivo y transparente de los recursos."
        },
        "Tunja": {
            title: "Trayectoria territorial en Boyacá",
            description: "IDEAPRO ha acompañado la construcción de capacidades y herramientas de gestión para responder a los retos de los territorios boyacenses."
        }
    };

    function selectMunicipality(item) {
        municipalities.forEach((municipality) => {
            const selected = municipality === item;
            municipality.classList.toggle("is-selected", selected);
            municipality.setAttribute("aria-pressed", String(selected));
        });
        const municipalityName = item.dataset.municipality;
        const municipalityProject = projects[municipalityName] || {
            title: "Trayectoria territorial IDEAPRO",
            description: "IDEAPRO ha desarrollado acompañamiento territorial en Boyacá. Próximamente podrás conocer más detalles de esta experiencia."
        };
        name.textContent = municipalityName;
        project.textContent = municipalityProject.title;
        description.textContent = municipalityProject.description;
    }

    municipalities.forEach((municipality) => {
        municipality.addEventListener("click", () => selectMunicipality(municipality));
        municipality.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectMunicipality(municipality);
            }
        });
    });

    const tunja = Array.from(municipalities).find((item) => item.dataset.municipality === "Tunja");
    if (tunja) selectMunicipality(tunja);
}

setupMunicipalityMap();

function setupAccessibilityMenu() {
    const toggle = document.querySelector("[data-accessibility-toggle]");
    const menu = document.getElementById("page-accessibility-menu");
    const value = document.querySelector("[data-accessibility-zoom-value]");
    const controls = document.querySelectorAll("[data-accessibility-zoom]");
    const quickOptions = document.querySelectorAll("[data-a11y-quick]");
    if (!toggle || !menu || !value || !controls.length) return;

    let zoom = 100;
    const setZoom = (nextZoom) => {
        zoom = Math.min(125, Math.max(80, nextZoom));
        document.documentElement.style.setProperty("--page-zoom", `${zoom}%`);
        value.textContent = `${zoom}%`;
    };

    const closeMenu = () => {
        menu.hidden = true;
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir herramientas de accesibilidad");
    };

    toggle.addEventListener("click", () => {
        const isOpen = menu.hidden;
        menu.hidden = !isOpen;
        toggle.classList.toggle("is-open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Cerrar herramientas de accesibilidad" : "Abrir herramientas de accesibilidad");
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".page-accessibility")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
    });

    controls.forEach((control) => control.addEventListener("click", () => {
        const action = control.dataset.accessibilityZoom;
        setZoom(action === "in" ? zoom + 10 : action === "out" ? zoom - 10 : 100);
    }));

    quickOptions.forEach((option) => option.addEventListener("click", () => {
        const className = option.dataset.a11yQuick === "contrast" ? "a11y-contrast" : "a11y-reduce-motion";
        const isEnabled = document.body.classList.toggle(className);
        option.classList.toggle("is-active", isEnabled);
        option.setAttribute("aria-pressed", String(isEnabled));
    }));

    if (window.matchMedia("(pointer: fine)").matches) {
        let leaveTimer;
        const openMenu = () => {
            window.clearTimeout(leaveTimer);
            if (menu.hidden) toggle.click();
        };
        const scheduleClose = () => { leaveTimer = window.setTimeout(closeMenu, 230); };
        toggle.addEventListener("mouseenter", openMenu);
        menu.addEventListener("mouseenter", () => window.clearTimeout(leaveTimer));
        menu.addEventListener("mouseleave", scheduleClose);
        toggle.addEventListener("mouseleave", scheduleClose);
    }
}

setupAccessibilityMenu();

document.addEventListener("DOMContentLoaded", () => {
    const logoWordsElements = document.querySelectorAll("[data-logo-word]");

    if (!logoWordsElements.length) {
        return;
    }

    const logoWords = ["PRO", "IA", "SANTOTO"];
    let wordIndex = 0;
    let characterIndex = logoWords[wordIndex].length;
    let isDeleting = true;

    function animateLogoWord() {
        const currentWord = logoWords[wordIndex];
        let delay;

        if (isDeleting) {
            characterIndex -= 1;
            logoWordsElements.forEach((element) => { element.textContent = currentWord.slice(0, characterIndex); });
            delay = 100;

            if (characterIndex === 0) {
                wordIndex = (wordIndex + 1) % logoWords.length;
                isDeleting = false;
                delay = 350;
            }
        } else {
            characterIndex += 1;
            logoWordsElements.forEach((element) => { element.textContent = logoWords[wordIndex].slice(0, characterIndex); });
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
            
        }
    }

    function say(message) {
        if (announce) {
            announce.textContent = message;
        }
    }

    
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

    
    resetBtn.addEventListener("click", () => {
        prefs = { ...defaultPrefs };
        savePrefs(prefs);
        applyPrefs();
        say("Preferencias de accesibilidad restablecidas");
    });

    
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
