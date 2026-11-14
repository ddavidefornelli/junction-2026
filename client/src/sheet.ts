import type { MouseEvent } from 'react'

// True when a click on a dialog landed on its backdrop, outside the sheet
// itself. (A click on the sheet's own padding also has the dialog as target.)
export function onBackdrop(e: MouseEvent<HTMLDialogElement>): boolean {
  if (e.target !== e.currentTarget) return false
  const box = e.currentTarget.getBoundingClientRect()
  return e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom
}
