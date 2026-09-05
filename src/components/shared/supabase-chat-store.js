import { auth, supabase } from "../../config/supabase.js";

function usuarioActual() {
    return auth.currentUser;
}

function normalizarTitulo(valor) {
    return String(valor || "Nuevo chat").replace(/\s+/g, " ").trim() || "Nuevo chat";
}

// La tabla messages usa role 'user' | 'agent' (restricción CHECK); el resto
// de la app trabaja con sender 'user' | 'bot'.
function filaAMensaje(fila) {
    return { sender: fila.role === "agent" ? "bot" : "user", content: fila.content };
}

export async function guardarDatosUsuario() {
    const usuario = usuarioActual();
    if (!usuario) return false;

    try {
        const { error } = await supabase.from("profiles").upsert({
            id: usuario.uid,
            email: usuario.email || null,
            full_name: usuario.displayName || null,
            avatar_url: usuario.photoURL || null,
            ultima_actividad_at: new Date().toISOString()
        });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("No se pudo guardar el usuario en Supabase.", error);
        return false;
    }
}

export async function crearChat(chat) {
    const usuario = usuarioActual();
    if (!usuario || !chat?.id) return false;

    try {
        const { error } = await supabase.from("conversations").insert({
            id: chat.id,
            user_id: usuario.uid,
            titulo: normalizarTitulo(chat.title),
            canal: "web",
            estado: "activa"
        });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("No se pudo crear el chat en Supabase.", error);
        return false;
    }
}

export async function renombrarChat(chatId, titulo) {
    try {
        const { error } = await supabase
            .from("conversations")
            .update({ titulo: normalizarTitulo(titulo) })
            .eq("id", chatId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("No se pudo cambiar el nombre del chat.", error);
        return false;
    }
}

export async function actualizarEstadoChat(chatId, cambios) {
    try {
        const { error } = await supabase.from("conversations").update(cambios).eq("id", chatId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("No se pudo actualizar el estado del chat.", error);
        return false;
    }
}

// conversations no se toca al guardar un mensaje, así que sin esto los chats
// con actividad reciente no subirían al tope de la lista (se ordena por
// updated_at). El trigger de la tabla fuerza updated_at = now() en cada UPDATE.
async function tocarChat(chatId) {
    const { error } = await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);
    if (error) console.warn("No se pudo actualizar la fecha del chat.", error);
}

export async function guardarMensaje(chatId, sender, content) {
    try {
        const { error } = await supabase.from("messages").insert({
            conversation_id: chatId,
            role: sender === "bot" ? "agent" : "user",
            content: String(content || "")
        });
        if (error) throw error;

        await tocarChat(chatId);
        return true;
    } catch (error) {
        console.error("No se pudo guardar el mensaje en Supabase.", error);
        return false;
    }
}

export function escucharChats(alCambiar, alFallar) {
    const usuario = usuarioActual();
    if (!usuario) return () => {};

    let cancelado = false;

    async function recargar() {
        const { data, error } = await supabase
            .from("conversations")
            .select("id, titulo, pinned, archived")
            .eq("user_id", usuario.uid)
            .order("updated_at", { ascending: false });

        if (cancelado) return;
        if (error) {
            alFallar?.(error);
            return;
        }

        alCambiar(data.map((fila) => ({
            id: fila.id,
            title: normalizarTitulo(fila.titulo),
            pinned: Boolean(fila.pinned),
            archived: Boolean(fila.archived)
        })));
    }

    recargar();

    const canal = supabase
        .channel(`conversations-${usuario.uid}`)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `user_id=eq.${usuario.uid}`
        }, recargar)
        .subscribe();

    return () => {
        cancelado = true;
        supabase.removeChannel(canal);
    };
}

export function escucharMensajes(chatId, alCambiar, alFallar) {
    let cancelado = false;

    async function recargar() {
        const { data, error } = await supabase
            .from("messages")
            .select("role, content, created_at")
            .eq("conversation_id", chatId)
            .order("created_at", { ascending: true });

        if (cancelado) return;
        if (error) {
            alFallar?.(error);
            return;
        }

        alCambiar(data.map(filaAMensaje));
    }

    recargar();

    const canal = supabase
        .channel(`messages-${chatId}`)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${chatId}`
        }, recargar)
        .subscribe();

    return () => {
        cancelado = true;
        supabase.removeChannel(canal);
    };
}

export async function eliminarChat(chatId) {
    try {
        // Los mensajes se eliminan solos: la FK tiene ON DELETE CASCADE.
        const { error } = await supabase.from("conversations").delete().eq("id", chatId);
        if (error) throw error;
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
        const ahora = Date.now();

        const conversaciones = chatsLocales.map((chat, indiceChat) => ({
            id: chat.id,
            user_id: usuario.uid,
            titulo: normalizarTitulo(chat.title),
            canal: "web",
            estado: "activa",
            updated_at: new Date(ahora - indiceChat * 1000).toISOString()
        }));

        const mensajes = chatsLocales.flatMap((chat, indiceChat) => (
            (chat.messages || []).map((mensaje, indice) => ({
                conversation_id: chat.id,
                role: mensaje.sender === "bot" ? "agent" : "user",
                content: String(mensaje.content || ""),
                created_at: new Date(ahora - indiceChat * 1000 + indice).toISOString()
            }))
        ));

        const { error: errorConversaciones } = await supabase.from("conversations").upsert(conversaciones);
        if (errorConversaciones) throw errorConversaciones;

        if (mensajes.length) {
            const { error: errorMensajes } = await supabase.from("messages").insert(mensajes);
            if (errorMensajes) throw errorMensajes;
        }

        return true;
    } catch (error) {
        console.error("No se pudo migrar el historial local a Supabase.", error);
        return false;
    }
}
