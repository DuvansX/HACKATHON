import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile
/*
  onAuthStateChanged
*/
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyArYIGlCbnAbL6dz0-cuur1JC885VKkkUc",
  authDomain: "ideapro-d6657.firebaseapp.com",
  projectId: "ideapro-d6657",
  storageBucket: "ideapro-d6657.firebasestorage.app",
  messagingSenderId: "8493880791",
  appId: "1:8493880791:web:3d3d3354e139419651a792",
  measurementId: "G-DRJ95515ED"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

function perfilUsuario(user, cambios = {}) {
  const nombre = cambios.nombre || user.displayName || user.email?.split("@")[0] || "Usuario";
  const correo = user.email || "";
  const identificador = correo
    ? correo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : `usuario-${user.uid.slice(0, 8)}`;

  const perfil = {
    nombre,
    correo,
    foto: user.photoURL || "",
    uid: user.uid,
    identificador,
    proveedor: user.providerData[0]?.providerId || "password",
    actualizadoEn: serverTimestamp(),
    ...cambios
  };

  Object.keys(perfil).forEach((clave) => {
    if (perfil[clave] === undefined) delete perfil[clave];
  });
  return perfil;
}

export async function guardarPerfilUsuario(user, cambios = {}) {
  await setDoc(doc(db, "usuarios", user.uid), perfilUsuario(user, cambios), { merge: true });
}

export async function iniciarConCorreo(correo, contrasena) {
  const resultado = await signInWithEmailAndPassword(auth, correo.trim(), contrasena);
  await guardarPerfilUsuario(resultado.user, { ultimoAcceso: serverTimestamp() });
  return resultado.user;
}

export async function registrarConCorreo(nombre, correo, contrasena) {
  const resultado = await createUserWithEmailAndPassword(auth, correo.trim(), contrasena);
  if (nombre.trim()) await updateProfile(resultado.user, { displayName: nombre.trim() });
  await sendEmailVerification(resultado.user);
  await guardarPerfilUsuario(resultado.user, nombre.trim() ? { nombre: nombre.trim() } : {});
  return resultado.user;
}

export async function enviarCorreoRestablecimiento(correo) {
  await sendPasswordResetEmail(auth, correo.trim());
}

export async function iniciarConGoogle() {
  const resultado = await signInWithPopup(auth, provider);
  const user = resultado.user;

  // El acceso al chat no debe depender de que Firestore esté disponible o de
  // que sus reglas permitan guardar el perfil en ese momento.
  try {
    const nombreBase = user.displayName || user.email?.split("@")[0] || "Usuario";
    const nombreSinEspacios = String(nombreBase).replace(/\s+/g, "");
    const idEsteticoUsuario = `${nombreSinEspacios}_${user.uid.substring(0, 6)}`;

    await guardarPerfilUsuario(user, {
      nombre: nombreBase,
      idEstetico: idEsteticoUsuario,
      ultimoAcceso: serverTimestamp(),
    });
  } catch (error) {
    console.warn("No se pudo guardar el perfil en Firestore.", error);
  }

  return user;
}

export async function iniciarComoInvitado() {
  const resultado = await signInAnonymously(auth);
  const user = resultado.user;

  // Igual que con Google: si Firestore falla, el invitado igual debe poder
  // entrar al chat. Solo se guarda un perfil mínimo para identificarlo.
  try {
    await setDoc(doc(db, "usuarios", user.uid), {
      nombre: "Invitado",
      correo: null,
      foto: null,
      uid: user.uid,
      esInvitado: true,
      ultimoAcceso: serverTimestamp(),
      actualizadoEn: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("No se pudo guardar el perfil de invitado en Firestore.", error);
  }

  return user;
}

/*
export async function iniciarConGoogle() {
  const resultado = await signInWithPopup(auth, provider);
  const user = resultado.user;

  // El acceso al chat no debe depender de que Firestore esté disponible o de
  // que sus reglas permitan guardar el perfil en ese momento.
  try {
    const nombreBase = user.displayName || user.email?.split("@")[0] || "Usuario";
    const nombreSinEspacios = String(nombreBase).replace(/\s+/g, "");
    const idEsteticoUsuario = `${nombreSinEspacios}_${user.uid.substring(0, 6)}`;

    await setDoc(doc(db, "usuarios", user.uid), {
      nombre: nombreBase,
      correo: user.email,
      foto: user.photoURL,
      uid: user.uid,
      idEstetico: idEsteticoUsuario,
      ultimoAcceso: serverTimestamp(),
      actualizadoEn: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("No se pudo guardar el perfil en Firestore.", error);
  }

  return user;
}

export async function iniciarComoInvitado() {
  const resultado = await signInAnonymously(auth);
  const user = resultado.user;

  // Igual que con Google: si Firestore falla, el invitado igual debe poder
  // entrar al chat. Solo se guarda un perfil mínimo para identificarlo.
  try {
    await setDoc(doc(db, "usuarios", user.uid), {
      nombre: "Invitado",
      correo: null,
      foto: null,
      uid: user.uid,
      esInvitado: true,
      ultimoAcceso: serverTimestamp(),
      actualizadoEn: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("No se pudo guardar el perfil de invitado en Firestore.", error);
  }

  return user;
}

*/
export async function guardarConsulta(empresaId, pregunta, respuesta) {
  const user = auth.currentUser;
  if (!user) return;

  await addDoc(
    collection(db, "usuarios", user.uid, "empresas", empresaId, "consultas"),
    {
      pregunta,
      respuesta,
      fecha: serverTimestamp()
    }
  );
}

export async function obtenerHistorial(empresaId) {
  const user = auth.currentUser;
  if (!user) return [];

  const consultasRef = collection(
    db, "usuarios", user.uid, "empresas", empresaId, "consultas"
  );

  const resultado = await getDocs(query(consultasRef, orderBy("fecha", "desc")));
  return resultado.docs.map(documento => ({
    id: documento.id,
    ...documento.data()
  }));
}

onAuthStateChanged(auth, (user) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ideapro-auth-state", { detail: user }));
  }

  const pathname = window.location.pathname;

  if (user && pathname.includes("index.html")) {
    return;
  }
});
