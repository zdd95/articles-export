# Articles Export

Сервис для поиска и выгрузки статей из БД PostgreSQL по проектам, ключевым словам и периоду публикации.

## Возможности

- Поиск по проекту, ключевым словам (заголовок, лид, контент) и периоду публикации
- Фильтр по коммерческим/некоммерческим статьям
- Таблица с сортировкой по колонкам
- Переход на статью по клику на ID
- Экспорт результатов в CSV
- Сохранение фильтров в браузере

## Требования

- Docker + Docker Compose
- Доступ к БД со схемой `articles`
- Доступ к GraphQL-сервису Pages

## Настройка .env

```bash
cp .env.example .env
nano .env  # вписать DB_USER, DB_PASSWORD
```

## Запуск

### Локально

```bash
npm install
npm start          # или npm run dev — с nodemon
```

Остановка: `Ctrl + C`

### В Docker

#### Первый запуск

```bash
cp .env.example .env   # настроить .env
docker-compose up -d --build
docker-compose ps
docker-compose logs -f articles-export
```

#### Перезапуск

```bash
docker-compose restart                 # без пересборки
docker-compose up -d --build           # с пересборкой (после изменений кода)
```

#### Остановка

```bash
docker-compose down                    # остановить и удалить контейнер
docker-compose down --rmi local        # + удалить образ
```

#### Логи и отладка

```bash
docker-compose logs -f articles-export       # логи в реальном времени
docker-compose logs --tail=100 articles-export
docker stats articles-export                 # ресурсы
docker exec -it articles-export sh           # зайти в контейнер
curl http://localhost:3001/health            # health
curl http://localhost:3001/api/test-db       # тест БД
```

#### Полная очистка

```bash
docker-compose down --rmi local && docker system prune -f
docker-compose up -d --build
```

#### Шпаргалка

| Задача | Команда |
|--------|---------|
| Первый запуск | `docker-compose up -d --build` |
| Перезапуск | `docker-compose restart` |
| После изменений в коде | `docker-compose up -d --build` |
| Остановить | `docker-compose down` |
| Логи | `docker-compose logs -f articles-export` |
| Зайти в контейнер | `docker exec -it articles-export sh` |
| Полная очистка | `docker-compose down --rmi local && docker system prune -f` |

## Доступ

- **Локально**: http://localhost:3001
- **В сети**: http://<IP-СЕРВЕРА>:3001

```bash
hostname -I     # Linux
ipconfig        # Windows
ifconfig        # macOS
```

## Использование

1. Выбрать проект
2. Задать период публикации (опционально)
3. Выбрать тип статей (коммерческие/нет/все)
4. Добавить ключевые слова в заголовке / лиде / контенте (опционально)
5. **«Найти статьи»** — результаты в таблице
6. **Клик на ID** — открыть статью в новой вкладке
7. **«Скачать CSV»** — экспорт результатов
8. **«Сбросить все»** — очистить фильтры

**Ввод тегов:** Enter или запятая — добавить, Backspace на пустом поле — удалить последний, клик на × — удалить конкретный.

## API

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/projects` | Список проектов |
| POST | `/api/articles/search` | Поиск статей |
| GET | `/api/test-db` | Проверка БД |
| GET | `/health` | Health check |

## Структура

```
articles-export/
├── server.js
├── package.json
├── .env / .env.example
├── Dockerfile
├── docker-compose.yml
└── public/
    ├── index.html
    ├── styles.css
    └── script.js
```

## Лицензия

MIT