// 40px top bar (Shell Spec v01 §2). The whole bar is a window drag region;
// interactive children must opt out with the `no-drag` class.
export function TopBar() {
  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar__traffic-lights" aria-hidden="true" />
      <div className="topbar__content" />
    </header>
  )
}
