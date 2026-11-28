import { createContentLoader } from 'vitepress'

type DocEntry = { text: string; link: string }

declare const data: DocEntry[]
export { data }

export default createContentLoader(['en/**/*.md', 'zh-CN/**/*.md'], {
  includeSrc: true,
  transform(pages): DocEntry[] {
    return pages.map(({ frontmatter, src, url }) => {
      const heading = src?.match(/^#[\t ]+(.+?)\s*#*\s*$/m)?.[1]
      return {
        link: url,
        text: typeof frontmatter.title === 'string' && frontmatter.title.trim()
          ? frontmatter.title.trim()
          : heading || url.split('/').filter(Boolean).at(-1) || 'Finesse',
      }
    })
  },
})
