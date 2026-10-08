import { describe, expect, test } from 'claude-code/testing'

import { promptLine } from '../hooks/domain/calls'
import { unwrapPastes } from '../hooks/text/format'
import { plainLine, tailToWidth } from '../hooks/text/markdown'

const tagged = (text: string) => plainLine(text, [...text].map((_, i) => i))

describe('streamed lines read as plain words', () => {
  test('emphasis, code and link marks go; words stay', async () => {
    expect(tagged('**Music:** the *Black Parade* uses `npm` and [docs](https://x.y)').text).toBe('Music: the Black Parade uses npm and docs')
  })

  test('list items get a bullet; headings and quotes lose their marks', async () => {
    expect(tagged('- **Comics:** Umbrella').text).toBe('• Comics: Umbrella')
    expect(tagged('  * nested').text).toBe('  • nested')
    expect(tagged('## Background').text).toBe('Background')
    expect(tagged('> quoted').text).toBe('quoted')
    expect(tagged('1. first').text).toBe('1. first')
  })

  test('each kept character keeps its own arrival', async () => {
    const line = tagged('a**b**c')
    expect(line.text).toBe('abc')
    expect(line.tags).toEqual([0, 3, 6])
  })

  test('snake_case and a half-written link are left alone', async () => {
    expect(tagged('see my_var and [part').text).toBe('see my_var and [part')
  })
})

describe('a long line keeps its writing end', () => {
  test('cut on a whole word near the edge, marked with an ellipsis', async () => {
    const line = tagged('The True Lives of the Fabulous Killjoys came out in 2010')
    const cut = tailToWidth(line, 24)
    expect(cut.text.length).toBeLessThanOrEqual(24)
    expect(cut.text.startsWith('…')).toBe(true)
    expect(cut.text.slice(1).startsWith(' ')).toBe(false)
    expect(line.text.endsWith(cut.text.slice(1))).toBe(true)
    expect(cut.tags.length).toBe(cut.text.length)
  })

  test('a short line is left whole', async () => {
    const line = tagged('short')
    expect(tailToWidth(line, 24)).toBe(line)
  })
})

describe('pasted text reads as the words pasted', () => {
  test('the wrapper and the blank lines around it go', async () => {
    const paste = '\n\n<pasted_content id="134a">\nScreen areas\n  - Image: pictures\n</pasted_content id="134a">\n\n\nwdyt?'
    expect(unwrapPastes(paste)).toBe('Screen areas\n  - Image: pictures\n\nwdyt?')
    expect(promptLine(paste)).toBe('Screen areas - Image: pictures wdyt?')
  })

  test('a prompt without a paste is left alone', async () => {
    expect(unwrapPastes('fix the <b>login</b> bug')).toBe('fix the <b>login</b> bug')
  })
})
