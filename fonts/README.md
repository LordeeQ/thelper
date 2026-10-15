# Onest

Шрифт интерфейса, поставляется вместе с расширением.

- Источник: [google/fonts · ofl/onest](https://github.com/google/fonts/tree/main/ofl/onest)
- Авторы: Dmitri Voloshin, Andrey Kudryavtsev
- Лицензия: SIL Open Font License 1.1 — см. `OFL.txt`

Файлы — вариативные (ось `wght` 100–900), по одному на набор символов.
Правила `@font-face` лежат в `src/styles/fonts.css`.

Раньше шрифт подключался через `@import` с `fonts.googleapis.com`.
Этот импорт блокировал отрисовку и в корпоративной сети висел до
таймаута, из-за чего попап открывался с задержкой, а запрос повторялся
на каждой странице, куда инжектится `menu.css`.
