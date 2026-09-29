FROM node:18-alpine

WORKDIR /app

# Копируем package-файлы для установки зависимостей
COPY package*.json ./

# Устанавливаем только production-зависимости
RUN npm install --production

# Копируем исходный код
COPY . .

# Создаём непривилегированного пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Меняем владельца файлов
RUN chown -R nextjs:nodejs /app
USER nextjs

# Открываем порт
EXPOSE 3001

# Переменные окружения по умолчанию
ENV HOST=0.0.0.0
ENV PORT=3001
ENV NODE_ENV=production

# Запуск приложения
CMD ["node", "server.js"]