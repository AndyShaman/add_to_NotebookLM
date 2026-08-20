<p align="center">
  <img src="icons/icon128.png" alt="Add to NotebookLM" width="80">
</p>

<h1 align="center">Add to NotebookLM</h1>

<p align="center">
  Chrome-расширение для удобной работы с Google NotebookLM.<br>
  Добавляйте веб-страницы, YouTube-видео, комментарии и целые плейлисты в нотбуки — в один клик.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/add-to-notebooklm/pdkgjccfmjghjelcogecndopngnjhope"><img src="https://img.shields.io/chrome-web-store/v/pdkgjccfmjghjelcogecndopngnjhope?style=for-the-badge&logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store&color=4285F4" alt="Chrome Web Store"></a>
  &nbsp;
  <a href="https://t.me/AI_Handler"><img src="https://img.shields.io/badge/Telegram-канал автора-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
  &nbsp;
  <a href="https://www.youtube.com/channel/UCLkP6wuW_P2hnagdaZMBtCw"><img src="https://img.shields.io/badge/YouTube-канал автора-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube"></a>
</p>

---

## Возможности

**Основное**
- Добавление текущей страницы в нотбук одним кликом
- **Захват страницы как PDF** — полный снимок страницы через Chrome Debugger API, загрузка в NotebookLM как PDF-источник
- Создание новых нотбуков прямо из расширения

**YouTube**
- Добавление видео, плейлистов и каналов целиком
- **Парсинг комментариев** — загрузка топ/новых комментариев с ответами, отправка в нотбук как текстовый источник

**Инструменты**
- Массовый импорт ссылок
- Импорт открытых вкладок браузера
- **Массовое удаление источников** из нотбука
- **Синхронизация Google Drive-источников** (Docs, Sheets)

**Настройки**
- Поддержка нескольких Google-аккаунтов
- Тёмная тема
- Русский и английский интерфейс

## Установка

**Из Chrome Web Store (рекомендуется):** [Add to NotebookLM](https://chromewebstore.google.com/detail/add-to-notebooklm/pdkgjccfmjghjelcogecndopngnjhope) — установка в один клик, обновления автоматически.

**Вручную (для разработки):**

1. Скачайте или клонируйте репозиторий
2. Откройте `chrome://extensions/`
3. Включите «Режим разработчика»
4. Нажмите «Загрузить распакованное расширение»
5. Выберите папку с расширением

## Использование

1. Войдите в [NotebookLM](https://notebooklm.google.com)
2. Нажмите на иконку расширения
3. Выберите нотбук и нажмите «Добавить в нотбук»

### Добавление как PDF

Кнопка «Добавить как PDF» делает полный снимок страницы и загружает его в NotebookLM как PDF-источник. Используйте для длинных статей и страниц с динамическим контентом, где обычное добавление по URL даёт неполный результат.

### YouTube

| Страница | Действие |
|----------|----------|
| Видео | Добавляет текущее видео |
| Плейлист | Добавляет все видео из плейлиста |
| Канал | Добавляет видимые видео с канала |
| Видео (комментарии) | Парсит и отправляет комментарии в нотбук |

## Лицензия

MIT — свободно используйте, модифицируйте и распространяйте.

**[@AndyShaman](https://github.com/AndyShaman)** · [add_to_NotebookLM](https://github.com/AndyShaman/add_to_NotebookLM)

---

<p align="center">
  <img src="icons/icon128.png" alt="Add to NotebookLM" width="80">
</p>

<h1 align="center">Add to NotebookLM</h1>

<p align="center">
  Chrome extension for working with Google NotebookLM.<br>
  Add web pages, YouTube videos, comments, and entire playlists to your notebooks — in one click.
</p>

<p align="center">
  <a href="https://t.me/AI_Handler"><img src="https://img.shields.io/badge/Telegram-Author's_Channel-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
  &nbsp;
  <a href="https://www.youtube.com/channel/UCLkP6wuW_P2hnagdaZMBtCw"><img src="https://img.shields.io/badge/YouTube-Author's_Channel-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube"></a>
</p>

---

## Features

**Core**
- Add current page to a notebook with one click
- **Capture page as PDF** — full page snapshot via Chrome Debugger API, uploaded to NotebookLM as a PDF source
- Create new notebooks directly from the extension

**YouTube**
- Add videos, playlists, and entire channels
- **Parse comments** — fetch top/newest comments with replies, send to notebook as text source

**Tools**
- Bulk import links
- Import open browser tabs
- **Bulk delete sources** from notebooks
- **Sync Google Drive sources** (Docs, Sheets)

**Settings**
- Multiple Google account support
- Dark mode
- English and Russian interface

## Installation

1. Download or clone the repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Login to [NotebookLM](https://notebooklm.google.com)
2. Click the extension icon
3. Select a notebook and click "Add to Notebook"

### Add as PDF

The "Add as PDF" button captures a full page snapshot and uploads it to NotebookLM as a PDF source. Use it for long articles and dynamic pages where regular URL import captures incomplete content.

### YouTube

| Page | Action |
|------|--------|
| Video | Adds current video |
| Playlist | Adds all videos from playlist |
| Channel | Adds visible channel videos |
| Video (comments) | Parses and sends comments to notebook |

## License

MIT — free to use, modify, and distribute.

**[@AndyShaman](https://github.com/AndyShaman)** · [add_to_NotebookLM](https://github.com/AndyShaman/add_to_NotebookLM)
