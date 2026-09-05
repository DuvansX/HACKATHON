import { auth, db } from "../../config/firebase.js";
import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    setDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const MAX_OPERACIONES_POR_LOTE = 450;

function usuarioActual() {
    return auth.currentUser;
}

function normalizarTitulo(valor) {
    return String(valor || "Nuevo chat").replace(/\s+/g, " ").trim() || "Nuevo chat";
}

function ordenarPorFecha(recientesPrimero = false) {
    return (primerElemento, segundoElemento) => {
        const primerOrden = Number(primerElemento.orden ?? primerElemento.actualizadoEn?.toMillis?.() ?? 0);
        const segundoOrden = Number(segundoElemento.orden ?? segundoElemento.actualizadoEn?.toMillis?.() ?? 0);
        return recientesPrimero ? segundoOrden - primerOrden : primerOrden - segundoOrden;
    };
}

function referenciaChats(usuario = usuarioActual()) {
    return usuario ? collection(db, "usuarios", usuario.uid, "chats") : null;
}

function referenciaChat(chatId, usuario = usuarioActual()) {
    return usuario ? doc(db, "usuarios", usuario.uid, "chats", chatId) : null;
}

function referenciaMensajes(chatId, usuario = usuarioActual()) {
    return usuario ? collection(db, "usuarios", usuario.uid, "chats", chatId, "mensajes") : null;
}

export async function guardarDatosUsuario() {
    const usuario = usuarioActual();
    if (!usuario) return false;

    try {
        await setDoc(doc(db, "usuarios", usuario.uid), {
            nombre: usuario.displayName || usuario.email?.split("@")[0] || "Usuario",
            correo: usuario.email || "",
            foto: usuario.photoURL || "",
            uid: usuario.uid,
            ultimoAcceso: serverTimestamp(),
            actualizadoEn: serverTimestamp()
        }, { merge: true });

        return true;
    } catch (error) {
        console.error("No se pudo guardar el usuario en Firestore.", error);
        return false;
    }
}

export async function crearChat(chat) {
    const referencia = referenciaChat(chat?.id);
    if (!referencia) return false;

    try {
        await setDoc(referencia, {
            titulo: normalizarTitulo(chat.title),
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp(),
            orden: Date.now(),
            pinned: false,
            archived: false
        });
        return true;
    } catch (error) {
        console.error("No se pudo crear el chat en Firestore.", error);
        return false;
    }
}

export async function renombrarChat(chatId, titulo) {
    const referencia = referenciaChat(chatId);
    if (!referencia) return false;

    try {
        await setDoc(referencia, {
            titulo: normalizarTitulo(titulo),
            actualizadoEn: serverTimestamp(),
            orden: Date.now()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error("No se pudo cambiar el nombre del chat.", error);
        return false;
    }
}

export async function actualizarEstadoChat(chatId, cambios) {
    const referencia = referenciaChat(chatId);
    if (!referencia) return false;

    try {
        await setDoc(referencia, {
            ...cambios,
            actualizadoEn: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error("No se pudo actualizar el estado del chat.", error);
        return false;
    }
}

export async function guardarMensaje(chatId, sender, content) {
    const mensajes = referenciaMensajes(chatId);
    const chat = referenciaChat(chatId);
    if (!mensajes || !chat) return false;

    try {
        const ahora = Date.now();
        const mensaje = doc(mensajes);
        const lote = writeBatch(db);

        lote.set(mensaje, {
            sender: sender === "bot" ? "bot" : "user",
            content: String(content || ""),
            creadoEn: serverTimestamp(),
            orden: ahora
        });
        lote.set(chat, {
            actualizadoEn: serverTimestamp(),
            orden: ahora
        }, { merge: true });

        await lote.commit();
        return true;
    } catch (error) {
        console.error("No se pudo guardar el mensaje en Firestore.", error);
        return false;
    }
}

export function escucharChats(alCambiar, alFallar) {
    const chats = referenciaChats();
    if (!chats) return () => {};

    return onSnapshot(chats, (resultado) => {
        const chatsGuardados = resultado.docs
            .map((documento) => ({ id: documento.id, ...documento.data() }))
            .sort(ordenarPorFecha(true))
            .map((chat) => ({
                id: chat.id,
                title: normalizarTitulo(chat.titulo),
                pinned: Boolean(chat.pinned),
                archived: Boolean(chat.archived)
            }));

        alCambiar(chatsGuardados);
    }, alFallar);
}

export function escucharMensajes(chatId, alCambiar, alFallar) {
    const mensajes = referenciaMensajes(chatId);
    if (!mensajes) return () => {};

    return onSnapshot(mensajes, (resultado) => {
        const mensajesGuardados = resultado.docs
            .map((documento) => documento.data())
            .filter((mensaje) => (
                (mensaje.sender === "user" || mensaje.sender === "bot")
                && typeof mensaje.content === "string"
            ))
            .sort(ordenarPorFecha())
            .map((mensaje) => ({ sender: mensaje.sender, content: mensaje.content }));

        alCambiar(mensajesGuardados);
    }, alFallar);
}

export async function eliminarChat(chatId) {
    const chat = referenciaChat(chatId);
    const mensajes = referenciaMensajes(chatId);
    if (!chat || !mensajes) return false;

    try {
        const resultado = await getDocs(mensajes);
        let lote = writeBatch(db);
        let operaciones = 0;

        for (const mensaje of resultado.docs) {
            if (operaciones === MAX_OPERACIONES_POR_LOTE) {
                await lote.commit();
                lote = writeBatch(db);
                operaciones = 0;
            }

            lote.delete(mensaje.ref);
            operaciones += 1;
        }

        if (operaciones === MAX_OPERACIONES_POR_LOTE) {
            await lote.commit();
            lote = writeBatch(db);
            operaciones = 0;
        }

        lote.delete(chat);
        operaciones += 1;

        if (operaciones > 0) await lote.commit();
        return true;
    } catch (error) {
        console.error("No se pudo eliminar el chat.", error);
        return false;
    }
}

export async function migrarChatsLocales(chatsLocales) {
    const usuario = usuarioActual();
    if (!usuario || !Array.isArray(chatsLocales) || !chatsLocales.length) return true;

    try {
        let lote = writeBatch(db);
        let operaciones = 0;

        const agregarOperacion = async (accion) => {
            if (operaciones === MAX_OPERACIONES_POR_LOTE) {
                await lote.commit();
                lote = writeBatch(db);
                operaciones = 0;
            }

            accion(lote);
            operaciones += 1;
        };

        for (const [indiceChat, chat] of chatsLocales.entries()) {
            const referencia = referenciaChat(chat.id, usuario);
            await agregarOperacion((loteActual) => {
                loteActual.set(referencia, {
                    titulo: normalizarTitulo(chat.title),
                    creadoEn: serverTimestamp(),
                    actualizadoEn: serverTimestamp(),
                    orden: Date.now() - indiceChat
                }, { merge: true });
            });

            for (const [indice, mensaje] of (chat.messages || []).entries()) {
                const referenciaMensaje = doc(referenciaMensajes(chat.id, usuario), `migrado-${indice}`);
                await agregarOperacion((loteActual) => {
                    loteActual.set(referenciaMensaje, {
                        sender: mensaje.sender === "bot" ? "bot" : "user",
                        content: String(mensaje.content || ""),
                        creadoEn: serverTimestamp(),
                        orden: indice
                    });
                });
            }
        }

        if (operaciones > 0) await lote.commit();
        return true;
    } catch (error) {
        console.error("No se pudo migrar el historial local a Firestore.", error);
        return false;
    }
}
