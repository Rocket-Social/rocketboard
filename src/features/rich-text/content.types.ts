import type {RichTextDocument} from './rich-text'

/**
 * Shape every feature that stores rich-text content uses: the parsed Tiptap
 * document + its serialized Markdown projection. Notes, wiki pages, and
 * free-floating documents all embed this. Cards use different field names
 * (body_json / body_md) for legacy reasons and intentionally do NOT adopt
 * this type — they map through `prepareContentForSave` instead.
 */
export type ContentDocument = {
  contentJson: RichTextDocument
  contentMd: string
}
