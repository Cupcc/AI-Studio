import { Fragment } from 'react'

/** Text in which `words between backticks` are commands or paths, shown as <code>. Nothing else is interpreted. */
export function InlineText({ text }: { text: string }) {
  return <>{text.split('`').map((part, index) => index % 2 === 1 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>)}</>
}
