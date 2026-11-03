type IconProps = React.SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function FileIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Svg>
  )
}

export function FolderIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  )
}

export function FilePlusIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 12v5M9.5 14.5h5" />
    </Svg>
  )
}

export function FolderPlusIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 11.5v6M9 14.5h6" />
    </Svg>
  )
}

export function FolderOpenIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 8V7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V11" />
      <path d="M3.5 10.5h18l-2.2 8a2 2 0 0 1-1.9 1.5H5.4a2 2 0 0 1-1.9-1.5z" />
    </Svg>
  )
}

export function ChevronIcon({ open, ...props }: IconProps & { open: boolean }): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
    </Svg>
  )
}

export function ChevronLeftIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  )
}

export function ChevronRightIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  )
}

export function SearchIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Svg>
  )
}

export function SunIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </Svg>
  )
}

export function MoonIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8.2 8.2 0 1 0 10.5 10.5z" />
    </Svg>
  )
}

export function PanelIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </Svg>
  )
}

export function PlusIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}

export function ArrowUpIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  )
}

export function ArrowDownIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  )
}

export function BookIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H19" />
    </Svg>
  )
}

export function ListIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function PencilIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M13.5 6.5l3 3" />
    </Svg>
  )
}

export function EyeIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  )
}

export function ZoomInIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
      <path d="M11 8.5v5M8.5 11h5" />
    </Svg>
  )
}

export function ZoomOutIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
      <path d="M8.5 11h5" />
    </Svg>
  )
}

export function RotateLeftIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Svg>
  )
}

export function RotateRightIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </Svg>
  )
}

export function FlipHorizontalIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M12 2v2M12 8v2M12 14v2M12 20v2" />
    </Svg>
  )
}

export function FlipVerticalIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
      <path d="M2 12h2M8 12h2M14 12h2M20 12h2" />
    </Svg>
  )
}

function WindowGlyph({
  children,
  ...props
}: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function WindowMinimizeIcon(props: IconProps): React.JSX.Element {
  return (
    <WindowGlyph {...props}>
      <path d="M2.5 5h5" />
    </WindowGlyph>
  )
}

export function WindowMaximizeIcon({
  restored = false,
  ...props
}: IconProps & { restored?: boolean }): React.JSX.Element {
  if (restored) {
    return (
      <WindowGlyph {...props}>
        <path d="M3.5 3.5h3v3" />
        <rect x="2.5" y="4.5" width="3" height="3" />
      </WindowGlyph>
    )
  }
  return (
    <WindowGlyph {...props}>
      <rect x="2.5" y="2.5" width="5" height="5" />
    </WindowGlyph>
  )
}

export function WindowCloseIcon(props: IconProps): React.JSX.Element {
  return (
    <WindowGlyph {...props}>
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
    </WindowGlyph>
  )
}
