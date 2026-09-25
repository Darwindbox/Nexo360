/* Control principal de la interfaz. No realiza llamadas a APIs externas. */
document.addEventListener("DOMContentLoaded", () => {
  const greeting = "Hola, soy LIA, tu asistente académica.";
  const typedGreeting = document.querySelector("#typedGreeting");
  const form = document.querySelector("#chatForm");
  const input = document.querySelector("#questionInput");
  const conversation = document.querySelector("#conversation");
  const clearButton = document.querySelector("#clearChat");
  const menuButton = document.querySelector("#menuButton");
  const sidebar = document.querySelector("#sidebar");
  const overlay = document.querySelector("#overlay");
  const materialsGrid = document.querySelector("#materialsGrid");
  const materialsEmpty = document.querySelector("#materialsEmpty");
  const materialCourseFilter = document.querySelector("#materialCourseFilter");
  const sendButton = form.querySelector('button[type="submit"]');
  const catalogKey = "liaCatalogoV1";
  let chatHistory = [];

  // Prioriza el catálogo permanente del servidor y conserva compatibilidad local.
  const readCatalog = async () => {
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch {
      // Al abrir index.html directamente, fetch no está disponible para esta ruta.
    }
    try {
      const saved = JSON.parse(window.localStorage.getItem(catalogKey));
      return saved && Array.isArray(saved.materias) && Array.isArray(saved.fuentes) ? saved : window.LIA_CATALOG;
    } catch {
      return window.LIA_CATALOG;
    }
  };

  const renderMaterials = async () => {
    const catalog = await readCatalog();
    const activeSubjects = catalog.materias.filter((subject) => subject.activa !== false);
    materialCourseFilter.innerHTML = "";
    activeSubjects.forEach((subject) => {
      const option = document.createElement("option");
      option.value = subject.id;
      option.textContent = `${subject.nombre} · ${subject.periodo}`;
      materialCourseFilter.append(option);
    });

    const paint = () => {
      const subjectId = materialCourseFilter.value;
      const sources = catalog.fuentes.filter((source) => source.materiaId === subjectId && source.activa !== false);
      materialsGrid.innerHTML = "";
      materialsEmpty.hidden = sources.length > 0;
      sources.forEach((source) => {
        const card = document.createElement("article");
        card.className = "material-card";
        const meta = document.createElement("div");
        meta.className = "material-card__meta";
        const type = document.createElement("span");
        type.className = "material-card__type";
        type.textContent = source.tipo;
        const unit = document.createElement("span");
        unit.className = "material-card__unit";
        unit.textContent = source.unidad;
        meta.append(type, unit);

        const title = document.createElement("h3");
        title.textContent = source.titulo;
        const description = document.createElement("p");
        description.textContent = source.descripcion;
        const footer = document.createElement("div");
        footer.className = "material-card__footer";
        const origin = document.createElement("small");
        origin.textContent = source.origen;
        const link = document.createElement("a");
        link.className = "material-card__link";
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.tipo === "Video" ? "Ver video" : "Abrir material";
        footer.append(origin, link);
        card.append(meta, title, description, footer);
        materialsGrid.append(card);
      });
    };

    materialCourseFilter.addEventListener("change", paint);
    paint();
  };

  renderMaterials().catch(() => {
    materialsGrid.innerHTML = "";
    materialsEmpty.hidden = false;
    materialsEmpty.textContent = "No fue posible cargar los materiales en este momento.";
  });

  // Escribe el saludo letra por letra; respeta la preferencia de movimiento reducido.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    typedGreeting.textContent = greeting;
  } else {
    let index = 0;
    const typeNextCharacter = () => {
      typedGreeting.textContent = greeting.slice(0, index += 1);
      if (index < greeting.length) window.setTimeout(typeNextCharacter, 42);
    };
    window.setTimeout(typeNextCharacter, 280);
  }

  const scrollConversation = () => {
    conversation.scrollTop = conversation.scrollHeight;
  };

  // Inserta mensajes usando textContent para no interpretar contenido como HTML.
  const addMessage = (author, text) => {
    const article = document.createElement("div");
    article.className = `message message--${author === "LIA" ? "lia" : "user"}`;

    if (author === "LIA") {
      const avatar = document.createElement("span");
      avatar.className = "avatar-mini";
      const image = document.createElement("img");
      image.src = "assets/avatar-lia.png";
      image.alt = "";
      avatar.append(image);
      article.append(avatar);
    }

    const bubble = document.createElement("div");
    const name = document.createElement("strong");
    const paragraph = document.createElement("p");
    name.textContent = author;
    paragraph.textContent = text;
    bubble.append(name, paragraph);
    article.append(bubble);
    conversation.append(article);
    scrollConversation();
  };

  const showAIReply = async (question) => {
    const loading = document.createElement("div");
    loading.className = "message message--lia";
    loading.innerHTML = '<span class="avatar-mini"><img src="assets/avatar-lia.png" alt=""></span><div><strong>LIA</strong><span class="typing-dots" aria-label="LIA está escribiendo"><i></i><i></i><i></i></span></div>';
    conversation.append(loading);
    scrollConversation();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: chatHistory,
          subjectId: materialCourseFilter.value
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "LIA no pudo responder en este momento.");
      const answer = String(result.answer || "").trim();
      if (!answer) throw new Error("LIA no generó una respuesta. Intenta formular la pregunta de otra manera.");
      loading.remove();
      addMessage("LIA", answer);
      chatHistory.push(
        { role: "user", content: question },
        { role: "assistant", content: answer }
      );
      chatHistory = chatHistory.slice(-8);
    } catch (error) {
      loading.remove();
      addMessage("LIA", error.message || "No fue posible conectar con LIA. Intenta nuevamente.");
    } finally {
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    addMessage("Tú", question);
    input.value = "";
    input.style.height = "auto";
    sendButton.disabled = true;
    input.disabled = true;
    await showAIReply(question);
  });

  // Enter envía; Mayús + Enter crea una nueva línea.
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  });

  document.querySelectorAll(".quick-card").forEach((card) => {
    card.addEventListener("click", () => {
      input.value = card.dataset.prompt;
      input.focus();
      document.querySelector("#chat").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
  });

  clearButton.addEventListener("click", () => {
    chatHistory = [];
    conversation.innerHTML = '<div class="message message--lia"><span class="avatar-mini"><img src="assets/avatar-lia.png" alt=""></span><div><strong>LIA</strong><p>¡Hola! ¿Qué te gustaría aprender hoy?</p></div></div>';
  });

  const closeMenu = () => {
    sidebar.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    overlay.hidden = true;
  };

  menuButton.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
    overlay.hidden = !isOpen;
  });
  overlay.addEventListener("click", closeMenu);
  document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", closeMenu));
});
