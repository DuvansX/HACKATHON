import { auth } from "../../config/firebase.js";
import {
    crearChat as crearChatEnFirebase,
    eliminarChat as eliminarChatEnFirebase,
    escucharChats as escucharChatsEnFirebase,
    escucharMensajes as escucharMensajesEnFirebase,
    guardarDatosUsuario,
    guardarMensaje,
    migrarChatsLocales,
    renombrarChat as renombrarChatEnFirebase,
    actualizarEstadoChat as actualizarEstadoChatEnFirebase
} from "../shared/firebase-chat-store.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const isLocalPreview = window.location.protocol === "file:"
    || ["localhost", "127.0.0.1"].includes(window.location.hostname);

function redirectUnauthenticatedUser(user) {
    if (!user && !isLocalPreview) {
        window.location.href = "../auth/login.html";
    }
}

const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const chatForm = document.getElementById("chat-form");
const chatHistory = document.getElementById("chat-history");
const welcomeScreen = document.getElementById("welcome-screen");
const newChatBtn = document.getElementById("new-chat-btn");
const chatNavList = document.getElementById("chat-nav-list");
const pinnedChatNavList = document.getElementById("pinned-chat-nav-list");
const pinnedChatsSection = document.getElementById("pinned-chats-section");
const recentChatsLabel = document.getElementById("recent-chats-label");
const archivedChatsBtn = document.getElementById("archived-chats-btn");
const archivedChatsButtonLabel = document.getElementById("archived-chats-button-label");
const archivedChatsButtonIcon = document.getElementById("archived-chats-button-icon");
const collapsedChatsBtn = document.getElementById("collapsed-chats-btn");
const collapsedChatPopover = document.getElementById("collapsed-chat-popover");
const collapsedChatNavList = document.getElementById("collapsed-chat-nav-list");
const collapsedChatPopoverLabel = document.querySelector(".collapsed-chat-popover-label");
const menuBtn = document.getElementById("menu-btn");
const sidebar = document.querySelector(".chat-sidebar");
const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
const welcomeTitle = document.getElementById("welcome-title");
const microphoneBtn = document.getElementById("microphone-btn");
const inputHintText = document.getElementById("input-hint-text");
const chatModalBackdrop = document.getElementById("chat-modal-backdrop");
const chatModalForm = document.getElementById("chat-modal-form");
const chatModalTitle = document.getElementById("chat-modal-title");
const chatModalDescription = document.getElementById("chat-modal-description");
const chatModalNameField = document.getElementById("chat-modal-name-field");
const chatModalNameInput = document.getElementById("chat-modal-name-input");
const chatModalCancel = document.getElementById("chat-modal-cancel");
const chatModalSubmit = document.getElementById("chat-modal-submit");
const logoutBtn = document.getElementById("logout-btn");

/* En móvil el control vive directamente en la página, no dentro del encabezado.
   Así no queda atrapado debajo de la barra lateral al abrirla. */
if (menuBtn) {
    document.body.append(menuBtn);
}

const MAX_TEXTAREA_HEIGHT = 160;
const VOICE_SILENCE_TIMEOUT = 5000;
const MAX_CHAT_TITLE_LENGTH = 25;
const MAX_COLLAPSED_CHAT_COUNT = 5;
const MENSAJE_ERROR_SINCRONIZACION = "No se pudo sincronizar con Firebase. Verifica que publicaste las reglas y que iniciaste sesión con Google.";
let hasStartedConversation = false;
let recognition;
let isListening = false;
let isWaitingForResponse = false;
let isSendingMessage = false;
let speechBaseText = "";
let speechRecognitionFinalText = "";
let silenceTimer;
let sidebarAnimationTimer;
let activeChatId = null;
let chats = [];
let pendingChatAction = null;
let cancelarEscuchaChats = null;
let cancelarEscuchaMensajes = null;
let initialChatDataLoaded = false;
let isSelectingChats = false;
let selectedChatIds = new Set();
let isShowingArchivedChats = false;

function finishInitialChatLoad() {
    if (initialChatDataLoaded) return;
    initialChatDataLoaded = true;
    window.ideaproPageLoader?.hide();
}

// El historial de chats es parte de la carga inicial del asistente.
window.ideaproPageLoader?.show();

// Solo se consulta para subir una vez los chats que ya existían antes de
// activar la sincronización en Firebase. Después se elimina esta copia.
function getChatStorageKeyForEmail(email) {
    const normalized = (email || "").trim().toLowerCase();
    const safeKey = normalized ? normalized.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") : "guest";
    return `ideapro-chat-history-v1-${safeKey}`;
}

function obtenerChatsLocalesParaMigrar() {
    const email = auth.currentUser?.email;
    if (!email) return [];

    try {
        const chatsLocales = JSON.parse(window.localStorage.getItem(getChatStorageKeyForEmail(email)) || "[]");
        if (!Array.isArray(chatsLocales)) return [];

        return chatsLocales
            .filter((chat) => chat && typeof chat.id === "string" && typeof chat.title === "string" && Array.isArray(chat.messages))
            .map((chat) => ({
                id: chat.id,
                title: limitChatTitle(chat.title),
                messages: chat.messages.filter((message) => (
                    message
                    && (message.sender === "user" || message.sender === "bot")
                    && typeof message.content === "string"
                ))
            }));
    } catch (error) {
        console.warn("No se pudo leer el historial local para migrarlo.", error);
        return [];
    }
}

async function migrarHistorialLocal() {
    const email = auth.currentUser?.email;
    const chatsLocales = obtenerChatsLocalesParaMigrar();
    if (!email || !chatsLocales.length) return;

    const migrado = await migrarChatsLocales(chatsLocales);
    if (migrado) {
        window.localStorage.removeItem(getChatStorageKeyForEmail(email));
    }
}

function detenerEscuchaDeMensajes() {
    cancelarEscuchaMensajes?.();
    cancelarEscuchaMensajes = null;
}

function detenerSincronizacionChats() {
    cancelarEscuchaChats?.();
    cancelarEscuchaChats = null;
    detenerEscuchaDeMensajes();
}

function mostrarErrorDeSincronizacion() {
    if (inputHintText) inputHintText.textContent = MENSAJE_ERROR_SINCRONIZACION;
}

function renderizarMensajesDelChat(chat) {
    chatHistory.innerHTML = "";
    chat.messages.forEach((message) => appendMessage(message.sender, message.content, false));

    if (isWaitingForResponse && chat.id === activeChatId) {
        showTypingIndicator();
    }
}

function escucharMensajesDelChat(chatId) {
    detenerEscuchaDeMensajes();

    cancelarEscuchaMensajes = escucharMensajesEnFirebase(chatId, (mensajes) => {
        const chat = chats.find((item) => item.id === chatId);
        if (!chat) return;

        chat.messages = mensajes;
        if (activeChatId === chatId) renderizarMensajesDelChat(chat);
    }, (error) => {
        console.error("No se pudieron sincronizar los mensajes del chat.", error);
        mostrarErrorDeSincronizacion();
    });
}

async function iniciarSincronizacionChats() {
    const usuario = auth.currentUser;
    if (!usuario) return;

    detenerSincronizacionChats();
    chats = [];
    resetChat();

    await migrarHistorialLocal();
    if (auth.currentUser?.uid !== usuario.uid) return;

    cancelarEscuchaChats = escucharChatsEnFirebase((chatsGuardados) => {
        const mensajesActuales = new Map(chats.map((chat) => [chat.id, chat.messages || []]));
        chats = chatsGuardados.map((chat) => ({
            ...chat,
            messages: mensajesActuales.get(chat.id) || []
        }));

        if (activeChatId && !chats.some((chat) => chat.id === activeChatId)) {
            resetChat();
            return;
        }

        renderChatNav();
        finishInitialChatLoad();
    }, (error) => {
        console.error("No se pudieron sincronizar los chats de la cuenta.", error);
        mostrarErrorDeSincronizacion();
        finishInitialChatLoad();
    });
}

window.reloadAccountChats = () => {
    void iniciarSincronizacionChats();
};

function getActiveChat() {
    return chats.find((chat) => chat.id === activeChatId);
}

function createChatTitle(message) {
    return limitChatTitle(message);
}

function limitChatTitle(value) {
    const cleanTitle = String(value || "").replace(/\s+/g, " ").trim();
    return cleanTitle.length > MAX_CHAT_TITLE_LENGTH
        ? `${cleanTitle.slice(0, MAX_CHAT_TITLE_LENGTH - 1)}…`
        : cleanTitle;
}

async function createChat(message) {
    const id = window.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const chat = { id, title: createChatTitle(message), messages: [] };

    chats.unshift(chat);
    activeChatId = id;
    newChatBtn?.classList.remove("is-active");
    newChatBtn?.removeAttribute("aria-current");
    renderChatNav();

    const creado = await crearChatEnFirebase(chat);
    if (!creado) {
        chats = chats.filter((item) => item.id !== id);
        activeChatId = null;
        renderChatNav();
        throw new Error("No se pudo crear el chat en Firestore.");
    }

    escucharMensajesDelChat(id);
    return chat;
}

async function ensureActiveChat(message) {
    return getActiveChat() || createChat(message);
}

function closeChatMenus() {
    document.querySelectorAll(".chat-nav-entry.is-menu-open").forEach((entry) => {
        entry.classList.remove("is-menu-open");
        entry.querySelector(".chat-options-button")?.setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll(".chat-options-menu").forEach((menu) => {
        menu.style.removeProperty("--chat-menu-left");
        menu.style.removeProperty("--chat-menu-top");
    });
}

function setSelectionMode(enabled) {
    isSelectingChats = enabled;
    if (!enabled) selectedChatIds.clear();
    document.body.classList.toggle("is-selecting-chats", enabled);
    closeChatMenus();
    renderChatNav();
}

function setChatListView(showArchived) {
    isShowingArchivedChats = showArchived;
    if (archivedChatsBtn) {
        const nextView = showArchived ? "Chats recientes" : "Chats archivados";
        archivedChatsBtn.title = nextView;
        archivedChatsBtn.setAttribute("aria-label", `Mostrar ${nextView.toLowerCase()}`);
    }
    if (archivedChatsButtonLabel) {
        archivedChatsButtonLabel.textContent = showArchived ? "Chats recientes" : "Chats archivados";
    }
    if (archivedChatsButtonIcon) {
        archivedChatsButtonIcon.innerHTML = showArchived
            ? '<path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />'
            : '<path d="M4 7h16v13H4zM3 4h18v3H3zm6 7h6" />';
    }
    if (collapsedChatPopoverLabel) {
        collapsedChatPopoverLabel.textContent = showArchived ? "Archivados" : "Recientes";
    }
    renderChatNav();
}

function closeCollapsedChatPopover() {
    if (!collapsedChatPopover || !collapsedChatsBtn) return;

    collapsedChatPopover.hidden = true;
    collapsedChatsBtn.classList.remove("is-open");
    collapsedChatsBtn.setAttribute("aria-expanded", "false");
}

function toggleCollapsedChatPopover() {
    if (!collapsedChatPopover || !collapsedChatsBtn) return;

    const willOpen = collapsedChatPopover.hidden;
    collapsedChatPopover.hidden = !willOpen;
    collapsedChatsBtn.classList.toggle("is-open", willOpen);
    collapsedChatsBtn.setAttribute("aria-expanded", String(willOpen));
}

function closeChatModal() {
    pendingChatAction = null;
    chatModalBackdrop.hidden = true;
    document.body.classList.remove("has-chat-modal");
}

function openChatModal(action, chat) {
    pendingChatAction = { action, chatId: chat.id };
    closeChatMenus();
    const isDeleteAction = action === "delete";

    chatModalTitle.textContent = isDeleteAction ? "¿Deseas eliminar el chat?" : "Cambiar el nombre";
    chatModalDescription.replaceChildren();
    chatModalNameField.hidden = isDeleteAction;
    chatModalSubmit.classList.toggle("is-danger", isDeleteAction);
    chatModalSubmit.textContent = isDeleteAction ? "Eliminar" : "Guardar";

    if (isDeleteAction) {
        const chatName = document.createElement("strong");
        chatName.textContent = chat.title;
        chatModalDescription.append("Esto eliminará ", chatName, ".");
    } else {
        chatModalDescription.textContent = "Elige un nombre para identificar esta conversación.";
        chatModalNameInput.value = chat.title;
    }

    chatModalBackdrop.hidden = false;
    document.body.classList.add("has-chat-modal");

    if (!isDeleteAction) window.setTimeout(() => chatModalNameInput.focus(), 0);
}

async function deleteChat(chatId) {
    const isActiveChat = activeChatId === chatId;
    const eliminado = await eliminarChatEnFirebase(chatId);
    if (!eliminado) return;

    chats = chats.filter((chat) => chat.id !== chatId);

    if (isActiveChat) {
        resetChat();
        return;
    }

    renderChatNav();
}

async function updateChatState(chatId, changes) {
    const updated = await actualizarEstadoChatEnFirebase(chatId, changes);
    if (!updated) return false;
    const chat = chats.find((item) => item.id === chatId);
    if (chat) Object.assign(chat, changes);
    return true;
}

async function archiveChats(chatIds) {
    const ids = [...chatIds];
    if (!ids.length) return;
    const shouldArchive = !isShowingArchivedChats;
    const results = await Promise.all(ids.map((id) => updateChatState(id, {
        archived: shouldArchive,
        pinned: shouldArchive ? false : chats.find((chat) => chat.id === id)?.pinned
    })));
    if (shouldArchive && ids.includes(activeChatId) && results.some(Boolean)) resetChat();
    setSelectionMode(false);
    renderChatNav();
}

async function deleteChats(chatIds) {
    const ids = [...chatIds];
    if (!ids.length) return;
    await Promise.all(ids.map((id) => deleteChat(id)));
    setSelectionMode(false);
    renderChatNav();
}

function renameChat(chatId) {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;
    openChatModal("rename", chat);
}

function openChat(chatId) {
    if (isWaitingForResponse) return;

    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;

    activeChatId = chat.id;
    newChatBtn?.classList.remove("is-active");
    newChatBtn?.removeAttribute("aria-current");
    startConversation();
    renderizarMensajesDelChat(chat);
    escucharMensajesDelChat(chat.id);
    renderChatNav();
}

function createChatNavEntry(chat, isCollapsedMenu = false) {
    const entry = document.createElement("div");
    entry.className = isCollapsedMenu ? "collapsed-chat-nav-entry" : "chat-nav-entry";

    const chatButton = document.createElement("button");
    chatButton.className = isCollapsedMenu ? "collapsed-chat-nav-item" : "chat-nav-item";
    chatButton.type = "button";
    chatButton.setAttribute("aria-label", `${isSelectingChats ? "Seleccionar" : "Abrir"} chat: ${chat.title}`);

    if (!isCollapsedMenu && isSelectingChats) {
        const selectionMark = document.createElement("span");
        selectionMark.className = "chat-select-checkbox";
        selectionMark.setAttribute("aria-hidden", "true");
        selectionMark.textContent = selectedChatIds.has(chat.id) ? "✓" : "";
        chatButton.setAttribute("aria-pressed", String(selectedChatIds.has(chat.id)));
        chatButton.appendChild(selectionMark);
    } else if (!isCollapsedMenu) {
        chatButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 8.7 3.9 8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>';
    }

    const title = document.createElement("span");
    title.className = isCollapsedMenu ? "collapsed-chat-nav-title" : "chat-nav-title";
    title.textContent = chat.title;
    chatButton.appendChild(title);

    if (chat.id === activeChatId) {
        chatButton.classList.add("is-active");
        chatButton.setAttribute("aria-current", "page");
    }

    chatButton.addEventListener("click", () => {
        if (isSelectingChats) {
            if (selectedChatIds.has(chat.id)) selectedChatIds.delete(chat.id);
            else selectedChatIds.add(chat.id);
            renderChatNav();
            return;
        }
        closeCollapsedChatPopover();
        openChat(chat.id);
    });

    entry.appendChild(chatButton);
    if (isCollapsedMenu) return entry;

    const optionsButton = document.createElement("button");
    optionsButton.className = "chat-options-button";
    optionsButton.type = "button";
    optionsButton.textContent = "⋯";
    optionsButton.setAttribute("aria-label", `Opciones para ${chat.title}`);
    optionsButton.setAttribute("aria-expanded", "false");
    optionsButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = !entry.classList.contains("is-menu-open");
        closeChatMenus();
        entry.classList.toggle("is-menu-open", willOpen);

        if (willOpen) {
            const buttonBounds = optionsButton.getBoundingClientRect();
            const menuBounds = optionsMenu.getBoundingClientRect();
            const viewportPadding = 10;
            const hasRoomOnTheRight = window.innerWidth - buttonBounds.right >= menuBounds.width + viewportPadding;
            const left = hasRoomOnTheRight
                ? buttonBounds.right + 8
                : Math.max(viewportPadding, buttonBounds.right - menuBounds.width);
            const maxTop = Math.max(viewportPadding, window.innerHeight - menuBounds.height - viewportPadding);
            const top = Math.min(
                Math.max(viewportPadding, buttonBounds.top),
                maxTop
            );

            optionsMenu.style.setProperty("--chat-menu-left", `${left}px`);
            optionsMenu.style.setProperty("--chat-menu-top", `${top}px`);
        }

        optionsButton.setAttribute("aria-expanded", String(willOpen));
    });

    const optionsMenu = document.createElement("div");
    optionsMenu.className = "chat-options-menu";
    optionsMenu.setAttribute("role", "menu");

    if (isSelectingChats) {
        const count = selectedChatIds.size;
        const archiveAction = isShowingArchivedChats ? "Desarchivar seleccionados" : "Archivar seleccionados";

        const archiveSelectedButton = document.createElement("button");
        archiveSelectedButton.type = "button";
        archiveSelectedButton.disabled = count === 0;
        archiveSelectedButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zm6 7h6" /></svg><span>${archiveAction}</span>`;
        archiveSelectedButton.setAttribute("role", "menuitem");
        archiveSelectedButton.addEventListener("click", () => void archiveChats(selectedChatIds));

        const deleteSelectedButton = document.createElement("button");
        deleteSelectedButton.type = "button";
        deleteSelectedButton.disabled = count === 0;
        deleteSelectedButton.className = "is-danger";
        deleteSelectedButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg><span>Eliminar seleccionados</span>';
        deleteSelectedButton.setAttribute("role", "menuitem");
        deleteSelectedButton.addEventListener("click", () => {
            if (!count || !window.confirm(`¿Eliminar ${count} chat${count === 1 ? "" : "s"} seleccionados? Esta acción no se puede deshacer.`)) return;
            void deleteChats(selectedChatIds);
        });

        const cancelSelectionButton = document.createElement("button");
        cancelSelectionButton.type = "button";
        cancelSelectionButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg><span>Cancelar selección</span>';
        cancelSelectionButton.setAttribute("role", "menuitem");
        cancelSelectionButton.addEventListener("click", () => setSelectionMode(false));

        optionsMenu.append(archiveSelectedButton, deleteSelectedButton, cancelSelectionButton);
        entry.append(optionsButton, optionsMenu);
        return entry;
    }

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg><span>Cambiar el nombre</span>';
    renameButton.setAttribute("role", "menuitem");
    renameButton.addEventListener("click", () => renameChat(chat.id));

    const pinButton = document.createElement("button");
    pinButton.type = "button";
    pinButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13v8M8 4h8l-1 5 3 3v1H6v-1l3-3-1-5Z" /></svg><span>${chat.pinned ? "Desanclar" : "Anclar"}</span>`;
    pinButton.setAttribute("role", "menuitem");
    pinButton.addEventListener("click", async () => {
        await updateChatState(chat.id, { pinned: !chat.pinned, archived: false });
        closeChatMenus();
        renderChatNav();
    });

    const archiveButton = document.createElement("button");
    archiveButton.type = "button";
    archiveButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zm6 7h6" /></svg><span>${chat.archived ? "Desarchivar" : "Archivar"}</span>`;
    archiveButton.setAttribute("role", "menuitem");
    archiveButton.addEventListener("click", async () => {
        const wasArchived = chat.archived;
        await updateChatState(chat.id, { archived: !wasArchived, pinned: wasArchived ? chat.pinned : false });
        if (!wasArchived && activeChatId === chat.id) resetChat();
        closeChatMenus();
        renderChatNav();
    });

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg><span>Seleccionar</span>';
    selectButton.setAttribute("role", "menuitem");
    selectButton.addEventListener("click", () => {
        selectedChatIds = new Set([chat.id]);
        setSelectionMode(true);
    });

    const divider = document.createElement("span");
    divider.className = "chat-options-divider";
    divider.setAttribute("aria-hidden", "true");

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg><span>Eliminar</span>';
    deleteButton.className = "is-danger";
    deleteButton.setAttribute("role", "menuitem");
    deleteButton.addEventListener("click", () => openChatModal("delete", chat));

    optionsMenu.append(renameButton, selectButton, pinButton, archiveButton, divider, deleteButton);
    entry.append(optionsButton, optionsMenu);
    return entry;
}

function renderChatNav() {
    chatNavList?.replaceChildren();
    pinnedChatNavList?.replaceChildren();
    collapsedChatNavList?.replaceChildren();

    const activeChats = chats.filter((chat) => !chat.archived);
    const pinnedChats = activeChats.filter((chat) => chat.pinned);
    const recentChats = activeChats.filter((chat) => !chat.pinned);
    const archivedChats = chats.filter((chat) => chat.archived);
    const visibleChats = isShowingArchivedChats ? archivedChats : activeChats;

    pinnedChatsSection.hidden = isShowingArchivedChats || pinnedChats.length === 0;
    // El encabezado identifica siempre el historial que se está consultando,
    // aunque todavía no tenga conversaciones.
    recentChatsLabel.hidden = false;
    recentChatsLabel.textContent = isShowingArchivedChats ? "Archivados" : "Recientes";

    if (isShowingArchivedChats) {
        archivedChats.forEach((chat) => chatNavList?.appendChild(createChatNavEntry(chat)));
    } else {
        pinnedChats.forEach((chat) => pinnedChatNavList?.appendChild(createChatNavEntry(chat)));
        recentChats.forEach((chat) => chatNavList?.appendChild(createChatNavEntry(chat)));
    }

    visibleChats.slice(0, MAX_COLLAPSED_CHAT_COUNT).forEach((chat) => {
        collapsedChatNavList?.appendChild(createChatNavEntry(chat, true));
    });
}

function setDynamicWelcome(user = auth.currentUser) {
    const hour = new Date().getHours();
    let greeting;

    if (hour >= 5 && hour < 12) {
        greeting = "Buenos días";
    } else if (hour >= 12 && hour < 19) {
        greeting = "Buenas tardes";
    } else {
        greeting = "Buenas noches";
    }

    const name = String(user?.displayName || "").trim().split(/\s+/)[0];
    const welcomeOptions = name
        ? [
            `${greeting}, ${name}. ¿Qué analizamos hoy?`,
            `Hola, ${name}. ¿Qué oportunidad revisamos hoy?`,
            `${name}, cuéntame en qué etapa está tu empresa.`,
            `Qué gusto verte, ${name}. ¿Cómo impulsamos tu empresa hoy?`,
            `${name}, exploremos nuevas oportunidades para tu empresa.`,
            `Bienvenido de nuevo, ${name}. ¿Por dónde empezamos?`,
            `${name}, estoy listo para analizar tu próximo paso.`,
            `Hola, ${name}. Convirtamos tus ideas en oportunidades.`,
            `${name}, ¿qué proceso público quieres revisar?`,
            `Trabajemos en una ruta clara para tu empresa, ${name}.`,
            `${name}, cuéntame qué necesitas resolver hoy.`,
            `Hola, ${name}. Revisemos dónde está la mejor oportunidad.`,
            `${name}, construyamos una estrategia para avanzar.`,
            `Bienvenido, ${name}. Estoy aquí para ayudarte a decidir.`
        ]
        : [
            `${greeting}. ¿Qué analizamos hoy?`,
            "Hola, bienvenido. ¿Qué oportunidad quieres explorar?",
            "Cuéntame sobre tu empresa y empecemos a analizarla.",
            "¿Listo para encontrar tu siguiente oportunidad pública?",
            "Explora cómo llevar tu empresa al mercado público.",
            "Analicemos el siguiente paso para tu empresa.",
            "Estoy listo para convertir tus ideas en una ruta clara.",
            "Cuéntame qué reto quieres resolver hoy.",
            "Descubramos oportunidades que encajen con tu empresa.",
            "¿Quieres saber qué tan preparada está tu empresa?",
            "Empecemos por entender tus objetivos de crecimiento.",
            "Revisemos juntos tu potencial en contratación pública.",
            "Dime qué necesitas y encontraremos un buen camino.",
            "Tu próxima oportunidad puede empezar con una pregunta."
        ];

    welcomeTitle.textContent = welcomeOptions[Math.floor(Math.random() * welcomeOptions.length)];
}

function setSendButtonState() {
    sendBtn.disabled = isSendingMessage || isWaitingForResponse || !inputField.value.trim();
}

function resizeInput() {
    inputField.style.height = "auto";
    inputField.style.height = `${Math.min(inputField.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
}

function setVoiceState(listening, message) {
    isListening = listening;
    microphoneBtn.classList.toggle("is-listening", listening);
    microphoneBtn.setAttribute("aria-pressed", String(listening));
    microphoneBtn.setAttribute("aria-label", listening ? "Detener dictado por voz" : "Dictar mensaje por voz");
    microphoneBtn.title = listening ? "Detener dictado" : "Dictar mensaje por voz";
    inputHintText.textContent = message || "IDEAPRO Copilot puede cometer errores. Verifica la información importante.";
}

function clearSilenceTimer() {
    window.clearTimeout(silenceTimer);
}

function stopVoiceRecognition(message) {
    clearSilenceTimer();

    if (isListening && recognition) {
        setVoiceState(false, message);
        recognition.stop();
    }
}

function resetSilenceTimer() {
    clearSilenceTimer();
    silenceTimer = window.setTimeout(() => {
        stopVoiceRecognition("Pausé el dictado después de 5 segundos de silencio.");
    }, VOICE_SILENCE_TIMEOUT);
}

function setupVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        microphoneBtn.disabled = true;
        microphoneBtn.title = "El dictado por voz no está disponible en este navegador";
        microphoneBtn.setAttribute("aria-label", "El dictado por voz no está disponible en este navegador");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "es-CO";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        setVoiceState(true, "Escuchando… se pausará tras 5 segundos de silencio.");
        resetSilenceTimer();
    };

    recognition.onspeechstart = clearSilenceTimer;
    recognition.onspeechend = resetSilenceTimer;

    recognition.onresult = (event) => {
        let textoFinal = "";
        let textoParcial = "";

        for (let index = 0; index < event.results.length; index += 1) {
            const texto = event.results[index][0].transcript.trim();
            if (!texto) continue;

            if (event.results[index].isFinal) {
                textoFinal += `${texto} `;
            } else {
                textoParcial += `${texto} `;
            }
        }

        // El navegador vuelve a enviar los resultados anteriores en cada evento.
        // Se reconstruye la frase completa para que "hola" no termine como
        // "hola hola hola" mientras se sigue escuchando.
        speechRecognitionFinalText = textoFinal.trim();
        inputField.value = [speechBaseText, speechRecognitionFinalText, textoParcial.trim()]
            .filter(Boolean)
            .join(" ");
        resizeInput();
        setSendButtonState();
        resetSilenceTimer();
    };

    recognition.onerror = (event) => {
        const message = event.error === "not-allowed"
            ? "No se concedió permiso para usar el micrófono."
            : "No pudimos escuchar el dictado. Inténtalo de nuevo.";
        clearSilenceTimer();
        setVoiceState(false, message);
    };

    recognition.onend = () => {
        clearSilenceTimer();
        if (isListening) setVoiceState(false, "Dictado agregado al mensaje.");
    };

    microphoneBtn.addEventListener("click", () => {
        if (isListening) {
            stopVoiceRecognition("Dictado agregado al mensaje.");
            return;
        }

        speechBaseText = inputField.value.trim();
        speechRecognitionFinalText = "";

        try {
            recognition.start();
        } catch (error) {
            clearSilenceTimer();
            setVoiceState(false, "El dictado ya se estaba iniciando. Inténtalo de nuevo.");
        }
    });
}

function startConversation() {
    if (hasStartedConversation) return;

    hasStartedConversation = true;
    document.body.classList.add("is-conversation");
    welcomeScreen.classList.add("is-hidden");
    chatHistory.classList.add("has-messages");
}

function createAvatar() {
    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";

    const image = document.createElement("img");
    image.src = "../../assets/images/IA%20icono.png";
    image.alt = "IDEAPRO Copilot";
    avatar.appendChild(image);

    return avatar;
}

function appendMessage(sender, content, saveMessage = true) {
    const row = document.createElement("article");
    row.className = `message-row ${sender === "user" ? "user-row" : "bot-row"}`;

    if (sender === "bot") row.appendChild(createAvatar());

    const message = document.createElement("div");
    message.className = `message ${sender}`;
    message.innerHTML = content;

    if (sender === "bot") {
        const actions = document.createElement("div");
        actions.className = "bot-follow-up-actions";

        const followUpActions = [
            ["Profundizar", "Profundiza la respuesta anterior con ejemplos y pasos concretos."],
            ["Crear plan", "Convierte la recomendación anterior en un plan de acción priorizado para mi empresa."]
        ];

        followUpActions.forEach(([label, prompt]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.addEventListener("click", () => {
                inputField.value = prompt;
                resizeInput();
                setSendButtonState();
                inputField.focus();
            });
            actions.appendChild(button);
        });

        message.appendChild(actions);
    }
    row.appendChild(message);

    chatHistory.appendChild(row);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    if (saveMessage) {
        const activeChat = getActiveChat();
        if (!activeChat) return;

        activeChat.messages.push({ sender, content });
    }
}

function mostrarMensajeSinDuplicarlo(chatId, sender, content) {
    if (activeChatId !== chatId) return;

    const chat = getActiveChat();
    const mensajes = chat?.messages || [];
    const ultimoMensaje = mensajes[mensajes.length - 1];

    if (ultimoMensaje?.sender === sender && ultimoMensaje.content === content) return;
    appendMessage(sender, content);
}

function showTypingIndicator() {
    const row = document.createElement("article");
    row.className = "message-row bot-row";
    row.id = "typing-indicator";
    row.appendChild(createAvatar());

    const typing = document.createElement("div");
    typing.className = "typing-indicator";
    typing.setAttribute("aria-label", "IDEAPRO está analizando tu consulta");

    const label = document.createElement("span");
    label.className = "typing-label";
    label.textContent = "IDEAPRO está analizando tu consulta";

    const dots = document.createElement("span");
    dots.className = "typing-dots";

    for (let index = 0; index < 3; index += 1) {
        dots.appendChild(document.createElement("i"));
    }

    typing.append(label, dots);
    row.appendChild(typing);
    chatHistory.appendChild(row);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function removeTypingIndicator() {
    document.getElementById("typing-indicator")?.remove();
}

function getPlaceholderReply(message) {
    const summary = message.length > 110 ? `${message.slice(0, 110)}…` : message;
    return `Gracias. Ya registré tu consulta: “${summary}”. Cuando conectemos el flujo del bot, aquí recibirás un análisis con recomendaciones y los próximos pasos para tu empresa.`;
}

async function sendMessage(message = inputField.value.trim()) {
    if (!message || isSendingMessage || isWaitingForResponse) return;

    if (!auth.currentUser) {
        if (inputHintText) {
            inputHintText.textContent = "Inicia sesión con Google para guardar y sincronizar tus chats.";
        }
        return;
    }

    // Se bloquea antes de esperar a Firebase. Así dos clics rápidos, o Enter
    // seguido de un clic, no pueden iniciar dos envíos del mismo mensaje.
    isSendingMessage = true;
    setSendButtonState();

    if (isListening && recognition) {
        stopVoiceRecognition();
    }

    let activeChat;
    try {
        activeChat = await ensureActiveChat(message);
    } catch (error) {
        console.error("No se pudo iniciar el chat en Firestore.", error);
        mostrarErrorDeSincronizacion();
        isSendingMessage = false;
        setSendButtonState();
        return;
    }

    const requestChatId = activeChat.id;

    isWaitingForResponse = true;
    startConversation();
    appendMessage("user", message);
    inputField.value = "";
    resizeInput();
    setSendButtonState();
    showTypingIndicator();

    try {
        const mensajeGuardado = await guardarMensaje(requestChatId, "user", message);
        if (!mensajeGuardado) throw new Error("No se pudo guardar el mensaje del usuario.");

        // 1. Enviamos el mensaje a la URL de prueba de tu Webhook en n8n
        const response = await fetch("https://facecloth-carton-chafe.ngrok-free.dev/webhook/ideapro-chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({
                sessionId: "sesion-hackathon",
                chatInput: message
            })
        });

        if (!response.ok) throw new Error("Error en la conexión con n8n");

        // 2. Recibimos la respuesta de la IA
        const data = await response.json();

        // 3. Mostramos la respuesta (n8n suele enviarla en la variable 'output')
        // Convertimos los saltos de línea (\n) en <br> porque el mensaje se
        // inserta como HTML (innerHTML) y el navegador ignora los \n normales.
        const textoCrudo = data.output || data.text || data.response || "Recibí la respuesta, pero no encontré el texto.";
        const botReply = textoCrudo.replace(/\n/g, "<br>");
        const respuestaGuardada = await guardarMensaje(requestChatId, "bot", botReply);
        if (!respuestaGuardada) throw new Error("No se pudo guardar la respuesta del Copilot.");

        isWaitingForResponse = false;
        if (activeChatId === requestChatId) {
            removeTypingIndicator();
            mostrarMensajeSinDuplicarlo(requestChatId, "bot", botReply);
        }

    } catch (error) {
        console.error("Error del bot:", error);
        const mensajeError = "⚠️ <strong>Error de conexión:</strong> No pude contactar a los servidores. Asegúrate de presionar 'Execute workflow' en n8n.";

        await guardarMensaje(requestChatId, "bot", mensajeError);
        isWaitingForResponse = false;
        if (activeChatId === requestChatId) {
            removeTypingIndicator();
            mostrarMensajeSinDuplicarlo(requestChatId, "bot", mensajeError);
        }
    } finally {
        isWaitingForResponse = false;
        isSendingMessage = false;
        setSendButtonState();
    }
}

function resetChat() {
    if (isListening && recognition) stopVoiceRecognition();

    detenerEscuchaDeMensajes();
    activeChatId = null;
    newChatBtn?.classList.add("is-active");
    newChatBtn?.setAttribute("aria-current", "page");
    chatHistory.innerHTML = "";
    hasStartedConversation = false;
    document.body.classList.remove("is-conversation");
    chatHistory.classList.remove("has-messages");
    welcomeScreen.classList.remove("is-hidden");
    inputField.value = "";
    resizeInput();
    setSendButtonState();
    renderChatNav();
    inputField.focus();
}

inputField.addEventListener("input", () => {
    resizeInput();
    setSendButtonState();
});

inputField.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
        inputField.value = button.dataset.prompt;
        resizeInput();
        setSendButtonState();
        inputField.focus();
    });
});

newChatBtn?.addEventListener("click", () => {
    closeCollapsedChatPopover();
    resetChat();
});

collapsedChatsBtn?.addEventListener("click", () => {
    toggleCollapsedChatPopover();
});

function setSidebarToggleState(isCollapsed) {
    const action = isCollapsed ? "Abrir" : "Contraer";
    sidebarToggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
    sidebarToggleBtn.setAttribute("aria-label", `${action} barra lateral`);
}

sidebarToggleBtn?.addEventListener("click", () => {
    if (document.body.classList.contains("sidebar-opening") || document.body.classList.contains("sidebar-closing")) return;

    const isCollapsed = document.body.classList.contains("sidebar-collapsed");
    window.clearTimeout(sidebarAnimationTimer);

    if (isCollapsed) {
        closeCollapsedChatPopover();
        document.body.classList.remove("sidebar-collapsed");
        document.body.classList.add("sidebar-opening");
        setSidebarToggleState(false);
        sidebarAnimationTimer = window.setTimeout(() => {
            document.body.classList.remove("sidebar-opening");
        }, 190);
        return;
    }

    closeCollapsedChatPopover();
    document.body.classList.add("sidebar-closing");
    sidebarAnimationTimer = window.setTimeout(() => {
        document.body.classList.add("sidebar-collapsed");
        document.body.classList.remove("sidebar-closing");
        setSidebarToggleState(true);
    }, 130);
});

menuBtn?.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    document.body.classList.toggle("sidebar-open", isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
});

sidebarCloseBtn?.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    document.body.classList.remove("sidebar-open");
    menuBtn?.setAttribute("aria-expanded", "false");
});

document.addEventListener("click", (event) => {
    if (!sidebar.classList.contains("is-open")) return;
    if (!sidebar.contains(event.target) && !menuBtn.contains(event.target)) {
        sidebar.classList.remove("is-open");
        document.body.classList.remove("sidebar-open");
        menuBtn.setAttribute("aria-expanded", "false");
    }
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".chat-nav-entry")) closeChatMenus();
});

document.addEventListener("click", (event) => {
    if (!event.target.closest("#collapsed-chats-btn, #collapsed-chat-popover")) {
        closeCollapsedChatPopover();
    }
});

chatModalCancel?.addEventListener("click", closeChatModal);

archivedChatsBtn?.addEventListener("click", () => {
    setChatListView(!isShowingArchivedChats);
    if (document.body.classList.contains("sidebar-collapsed")) {
        sidebarToggleBtn?.click();
    }
});

chatModalBackdrop?.addEventListener("click", (event) => {
    if (event.target === chatModalBackdrop) closeChatModal();
});

chatModalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingChatAction) return;

    const { action, chatId } = pendingChatAction;
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return closeChatModal();

    if (action === "rename") {
        const newTitle = chatModalNameInput.value.trim();
        if (!newTitle) {
            chatModalNameInput.focus();
            return;
        }

        const tituloActualizado = limitChatTitle(newTitle);
        const actualizado = await renombrarChatEnFirebase(chat.id, tituloActualizado);
        if (!actualizado) return;

        chat.title = tituloActualizado;
        closeChatModal();
        renderChatNav();
        return;
    }

    closeChatModal();
    deleteChat(chat.id);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !chatModalBackdrop.hidden) closeChatModal();
    if (event.key === "Escape") closeCollapsedChatPopover();
});

logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;

    try {
        await signOut(auth);
    } catch (error) {
        console.error("No se pudo cerrar la sesión.", error);
        logoutBtn.disabled = false;
    }
});

onAuthStateChanged(auth, (user) => {
    redirectUnauthenticatedUser(user);

    if (user) {
        setDynamicWelcome(user);
        void guardarDatosUsuario().then((guardado) => {
            if (!guardado) mostrarErrorDeSincronizacion();
        });
        void iniciarSincronizacionChats();
        return;
    }

    detenerSincronizacionChats();
    chats = [];
    resetChat();
    finishInitialChatLoad();
});

resizeInput();
setSendButtonState();
setDynamicWelcome();
resetChat();
setupVoiceRecognition();

window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    window.ideaproPageLoader?.hide(true);
});

document.querySelectorAll(".back-link, .chat-brand").forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        window.ideaproPageLoader?.show();
        window.setTimeout(() => { window.location.href = link.href; }, 700);
    });
});
/*
import { auth } from "./firebase.js";
import {
    crearChat as crearChatEnFirebase,
    eliminarChat as eliminarChatEnFirebase,
    escucharChats as escucharChatsEnFirebase,
    escucharMensajes as escucharMensajesEnFirebase,
    guardarDatosUsuario,
    guardarMensaje,
    migrarChatsLocales,
    renombrarChat as renombrarChatEnFirebase,
    actualizarEstadoChat as actualizarEstadoChatEnFirebase
} from "./JS/Save.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const isLocalPreview = window.location.protocol === "file:"
    || ["localhost", "127.0.0.1"].includes(window.location.hostname);

function redirectUnauthenticatedUser(user) {
    if (!user && !isLocalPreview) {
        window.location.href = "login.html";
    }
}

const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const chatForm = document.getElementById("chat-form");
const chatHistory = document.getElementById("chat-history");
const welcomeScreen = document.getElementById("welcome-screen");
const newChatBtn = document.getElementById("new-chat-btn");
const chatNavList = document.getElementById("chat-nav-list");
const pinnedChatNavList = document.getElementById("pinned-chat-nav-list");
const pinnedChatsSection = document.getElementById("pinned-chats-section");
const recentChatsLabel = document.getElementById("recent-chats-label");
const archivedChatsBtn = document.getElementById("archived-chats-btn");
const archivedChatsButtonLabel = document.getElementById("archived-chats-button-label");
const archivedChatsButtonIcon = document.getElementById("archived-chats-button-icon");
const collapsedChatsBtn = document.getElementById("collapsed-chats-btn");
const collapsedChatPopover = document.getElementById("collapsed-chat-popover");
const collapsedChatNavList = document.getElementById("collapsed-chat-nav-list");
const collapsedChatPopoverLabel = document.querySelector(".collapsed-chat-popover-label");
const menuBtn = document.getElementById("menu-btn");
const sidebar = document.querySelector(".chat-sidebar");
const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
const welcomeTitle = document.getElementById("welcome-title");
const microphoneBtn = document.getElementById("microphone-btn");
const inputHintText = document.getElementById("input-hint-text");
const chatModalBackdrop = document.getElementById("chat-modal-backdrop");
const chatModalForm = document.getElementById("chat-modal-form");
const chatModalTitle = document.getElementById("chat-modal-title");
const chatModalDescription = document.getElementById("chat-modal-description");
const chatModalNameField = document.getElementById("chat-modal-name-field");
const chatModalNameInput = document.getElementById("chat-modal-name-input");
const chatModalCancel = document.getElementById("chat-modal-cancel");
const chatModalSubmit = document.getElementById("chat-modal-submit");
const logoutBtn = document.getElementById("logout-btn");

/* En móvil el control vive directamente en la página, no dentro del encabezado.
   Así no queda atrapado debajo de la barra lateral al abrirla. */
if (menuBtn) {
    document.body.append(menuBtn);
}

const MAX_TEXTAREA_HEIGHT = 160;
const VOICE_SILENCE_TIMEOUT = 5000;
const MAX_CHAT_TITLE_LENGTH = 25;
const MAX_COLLAPSED_CHAT_COUNT = 5;
const MENSAJE_ERROR_SINCRONIZACION = "No se pudo sincronizar con Firebase. Verifica que publicaste las reglas y que iniciaste sesión con Google.";
let hasStartedConversation = false;
let recognition;
let isListening = false;
let isWaitingForResponse = false;
let isSendingMessage = false;
let speechBaseText = "";
let speechRecognitionFinalText = "";
let silenceTimer;
let sidebarAnimationTimer;
let activeChatId = null;
let chats = [];
let pendingChatAction = null;
let cancelarEscuchaChats = null;
let cancelarEscuchaMensajes = null;
let initialChatDataLoaded = false;
let isSelectingChats = false;
let selectedChatIds = new Set();
let isShowingArchivedChats = false;

function finishInitialChatLoad() {
    if (initialChatDataLoaded) return;
    initialChatDataLoaded = true;
    window.ideaproPageLoader?.hide();
}

// El historial de chats es parte de la carga inicial del asistente.
window.ideaproPageLoader?.show();

// Solo se consulta para subir una vez los chats que ya existían antes de
// activar la sincronización en Firebase. Después se elimina esta copia.
function getChatStorageKeyForEmail(email) {
    const normalized = (email || "").trim().toLowerCase();
    const safeKey = normalized ? normalized.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") : "guest";
    return `ideapro-chat-history-v1-${safeKey}`;
}

function obtenerChatsLocalesParaMigrar() {
    const email = auth.currentUser?.email;
    if (!email) return [];

    try {
        const chatsLocales = JSON.parse(window.localStorage.getItem(getChatStorageKeyForEmail(email)) || "[]");
        if (!Array.isArray(chatsLocales)) return [];

        return chatsLocales
            .filter((chat) => chat && typeof chat.id === "string" && typeof chat.title === "string" && Array.isArray(chat.messages))
            .map((chat) => ({
                id: chat.id,
                title: limitChatTitle(chat.title),
                messages: chat.messages.filter((message) => (
                    message
                    && (message.sender === "user" || message.sender === "bot")
                    && typeof message.content === "string"
                ))
            }));
    } catch (error) {
        console.warn("No se pudo leer el historial local para migrarlo.", error);
        return [];
    }
}

async function migrarHistorialLocal() {
    const email = auth.currentUser?.email;
    const chatsLocales = obtenerChatsLocalesParaMigrar();
    if (!email || !chatsLocales.length) return;

    const migrado = await migrarChatsLocales(chatsLocales);
    if (migrado) {
        window.localStorage.removeItem(getChatStorageKeyForEmail(email));
    }
}

function detenerEscuchaDeMensajes() {
    cancelarEscuchaMensajes?.();
    cancelarEscuchaMensajes = null;
}

function detenerSincronizacionChats() {
    cancelarEscuchaChats?.();
    cancelarEscuchaChats = null;
    detenerEscuchaDeMensajes();
}

function mostrarErrorDeSincronizacion() {
    if (inputHintText) inputHintText.textContent = MENSAJE_ERROR_SINCRONIZACION;
}

function renderizarMensajesDelChat(chat) {
    chatHistory.innerHTML = "";
    chat.messages.forEach((message) => appendMessage(message.sender, message.content, false));

    if (isWaitingForResponse && chat.id === activeChatId) {
        showTypingIndicator();
    }
}

function escucharMensajesDelChat(chatId) {
    detenerEscuchaDeMensajes();

    cancelarEscuchaMensajes = escucharMensajesEnFirebase(chatId, (mensajes) => {
        const chat = chats.find((item) => item.id === chatId);
        if (!chat) return;

        chat.messages = mensajes;
        if (activeChatId === chatId) renderizarMensajesDelChat(chat);
    }, (error) => {
        console.error("No se pudieron sincronizar los mensajes del chat.", error);
        mostrarErrorDeSincronizacion();
    });
}

async function iniciarSincronizacionChats() {
    const usuario = auth.currentUser;
    if (!usuario) return;

    detenerSincronizacionChats();
    chats = [];
    resetChat();

    await migrarHistorialLocal();
    if (auth.currentUser?.uid !== usuario.uid) return;

    cancelarEscuchaChats = escucharChatsEnFirebase((chatsGuardados) => {
        const mensajesActuales = new Map(chats.map((chat) => [chat.id, chat.messages || []]));
        chats = chatsGuardados.map((chat) => ({
            ...chat,
            messages: mensajesActuales.get(chat.id) || []
        }));

        if (activeChatId && !chats.some((chat) => chat.id === activeChatId)) {
            resetChat();
            return;
        }

        renderChatNav();
        finishInitialChatLoad();
    }, (error) => {
        console.error("No se pudieron sincronizar los chats de la cuenta.", error);
        mostrarErrorDeSincronizacion();
        finishInitialChatLoad();
    });
}

window.reloadAccountChats = () => {
    void iniciarSincronizacionChats();
};

function getActiveChat() {
    return chats.find((chat) => chat.id === activeChatId);
}

function createChatTitle(message) {
    return limitChatTitle(message);
}

function limitChatTitle(value) {
    const cleanTitle = String(value || "").replace(/\s+/g, " ").trim();
    return cleanTitle.length > MAX_CHAT_TITLE_LENGTH
        ? `${cleanTitle.slice(0, MAX_CHAT_TITLE_LENGTH - 1)}…`
        : cleanTitle;
}

async function createChat(message) {
    const id = window.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const chat = { id, title: createChatTitle(message), messages: [] };

    chats.unshift(chat);
    activeChatId = id;
    newChatBtn?.classList.remove("is-active");
    newChatBtn?.removeAttribute("aria-current");
    renderChatNav();

    const creado = await crearChatEnFirebase(chat);
    if (!creado) {
        chats = chats.filter((item) => item.id !== id);
        activeChatId = null;
        renderChatNav();
        throw new Error("No se pudo crear el chat en Firestore.");
    }

    escucharMensajesDelChat(id);
    return chat;
}

async function ensureActiveChat(message) {
    return getActiveChat() || createChat(message);
}

function closeChatMenus() {
    document.querySelectorAll(".chat-nav-entry.is-menu-open").forEach((entry) => {
        entry.classList.remove("is-menu-open");
        entry.querySelector(".chat-options-button")?.setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll(".chat-options-menu").forEach((menu) => {
        menu.style.removeProperty("--chat-menu-left");
        menu.style.removeProperty("--chat-menu-top");
    });
}

function setSelectionMode(enabled) {
    isSelectingChats = enabled;
    if (!enabled) selectedChatIds.clear();
    document.body.classList.toggle("is-selecting-chats", enabled);
    closeChatMenus();
    renderChatNav();
}

function setChatListView(showArchived) {
    isShowingArchivedChats = showArchived;
    if (archivedChatsBtn) {
        const nextView = showArchived ? "Chats recientes" : "Chats archivados";
        archivedChatsBtn.title = nextView;
        archivedChatsBtn.setAttribute("aria-label", `Mostrar ${nextView.toLowerCase()}`);
    }
    if (archivedChatsButtonLabel) {
        archivedChatsButtonLabel.textContent = showArchived ? "Chats recientes" : "Chats archivados";
    }
    if (archivedChatsButtonIcon) {
        archivedChatsButtonIcon.innerHTML = showArchived
            ? '<path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />'
            : '<path d="M4 7h16v13H4zM3 4h18v3H3zm6 7h6" />';
    }
    if (collapsedChatPopoverLabel) {
        collapsedChatPopoverLabel.textContent = showArchived ? "Archivados" : "Recientes";
    }
    renderChatNav();
}

function closeCollapsedChatPopover() {
    if (!collapsedChatPopover || !collapsedChatsBtn) return;

    collapsedChatPopover.hidden = true;
    collapsedChatsBtn.classList.remove("is-open");
    collapsedChatsBtn.setAttribute("aria-expanded", "false");
}

function toggleCollapsedChatPopover() {
    if (!collapsedChatPopover || !collapsedChatsBtn) return;

    const willOpen = collapsedChatPopover.hidden;
    collapsedChatPopover.hidden = !willOpen;
    collapsedChatsBtn.classList.toggle("is-open", willOpen);
    collapsedChatsBtn.setAttribute("aria-expanded", String(willOpen));
}

function closeChatModal() {
    pendingChatAction = null;
    chatModalBackdrop.hidden = true;
    document.body.classList.remove("has-chat-modal");
}

function openChatModal(action, chat) {
    pendingChatAction = { action, chatId: chat.id };
    closeChatMenus();
    const isDeleteAction = action === "delete";

    chatModalTitle.textContent = isDeleteAction ? "¿Deseas eliminar el chat?" : "Cambiar el nombre";
    chatModalDescription.replaceChildren();
    chatModalNameField.hidden = isDeleteAction;
    chatModalSubmit.classList.toggle("is-danger", isDeleteAction);
    chatModalSubmit.textContent = isDeleteAction ? "Eliminar" : "Guardar";

    if (isDeleteAction) {
        const chatName = document.createElement("strong");
        chatName.textContent = chat.title;
        chatModalDescription.append("Esto eliminará ", chatName, ".");
    } else {
        chatModalDescription.textContent = "Elige un nombre para identificar esta conversación.";
        chatModalNameInput.value = chat.title;
    }

    chatModalBackdrop.hidden = false;
    document.body.classList.add("has-chat-modal");

    if (!isDeleteAction) window.setTimeout(() => chatModalNameInput.focus(), 0);
}

async function deleteChat(chatId) {
    const isActiveChat = activeChatId === chatId;
    const eliminado = await eliminarChatEnFirebase(chatId);
    if (!eliminado) return;

    chats = chats.filter((chat) => chat.id !== chatId);

    if (isActiveChat) {
        resetChat();
        return;
    }

    renderChatNav();
}

async function updateChatState(chatId, changes) {
    const updated = await actualizarEstadoChatEnFirebase(chatId, changes);
    if (!updated) return false;
    const chat = chats.find((item) => item.id === chatId);
    if (chat) Object.assign(chat, changes);
    return true;
}

async function archiveChats(chatIds) {
    const ids = [...chatIds];
    if (!ids.length) return;
    const shouldArchive = !isShowingArchivedChats;
    const results = await Promise.all(ids.map((id) => updateChatState(id, {
        archived: shouldArchive,
        pinned: shouldArchive ? false : chats.find((chat) => chat.id === id)?.pinned
    })));
    if (shouldArchive && ids.includes(activeChatId) && results.some(Boolean)) resetChat();
    setSelectionMode(false);
    renderChatNav();
}

async function deleteChats(chatIds) {
    const ids = [...chatIds];
    if (!ids.length) return;
    await Promise.all(ids.map((id) => deleteChat(id)));
    setSelectionMode(false);
    renderChatNav();
}

function renameChat(chatId) {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;
    openChatModal("rename", chat);
}

function openChat(chatId) {
    if (isWaitingForResponse) return;

    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;

    activeChatId = chat.id;
    newChatBtn?.classList.remove("is-active");
    newChatBtn?.removeAttribute("aria-current");
    startConversation();
    renderizarMensajesDelChat(chat);
    escucharMensajesDelChat(chat.id);
    renderChatNav();
}

function createChatNavEntry(chat, isCollapsedMenu = false) {
    const entry = document.createElement("div");
    entry.className = isCollapsedMenu ? "collapsed-chat-nav-entry" : "chat-nav-entry";

    const chatButton = document.createElement("button");
    chatButton.className = isCollapsedMenu ? "collapsed-chat-nav-item" : "chat-nav-item";
    chatButton.type = "button";
    chatButton.setAttribute("aria-label", `${isSelectingChats ? "Seleccionar" : "Abrir"} chat: ${chat.title}`);

    if (!isCollapsedMenu && isSelectingChats) {
        const selectionMark = document.createElement("span");
        selectionMark.className = "chat-select-checkbox";
        selectionMark.setAttribute("aria-hidden", "true");
        selectionMark.textContent = selectedChatIds.has(chat.id) ? "✓" : "";
        chatButton.setAttribute("aria-pressed", String(selectedChatIds.has(chat.id)));
        chatButton.appendChild(selectionMark);
    } else if (!isCollapsedMenu) {
        chatButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 8.7 3.9 8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>';
    }

    const title = document.createElement("span");
    title.className = isCollapsedMenu ? "collapsed-chat-nav-title" : "chat-nav-title";
    title.textContent = chat.title;
    chatButton.appendChild(title);

    if (chat.id === activeChatId) {
        chatButton.classList.add("is-active");
        chatButton.setAttribute("aria-current", "page");
    }

    chatButton.addEventListener("click", () => {
        if (isSelectingChats) {
            if (selectedChatIds.has(chat.id)) selectedChatIds.delete(chat.id);
            else selectedChatIds.add(chat.id);
            renderChatNav();
            return;
        }
        closeCollapsedChatPopover();
        openChat(chat.id);
    });

    entry.appendChild(chatButton);
    if (isCollapsedMenu) return entry;

    const optionsButton = document.createElement("button");
    optionsButton.className = "chat-options-button";
    optionsButton.type = "button";
    optionsButton.textContent = "⋯";
    optionsButton.setAttribute("aria-label", `Opciones para ${chat.title}`);
    optionsButton.setAttribute("aria-expanded", "false");
    optionsButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = !entry.classList.contains("is-menu-open");
        closeChatMenus();
        entry.classList.toggle("is-menu-open", willOpen);

        if (willOpen) {
            const buttonBounds = optionsButton.getBoundingClientRect();
            const menuBounds = optionsMenu.getBoundingClientRect();
            const viewportPadding = 10;
            const hasRoomOnTheRight = window.innerWidth - buttonBounds.right >= menuBounds.width + viewportPadding;
            const left = hasRoomOnTheRight
                ? buttonBounds.right + 8
                : Math.max(viewportPadding, buttonBounds.right - menuBounds.width);
            const maxTop = Math.max(viewportPadding, window.innerHeight - menuBounds.height - viewportPadding);
            const top = Math.min(
                Math.max(viewportPadding, buttonBounds.top),
                maxTop
            );

            optionsMenu.style.setProperty("--chat-menu-left", `${left}px`);
            optionsMenu.style.setProperty("--chat-menu-top", `${top}px`);
        }

        optionsButton.setAttribute("aria-expanded", String(willOpen));
    });

    const optionsMenu = document.createElement("div");
    optionsMenu.className = "chat-options-menu";
    optionsMenu.setAttribute("role", "menu");

    if (isSelectingChats) {
        const count = selectedChatIds.size;
        const archiveAction = isShowingArchivedChats ? "Desarchivar seleccionados" : "Archivar seleccionados";

        const archiveSelectedButton = document.createElement("button");
        archiveSelectedButton.type = "button";
        archiveSelectedButton.disabled = count === 0;
        archiveSelectedButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zm6 7h6" /></svg><span>${archiveAction}</span>`;
        archiveSelectedButton.setAttribute("role", "menuitem");
        archiveSelectedButton.addEventListener("click", () => void archiveChats(selectedChatIds));

        const deleteSelectedButton = document.createElement("button");
        deleteSelectedButton.type = "button";
        deleteSelectedButton.disabled = count === 0;
        deleteSelectedButton.className = "is-danger";
        deleteSelectedButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg><span>Eliminar seleccionados</span>';
        deleteSelectedButton.setAttribute("role", "menuitem");
        deleteSelectedButton.addEventListener("click", () => {
            if (!count || !window.confirm(`¿Eliminar ${count} chat${count === 1 ? "" : "s"} seleccionados? Esta acción no se puede deshacer.`)) return;
            void deleteChats(selectedChatIds);
        });

        const cancelSelectionButton = document.createElement("button");
        cancelSelectionButton.type = "button";
        cancelSelectionButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg><span>Cancelar selección</span>';
        cancelSelectionButton.setAttribute("role", "menuitem");
        cancelSelectionButton.addEventListener("click", () => setSelectionMode(false));

        optionsMenu.append(archiveSelectedButton, deleteSelectedButton, cancelSelectionButton);
        entry.append(optionsButton, optionsMenu);
        return entry;
    }

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg><span>Cambiar el nombre</span>';
    renameButton.setAttribute("role", "menuitem");
    renameButton.addEventListener("click", () => renameChat(chat.id));

    const pinButton = document.createElement("button");
    pinButton.type = "button";
    pinButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13v8M8 4h8l-1 5 3 3v1H6v-1l3-3-1-5Z" /></svg><span>${chat.pinned ? "Desanclar" : "Anclar"}</span>`;
    pinButton.setAttribute("role", "menuitem");
    pinButton.addEventListener("click", async () => {
        await updateChatState(chat.id, { pinned: !chat.pinned, archived: false });
        closeChatMenus();
        renderChatNav();
    });

    const archiveButton = document.createElement("button");
    archiveButton.type = "button";
    archiveButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zm6 7h6" /></svg><span>${chat.archived ? "Desarchivar" : "Archivar"}</span>`;
    archiveButton.setAttribute("role", "menuitem");
    archiveButton.addEventListener("click", async () => {
        const wasArchived = chat.archived;
        await updateChatState(chat.id, { archived: !wasArchived, pinned: wasArchived ? chat.pinned : false });
        if (!wasArchived && activeChatId === chat.id) resetChat();
        closeChatMenus();
        renderChatNav();
    });

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg><span>Seleccionar</span>';
    selectButton.setAttribute("role", "menuitem");
    selectButton.addEventListener("click", () => {
        selectedChatIds = new Set([chat.id]);
        setSelectionMode(true);
    });

    const divider = document.createElement("span");
    divider.className = "chat-options-divider";
    divider.setAttribute("aria-hidden", "true");

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg><span>Eliminar</span>';
    deleteButton.className = "is-danger";
    deleteButton.setAttribute("role", "menuitem");
    deleteButton.addEventListener("click", () => openChatModal("delete", chat));

    optionsMenu.append(renameButton, selectButton, pinButton, archiveButton, divider, deleteButton);
    entry.append(optionsButton, optionsMenu);
    return entry;
}

function renderChatNav() {
    chatNavList?.replaceChildren();
    pinnedChatNavList?.replaceChildren();
    collapsedChatNavList?.replaceChildren();

    const activeChats = chats.filter((chat) => !chat.archived);
    const pinnedChats = activeChats.filter((chat) => chat.pinned);
    const recentChats = activeChats.filter((chat) => !chat.pinned);
    const archivedChats = chats.filter((chat) => chat.archived);
    const visibleChats = isShowingArchivedChats ? archivedChats : activeChats;

    pinnedChatsSection.hidden = isShowingArchivedChats || pinnedChats.length === 0;
    // El encabezado identifica siempre el historial que se está consultando,
    // aunque todavía no tenga conversaciones.
    recentChatsLabel.hidden = false;
    recentChatsLabel.textContent = isShowingArchivedChats ? "Archivados" : "Recientes";

    if (isShowingArchivedChats) {
        archivedChats.forEach((chat) => chatNavList?.appendChild(createChatNavEntry(chat)));
    } else {
        pinnedChats.forEach((chat) => pinnedChatNavList?.appendChild(createChatNavEntry(chat)));
        recentChats.forEach((chat) => chatNavList?.appendChild(createChatNavEntry(chat)));
    }

    visibleChats.slice(0, MAX_COLLAPSED_CHAT_COUNT).forEach((chat) => {
        collapsedChatNavList?.appendChild(createChatNavEntry(chat, true));
    });
}

function setDynamicWelcome(user = auth.currentUser) {
    const hour = new Date().getHours();
    let greeting;

    if (hour >= 5 && hour < 12) {
        greeting = "Buenos días";
    } else if (hour >= 12 && hour < 19) {
        greeting = "Buenas tardes";
    } else {
        greeting = "Buenas noches";
    }

    const name = String(user?.displayName || "").trim().split(/\s+/)[0];
    const welcomeOptions = name
        ? [
            `${greeting}, ${name}. ¿Qué analizamos hoy?`,
            `Hola, ${name}. ¿Qué oportunidad revisamos hoy?`,
            `${name}, cuéntame en qué etapa está tu empresa.`,
            `Qué gusto verte, ${name}. ¿Cómo impulsamos tu empresa hoy?`,
            `${name}, exploremos nuevas oportunidades para tu empresa.`,
            `Bienvenido de nuevo, ${name}. ¿Por dónde empezamos?`,
            `${name}, estoy listo para analizar tu próximo paso.`,
            `Hola, ${name}. Convirtamos tus ideas en oportunidades.`,
            `${name}, ¿qué proceso público quieres revisar?`,
            `Trabajemos en una ruta clara para tu empresa, ${name}.`,
            `${name}, cuéntame qué necesitas resolver hoy.`,
            `Hola, ${name}. Revisemos dónde está la mejor oportunidad.`,
            `${name}, construyamos una estrategia para avanzar.`,
            `Bienvenido, ${name}. Estoy aquí para ayudarte a decidir.`
        ]
        : [
            `${greeting}. ¿Qué analizamos hoy?`,
            "Hola, bienvenido. ¿Qué oportunidad quieres explorar?",
            "Cuéntame sobre tu empresa y empecemos a analizarla.",
            "¿Listo para encontrar tu siguiente oportunidad pública?",
            "Explora cómo llevar tu empresa al mercado público.",
            "Analicemos el siguiente paso para tu empresa.",
            "Estoy listo para convertir tus ideas en una ruta clara.",
            "Cuéntame qué reto quieres resolver hoy.",
            "Descubramos oportunidades que encajen con tu empresa.",
            "¿Quieres saber qué tan preparada está tu empresa?",
            "Empecemos por entender tus objetivos de crecimiento.",
            "Revisemos juntos tu potencial en contratación pública.",
            "Dime qué necesitas y encontraremos un buen camino.",
            "Tu próxima oportunidad puede empezar con una pregunta."
        ];

    welcomeTitle.textContent = welcomeOptions[Math.floor(Math.random() * welcomeOptions.length)];
}

function setSendButtonState() {
    sendBtn.disabled = isSendingMessage || isWaitingForResponse || !inputField.value.trim();
}

function resizeInput() {
    inputField.style.height = "auto";
    inputField.style.height = `${Math.min(inputField.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
}

function setVoiceState(listening, message) {
    isListening = listening;
    microphoneBtn.classList.toggle("is-listening", listening);
    microphoneBtn.setAttribute("aria-pressed", String(listening));
    microphoneBtn.setAttribute("aria-label", listening ? "Detener dictado por voz" : "Dictar mensaje por voz");
    microphoneBtn.title = listening ? "Detener dictado" : "Dictar mensaje por voz";
    inputHintText.textContent = message || "IDEAPRO Copilot puede cometer errores. Verifica la información importante.";
}

function clearSilenceTimer() {
    window.clearTimeout(silenceTimer);
}

function stopVoiceRecognition(message) {
    clearSilenceTimer();

    if (isListening && recognition) {
        setVoiceState(false, message);
        recognition.stop();
    }
}

function resetSilenceTimer() {
    clearSilenceTimer();
    silenceTimer = window.setTimeout(() => {
        stopVoiceRecognition("Pausé el dictado después de 5 segundos de silencio.");
    }, VOICE_SILENCE_TIMEOUT);
}

function setupVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        microphoneBtn.disabled = true;
        microphoneBtn.title = "El dictado por voz no está disponible en este navegador";
        microphoneBtn.setAttribute("aria-label", "El dictado por voz no está disponible en este navegador");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "es-CO";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        setVoiceState(true, "Escuchando… se pausará tras 5 segundos de silencio.");
        resetSilenceTimer();
    };

    recognition.onspeechstart = clearSilenceTimer;
    recognition.onspeechend = resetSilenceTimer;

    recognition.onresult = (event) => {
        let textoFinal = "";
        let textoParcial = "";

        for (let index = 0; index < event.results.length; index += 1) {
            const texto = event.results[index][0].transcript.trim();
            if (!texto) continue;

            if (event.results[index].isFinal) {
                textoFinal += `${texto} `;
            } else {
                textoParcial += `${texto} `;
            }
        }

        // El navegador vuelve a enviar los resultados anteriores en cada evento.
        // Se reconstruye la frase completa para que "hola" no termine como
        // "hola hola hola" mientras se sigue escuchando.
        speechRecognitionFinalText = textoFinal.trim();
        inputField.value = [speechBaseText, speechRecognitionFinalText, textoParcial.trim()]
            .filter(Boolean)
            .join(" ");
        resizeInput();
        setSendButtonState();
        resetSilenceTimer();
    };

    recognition.onerror = (event) => {
        const message = event.error === "not-allowed"
            ? "No se concedió permiso para usar el micrófono."
            : "No pudimos escuchar el dictado. Inténtalo de nuevo.";
        clearSilenceTimer();
        setVoiceState(false, message);
    };

    recognition.onend = () => {
        clearSilenceTimer();
        if (isListening) setVoiceState(false, "Dictado agregado al mensaje.");
    };

    microphoneBtn.addEventListener("click", () => {
        if (isListening) {
            stopVoiceRecognition("Dictado agregado al mensaje.");
            return;
        }

        speechBaseText = inputField.value.trim();
        speechRecognitionFinalText = "";

        try {
            recognition.start();
        } catch (error) {
            clearSilenceTimer();
            setVoiceState(false, "El dictado ya se estaba iniciando. Inténtalo de nuevo.");
        }
    });
}

function startConversation() {
    if (hasStartedConversation) return;

    hasStartedConversation = true;
    document.body.classList.add("is-conversation");
    welcomeScreen.classList.add("is-hidden");
    chatHistory.classList.add("has-messages");
}

function createAvatar() {
    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";

    const image = document.createElement("img");
    image.src = "img/IA%20icono.png";
    image.alt = "IDEAPRO Copilot";
    avatar.appendChild(image);

    return avatar;
}

function appendMessage(sender, content, saveMessage = true) {
    const row = document.createElement("article");
    row.className = `message-row ${sender === "user" ? "user-row" : "bot-row"}`;

    if (sender === "bot") row.appendChild(createAvatar());

    const message = document.createElement("div");
    message.className = `message ${sender}`;
    message.innerHTML = content;

    if (sender === "bot") {
        const actions = document.createElement("div");
        actions.className = "bot-follow-up-actions";

        const followUpActions = [
            ["Profundizar", "Profundiza la respuesta anterior con ejemplos y pasos concretos."],
            ["Crear plan", "Convierte la recomendación anterior en un plan de acción priorizado para mi empresa."]
        ];

        followUpActions.forEach(([label, prompt]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.addEventListener("click", () => {
                inputField.value = prompt;
                resizeInput();
                setSendButtonState();
                inputField.focus();
            });
            actions.appendChild(button);
        });

        message.appendChild(actions);
    }
    row.appendChild(message);

    chatHistory.appendChild(row);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    if (saveMessage) {
        const activeChat = getActiveChat();
        if (!activeChat) return;

        activeChat.messages.push({ sender, content });
    }
}

function mostrarMensajeSinDuplicarlo(chatId, sender, content) {
    if (activeChatId !== chatId) return;

    const chat = getActiveChat();
    const mensajes = chat?.messages || [];
    const ultimoMensaje = mensajes[mensajes.length - 1];

    if (ultimoMensaje?.sender === sender && ultimoMensaje.content === content) return;
    appendMessage(sender, content);
}

function showTypingIndicator() {
    const row = document.createElement("article");
    row.className = "message-row bot-row";
    row.id = "typing-indicator";
    row.appendChild(createAvatar());

    const typing = document.createElement("div");
    typing.className = "typing-indicator";
    typing.setAttribute("aria-label", "IDEAPRO está analizando tu consulta");

    const label = document.createElement("span");
    label.className = "typing-label";
    label.textContent = "IDEAPRO está analizando tu consulta";

    const dots = document.createElement("span");
    dots.className = "typing-dots";

    for (let index = 0; index < 3; index += 1) {
        dots.appendChild(document.createElement("i"));
    }

    typing.append(label, dots);
    row.appendChild(typing);
    chatHistory.appendChild(row);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function removeTypingIndicator() {
    document.getElementById("typing-indicator")?.remove();
}

function getPlaceholderReply(message) {
    const summary = message.length > 110 ? `${message.slice(0, 110)}…` : message;
    return `Gracias. Ya registré tu consulta: “${summary}”. Cuando conectemos el flujo del bot, aquí recibirás un análisis con recomendaciones y los próximos pasos para tu empresa.`;
}

async function sendMessage(message = inputField.value.trim()) {
    if (!message || isSendingMessage || isWaitingForResponse) return;

    if (!auth.currentUser) {
        if (inputHintText) {
            inputHintText.textContent = "Inicia sesión con Google para guardar y sincronizar tus chats.";
        }
        return;
    }

    // Se bloquea antes de esperar a Firebase. Así dos clics rápidos, o Enter
    // seguido de un clic, no pueden iniciar dos envíos del mismo mensaje.
    isSendingMessage = true;
    setSendButtonState();

    if (isListening && recognition) {
        stopVoiceRecognition();
    }

    let activeChat;
    try {
        activeChat = await ensureActiveChat(message);
    } catch (error) {
        console.error("No se pudo iniciar el chat en Firestore.", error);
        mostrarErrorDeSincronizacion();
        isSendingMessage = false;
        setSendButtonState();
        return;
    }

    const requestChatId = activeChat.id;

    isWaitingForResponse = true;
    startConversation();
    appendMessage("user", message);
    inputField.value = "";
    resizeInput();
    setSendButtonState();
    showTypingIndicator();

    try {
        const mensajeGuardado = await guardarMensaje(requestChatId, "user", message);
        if (!mensajeGuardado) throw new Error("No se pudo guardar el mensaje del usuario.");

        // 1. Enviamos el mensaje a la URL de prueba de tu Webhook en n8n
        const response = await fetch("https://facecloth-carton-chafe.ngrok-free.dev/webhook/ideapro-chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({
                sessionId: "sesion-hackathon",
                chatInput: message
            })
        });

        if (!response.ok) throw new Error("Error en la conexión con n8n");

        // 2. Recibimos la respuesta de la IA
        const data = await response.json();

        // 3. Mostramos la respuesta (n8n suele enviarla en la variable 'output')
        // Convertimos los saltos de línea (\n) en <br> porque el mensaje se
        // inserta como HTML (innerHTML) y el navegador ignora los \n normales.
        const textoCrudo = data.output || data.text || data.response || "Recibí la respuesta, pero no encontré el texto.";
        const botReply = textoCrudo.replace(/\n/g, "<br>");
        const respuestaGuardada = await guardarMensaje(requestChatId, "bot", botReply);
        if (!respuestaGuardada) throw new Error("No se pudo guardar la respuesta del Copilot.");

        isWaitingForResponse = false;
        if (activeChatId === requestChatId) {
            removeTypingIndicator();
            mostrarMensajeSinDuplicarlo(requestChatId, "bot", botReply);
        }

    } catch (error) {
        console.error("Error del bot:", error);
        const mensajeError = "⚠️ <strong>Error de conexión:</strong> No pude contactar a los servidores. Asegúrate de presionar 'Execute workflow' en n8n.";

        await guardarMensaje(requestChatId, "bot", mensajeError);
        isWaitingForResponse = false;
        if (activeChatId === requestChatId) {
            removeTypingIndicator();
            mostrarMensajeSinDuplicarlo(requestChatId, "bot", mensajeError);
        }
    } finally {
        isWaitingForResponse = false;
        isSendingMessage = false;
        setSendButtonState();
    }
}

function resetChat() {
    if (isListening && recognition) stopVoiceRecognition();

    detenerEscuchaDeMensajes();
    activeChatId = null;
    newChatBtn?.classList.add("is-active");
    newChatBtn?.setAttribute("aria-current", "page");
    chatHistory.innerHTML = "";
    hasStartedConversation = false;
    document.body.classList.remove("is-conversation");
    chatHistory.classList.remove("has-messages");
    welcomeScreen.classList.remove("is-hidden");
    inputField.value = "";
    resizeInput();
    setSendButtonState();
    renderChatNav();
    inputField.focus();
}

inputField.addEventListener("input", () => {
    resizeInput();
    setSendButtonState();
});

inputField.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
        inputField.value = button.dataset.prompt;
        resizeInput();
        setSendButtonState();
        inputField.focus();
    });
});

newChatBtn?.addEventListener("click", () => {
    closeCollapsedChatPopover();
    resetChat();
});

collapsedChatsBtn?.addEventListener("click", () => {
    toggleCollapsedChatPopover();
});

function setSidebarToggleState(isCollapsed) {
    const action = isCollapsed ? "Abrir" : "Contraer";
    sidebarToggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
    sidebarToggleBtn.setAttribute("aria-label", `${action} barra lateral`);
}

sidebarToggleBtn?.addEventListener("click", () => {
    if (document.body.classList.contains("sidebar-opening") || document.body.classList.contains("sidebar-closing")) return;

    const isCollapsed = document.body.classList.contains("sidebar-collapsed");
    window.clearTimeout(sidebarAnimationTimer);

    if (isCollapsed) {
        closeCollapsedChatPopover();
        document.body.classList.remove("sidebar-collapsed");
        document.body.classList.add("sidebar-opening");
        setSidebarToggleState(false);
        sidebarAnimationTimer = window.setTimeout(() => {
            document.body.classList.remove("sidebar-opening");
        }, 190);
        return;
    }

    closeCollapsedChatPopover();
    document.body.classList.add("sidebar-closing");
    sidebarAnimationTimer = window.setTimeout(() => {
        document.body.classList.add("sidebar-collapsed");
        document.body.classList.remove("sidebar-closing");
        setSidebarToggleState(true);
    }, 130);
});

menuBtn?.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    document.body.classList.toggle("sidebar-open", isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
});

sidebarCloseBtn?.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    document.body.classList.remove("sidebar-open");
    menuBtn?.setAttribute("aria-expanded", "false");
});

document.addEventListener("click", (event) => {
    if (!sidebar.classList.contains("is-open")) return;
    if (!sidebar.contains(event.target) && !menuBtn.contains(event.target)) {
        sidebar.classList.remove("is-open");
        document.body.classList.remove("sidebar-open");
        menuBtn.setAttribute("aria-expanded", "false");
    }
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".chat-nav-entry")) closeChatMenus();
});

document.addEventListener("click", (event) => {
    if (!event.target.closest("#collapsed-chats-btn, #collapsed-chat-popover")) {
        closeCollapsedChatPopover();
    }
});

chatModalCancel?.addEventListener("click", closeChatModal);

archivedChatsBtn?.addEventListener("click", () => {
    setChatListView(!isShowingArchivedChats);
    if (document.body.classList.contains("sidebar-collapsed")) {
        sidebarToggleBtn?.click();
    }
});

chatModalBackdrop?.addEventListener("click", (event) => {
    if (event.target === chatModalBackdrop) closeChatModal();
});

chatModalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingChatAction) return;

    const { action, chatId } = pendingChatAction;
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return closeChatModal();

    if (action === "rename") {
        const newTitle = chatModalNameInput.value.trim();
        if (!newTitle) {
            chatModalNameInput.focus();
            return;
        }

        const tituloActualizado = limitChatTitle(newTitle);
        const actualizado = await renombrarChatEnFirebase(chat.id, tituloActualizado);
        if (!actualizado) return;

        chat.title = tituloActualizado;
        closeChatModal();
        renderChatNav();
        return;
    }

    closeChatModal();
    deleteChat(chat.id);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !chatModalBackdrop.hidden) closeChatModal();
    if (event.key === "Escape") closeCollapsedChatPopover();
});

logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;

    try {
        await signOut(auth);
    } catch (error) {
        console.error("No se pudo cerrar la sesión.", error);
        logoutBtn.disabled = false;
    }
});

onAuthStateChanged(auth, (user) => {
    redirectUnauthenticatedUser(user);

    if (user) {
        setDynamicWelcome(user);
        void guardarDatosUsuario().then((guardado) => {
            if (!guardado) mostrarErrorDeSincronizacion();
        });
        void iniciarSincronizacionChats();
        return;
    }

    detenerSincronizacionChats();
    chats = [];
    resetChat();
    finishInitialChatLoad();
});

resizeInput();
setSendButtonState();
setDynamicWelcome();
resetChat();
setupVoiceRecognition();

window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    window.ideaproPageLoader?.hide(true);
});

document.querySelectorAll(".back-link, .chat-brand").forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        window.ideaproPageLoader?.show();
        window.setTimeout(() => { window.location.href = link.href; }, 700);
    });
});
*/
