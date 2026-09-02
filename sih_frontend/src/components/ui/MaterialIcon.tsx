import React from "react";
import clsx from "clsx";

interface MaterialIconProps {
  name: string;
  size?: number | string;
  fill?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function MaterialIcon({
  name,
  size = 20,
  fill = false,
  className = "",
  style = {},
}: MaterialIconProps) {
  const iconSize = typeof size === "number" ? `${size}px` : size;

  return (
    <span
      className={clsx("material-symbols-outlined select-none inline-flex items-center justify-center shrink-0", className)}
      style={{
        fontSize: iconSize,
        width: iconSize,
        height: iconSize,
        fontVariationSettings: fill ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
        ...style,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
