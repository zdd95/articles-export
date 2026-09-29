const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ ПОДКЛЮЧЕНИЕ К БД ============
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20
});

pool.on('connect', () => {
    console.log('✅ Подключение к БД установлено');
});

pool.on('error', (err) => {
    console.error('❌ Ошибка подключения к БД:', err);
});

// ============ КЭШ ПРОЕКТОВ ============
let projectsCache = {
    data: null,
    timestamp: 0
};
const PROJECTS_CACHE_TTL = 5 * 60 * 1000; // 5 минут

async function getProjectsCached() {
    const now = Date.now();

    // Если кэш свежий — отдаём из памяти
    if (projectsCache.data && (now - projectsCache.timestamp) < PROJECTS_CACHE_TTL) {
        console.log('📦 Проекты из кэша');
        return projectsCache.data;
    }

    // Иначе — запрос в БД
    console.log('🔍 Загрузка проектов из БД...');
    const start = Date.now();

    const result = await pool.query(`
        SELECT DISTINCT "projectKey"
        FROM articles.articles
        WHERE "projectKey" IS NOT NULL
        ORDER BY "projectKey"
    `);

    const data = result.rows.map(r => r.projectKey);

    projectsCache = { data, timestamp: now };
    console.log(`✅ Проекты загружены за ${Date.now() - start}ms (${data.length} шт.)`);

    return data;
}

// ============ ХЕЛПЕР: ПОЛУЧЕНИЕ URL СТАТЕЙ ============
async function fetchArticleUrls(projectKey, ids) {
    if (!ids.length) return {};

    const urlMap = {};
    const CHUNK_SIZE = 100;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);

        try {
            const response = await fetch(process.env.PAGES_GRAPHQL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `query FindPagesUrls($input: FindPagesUrlsInput!) {
                        findPagesUrls(input: $input) {
                            ... on PagesUrlsResult {
                                urls { entityId fullUrl }
                            }
                            ... on ValidationError {
                                field rule message
                            }
                        }
                    }`,
                    variables: {
                        input: {
                            projectKey: projectKey,
                            entityType: "ARTICLE",
                            entityIdAnyOf: chunk
                        }
                    }
                })
            });

            if (!response.ok) {
                console.error(`GraphQL HTTP ${response.status} для ${projectKey}`);
                continue;
            }

            const gqlData = await response.json();

            if (gqlData.errors) {
                console.error('GraphQL errors:', gqlData.errors);
                continue;
            }

            const result = gqlData?.data?.findPagesUrls;
            const urls = result?.urls || [];

            urls.forEach(u => {
                urlMap[String(u.entityId)] = u.fullUrl;
            });

        } catch (err) {
            console.error(`Ошибка получения URL для ${projectKey}:`, err.message);
        }
    }

    return urlMap;
}

// ============ API: СПИСОК ПРОЕКТОВ ============
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await getProjectsCached();
        res.json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Ошибка загрузки проектов: ' + error.message });
    }
});

// ============ API: ПОИСК СТАТЕЙ ============
app.post('/api/articles/search', async (req, res) => {
    const {
        project,
        titleKeywords = [],
        leadKeywords = [],
        contentKeywords = [],
        dateFrom,
        dateTo,
        isCommercial
    } = req.body;

    try {
        if (!project || typeof project !== 'string') {
            return res.status(400).json({ error: 'Параметр "project" обязателен' });
        }

        if (!Array.isArray(titleKeywords) || !Array.isArray(leadKeywords) || !Array.isArray(contentKeywords)) {
            return res.status(400).json({ error: 'Ключевые слова должны быть массивами' });
        }

        const params = [project];
        const conditions = [`a."projectKey" = $1`];

        // ===== ОБЩАЯ ГРУППА OR (title + lead + content вместе) =====
        const keywordConditions = [];

        // title
        titleKeywords.forEach(kw => {
            params.push(`%${kw}%`);
            keywordConditions.push(`a.title ILIKE $${params.length}`);
        });

        // leadParagraph
        leadKeywords.forEach(kw => {
            params.push(`%${kw}%`);
            keywordConditions.push(`a."leadParagraph" ILIKE $${params.length}`);
        });

        // content
        contentKeywords.forEach(kw => {
            params.push(`%${kw}%`);
            keywordConditions.push(
                `COALESCE(
                    (SELECT STRING_AGG(
                        regexp_replace(elem->>'text', '<[^>]+>', '', 'g'),
                        ' '
                    )
                    FROM jsonb_array_elements(ct."content") AS elem),
                    ''
                ) ILIKE $${params.length}`
            );
        });

        if (keywordConditions.length > 0) {
            conditions.push(`(${keywordConditions.join(' OR ')})`);
        }

        // isCommercial
        if (isCommercial === true || isCommercial === false) {
            params.push(isCommercial);
            conditions.push(`a."isCommercial" = $${params.length}`);
        }

        // Даты
        if (dateFrom) {
            params.push(dateFrom);
            conditions.push(`a."publishedAt" >= $${params.length}`);
        }
        if (dateTo) {
            params.push(dateTo + ' 23:59:59');
            conditions.push(`a."publishedAt" <= $${params.length}`);
        }

        const query = `
            SELECT
                a.id,
                a."projectKey",
                a."type",
                a.title,
                a."leadParagraph",
                a."createdAt",
                a."modifiedAt",
                a."publishedAt",
                a."isCommercial"
            FROM articles.articles a
            LEFT JOIN articles."content" ct ON ct."articleId" = a.id
            WHERE ${conditions.join(' AND ')}
            ORDER BY a."publishedAt" DESC NULLS LAST
            LIMIT 1000
        `;

        console.log('📝 SQL:', query);
        console.log('📝 Параметры:', params);

        const result = await pool.query(query, params);
        const articles = result.rows;

        console.log(`✅ Найдено статей: ${articles.length}`);

        // ===== ПОЛУЧАЕМ URL СТАТЕЙ =====
        let enriched = articles;

        if (articles.length > 0 && process.env.PAGES_GRAPHQL_URL) {
            const ids = articles.map(a => a.id);
            const projectKey = articles[0].projectKey;

            console.log(`🔗 Запрос URL для ${ids.length} статей (${projectKey})`);

            const urlMap = await fetchArticleUrls(projectKey, ids);

            console.log(`✅ Получено URL: ${Object.keys(urlMap).length}`);

            enriched = articles.map(a => ({
                ...a,
                url: urlMap[String(a.id)] || null
            }));
        }

        res.json({
            count: enriched.length,
            articles: enriched
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Ошибка поиска: ' + error.message });
    }
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============ ТЕСТ ПОДКЛЮЧЕНИЯ К БД ============
app.get('/api/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as current_time');
        res.json({
            success: true,
            message: 'Подключение к БД успешно',
            time: result.rows[0].current_time
        });
    } catch (error) {
        console.error('Test DB error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка подключения к БД: ' + error.message
        });
    }
});

// ============ GRACEFUL SHUTDOWN ============
process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал завершения...');
    console.log('Завершение работы сервера...');

    try {
        await pool.end();
        console.log('✅ Подключение к БД закрыто');
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при завершении:', error);
        process.exit(1);
    }
});

// ============ ЗАПУСК СЕРВЕРА ============
app.listen(port, '0.0.0.0', async () => {
    console.log(`🚀 Сервер запущен на http://0.0.0.0:${port}`);
    console.log(`📊 База данных: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    // Прогрев кэша проектов при старте
    try {
        await getProjectsCached();
    } catch (error) {
        console.log('📋 Не удалось загрузить проекты при старте');
        console.log('⚠️  Проверьте доступ к БД');
    }
});