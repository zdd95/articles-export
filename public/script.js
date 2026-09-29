// ============ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ============
let currentArticles = [];
let selectedProject = null;
let projects = [];
let sortField = 'publishedAt';
let sortOrder = 'desc';

let currentLimit;

// Ключевые слова (теги)
let titleKeywords = [];
let leadKeywords = [];
let contentKeywords = [];

// Флаг: идёт восстановление фильтров (не сохраняем в localStorage)
let isRestoringFilters = false;

// ============ СОХРАНЕНИЕ ФИЛЬТРОВ ============
const STORAGE_KEY = 'articlesExportFilters';

function saveFilters() {
    if (isRestoringFilters) return;

    const filters = {
        project: selectedProject,
        titleKeywords: titleKeywords,
        leadKeywords: leadKeywords,
        contentKeywords: contentKeywords,
        dateFrom: document.getElementById('dateFrom').value,
        dateTo: document.getElementById('dateTo').value,
        isCommercial: document.querySelector('input[name="isCommercial"]:checked')?.value || 'false',
        isActive: document.querySelector('input[name="isActive"]:checked')?.value || 'true'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
}

function loadFilters() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        return JSON.parse(saved);
    } catch (e) {
        console.error('Ошибка чтения фильтров:', e);
        return null;
    }
}

function applyFilters(filters) {
    if (!filters) return;

    // Проект уже выбран в initializeProjectDropdown — не трогаем

    // Ключевые слова
    titleKeywords = Array.isArray(filters.titleKeywords) ? filters.titleKeywords : [];
    leadKeywords = Array.isArray(filters.leadKeywords) ? filters.leadKeywords : [];
    contentKeywords = Array.isArray(filters.contentKeywords) ? filters.contentKeywords : [];

    renderTags('title');
    renderTags('lead');
    renderTags('content');

    // Даты
    if (filters.dateFrom) document.getElementById('dateFrom').value = filters.dateFrom;
    if (filters.dateTo) document.getElementById('dateTo').value = filters.dateTo;

    // Коммерческие
    if (filters.isCommercial) {
        const radio = document.querySelector(`input[name="isCommercial"][value="${filters.isCommercial}"]`);
        if (radio) radio.checked = true;
    }

    // Активные
    if (filters.isActive) {
        const radio = document.querySelector(`input[name="isActive"][value="${filters.isActive}"]`);
        if (radio) radio.checked = true;
    }
}

// ============ ЗАГРУЗКА ПРОЕКТОВ ============
async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('Ошибка загрузки проектов');
        projects = await response.json();

        const savedFilters = loadFilters();

        // Включаем режим восстановления — saveFilters не пишет в localStorage
        isRestoringFilters = true;

        initializeProjectDropdown(savedFilters);

        if (savedFilters) {
            applyFilters(savedFilters);
        }

        // Выключаем режим восстановления
        isRestoringFilters = false;

        // Синхронизируем localStorage с актуальным состоянием
        saveFilters();

    } catch (error) {
        isRestoringFilters = false;
        console.error('Error loading projects:', error);
        document.getElementById('projectFilter').placeholder = 'Ошибка загрузки';
    }
}

function initializeProjectDropdown(savedFilters) {
    const projectOptions = document.getElementById('projectOptions');
    projectOptions.innerHTML = '';

    projects.forEach(project => {
        const option = document.createElement('div');
        option.className = 'dropdown-option';
        option.textContent = project;
        option.setAttribute('data-project', project);

        option.addEventListener('click', function () {
            selectProject(project);
            closeProjectDropdown();
        });

        projectOptions.appendChild(option);
    });

    // Выбираем: сохранённый проект (если есть в списке) или первый
    let projectToSelect = null;

    if (savedFilters?.project && projects.includes(savedFilters.project)) {
        projectToSelect = savedFilters.project;
    } else if (projects.length > 0) {
        projectToSelect = projects[0];
    }

    if (projectToSelect) {
        selectProject(projectToSelect);
    }
}

function selectProject(project) {
    selectedProject = project;
    document.getElementById('projectFilter').value = project;

    document.querySelectorAll('#projectOptions .dropdown-option').forEach(opt => {
        opt.classList.toggle('selected', opt.getAttribute('data-project') === project);
    });

    if (!isRestoringFilters) {
        saveFilters();
    }
}

// ============ DROPDOWN УПРАВЛЕНИЕ ============
function toggleProjectDropdown() {
    const list = document.getElementById('projectList');
    const isShowing = list.classList.contains('show');
    closeAllDropdowns();

    if (!isShowing) {
        list.classList.add('show');
        document.getElementById('projectSearch').value = '';
        document.querySelectorAll('#projectOptions .dropdown-option').forEach(o => o.style.display = 'block');

        const existing = document.getElementById('noResults');
        if (existing) existing.remove();

        setTimeout(() => document.getElementById('projectSearch').focus(), 0);
    }
}

function closeProjectDropdown() {
    document.getElementById('projectList').classList.remove('show');
}

function closeAllDropdowns() {
    closeProjectDropdown();
}

function filterProjects() {
    const term = document.getElementById('projectSearch').value.toLowerCase();
    const options = document.querySelectorAll('#projectOptions .dropdown-option');
    let hasVisible = false;

    options.forEach(opt => {
        const match = opt.getAttribute('data-project').toLowerCase().includes(term);
        opt.style.display = match ? 'block' : 'none';
        if (match) hasVisible = true;
    });

    const existing = document.getElementById('noResults');
    if (!hasVisible) {
        if (!existing) {
            const msg = document.createElement('div');
            msg.id = 'noResults';
            msg.className = 'no-results';
            msg.textContent = 'Проекты не найдены';
            document.getElementById('projectOptions').appendChild(msg);
        }
    } else if (existing) {
        existing.remove();
    }
}

// ============ TAGS INPUT (КЛЮЧЕВЫЕ СЛОВА) ============
function getKeywordsByType(type) {
    if (type === 'title') return titleKeywords;
    if (type === 'lead') return leadKeywords;
    if (type === 'content') return contentKeywords;
    return [];
}

function handleTagInput(event, type) {
    const input = event.target;
    const value = input.value.trim();

    // Enter или запятая — добавить тег
    if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        if (value) {
            addTag(type, value);
            input.value = '';
        }
    }

    // Backspace на пустом поле — удалить последний тег
    if (event.key === 'Backspace' && !value) {
        const keywords = getKeywordsByType(type);
        if (keywords.length > 0) {
            removeTag(type, keywords[keywords.length - 1]);
        }
    }
}

function addTag(type, value) {
    const cleanValue = value.replace(/,+$/, '').trim();
    if (!cleanValue) return;

    const keywords = getKeywordsByType(type);

    const alreadyExists = keywords.some(k => k.toLowerCase() === cleanValue.toLowerCase());
    if (alreadyExists) return;

    keywords.push(cleanValue);
    renderTags(type);

    saveFilters();
}

function removeTag(type, value) {
    if (type === 'title') {
        titleKeywords = titleKeywords.filter(k => k !== value);
    } else if (type === 'lead') {
        leadKeywords = leadKeywords.filter(k => k !== value);
    } else if (type === 'content') {
        contentKeywords = contentKeywords.filter(k => k !== value);
    }
    renderTags(type);

    saveFilters();
}

function renderTags(type) {
    const container = document.getElementById(type + 'TagsContainer');
    const input = document.getElementById(type + 'TagInput');
    const keywords = getKeywordsByType(type);

    // Удаляем старые теги (input остаётся)
    container.querySelectorAll('.tag').forEach(t => t.remove());

    // Добавляем новые перед input
    keywords.forEach(kw => {
        const tag = document.createElement('div');
        tag.className = 'tag';

        const text = document.createElement('span');
        text.className = 'tag-text';
        text.textContent = kw;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'tag-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeTag(type, kw);
        });

        tag.appendChild(text);
        tag.appendChild(removeBtn);
        container.insertBefore(tag, input);
    });
}

function focusTagInput(id) {
    document.getElementById(id).focus();
}

// ============ ПОИСК СТАТЕЙ ============
async function searchArticles() {
    const messageDiv = document.getElementById('message');
    const loadingDiv = document.getElementById('loading');
    const downloadBtn = document.getElementById('downloadBtn');
    const downloadXlsxBtn = document.getElementById('downloadXlsxBtn');

    messageDiv.innerHTML = '';
    document.getElementById('tableContainer').innerHTML = '';
    downloadBtn.disabled = true;
    downloadXlsxBtn.disabled = true;
    currentArticles = [];

    if (!selectedProject) {
        messageDiv.innerHTML = '<div class="error">Выберите проект</div>';
        return;
    }

    // Собираем isCommercial
    const commercialRadio = document.querySelector('input[name="isCommercial"]:checked');
    let isCommercial = null;
    if (commercialRadio && commercialRadio.value === 'true') isCommercial = true;
    else if (commercialRadio && commercialRadio.value === 'false') isCommercial = false;
    // 'all' -> null (не фильтруем)

    // Собираем isActive
    const activeRadio = document.querySelector('input[name="isActive"]:checked');
    let isActive = null;
    if (activeRadio && activeRadio.value === 'true') isActive = true;
    else if (activeRadio && activeRadio.value === 'false') isActive = false;
    // 'all' -> null (не фильтруем)

    const body = {
        project: selectedProject,
        titleKeywords: titleKeywords,
        leadKeywords: leadKeywords,
        contentKeywords: contentKeywords,
        dateFrom: document.getElementById('dateFrom').value || null,
        dateTo: document.getElementById('dateTo').value || null
    };

    if (isCommercial !== null) {
        body.isCommercial = isCommercial;
    }

    if (isActive !== null) {
        body.isActive = isActive;
    }

    loadingDiv.style.display = 'block';

    try {
        const response = await fetch('/api/articles/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ошибка поиска');
        }

        currentArticles = data.articles || [];
        currentLimit = data.limit || 5000;

        if (currentArticles.length === 0) {
            messageDiv.innerHTML = '<div class="success">Найдено записей: 0</div>';
            document.getElementById('tableContainer').innerHTML =
                '<p style="padding:20px;text-align:center;color:#666;">Ничего не найдено. Попробуйте изменить фильтры.</p>';
            return;
        }

        sortTable();
        messageDiv.innerHTML = `<div class="success">Найдено записей: ${currentArticles.length} (Лимит запроса: ${currentLimit})</div>`;
        downloadBtn.disabled = false;
        downloadXlsxBtn.disabled = false;

    } catch (error) {
        console.error('Search error:', error);
        messageDiv.innerHTML = `<div class="error">ERROR: ${error.message}</div>`;
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// ============ СОРТИРОВКА И ОТОБРАЖЕНИЕ ============
function sortTable() {
    if (currentArticles.length === 0) return;

    const sorted = [...currentArticles].sort((a, b) => {
        let va = a[sortField];
        let vb = b[sortField];

        if (sortField === 'publishedAt' || sortField === 'createdAt' || sortField === 'modifiedAt') {
            va = va ? new Date(va).getTime() : 0;
            vb = vb ? new Date(vb).getTime() : 0;
        } else if (sortField === 'isCommercial') {
            va = va ? 1 : 0;
            vb = vb ? 1 : 0;
        } else if (typeof va === 'string') {
            va = (va || '').toLowerCase();
            vb = (vb || '').toLowerCase();
        }

        if (va < vb) return sortOrder === 'asc' ? -1 : 1;
        if (va > vb) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    displayTable(sorted);
}

function displayTable(data) {
    const container = document.getElementById('tableContainer');

    let html = `
        <table>
            <thead>
                <tr>
                    <th onclick="sortByColumn('id')">ID</th>
                    <th onclick="sortByColumn('title')">Title</th>
                    <th onclick="sortByColumn('leadParagraph')">Lead Paragraph</th>
                    <th onclick="sortByColumn('type')">Type</th>
                    <th onclick="sortByColumn('publishedAt')">Published At</th>
                    <th onclick="sortByColumn('isActive')">Активна</th>
                    <th onclick="sortByColumn('isCommercial')">Коммерч.</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(article => {
        const idCell = article.url
            ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener" class="article-link" title="Открыть статью">${escapeHtml(article.id)}</a>`
            : escapeHtml(article.id || '');

        html += `
            <tr>
                <td>${idCell}</td>
                <td class="col-title">${escapeHtml(article.title || '')}</td>
                <td class="col-lead">${escapeHtml(article.leadParagraph || '')}</td>
                <td class="col-type">${escapeHtml(article.type || '')}</td>
                <td class="col-date">${formatDate(article.publishedAt)}</td>
                <td class="col-badge">
                    ${article.isActive
                        ? '<span class="badge badge-active">Да</span>'
                        : '<span class="badge badge-inactive">Нет</span>'}
                </td>
                <td class="col-badge">
                    ${article.isCommercial
                        ? '<span class="badge badge-commercial">Да</span>'
                        : '<span class="badge badge-free">Нет</span>'}
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
    updateSortIndicators();
}

function sortByColumn(column) {
    if (sortField === column) {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = column;
        sortOrder = 'desc';
    }
    sortTable();
}

function updateSortIndicators() {
    document.querySelectorAll('th').forEach(header => {
        header.classList.remove('sorted-asc', 'sorted-desc');
        const onclick = header.getAttribute('onclick');
        if (onclick && onclick.includes(`'${sortField}'`)) {
            header.classList.add(`sorted-${sortOrder}`);
        }
    });
}

// ============ CSV EXPORT ============
function downloadCSV() {
    if (currentArticles.length === 0) {
        alert('Нет данных для скачивания');
        return;
    }

    const headers = ['id', 'url', 'projectKey', 'type', 'title', 'leadParagraph',
                    'createdAt', 'modifiedAt', 'publishedAt', 'isActive','isCommercial'];

    let csv = '\uFEFF';
    csv += headers.join(',') + '\n';

    currentArticles.forEach(article => {
        const row = headers.map(h => {
            let value = article[h];
            if (value === null || value === undefined) value = '';

            if (h === 'createdAt' || h === 'modifiedAt' || h === 'publishedAt') {
                value = formatDate(value);
            }

            if (h === 'isCommercial' || h === 'isActive') {
                value = value ? 'true' : 'false';
            }

            value = String(value).replace(/"/g, '""');
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = `"${value}"`;
            }

            return value;
        });
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `articles_${selectedProject}_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============ XLSX EXPORT ============
function downloadXLSX() {
    if (currentArticles.length === 0) {
        alert('Нет данных для скачивания');
        return;
    }

    // Готовим данные
    const headers = ['id', 'url', 'projectKey', 'type', 'title', 'leadParagraph',
                     'createdAt', 'modifiedAt', 'publishedAt', 'isActive', 'isCommercial'];

    // Формируем массив массивов (первая строка — заголовки)
    const rows = [headers];

    currentArticles.forEach(article => {
        const row = headers.map(h => {
            let value = article[h];

            if (value === null || value === undefined) value = '';

            if (h === 'createdAt' || h === 'modifiedAt' || h === 'publishedAt') {
                value = formatDate(value);
            }

            if (h === 'isCommercial' || h === 'isActive') {
                value = value ? 'Да' : 'Нет';
            }

            return value;
        });
        rows.push(row);
    });

    // Создаём книгу и лист
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Articles');

    // Автоширина колонок (по максимуму содержимого)
    const colWidths = headers.map((h, i) => {
        let maxLen = h.length;
        rows.forEach(row => {
            const v = String(row[i] || '');
            if (v.length > maxLen) maxLen = v.length;
        });
        return { wch: Math.min(maxLen + 2, 60) }; // ограничили 60 символами
    });
    ws['!cols'] = colWidths;

    // Имя файла
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `articles_${selectedProject}_${dateStr}.xlsx`;

    // Сохраняем
    XLSX.writeFile(wb, filename);
}

// ============ СБРОС ВСЕХ ФИЛЬТРОВ ============
function resetAllFilters() {
    // Очищаем теги
    titleKeywords = [];
    leadKeywords = [];
    contentKeywords = [];
    renderTags('title');
    renderTags('lead');
    renderTags('content');

    // Проект — первый в списке
    if (projects.length > 0) {
        selectProject(projects[0]);
    }

    // Даты
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';

    // Коммерческие — "Нет" по умолчанию
    const commercialDefault = document.querySelector('input[name="isCommercial"][value="false"]');
    if (commercialDefault) commercialDefault.checked = true;

    // Активные — "Да" по умолчанию
    const activeDefault = document.querySelector('input[name="isActive"][value="true"]');
    if (activeDefault) activeDefault.checked = true;

    // Сообщения и таблица
    document.getElementById('message').innerHTML = '';
    document.getElementById('tableContainer').innerHTML = '';
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('downloadXlsxBtn').disabled = true;
    currentArticles = [];
    currentLimit = 5000;

    // Удаляем сохранённые фильтры
    localStorage.removeItem(STORAGE_KEY);

    // Закрываем dropdown
    closeAllDropdowns();
}

// ============ УТИЛИТЫ ============
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============ ИНИЦИАЛИЗАЦИЯ ============
document.addEventListener('click', function (e) {
    if (!e.target.closest('.dropdown')) {
        closeAllDropdowns();
    }
});

document.addEventListener('DOMContentLoaded', function () {
    loadProjects();

    // Сохраняем при изменении дат
    document.getElementById('dateFrom').addEventListener('change', saveFilters);
    document.getElementById('dateTo').addEventListener('change', saveFilters);

    // Сохраняем при смене radio "Коммерческие"
    document.querySelectorAll('input[name="isCommercial"]').forEach(radio => {
        radio.addEventListener('change', saveFilters);
    });

    // Сохраняем при смене radio "Активные"
    document.querySelectorAll('input[name="isActive"]').forEach(radio => {
        radio.addEventListener('change', saveFilters);
    });
});