# Цветочный портрет

Frontend MVP интерактивной формы по ТЗ: mobile-first квиз с локальным сохранением, расчетом архетипа, финальным портретом, шарингом, request-ссылками и сбором MVP-метрик.

## Запуск

В проекте ожидается обычный Node.js toolchain:

```bash
npm install
npm run dev
```

Затем откройте адрес, который покажет Vite.

## Сборка

```bash
npm run build
```

## Сбор данных в Google Sheets

MVP умеет отправлять данные во внешний collector endpoint через переменную окружения:

```bash
VITE_FLOWER_COLLECTOR_URL=https://script.google.com/macros/s/.../exec
```

Если переменная не задана, приложение работает полностью локально. Если endpoint временно недоступен, записи остаются в очереди `localStorage` и отправляются позже.

Что отправляется:

- `events`: просмотры шагов, старт, свайпы, выборы, завершение, sharing/order/request события.
- `submissions`: завершенный Flower ID, ответы и computed profile.
- `requests`: request-ссылки и их статусы.
- `feedback`: ответы на блок результата «Похоже на тебя?» и комментарии.

Как подключить Google Sheets:

1. Создайте Google Sheet.
2. Откройте `Extensions` → `Apps Script`.
3. Вставьте код из `google-apps-script/Code.gs`.
4. Нажмите `Deploy` → `New deployment` → `Web app`.
5. Execute as: `Me`.
6. Who has access: `Anyone`.
7. Скопируйте Web App URL.
8. Добавьте URL в `.env.local` локально или в Vercel Environment Variables как `VITE_FLOWER_COLLECTOR_URL`.

## Что реализовано

- Mobile-first Flower ID quiz.
- 12 визуальных карточек букетов с локальными AI-визуалами.
- Свайпы мышью/тачем.
- Ограничение выбора настроений до 5.
- Палитры с режимами `Нравится`, `Идеально`, `Не мое`.
- Цветочный кастинг с реакциями `Люблю`, `Нормально`, `Не люблю`, `Нельзя`.
- Практичные ограничения: аромат, стойкость, аллергии.
- Упаковка, стоп-лист упаковки, комментарий для флориста и контактный экран.
- Локальное сохранение прогресса в `localStorage`.
- Локальный scoring 10 архетипов и гибридный результат при близких баллах.
- ТЗ для флориста сохраняется в computed profile и доступно для order-сценария.
- Безопасная публичная ссылка `/result/{submissionId}` без телефона и Telegram.
- Web Share API с fallback на копирование.
- Локальный массив событий `quiz_events` в `localStorage`.
- Очередь отправки метрик в Google Sheets collector.
