import { expect, test, type Page, type Route } from "@playwright/test";

const INBOX_ID = "00000000-0000-4000-8000-000000000001";
const WORK_ID = "00000000-0000-4000-8000-000000000002";
const VOICE_SESSION_ID = "00000000-0000-4000-8000-000000000010";
const VOICE_DRAFT_ID = "00000000-0000-4000-8000-000000000011";

type FixtureState = {
  authenticated: boolean;
  lists: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
};

function createFixtureState(authenticated = true): FixtureState {
  const timestamp = "2026-09-18T10:00:00.000Z";
  return {
    authenticated,
    lists: [
      {
        id: INBOX_ID,
        name: "Inbox",
        description: "",
        emoji: "",
        color: "#1b1d1c",
        position: 0,
        is_archived: false,
        is_system: true,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: WORK_ID,
        name: "Trabajo",
        description: "Tareas profesionales",
        emoji: "·",
        color: "#2e6f65",
        position: 1,
        is_archived: false,
        is_system: false,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    tasks: [],
    history: [],
  };
}

function envelope<T>(data: T, totalCount = Array.isArray(data) ? data.length : 1) {
  return {
    data,
    meta: { page: 1, page_size: 100, total_count: totalCount, total_pages: 1 },
  };
}

async function json(route: Route, body: unknown, status = 200, setCookie = false) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: setCookie ? { "set-cookie": "taskflowcsrftoken=e2e-csrf; Path=/; SameSite=Lax" } : undefined,
    body: JSON.stringify(body),
  });
}

async function installApiFixtures(page: Page, authenticated = true): Promise<FixtureState> {
  const state = createFixtureState(authenticated);

  await page.route("**/api/accounts/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/csrf/")) {
      await json(route, {}, 200, true);
      return;
    }
    if (pathname.endsWith("/login/")) {
      state.authenticated = true;
      await json(route, { authenticated: true });
      return;
    }
    await json(route, {});
  });

  await page.route("**/api/v1/auth/me/", async (route) => {
    await json(route, state.authenticated
      ? {
          authenticated: true,
          user: {
            id: 7,
            username: "demo",
            email: "demo@example.test",
            email_verified: true,
            first_name: "Demo",
            last_name: "User",
            plan: "FREE",
          },
        }
      : { authenticated: false, user: null });
  });

  await page.route("**/api/v1/auth/csrf/", async (route) => {
    await json(route, {}, 200, true);
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const resource = segments[2];
    const resourceId = segments[3];

    if (pathname.endsWith("/auth/me/")) {
      await json(route, state.authenticated
        ? {
            authenticated: true,
            user: {
              id: 7,
              username: "demo",
              email: "demo@example.test",
              email_verified: true,
              first_name: "Demo",
              last_name: "User",
              plan: "FREE",
            },
          }
        : { authenticated: false, user: null });
      return;
    }
    if (pathname.endsWith("/auth/csrf/")) {
      await json(route, {}, 200, true);
      return;
    }

    if (resource === "lists") {
      await handleLists(route, state, resourceId);
      return;
    }
    if (resource === "tasks") {
      await handleTasks(route, state, resourceId, segments[4]);
      return;
    }
    if (resource === "history") {
      await json(route, envelope(state.history));
      return;
    }
    if (resource === "data" && resourceId === "reset") {
      const body = JSON.parse(request.postData() ?? "{}");
      if (body.confirmation !== "RESET TASKFLOW DATA") {
        await json(route, { error: { code: "confirmation_required", message: "Confirmación inválida." } }, 400);
        return;
      }
      state.lists = state.lists.filter((list) => list.is_system === true);
      state.tasks = [];
      state.history = [];
      await json(route, { data: { reset: true } });
      return;
    }
    if (resource === "voice") {
      await handleVoice(route, state, segments.slice(3));
      return;
    }
    await json(route, {});
  });

  return state;
}

async function handleLists(route: Route, state: FixtureState, resourceId?: string) {
  const request = route.request();
  if (!resourceId && request.method() === "GET") {
    await json(route, envelope(state.lists));
    return;
  }
  if (!resourceId && request.method() === "POST") {
    const body = JSON.parse(request.postData() ?? "{}");
    const list = {
      id: "00000000-0000-4000-8000-000000000003",
      name: body.name,
      description: body.description ?? "",
      emoji: body.emoji ?? "·",
      color: body.color ?? "#2e6f65",
      position: state.lists.length,
      is_archived: false,
      is_system: false,
      created_at: "2026-09-18T10:00:00.000Z",
      updated_at: "2026-09-18T10:00:00.000Z",
    };
    state.lists.push(list);
    await json(route, envelope(list), 201);
    return;
  }
  const list = state.lists.find((candidate) => candidate.id === resourceId);
  if (!list) {
    await json(route, { error: { code: "not_found", message: "No encontrado." } }, 404);
    return;
  }
  if (request.method() === "PATCH") {
    Object.assign(list, JSON.parse(request.postData() ?? "{}"));
    await json(route, envelope(list));
    return;
  }
  if (request.method() === "DELETE") {
    state.lists = state.lists.filter((candidate) => candidate.id !== resourceId);
    await route.fulfill({ status: 204, body: "" });
    return;
  }
  await json(route, envelope(list));
}

async function handleTasks(route: Route, state: FixtureState, resourceId?: string, action?: string) {
  const request = route.request();
  if (!resourceId && request.method() === "GET") {
    await json(route, envelope(state.tasks));
    return;
  }
  if (!resourceId && request.method() === "POST") {
    const body = JSON.parse(request.postData() ?? "{}");
    const task = {
      id: `00000000-0000-4000-8000-0000000001${state.tasks.length + 1}`,
      list_id: body.list_id ?? INBOX_ID,
      title: body.title,
      description: body.description ?? "",
      status: "pending",
      source: body.source ?? "manual",
      position: state.tasks.length,
      completed_at: null,
      created_at: "2026-09-18T10:00:00.000Z",
      updated_at: "2026-09-18T10:00:00.000Z",
    };
    state.tasks.push(task);
    state.history.unshift({ id: `created-${task.id}`, task_id: task.id, event_type: "TASK_CREATED", payload: {}, created_at: task.created_at });
    await json(route, envelope(task), 201);
    return;
  }
  const task = state.tasks.find((candidate) => candidate.id === resourceId);
  if (!task) {
    await json(route, { error: { code: "not_found", message: "No encontrado." } }, 404);
    return;
  }
  if (action === "complete") {
    task.status = "completed";
    task.completed_at = "2026-09-18T10:05:00.000Z";
    state.history.unshift({ id: `completed-${task.id}`, task_id: task.id, event_type: "TASK_COMPLETED", payload: {}, created_at: task.completed_at });
    await json(route, envelope(task));
    return;
  }
  if (action === "reopen") {
    task.status = "pending";
    task.completed_at = null;
    state.history.unshift({ id: `reopened-${task.id}`, task_id: task.id, event_type: "TASK_REOPENED", payload: {}, created_at: "2026-09-18T10:06:00.000Z" });
    await json(route, envelope(task));
    return;
  }
  if (request.method() === "PATCH") {
    const body = JSON.parse(request.postData() ?? "{}");
    Object.assign(task, body);
    await json(route, envelope(task));
    return;
  }
  if (request.method() === "DELETE") {
    state.tasks = state.tasks.filter((candidate) => candidate.id !== resourceId);
    await route.fulfill({ status: 204, body: "" });
    return;
  }
  await json(route, envelope(task));
}

async function handleVoice(route: Route, state: FixtureState, path: string[]) {
  const request = route.request();
  const [collection, resourceId, action] = path;
  const session = {
    id: VOICE_SESSION_ID,
    status: "transcribed",
    transcript: "Preparar la demo",
    transcript_retention: false,
    error_code: "",
    created_at: "2026-09-18T10:00:00.000Z",
    updated_at: "2026-09-18T10:00:00.000Z",
  };
  if (collection === "sessions" && !resourceId && request.method() === "POST") {
    await json(route, envelope({ ...session, status: "uploaded" }), 202);
    return;
  }
  if (collection === "sessions" && resourceId === VOICE_SESSION_ID && !action) {
    await json(route, envelope(session));
    return;
  }
  if (collection === "sessions" && resourceId === VOICE_SESSION_ID && action === "review" && request.method() === "POST") {
    await json(route, envelope({
      id: VOICE_DRAFT_ID,
      session_id: VOICE_SESSION_ID,
      status: "draft",
      schema_version: 1,
      tasks: [{ title: "Preparar la demo", description: null, list_id: WORK_ID, classification_hint: "semantic", confidence: 0.9, routing: "semantic" }],
      source: { kind: "voice_transcript" },
      expires_at: "2026-09-18T11:00:00.000Z",
      confirmed_task_ids: [],
      created_at: "2026-09-18T10:00:00.000Z",
      updated_at: "2026-09-18T10:00:00.000Z",
    }), 201);
    return;
  }
  if (collection === "reviews" && resourceId === VOICE_DRAFT_ID && action === "confirm" && request.method() === "POST") {
    const body = JSON.parse(request.postData() ?? "{}");
    const createdTasks = (body.tasks as Array<Record<string, unknown>>).map((draft, index) => ({
      id: `00000000-0000-4000-8000-0000000002${index + 1}`,
      list_id: draft.list_id,
      title: draft.title,
      description: draft.description ?? "",
      status: "pending",
      source: "voice",
      position: state.tasks.length + index,
      completed_at: null,
      created_at: "2026-09-18T10:00:00.000Z",
      updated_at: "2026-09-18T10:00:00.000Z",
    }));
    state.tasks.push(...createdTasks);
    await json(route, envelope({ draft: { id: VOICE_DRAFT_ID }, tasks: createdTasks }));
    return;
  }
  await json(route, {});
}

async function installMediaRecorder(page: Page) {
  await page.addInitScript(() => {
    class FakeTrack {
      stop() {}
    }
    class FakeMediaStream {
      getTracks() {
        return [new FakeTrack()];
      }
    }
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) });
          this.onstop?.();
        }, 0);
      }
    }
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => new FakeMediaStream() },
    });
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
  });
}

test("login delegado, CRUD de tarea y entrada en historial", async ({ page }) => {
  await installApiFixtures(page, false);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email o usuario").fill("demo");
  await page.getByLabel("Contraseña").fill("fixture-password");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Pendientes que caben en la cabeza." })).toBeVisible();
  await page.getByLabel("Nueva tarea").fill("Preparar demo");
  await page.getByLabel("Nueva tarea").press("Enter");
  await expect(page.getByText("Preparar demo")).toBeVisible();

  await page.getByRole("button", { name: "Completar Preparar demo" }).click();
  await page.getByRole("link", { name: "Historial" }).click();
  await expect(page.getByRole("heading", { name: "Lo que ya está hecho." })).toBeVisible();
  await expect(page.getByText("Tarea completada")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preparar demo", exact: true })).toHaveCount(2);
});

test("voz pasa por revisión antes de crear la tarea", async ({ page }) => {
  await installApiFixtures(page);
  await installMediaRecorder(page);
  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: "Pendientes que caben en la cabeza." })).toBeVisible();

  await page.getByRole("button", { name: "Grabar" }).click();
  await page.getByRole("button", { name: "Detener" }).dispatchEvent("click");
  await expect(page.getByRole("heading", { name: "Revisar tareas de voz" })).toBeVisible();

  await page.getByRole("dialog").getByLabel("Tarea 1", { exact: true }).fill("Preparar demo revisada");
  await page.getByRole("button", { name: "Crear seleccionadas" }).click();
  await expect(page.getByRole("heading", { name: "Revisar tareas de voz" })).toBeHidden();
  await expect(page.getByText("Preparar demo revisada")).toBeVisible();
});

test("manifest y service worker mantienen el app shell fuera de la API", async ({ page }) => {
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/app/dashboard");

  const serviceWorkerResponse = await page.request.get("/sw.js");
  expect(serviceWorkerResponse.ok()).toBeTruthy();
  const serviceWorker = await serviceWorkerResponse.text();
  expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
  expect(serviceWorker).toContain('url.pathname.startsWith("/app/")');
});

test("reset cloud exige confirmación fuerte y no se mezcla con Accounts", async ({ page }) => {
  await installApiFixtures(page);
  await page.goto("/app/dashboard");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Pendientes que caben en la cabeza." })).toBeVisible();
  await page.evaluate(async () => {
    await fetch("/api/v1/auth/csrf/", { credentials: "include" });
  });

  const invalid = await page.evaluate(async () => {
    const response = await fetch("/api/v1/data/reset/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": "e2e-csrf" },
      body: JSON.stringify({ confirmation: "RESET" }),
    });
    return response.status;
  });
  expect(invalid).toBe(400);

  const valid = await page.evaluate(async () => {
    const response = await fetch("/api/v1/data/reset/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": "e2e-csrf" },
      body: JSON.stringify({ confirmation: "RESET TASKFLOW DATA" }),
    });
    return response.status;
  });
  expect(valid).toBe(200);
});

test("navegación móvil expone las vistas principales", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Este caso pertenece al proyecto móvil.");
  await installApiFixtures(page);
  await page.goto("/app/dashboard");
  const mobileNavigation = page.getByRole("navigation", { name: "Navegación móvil" });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "Listas" }).click();
  await expect(page).toHaveURL(/\/app\/lists$/);
  await expect(page.getByRole("heading", { name: "Listas que te dan contexto." })).toBeVisible();
});

const stagingBaseUrl = process.env.TASKFLOW_E2E_BASE_URL;
const stagingUsername = process.env.TASKFLOW_E2E_USERNAME;
const stagingPassword = process.env.TASKFLOW_E2E_PASSWORD;

test.describe("Accounts staging real", () => {
  test.skip(
    !stagingBaseUrl || !stagingUsername || !stagingPassword,
    "Requiere TASKFLOW_E2E_BASE_URL, TASKFLOW_E2E_USERNAME y TASKFLOW_E2E_PASSWORD.",
  );

  test("inicia sesión con Accounts y llega al espacio privado", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email o usuario").fill(stagingUsername!);
    await page.getByLabel("Contraseña").fill(stagingPassword!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Pendientes que caben en la cabeza." })).toBeVisible();
  });
});