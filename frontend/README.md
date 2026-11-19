# Anime Watch — frontend

Telegram Mini App на Next.js (App Router), TypeScript (strict), Tailwind CSS,
TanStack Query и Zod.

## Архитектура

```
src/
├── app/                      # маршруты App Router
│   ├── layout.tsx            # провайдеры (Telegram + Query) и общий каркас
│   ├── page.tsx              # главная: поиск + «продолжить просмотр»
│   ├── anime/[id]/page.tsx   # карточка аниме: серии, источники, плеер
│   ├── library/page.tsx      # личная библиотека
│   └── api/health/route.ts   # health-check контейнера
├── components/
│   ├── ui/                   # бездоменные примитивы (button, select-field, …)
│   ├── layout/               # каркас приложения и нижняя навигация
│   ├── anime/                # карточки и заголовок аниме
│   ├── library/              # элементы библиотеки и управление прогрессом
│   └── player/               # селекторы источников и видеоплеер
├── features/                 # use case-ы и хуки (auth, search, anime, player, library)
├── hooks/                    # общие хуки (useDebouncedValue)
├── lib/
│   ├── api/                  # единственный HTTP-клиент, схемы Zod, типы
│   ├── telegram/             # типизированный слой над Telegram WebApp
│   └── utils/                # форматирование и классы
├── providers/                # QueryClient и инициализация Telegram
└── types/api.d.ts            # типы, сгенерированные из OpenAPI бэкенда
```

Правила зависимостей (проверяются ревью):

* `components/` не знают о `features/`, `features/` не знают о `components/`,
  `lib/` не знает ни о ком ниже себя — циклов нет;
* сетевые запросы идут **только** через `lib/api/client.ts`, компоненты
  `fetch` не вызывают;
* ответы backend-а валидируются схемами Zod (`lib/api/schemas.ts`), типы
  генерируются из OpenAPI (`pnpm generate:api`), поэтому контракт не может
  разойтись незаметно.

## Команды

```bash
pnpm install          # установка зависимостей
pnpm dev              # сервер разработки на :3000
pnpm build            # production-сборка (standalone-вывод)
pnpm start            # запуск production-сборки
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # юнит-тесты (Vitest + Testing Library)
pnpm test:coverage    # юнит-тесты с отчётом о покрытии
pnpm e2e              # end-to-end тесты (Playwright)
pnpm generate:api     # перегенерация типов из backend/openapi.json
```

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `API_URL` | публичный адрес backend API, например `http://localhost:8000/api/v1` |
| `DEV_AUTH_ENABLED` | `true` — использовать dev-авторизацию вне Telegram |

Значения читаются из окружения на каждом запросе: корневой layout встраивает их
в HTML (`window.__ANIME_WATCH_CONFIG__`), а клиент берёт их оттуда. Поэтому в
контейнере это обычные `environment`, а не build args: смена значения требует
только перезапуска, но не пересборки образа.

## Аутентификация

Клиент никогда не доверяет данным Telegram: он только пересылает «сырую»
строку `initData` в заголовке `Authorization: tma <initData>`, а подпись
проверяет backend.

Вне Telegram (в обычном браузере) используется dev-fallback: если
`initData` пуст и включён `DEV_AUTH_ENABLED`, клиент отправляет
`Authorization: dev dev`. Backend принимает эту схему только в
непроизводственном окружении.

## End-to-end тесты

Сценарии не зависят от внешних аниме-сайтов: backend запускается с
детерминированным провайдером `fixture`.

```bash
# 1. Поднять зависимости
docker compose up -d postgres redis
uv run --project backend alembic -c backend/alembic.ini upgrade head

# 2. Запустить API с тестовым провайдером (в отдельном терминале)
cd backend
uv run --env-file .env.e2e uvicorn anime_app.main:app --port 8000

# 3. Запустить сценарии
cd frontend
pnpm e2e:install   # один раз: скачать браузер
pnpm e2e
```

Файл `backend/.env.e2e` включает `ALLOWED_PROVIDERS=fixture`,
`DEV_AUTH_ENABLED=true` и список origins для CORS.
