# IDEAPRO Copilot — Agente Inteligente para Ecosistema Público

> **HackTech 5.0 (2026)** | **Reto 2:** Diseño de un agente inteligente para empresarios que facilite la entrada al ecosistema público y servicios de IDEAPRO.  
> **Empresa Proponente:** IDEAPRO S.A.S.


---

##  Contexto y Descripción del Reto

Las micro, pequeñas y medianas empresas interesadas en contratar con el Estado frecuentemente enfrentan una barrera de entrada: desconocen los requisitos normativos, su propio nivel de preparación y cuál es la oferta de servicios adecuada para su etapa de madurez. Por su parte, para **IDEAPRO S.A.S.** resulta complejo escalar diagnósticos personalizados sin depender de la intervención constante de un consultor humano.

**IDEAPRO Copilot** nace como la puerta de entrada inteligente y escalable al ecosistema de servicios de IDEAPRO: un agente conversacional interactivo capaz de diagnosticar, perfilar y trazar rutas de acompañamiento a la medida de cada empresario.

---

##  Funcionalidades Principales

* **Onboarding Conversacional:** Recolección dinámica de datos clave sobre la empresa, capacidades, experiencia comercial y metas de contratación.
* **Diagnóstico de Madurez y Perfilamiento:** Clasificación automática del nivel de preparación de la organización frente a los procesos de compra pública.
* **Ruta de Crecimiento Personalizada:** Guía paso a paso adaptada al estadio de la empresa para cerrar brechas técnicas y administrativas.
* **Recomendación Inteligente de Portafolio:** Sugerencia contextualizada de consultorías, capacitaciones, herramientas y mentorías de IDEAPRO sin recurrir a ventas genéricas.
* **Persistencia y Seguimiento:** Historial de conversaciones sincronizado en la nube para mantener el contexto del usuario en futuras sesiones.
* **Accesibilidad e Inclusión:** Panel nativo de ajustes de accesibilidad (alto contraste, tipografía legible, escala tipográfica, lector de pantalla).

---

##  Arquitectura Técnica

El proyecto está estructurado como una solución web Vanilla, lista para desplegarse ágilmente y escalar dentro del ecosistema digital de IDEAPRO:

* **Frontend:** HTML5 semántico, CSS3 modular (diseño responsive, soporte dark/light mode y accesibilidad WCAG) y Vanilla JavaScript (ES Modules).
* **Autenticación y Persistencia:** Integración de base de datos (como Supabase o Firebase) para el almacenamiento reactivo de perfiles, sesiones y chats.
* **Motor de IA y Orquestación:** Flujo automatizado en **n8n** expuesto vía Webhook, integrando modelos de Inteligencia Artificial (Anthropic / Ollama) para el análisis de lenguaje natural y generación de diagnósticos en tiempo real.

---

## Stack Tecnologico 

<div align="center">
  <table>
    <!-- Fila 1: Frontend -->
    <tr>
      <td align="center" width="160">
        <img src="https://skillicons.dev/icons?i=html" height="48" alt="HTML5"/><br/>
        <strong>HTML5</strong>
      </td>
      <td align="center" width="160">
        <img src="https://skillicons.dev/icons?i=css" height="48" alt="CSS3"/><br/>
        <strong>CSS3</strong>
      </td>
      <td align="center" width="160">
        <img src="https://skillicons.dev/icons?i=javascript" height="48" alt="JavaScript"/><br/>
        <strong>JavaScript</strong>
      </td>
    </tr>
    <!-- Fila 2: Backend, DB y Automatización -->
    <tr>
      <td align="center" width="160">
        <img src="https://skillicons.dev/icons?i=supabase" height="48" alt="Supabase"/><br/>
        <strong>Supabase</strong>
      </td>
      <td align="center" width="160">
        <img src="https://cdn.simpleicons.org/n8n/EA4B71" height="48" width="48" alt="n8n"/><br/>
        <strong>n8n</strong>
      </td>
      <td align="center" width="160">
        <img src="https://skillicons.dev/icons?i=github" height="48" alt="GitHub"/><br/>
        <strong>GitHub</strong>
      </td>
    </tr>
    <!-- Fila 3: Modelos IA & Entorno IDE -->
    <tr>
      <td align="center" width="160">
        <img src="https://cdn.simpleicons.org/ollama/a3a3a3" height="48" width="48" alt="Ollama"/><br/>
        <strong>Ollama</strong>
      </td>
      <td align="center" width="160">
        <img src="https://cdn.simpleicons.org/anthropic/D97757" height="48" width="48" alt="Anthropic"/><br/>
        <strong>Anthropic</strong>
      </td>
      <td align="center" width="160">
        <img src="https://skillicons.dev/icons?i=gcp" height="48" alt="Google"/><br/>
        <strong>Google</strong>
      </td>
    </tr>
  </table>
</div>

---

## 📁 Estructura del Repositorio

```text
proyecto-nombre/
├── src/
│   ├── components/
│   │   ├── auth/          # Vistas y lógica de autenticación (login.html, login.js)
│   │   ├── chat/          # Interfaz conversacional del Copilot (chat.html, chat.js)
│   │   └── shared/        # Utilidades compartidas y persistencia (Save.js)
│   ├── styles/            # Hojas de estilo modulares (styles.css, style.css)
│   ├── config/            # Configuraciones y credenciales de servicios
│   ├── assets/            # Recursos estáticos (imágenes, logos, iconos)
│   └── main.js            # Lógica central e integraciones de la landing page
├── index.html             # Punto de entrada principal (Landing Page en la raíz)
├── .gitignore             # Archivos excluidos del control de versiones
└── README.md
