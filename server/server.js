/* Servidor local de LIA: publica la interfaz y conserva el catálogo docente. */
"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");
const dataDirectory = process.env.LIA_DATA_DIR
  ? path.resolve(process.env.LIA_DATA_DIR)
  : path.join(__dirname, "data");
const catalogPath = path.join(dataDirectory, "catalog.json");
const seedCatalogPath = path.join(__dirname, "data", "catalog.example.json");
// HOST permite compartir temporalmente LIA dentro de la misma red Wi-Fi.
const host = process.env.HOST || (process.env.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1");
const port = Number(process.env.PORT) || 4173;
const maxBodyBytes = 1024 * 1024;
const adminUser = process.env.LIA_ADMIN_USER || "";
const adminPassword = process.env.LIA_ADMIN_PASSWORD || "";
const sessionSecret = process.env.LIA_SESSION_SECRET || "";
const authConfigured = Boolean(adminUser && adminPassword && sessionSecret.length >= 32);
const sessionDurationSeconds = 8 * 60 * 60;
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5-mini";
const chatRateLimits = new Map();

// Crea el catálogo privado a partir del ejemplo cuando se instala LIA por primera vez.
const ensureCatalog = async () => {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.access(catalogPath);
  } catch {
    await fs.copyFile(seedCatalogPath, catalogPath);
  }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf"
};

const publicFiles = new Set(["index.html", "login.html", "data/catalogo.js"]);
const publicDirectories = ["assets/", "css/", "js/"];

const isPublicPath = (relativePath) => {
  const webPath = relativePath.split(path.sep).join("/");
  return publicFiles.has(webPath)
    || webPath === "admin"
    || webPath === "admin/index.html"
    || publicDirectories.some((directory) => webPath.startsWith(directory));
};

const sendJson = (response, status, payload) => {
  response.setHeader("Cache-Control", "no-store");
  response.writeHead(status, { "Content-Type": mimeTypes[".json"] });
  response.end(JSON.stringify(payload));
};

const parseCookies = (request) => Object.fromEntries(
  String(request.headers.cookie || "")
    .split(";")
    .map((item) => item.trim().split("="))
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key, decodeURIComponent(value)])
);

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const signSession = (payload) => crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");

const createSession = () => {
  const payload = Buffer.from(JSON.stringify({ user: adminUser, expires: Date.now() + sessionDurationSeconds * 1000 })).toString("base64url");
  return `${payload}.${signSession(payload)}`;
};

const hasValidSession = (request) => {
  if (!authConfigured) return false;
  const token = parseCookies(request).lia_session;
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, signSession(payload))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.user === adminUser && Number(session.expires) > Date.now();
  } catch {
    return false;
  }
};

const cookieSecurity = (request) => request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";

const setSessionCookie = (request, response, token, maxAge) => {
  response.setHeader("Set-Cookie", `lia_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cookieSecurity(request)}`);
};

const cleanString = (value, label, maxLength) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} es obligatorio.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(`${label} supera el límite de ${maxLength} caracteres.`);
  return cleaned;
};

const getClientAddress = (request) => String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim();

const chatLimitReached = (request) => {
  const address = getClientAddress(request);
  const now = Date.now();
  const windowStart = now - (10 * 60 * 1000);
  const recentRequests = (chatRateLimits.get(address) || []).filter((timestamp) => timestamp > windowStart);
  if (recentRequests.length >= 20) return true;
  recentRequests.push(now);
  chatRateLimits.set(address, recentRequests);
  return false;
};

const extractResponseText = (responseData) => {
  if (typeof responseData.output_text === "string") return responseData.output_text.trim();
  return (responseData.output || [])
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text.trim())
    .filter(Boolean)
    .join("\n\n");
};

const buildAcademicInstructions = (catalog, subjectId) => {
  const subject = catalog.materias.find((item) => item.id === subjectId && item.activa !== false)
    || catalog.materias.find((item) => item.activa !== false);
  const sources = subject
    ? catalog.fuentes.filter((item) => item.materiaId === subject.id && item.activa !== false)
    : [];
  const sourceSummary = sources.length
    ? sources.map((source) => `- ${source.titulo} (${source.tipo}, ${source.unidad}): ${source.descripcion}`).join("\n")
    : "- No hay fuentes activas registradas todavía.";

  return `Eres LIA, Asistente Académica Inteligente. Responde siempre en español claro, cálido y académico.
Materia actual: ${subject ? `${subject.nombre}, ${subject.carrera}, periodo ${subject.periodo}` : "sin materia seleccionada"}.

Fuentes registradas por el docente (solo conoces sus metadatos, no afirmes haber leído el contenido completo):
${sourceSummary}

Reglas obligatorias:
1. Enseña, explica conceptos, ofrece ejemplos, pistas, preguntas guía y retroalimentación.
2. No hagas tareas, trabajos, ensayos, proyectos, cuestionarios ni evaluaciones que el estudiante deba entregar como propios.
3. Si te piden realizar una entrega, rechaza amablemente esa parte y ofrece acompañamiento paso a paso; pide que compartan su intento.
4. Puedes aportar conocimiento general relacionado con la materia cuando no aparezca en las fuentes, indicándolo con honestidad.
5. No inventes citas, páginas, autores ni contenidos de los materiales.
6. Sé concisa por defecto y adapta la profundidad a la pregunta.`;
};

const requestOpenAIResponse = async ({ message, history, catalog, subjectId }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const input = history
      .slice(-8)
      .map((item) => ({ role: item.role, content: item.content }))
      .concat({ role: "user", content: message });
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: openaiModel,
        store: false,
        max_output_tokens: 700,
        instructions: buildAcademicInstructions(catalog, subjectId),
        input
      }),
      signal: controller.signal
    });
    if (!apiResponse.ok) {
      const error = new Error("La inteligencia de LIA no está disponible en este momento.");
      error.status = apiResponse.status;
      throw error;
    }
    const answer = extractResponseText(await apiResponse.json());
    if (!answer) throw new Error("LIA no generó una respuesta utilizable.");
    return answer;
  } finally {
    clearTimeout(timeout);
  }
};

// Normaliza y valida todo el catálogo antes de escribirlo en disco.
const validateCatalog = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("El catálogo no es válido.");
  if (!Array.isArray(value.materias) || !Array.isArray(value.fuentes)) throw new Error("El catálogo debe incluir materias y fuentes.");
  if (value.materias.length > 100 || value.fuentes.length > 1000) throw new Error("El catálogo supera el tamaño permitido.");

  const modes = new Set(["estricto", "ampliado", "investigacion", "evaluacion"]);
  const sourceTypes = new Set(["Libro", "Presentación", "Página web", "Video", "Apuntes"]);
  const subjectIds = new Set();

  const materias = value.materias.map((subject, index) => {
    if (!subject || typeof subject !== "object") throw new Error(`La materia ${index + 1} no es válida.`);
    const id = cleanString(subject.id, "El identificador de la materia", 160);
    if (subjectIds.has(id)) throw new Error(`El identificador de materia ${id} está duplicado.`);
    subjectIds.add(id);
    const modo = cleanString(subject.modo, "El modo de asistencia", 30);
    if (!modes.has(modo)) throw new Error(`El modo ${modo} no está permitido.`);
    return {
      id,
      nombre: cleanString(subject.nombre, "El nombre de la materia", 100),
      carrera: cleanString(subject.carrera, "La carrera", 100),
      periodo: cleanString(subject.periodo, "El periodo", 30),
      modo,
      activa: subject.activa !== false
    };
  });

  const sourceIds = new Set();
  const fuentes = value.fuentes.map((source, index) => {
    if (!source || typeof source !== "object") throw new Error(`La fuente ${index + 1} no es válida.`);
    const id = cleanString(source.id, "El identificador de la fuente", 180);
    if (sourceIds.has(id)) throw new Error(`El identificador de fuente ${id} está duplicado.`);
    sourceIds.add(id);
    const materiaId = cleanString(source.materiaId, "La materia de la fuente", 160);
    if (!subjectIds.has(materiaId)) throw new Error(`La fuente ${id} no pertenece a una materia registrada.`);
    const tipo = cleanString(source.tipo, "El tipo de fuente", 40);
    if (!sourceTypes.has(tipo)) throw new Error(`El tipo ${tipo} no está permitido.`);
    const url = cleanString(source.url, "El enlace o ruta", 500);
    if (!/^(https?:\/\/|assets\/materiales\/)/i.test(url)) throw new Error("Las fuentes deben usar http(s) o la carpeta assets/materiales/.");
    return {
      id,
      materiaId,
      titulo: cleanString(source.titulo, "El título de la fuente", 140),
      tipo,
      unidad: cleanString(source.unidad, "La unidad", 50),
      descripcion: cleanString(source.descripcion, "La descripción", 260),
      origen: cleanString(source.origen || "Fuente agregada por el docente", "El origen", 120),
      url,
      activa: source.activa !== false
    };
  });

  return { materias, fuentes };
};

const readRequestBody = (request) => new Promise((resolve, reject) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
      reject(new Error("La solicitud supera 1 MB."));
      request.destroy();
    }
  });
  request.on("end", () => resolve(body));
  request.on("error", reject);
});

const handleApi = async (request, response, pathname) => {
  if (pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, storage: "persistent", authentication: authConfigured ? "configured" : "required", ai: openaiApiKey ? "configured" : "required" });
    return true;
  }

  if (pathname === "/api/chat" && request.method === "POST") {
    if (!openaiApiKey) {
      sendJson(response, 503, { error: "La inteligencia de LIA todavía no está configurada." });
      return true;
    }
    if (chatLimitReached(request)) {
      sendJson(response, 429, { error: "Has realizado varias consultas seguidas. Espera unos minutos para continuar." });
      return true;
    }
    try {
      const payload = JSON.parse(await readRequestBody(request));
      const message = cleanString(payload.message, "La pregunta", 1000);
      const restrictedRequest = /(haz|realiza|resuelve|contesta|escribe|elabora|redacta).{0,80}(tarea|trabajo|actividad|examen|ensayo|cuestionario|proyecto)/i.test(message);
      if (restrictedRequest) {
        sendJson(response, 200, {
          answer: "Puedo ayudarte a comprender la actividad y acompañarte paso a paso, pero no realizarla por ti. Comparte lo que has intentado o dime qué parte te resulta difícil."
        });
        return true;
      }
      const history = Array.isArray(payload.history)
        ? payload.history
          .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
          .slice(-8)
          .map((item) => ({ role: item.role, content: item.content.slice(0, 2000) }))
        : [];
      const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
      const answer = await requestOpenAIResponse({ message, history, catalog, subjectId: String(payload.subjectId || "") });
      sendJson(response, 200, { answer });
    } catch (error) {
      if (error.name === "AbortError") sendJson(response, 504, { error: "LIA tardó demasiado en responder. Intenta nuevamente." });
      else if (error.status === 401) sendJson(response, 503, { error: "La conexión de LIA necesita revisión del docente." });
      else if (error.status === 429) sendJson(response, 429, { error: "LIA alcanzó temporalmente su límite de consultas. Intenta más tarde." });
      else sendJson(response, 400, { error: error instanceof SyntaxError ? "La consulta enviada no es válida." : error.message });
    }
    return true;
  }

  if (pathname === "/api/auth/session" && request.method === "GET") {
    sendJson(response, 200, { configured: authConfigured, authenticated: hasValidSession(request) });
    return true;
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    if (!authConfigured) {
      sendJson(response, 503, { error: "El acceso docente todavía no está configurado." });
      return true;
    }
    try {
      const credentials = JSON.parse(await readRequestBody(request));
      const valid = safeEqual(credentials.username || "", adminUser) && safeEqual(credentials.password || "", adminPassword);
      if (!valid) {
        sendJson(response, 401, { error: "Usuario o contraseña incorrectos." });
        return true;
      }
      setSessionCookie(request, response, createSession(), sessionDurationSeconds);
      sendJson(response, 200, { authenticated: true });
    } catch {
      sendJson(response, 400, { error: "No fue posible procesar el inicio de sesión." });
    }
    return true;
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    setSessionCookie(request, response, "", 0);
    sendJson(response, 200, { authenticated: false });
    return true;
  }

  if (pathname !== "/api/catalog") return false;
  if (request.method === "GET") {
    const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
    sendJson(response, 200, catalog);
    return true;
  }
  if (request.method === "PUT") {
    if (!hasValidSession(request)) {
      sendJson(response, 401, { error: "La sesión docente expiró o no es válida." });
      return true;
    }
    try {
      const body = await readRequestBody(request);
      const catalog = validateCatalog(JSON.parse(body));
      const temporaryPath = `${catalogPath}.tmp`;
      await fs.writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
      await fs.rename(temporaryPath, catalogPath);
      sendJson(response, 200, catalog);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof SyntaxError ? "El JSON enviado no es válido." : error.message });
    }
    return true;
  }

  response.setHeader("Allow", "GET, PUT");
  sendJson(response, 405, { error: "Método no permitido." });
  return true;
};

const serveStaticFile = async (request, response, pathname) => {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Ruta no válida." });
    return;
  }

  const requestedPath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let filePath = path.resolve(projectRoot, requestedPath);
  if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${path.sep}`)) {
    sendJson(response, 403, { error: "Acceso no permitido." });
    return;
  }

  const relativePath = path.relative(projectRoot, filePath);
  if (!isPublicPath(relativePath)) {
    sendJson(response, 404, { error: "Recurso no encontrado." });
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) filePath = path.join(filePath, "index.html");
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const cacheControl = extension === ".html" ? "no-store" : "public, max-age=3600";
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": cacheControl
    });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") sendJson(response, 404, { error: "Recurso no encontrado." });
    else throw error;
  }
};

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com");

  try {
    const pathname = new URL(request.url, `http://${request.headers.host || host}`).pathname;
    if (await handleApi(request, response, pathname)) return;
    if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !hasValidSession(request)) {
      response.writeHead(302, { Location: authConfigured ? "/login.html" : "/login.html?setup=required" });
      response.end();
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Método no permitido." });
      return;
    }
    await serveStaticFile(request, response, pathname);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Ocurrió un error interno." });
    else response.end();
  }
});

ensureCatalog()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`LIA está disponible en http://${host}:${port}`);
    });
  })
  .catch((error) => {
    console.error("No fue posible preparar el almacenamiento de LIA.", error);
    process.exitCode = 1;
  });
