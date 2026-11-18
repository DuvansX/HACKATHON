# IDEASANTOTO – IDEAPRO Copilot

> Inteligencia artificial para llevar tu empresa al mercado público.

## Descripción general

**IDEASANTOTO** es una aplicación web desarrollada como solución para un hackathon. Su asistente de inteligencia artificial, **IDEAPRO Copilot**, analiza las necesidades y el nivel de madurez de una empresa y crea una ruta personalizada para ayudarla a participar en el mercado público (contratación con el Estado).

La plataforma cuenta con una página de presentación, un chat demostrativo del Copilot y un sistema de acceso para usuarios (correo, Google o invitado), con una interfaz moderna que incluye modo claro y modo oscuro.

## Objetivo del proyecto

El objetivo principal es facilitar que empresas que nunca han trabajado con el Estado (por ejemplo, empresas de tecnología) entiendan qué tan preparadas están y qué pasos deben seguir para acceder a oportunidades del sector público.

La plataforma busca ofrecer un acompañamiento sencillo, visual y guiado, desde el diagnóstico inicial hasta el seguimiento del proceso.

## Funcionalidades principales

### Página de inicio
La página principal presenta la propuesta de valor del proyecto e incluye:

- Mensaje principal: "Lleva tu empresa al mercado público".
- Botones de acción: **Comenzar diagnóstico** y **Conocer más**.
- Demo del chat de **IDEAPRO Copilot**.
- Resumen del proceso en tres pasos: Diagnóstico, Recomendaciones y Acompañamiento.
- Menú de navegación: Quiénes somos, Territorios, Cómo funciona y Beneficios.
- Botón de modo claro / oscuro.

### Cómo funciona

| Paso | Descripción |
|------|-------------|
| 01. Diagnóstico | El Copilot conoce la empresa y evalúa su nivel de preparación. |
| 02. Recomendaciones | Se genera una ruta personalizada con los pasos a seguir. |
| 03. Acompañamiento | La empresa recibe guía durante el proceso. |

### Inicio de sesión y registro
La pantalla de acceso permite:

- Iniciar sesión con correo electrónico y contraseña.
- Mostrar u ocultar la contraseña.
- Recordar la sesión por 30 días.
- Recuperar la contraseña.
- Iniciar sesión con Google.
- Iniciar como invitado.
- Registrarse como nuevo usuario.


## Capturas del proyecto

### Inicio
![Página de inicio](Captura de pantalla 2026-11-18 114120.png)

### Inicio de sesión

<img width="1430" height="775" alt="Captura de pantalla 2026-11-18 114109" src="https://github.com/user-attachments/assets/d21f9f4f-a1cf-4f34-9a24-0c04555f8eaa" />


## Tecnologías utilizadas

| Tecnología | Uso |
|------------|-----|
| HTML | Estructura de las páginas |
| CSS | Estilos visuales y modo claro/oscuro |
| JavaScript | Interactividad y lógica de la interfaz |
| Visual Studio Code | Editor de código utilizado |
| GitHub | Publicación y control de versiones |

> Si el proyecto usa otras herramientas (API de IA, Google Auth, Firebase, etc.), agrégalas a esta tabla.

## Estructura del proyecto

```
HACKATHON/
├── img/
│   ├── inicio.png
│   └── login.png
├── index.html
├── script.js
├── style.css
└── README.md
```

## Requisitos previos

Antes de ejecutar el proyecto, se recomienda tener:

- Un navegador web actualizado (Chrome, Edge o Firefox).
- Git (para clonar el repositorio).
- Visual Studio Code con la extensión *Live Server* (opcional).

## Cómo ejecutar el proyecto

### 1. Descargar o clonar el repositorio

```bash
git clone https://github.com/DuvansX/HACKATHON.git
```

Luego entrar a la carpeta del proyecto:

```bash
cd HACKATHON
```

También se puede descargar el repositorio como archivo `.zip` desde GitHub y descomprimirlo.

### 2. Abrir el proyecto

- **Opción A:** hacer doble clic en `index.html` para abrirlo en el navegador.
- **Opción B:** en Visual Studio Code, clic derecho sobre `index.html` y elegir **Open with Live Server**.

## Notas importantes

- Las imágenes deben estar en la carpeta `img/` para que se vean en el README y en la página.
- Si algo no carga, verifica que `index.html`, `script.js` y `style.css` estén en la misma carpeta.
- Algunas funciones (como el inicio de sesión con Google) pueden requerir conexión a internet.

## Posibles errores comunes

**Las imágenes no se ven en el README**
Verifica que los archivos estén en `img/` y que los nombres coincidan exactamente (`inicio.png`, `login.png`).

**La página se ve sin estilos**
Revisa que `style.css` esté en la misma carpeta que `index.html`.


## Equipo

- [DuvansX](https://github.com/DuvansX)
- Juan David Avila
- Oriana Lozano
- Juan Mahecha
- Jualian Daza 

## Estado del proyecto

Proyecto académico desarrollado para un hackathon, en desarrollo.
