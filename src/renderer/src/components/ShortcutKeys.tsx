import { Fragment, type JSX } from 'react'

export function ShortcutKeys({ keys }: { keys: string[][] }): JSX.Element {
  return (
    <span className="shortcut-keys">
      {keys.map((combo, comboIndex) => (
        <Fragment key={comboIndex}>
          {comboIndex > 0 ? <span className="shortcut-or">/</span> : null}
          <span className="shortcut-combo">
            {combo.map((key, keyIndex) => (
              <Fragment key={keyIndex}>
                {keyIndex > 0 ? <span className="shortcut-plus">+</span> : null}
                <kbd className="shortcut-key">{key}</kbd>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
