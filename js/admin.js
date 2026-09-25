/* Administración del catálogo: usa el servidor local y conserva un respaldo por navegador. */
document.addEventListener("DOMContentLoaded", async () => {
  const catalogKey = "liaCatalogoV1";
  const cloneSeed = () => JSON.parse(JSON.stringify(window.LIA_CATALOG));
  let catalog = cloneSeed();
  let apiAvailable = false;

  const subjectForm = document.querySelector("#subjectForm");
  const sourceForm = document.querySelector("#sourceForm");
  const subjectList = document.querySelector("#subjectList");
  const sourceList = document.querySelector("#sourceList");
  const sourceSubject = document.querySelector("#sourceSubject");
  const message = document.querySelector("#saveMessage");
  const storageStatus = document.querySelector("#storageStatus");

  const slug = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const showMessage = (text, isError = false) => {
    message.textContent = text;
    message.style.color = isError ? "#9f2f3d" : "";
    window.setTimeout(() => {
      if (message.textContent === text) message.textContent = "";
    }, 3600);
  };

  const setStorageStatus = (permanent) => {
    storageStatus.classList.toggle("is-local", !permanent);
    storageStatus.innerHTML = permanent
      ? "<span></span>Almacenamiento permanente activo"
      : "<span></span>Modo local del navegador";
  };

  // Intenta obtener los datos compartidos. Si no hay servidor, usa localStorage.
  const loadCatalog = async () => {
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("El servidor no respondió correctamente.");
      const storedCatalog = await response.json();
      apiAvailable = true;
      setStorageStatus(true);
      return storedCatalog;
    } catch {
      apiAvailable = false;
      setStorageStatus(false);
      try {
        return JSON.parse(window.localStorage.getItem(catalogKey)) || cloneSeed();
      } catch {
        return cloneSeed();
      }
    }
  };

  const persist = async (successText) => {
    if (apiAvailable) {
      const response = await fetch("/api/catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(catalog)
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.replace("/login.html");
        throw new Error("La sesión docente expiró.");
      }
      if (!response.ok) throw new Error(result.error || "No fue posible guardar el catálogo.");
      catalog = result;
      showMessage(`${successText} Guardado permanentemente.`);
      return;
    }

    window.localStorage.setItem(catalogKey, JSON.stringify(catalog));
    showMessage(`${successText} Guardado en este navegador.`);
  };

  const runAction = async (action) => {
    try {
      await action();
    } catch (error) {
      showMessage(error.message || "No fue posible completar la operación.", true);
    }
  };

  const actionButton = (label, className, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener("click", () => runAction(onClick));
    return button;
  };

  const render = () => {
    document.querySelector("#subjectCount").textContent = `${catalog.materias.length} registradas`;
    document.querySelector("#sourceCount").textContent = `${catalog.fuentes.length} registradas`;
    sourceSubject.innerHTML = "";
    subjectList.innerHTML = "";
    sourceList.innerHTML = "";

    catalog.materias.forEach((subject) => {
      const option = document.createElement("option");
      option.value = subject.id;
      option.textContent = `${subject.nombre} · ${subject.periodo}`;
      sourceSubject.append(option);

      const record = document.createElement("article");
      record.className = `record${subject.activa === false ? " is-disabled" : ""}`;
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = subject.nombre;
      const detail = document.createElement("p");
      detail.textContent = `${subject.carrera} · ${subject.periodo} · Modo ${subject.modo}`;
      copy.append(title, detail);
      const actions = document.createElement("div");
      actions.className = "record-actions";
      actions.append(actionButton(subject.activa === false ? "Activar" : "Pausar", "", async () => {
        const previousValue = subject.activa;
        subject.activa = subject.activa === false;
        try {
          await persist("Materia actualizada.");
          render();
        } catch (error) {
          subject.activa = previousValue;
          throw error;
        }
      }));
      record.append(copy, actions);
      subjectList.append(record);
    });

    catalog.fuentes.forEach((source) => {
      const subject = catalog.materias.find((item) => item.id === source.materiaId);
      const record = document.createElement("article");
      record.className = `record${source.activa === false ? " is-disabled" : ""}`;
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = source.titulo;
      const detail = document.createElement("p");
      detail.textContent = `${source.tipo} · ${source.unidad} · ${subject ? subject.nombre : "Sin materia"}`;
      copy.append(title, detail);
      const actions = document.createElement("div");
      actions.className = "record-actions";
      actions.append(
        actionButton(source.activa === false ? "Activar" : "Pausar", "", async () => {
          const previousValue = source.activa;
          source.activa = source.activa === false;
          try {
            await persist("Fuente actualizada.");
            render();
          } catch (error) {
            source.activa = previousValue;
            throw error;
          }
        }),
        actionButton("Eliminar", "delete", async () => {
          const previousSources = catalog.fuentes;
          catalog.fuentes = catalog.fuentes.filter((item) => item.id !== source.id);
          try {
            await persist("Fuente eliminada del catálogo.");
            render();
          } catch (error) {
            catalog.fuentes = previousSources;
            throw error;
          }
        })
      );
      record.append(copy, actions);
      sourceList.append(record);
    });
  };

  subjectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(async () => {
      const name = document.querySelector("#subjectName").value.trim();
      const period = document.querySelector("#subjectPeriod").value.trim();
      const subject = {
        id: `${slug(name)}-${slug(period)}-${Date.now()}`,
        nombre: name,
        carrera: document.querySelector("#subjectProgram").value.trim(),
        periodo: period,
        modo: document.querySelector("#subjectMode").value,
        activa: true
      };
      catalog.materias.push(subject);
      try {
        await persist("Materia agregada correctamente.");
        subjectForm.reset();
        render();
      } catch (error) {
        catalog.materias = catalog.materias.filter((item) => item !== subject);
        throw error;
      }
    });
  });

  sourceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(async () => {
      const title = document.querySelector("#sourceTitleInput").value.trim();
      const source = {
        id: `${slug(title)}-${Date.now()}`,
        materiaId: sourceSubject.value,
        titulo: title,
        tipo: document.querySelector("#sourceType").value,
        unidad: document.querySelector("#sourceUnit").value.trim(),
        descripcion: document.querySelector("#sourceDescription").value.trim(),
        origen: "Fuente agregada por el docente",
        url: document.querySelector("#sourceUrl").value.trim(),
        activa: true
      };
      catalog.fuentes.push(source);
      try {
        await persist("Fuente agregada correctamente.");
        sourceForm.reset();
        render();
      } catch (error) {
        catalog.fuentes = catalog.fuentes.filter((item) => item !== source);
        throw error;
      }
    });
  });

  document.querySelector("#resetCatalog").addEventListener("click", () => {
    runAction(async () => {
      const previousCatalog = catalog;
      catalog = cloneSeed();
      try {
        await persist("Se restablecieron los datos iniciales.");
        render();
      } catch (error) {
        catalog = previousCatalog;
        throw error;
      }
    });
  });

  document.querySelector("#logoutButton").addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login.html");
    }
  });

  catalog = await loadCatalog();
  render();
});
