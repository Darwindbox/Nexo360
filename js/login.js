/* Inicio de sesión del área docente. Las credenciales se validan únicamente en el servidor. */
document.addEventListener("DOMContentLoaded", async () => {
  const form = document.querySelector("#loginForm");
  const message = document.querySelector("#loginMessage");
  const button = form.querySelector("button");

  try {
    const session = await fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json());
    if (session.authenticated) window.location.replace("/admin/");
    if (!session.configured) message.textContent = "El acceso docente debe configurarse en el servidor antes de iniciar sesión.";
  } catch {
    message.textContent = "No fue posible conectar con el servidor de LIA.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    message.textContent = "";
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.querySelector("#username").value,
          password: document.querySelector("#password").value
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No fue posible iniciar sesión.");
      window.location.replace("/admin/");
    } catch (error) {
      message.textContent = error.message;
      button.disabled = false;
    }
  });
});
