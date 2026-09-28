import { createServer } from "node:http";
import { readFile, readFileSync, stat } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(projectRoot, "public");

function loadLocalEnv() {
  const envPath = path.join(projectRoot, ".env");
  let source;

  try {
    source = readFileSync(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const apiKey = (process.env.ROUTER_API_KEY || "").trim();
const requestTimeoutMs = Number.parseInt(
  process.env.ROUTER_REQUEST_TIMEOUT_MS || "120000",
  10,
);

function getRouterBaseUrl() {
  const configuredUrl =
    process.env.ROUTER_BASE_URL || "http://127.0.0.1:20128";
  const parsed = new URL(configuredUrl);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("ROUTER_BASE_URL must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Do not put credentials in ROUTER_BASE_URL.");
  }

  return parsed.toString().replace(/\/+$/, "");
}

const routerBaseUrl = getRouterBaseUrl();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function routerHeaders(json = false) {
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function proxyRouterResponse(response, endpoint, options = {}) {
  const upstream = await fetch(`${routerBaseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...routerHeaders(Boolean(options.body)),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  const body = await upstream.text();
  response.writeHead(upstream.status, {
    "Cache-Control": "no-store",
    "Content-Type":
      upstream.headers.get("content-type") || "application/json; charset=utf-8",
  });
  response.end(body);
}

async function readJsonBody(request, maximumBytes = 1_000_000) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }

  const relativePath =
    decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicRoot, relativePath);
  const allowedPrefix = `${publicRoot}${path.sep}`;

  if (filePath !== path.join(publicRoot, "index.html") && !filePath.startsWith(allowedPrefix)) {
    sendJson(response, 403, { error: "Access denied." });
    return;
  }

  stat(filePath, (statError, fileStat) => {
    if (statError || !fileStat.isFile()) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }

    const contentType =
      mimeTypes[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream";

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": fileStat.size,
      "Content-Type": contentType,
    });

    readFile(filePath, (readError, content) => {
      if (readError) {
        response.destroy(readError);
        return;
      }
      response.end(content);
    });
  });
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(
    request.url || "/",
    `http://${request.headers.host || "127.0.0.1"}`,
  );

  try {
    if (request.method === "GET" && requestUrl.pathname === "/api/config") {
      sendJson(response, 200, {
        routerBaseUrl,
        hasApiKey: Boolean(apiKey),
        apiKeyRequired: true,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/models") {
      await proxyRouterResponse(response, "/v1/models");
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/chat/completions"
    ) {
      const input = await readJsonBody(request);
      const model =
        typeof input.model === "string" ? input.model.trim() : "";
      const messages = Array.isArray(input.messages) ? input.messages : [];

      if (!model || model.length > 300) {
        sendJson(response, 400, { error: "Choose a valid model." });
        return;
      }
      if (
        messages.length === 0 ||
        messages.length > 200 ||
        messages.some(
          (message) =>
            !message ||
            !["system", "user", "assistant"].includes(message.role) ||
            typeof message.content !== "string",
        )
      ) {
        sendJson(response, 400, { error: "Chat messages are invalid." });
        return;
      }

      await proxyRouterResponse(response, "/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model, messages, stream: false }),
      });
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    serveStatic(request, response, requestUrl.pathname);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    const status = Number.isInteger(error.status)
      ? error.status
      : error.name === "TimeoutError" || error.name === "AbortError"
        ? 504
        : 502;
    sendJson(response, status, {
      error:
        status === 504
          ? "9Router did not respond before the timeout."
          : error.message || "Could not reach 9Router.",
    });
  }
});

server.listen(port, host, () => {
  console.log(`Personal Workspace listening at http://${host}:${port}`);
  console.log(`9Router API: ${routerBaseUrl}`);
});

server.on("error", (error) => {
  console.error(`Server error: ${error.message}`);
  process.exitCode = 1;
});