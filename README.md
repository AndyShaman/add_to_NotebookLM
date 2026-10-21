<p align="center">
  <img src="icons/icon128.png" alt="Add to NotebookLM" width="80">
</p>

<h1 align="center">Add to NotebookLM</h1>

<p align="center">
  Chrome extension for Google NotebookLM.<br>
  Add web pages, YouTube videos, playlists, channels and comments to your notebooks in one click.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/add-to-notebooklm/pdkgjccfmjghjelcogecndopngnjhope"><img src="https://img.shields.io/chrome-web-store/v/pdkgjccfmjghjelcogecndopngnjhope?style=for-the-badge&logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store&color=4285F4" alt="Chrome Web Store"></a>
  &nbsp;
  <a href="https://t.me/AI_Handler"><img src="https://img.shields.io/badge/Telegram-Author's_Channel-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
  &nbsp;
  <a href="https://www.youtube.com/channel/UCLkP6wuW_P2hnagdaZMBtCw"><img src="https://img.shields.io/badge/YouTube-Author's_Channel-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube"></a>
  &nbsp;
  <a href="https://ai-handler.com/add-to-notebooklm/"><img src="https://img.shields.io/badge/Website-ai--handler.com-007AFF?style=for-the-badge" alt="Website"></a>
</p>

Website: https://ai-handler.com/add-to-notebooklm/

Add to NotebookLM is a free Chrome extension that imports sources into Google NotebookLM (Gemini Notebook). It adds the current page in one click and bulk-imports YouTube videos, whole playlists and channels, YouTube comments, web pages, open browser tabs, all links from a page and links from RSS feeds. There are no limits, no paid tier, no account and no ads. The extension talks directly from your browser to your own notebook: it uses no servers of its own and collects no analytics or telemetry. The code is open source under the MIT license.

[Русская версия ниже](#русский)

---

## Features

**Core**
- Add the current page to any of your notebooks in one click
- **Add a page as PDF**: captures the full rendered page and uploads it to NotebookLM as a PDF source
- Create new notebooks directly from the extension
- "Send to NotebookLM" item in the page and link context menu

**YouTube**
- Import videos, whole playlists and channels as sources
- **Import comments**: top or newest comments with replies, sent to the notebook as clean, structured text

**Bulk tools**
- Paste a list of links and import them at once
- Load links from an RSS or Atom feed
- Grab every link from the current page
- Import open browser tabs
- **Bulk delete sources** inside a notebook
- **Sync Google Drive sources** (Docs, Sheets)

**Settings**
- Multiple Google accounts
- Dark mode
- English and Russian interface

## Why this one

- Unlimited imports, with no daily quotas.
- YouTube playlists and channels are free.
- Importing all open browser tabs is free.
- Grabbing every link from any page takes one click and is free.
- Importing links from any RSS feed is free.
- YouTube comments can become a source, so you can analyze what thousands of viewers say.
- Page-to-PDF capture works for sites that import poorly as plain links.

## Install

**From the Chrome Web Store (recommended):** [Add to NotebookLM](https://chromewebstore.google.com/detail/add-to-notebooklm/pdkgjccfmjghjelcogecndopngnjhope). It installs in one click and updates automatically.

**Manually (for development):**

1. Download or clone the repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Sign in to [NotebookLM](https://notebooklm.google.com)
2. Click the extension icon
3. Select a notebook and click "Add to Notebook"

### YouTube

| Page | Action |
|------|--------|
| Video | Adds the current video |
| Playlist | Adds all videos from the playlist |
| Channel | Adds the visible channel videos |
| Video (comments) | Parses the comments and sends them to the notebook |

## How it works and privacy

The extension sends requests from your browser directly to your own Google notebook, within the Google account you are signed in to. It has no servers of its own, requires no registration, and collects no analytics or telemetry.

It needs access to notebook.google.com to manage your sources, to www.youtube.com to read video lists and comments when you run an import, and to accounts.google.com to list the Google accounts signed in to the browser. It reads your open tabs only to show them in the tab import list. Access to any other site is requested only at the moment you use "Grab all links from page" or "Load from RSS", and only for that one site.

## "Add as PDF" note

PDF capture uses Chrome's debugger API to print the page you chose. While it captures, Chrome shows a standard notice that the extension started debugging. This is expected: the notice applies only for the moment of capture, and the extension uses only the page-to-PDF command. Use this feature for long articles and dynamic pages where a regular URL import gives incomplete content.

## Requirements

A Google account signed in to notebook.google.com.

## License

MIT: free to use, modify and distribute.

NotebookLM and Gemini are trademarks of Google LLC. This extension is an independent project and is not affiliated with, endorsed or sponsored by Google.

**[@AndyShaman](https://github.com/AndyShaman)** · [add_to_NotebookLM](https://github.com/AndyShaman/add_to_NotebookLM)

---

## Русский

<p align="center">
  <a href="https://t.me/AI_Handler"><img src="https://img.shields.io/badge/Telegram-канал автора-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
  &nbsp;
  <a href="https://www.youtube.com/channel/UCLkP6wuW_P2hnagdaZMBtCw"><img src="https://img.shields.io/badge/YouTube-канал автора-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube"></a>
  &nbsp;
  <a href="https://ai-handler.com/add-to-notebooklm/"><img src="https://img.shields.io/badge/Сайт-ai--handler.com-007AFF?style=for-the-badge" alt="Сайт"></a>
</p>

Сайт: https://ai-handler.com/add-to-notebooklm/

Add to NotebookLM — бесплатное Chrome-расширение для удобной работы с Google NotebookLM (Gemini Notebook). Добавляйте веб-страницы, YouTube-видео, комментарии и целые плейлисты в нотбуки в один клик. Расширение массово импортирует видео, плейлисты и каналы YouTube, комментарии, веб-страницы, открытые вкладки, все ссылки со страницы и ссылки из RSS-фидов. Без лимитов, без платного тарифа, без регистрации и рекламы. Расширение работает напрямую из вашего браузера с вашим же нотбуком: без собственных серверов, без аналитики и телеметрии. Открытый код, лицензия MIT.

### Возможности

**Основное**
- Добавление текущей страницы в нотбук одним кликом
- **Захват страницы как PDF** — полный снимок отрендеренной страницы, загрузка в NotebookLM как PDF-источник
- Создание новых нотбуков прямо из расширения
- Пункт «Send to NotebookLM» в контекстном меню страницы и ссылки

**YouTube**
- Добавление видео, плейлистов и каналов целиком
- **Парсинг комментариев** — загрузка топ/новых комментариев с ответами, отправка в нотбук как текстовый источник

**Инструменты**
- Массовый импорт ссылок
- Загрузка ссылок из RSS/Atom-фида
- Сбор всех ссылок с текущей страницы
- Импорт открытых вкладок браузера
- **Массовое удаление источников** из нотбука
- **Синхронизация Google Drive-источников** (Docs, Sheets)

**Настройки**
- Поддержка нескольких Google-аккаунтов
- Тёмная тема
- Русский и английский интерфейс

### Почему именно это расширение

- Безлимитный импорт, никаких дневных квот.
- Плейлисты и каналы YouTube — бесплатно.
- Импорт всех открытых вкладок — бесплатно.
- Сбор всех ссылок с любой страницы в один клик — бесплатно.
- Импорт ссылок из любого RSS-фида — бесплатно.
- Комментарии YouTube как источник — анализ мнений тысяч зрителей.
- Снимок страницы в PDF для сайтов, которые плохо импортируются по ссылке.

### Установка

**Из Chrome Web Store (рекомендуется):** [Add to NotebookLM](https://chromewebstore.google.com/detail/add-to-notebooklm/pdkgjccfmjghjelcogecndopngnjhope) — установка в один клик, обновления автоматически.

**Вручную (для разработки):**

1. Скачайте или клонируйте репозиторий
2. Откройте `chrome://extensions/`
3. Включите «Режим разработчика»
4. Нажмите «Загрузить распакованное расширение»
5. Выберите папку с расширением

### Использование

1. Войдите в [NotebookLM](https://notebooklm.google.com)
2. Нажмите на иконку расширения
3. Выберите нотбук и нажмите «Добавить в нотбук»

#### YouTube

| Страница | Действие |
|----------|----------|
| Видео | Добавляет текущее видео |
| Плейлист | Добавляет все видео из плейлиста |
| Канал | Добавляет видимые видео с канала |
| Видео (комментарии) | Парсит и отправляет комментарии в нотбук |

### Как работает и приватность

Расширение отправляет запросы из вашего браузера напрямую в ваш же Google-нотбук, в рамках Google-аккаунта, под которым вы вошли. У него нет собственных серверов, оно не требует регистрации и не собирает аналитику и телеметрию.

Ему нужен доступ к notebook.google.com, чтобы управлять вашими источниками, к www.youtube.com, чтобы читать списки видео и комментарии при импорте, и к accounts.google.com, чтобы показать Google-аккаунты, вошедшие в браузер. Открытые вкладки расширение читает только для списка импорта вкладок. Доступ к любому другому сайту запрашивается только в момент использования «Собрать все ссылки со страницы» или «Загрузить из RSS» и только для этого одного сайта.

### О функции «Добавить как PDF»

Кнопка «Добавить как PDF» делает полный снимок страницы через debugger API Chrome и загружает его в NotebookLM как PDF-источник. Во время захвата Chrome показывает стандартное уведомление о том, что расширение запустило отладку. Это ожидаемо: уведомление действует только в момент захвата, а расширение использует единственную команду «страница в PDF». Используйте эту функцию для длинных статей и страниц с динамическим контентом, где обычное добавление по URL даёт неполный результат.

### Требования

Google-аккаунт со входом на notebook.google.com.

### Лицензия

MIT — свободно используйте, модифицируйте и распространяйте.

NotebookLM и Gemini — товарные знаки Google LLC. Расширение — независимый проект, не аффилировано с Google и не спонсируется Google.

**[@AndyShaman](https://github.com/AndyShaman)** · [add_to_NotebookLM](https://github.com/AndyShaman/add_to_NotebookLM)
