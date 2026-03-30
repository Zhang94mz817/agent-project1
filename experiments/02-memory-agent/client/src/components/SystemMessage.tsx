interface Props {
  text: string
}

export function SystemMessage({ text }: Props) {
  return (
    <div className="system-msg">
      <div className="system-msg-inner">{text}</div>
    </div>
  )
}
