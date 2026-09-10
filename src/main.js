import "./components/home/home.js";
import { db } from "./config/firebase.js";
import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export async function guardarPrueba() {
    try {
        const docRef = await addDoc(collection(db, "usuarios"), {
            nombre: "Prueba desde JS",
            rol: "estudiante",
            fecha: serverTimestamp()
        });

        console.log("¡Éxito! El dato se guardó con el ID:", docRef.id);
        alert("¡Dato guardado en Firebase!");
        return true;
    } catch (error) {
        console.error("Uy, algo falló:", error);
        alert("Error al guardar. Revisa la consola (F12).");
        return false;
    }
}

function setup() {
    const botonGuardar = document.getElementById("boton-guardar");
    if (botonGuardar) {
        botonGuardar.addEventListener("click", guardarPrueba);
    }

    window.guardarPrueba = guardarPrueba;
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
} else {
    setup();
}
