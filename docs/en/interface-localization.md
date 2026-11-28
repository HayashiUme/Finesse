# Interface language support

The language selector supports English (`en`) and Simplified Chinese (`zh-CN`). Changing language takes effect immediately and preserves the current page, filters, searches and unsaved input. The preference is saved in `localStorage` as `finesse-language` and is independent of server profiles.

On first use, Finesse checks the browser's preferred languages and matches English or Chinese. Unsupported languages fall back to Simplified Chinese. If browser storage is disabled, the selection remains active for the current page session.

Navigation, dashboard pages, connection dialogs, errors, confirmations, accessibility labels, document title, page `lang`, dates and numbers are localized. Server names, player names, room codes, technical configuration keys, server logs and API protocol values remain unchanged. Unknown server states and audit details are shown as returned by the server.

The application dictionaries live in `dashboard/src/localization/locales/en.ts` and `zh-CN.ts` on the development branch. Keep both dictionaries in sync and run `npm run test:i18n` after changing translation keys.

## Adding Markdown pages to this site

Create a `.md` file under `docs/en/` for English or `docs/zh-CN/` for Simplified Chinese. Start with a `# Page title`; an optional `title` field in the frontmatter overrides the sidebar title. New pages appear under **More docs** after the site builds.

Give translations the same relative path in both language directories (for example, `en/tutorials/setup.md` and `zh-CN/tutorials/setup.md`). The language switch opens the matching page when it exists, or the other language's homepage otherwise.
