import { useMemo } from 'react';
import { mdToHtml } from './markdown';

/** Renders Claude's markdown reply. Output is escaped inside mdToHtml. */
export function MarkdownRenderer({ text }: { text: string }) {
  const html = useMemo(() => mdToHtml(text), [text]);
  return <div className="coach-md text-[12px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
}
