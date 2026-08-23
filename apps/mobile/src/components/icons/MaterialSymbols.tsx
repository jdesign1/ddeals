import type { CSSProperties } from "react";

type MaterialSymbolProps = {
  className?: string;
  style?: CSSProperties;
};

type MaterialSymbolName =
  | "check_circle"
  | "list_alt_add"
  | "search_check_2"
  | "leaderboard"
  | "warning"
  | "balance"
  | "workspace_premium";

function MaterialSymbol({
  name,
  fill,
  weight = 400,
  className,
  style,
}: MaterialSymbolProps & { name: MaterialSymbolName; fill: 0 | 1; weight?: 400 | 700 }) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={{
        ...style,
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/** Google Material Symbols `check_circle`, outlined. */
export function CheckCircleOutlinedIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="check_circle" fill={0} />;
}

/** Google Material Symbols `check_circle`, filled. */
export function CheckCircleFilledIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="check_circle" fill={1} />;
}

/** Google Material Symbols `list_alt_add`, outlined. */
export function ListAltAddOutlinedIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="list_alt_add" fill={0} />;
}

/** Google Material Symbols `list_alt_add`, filled. */
export function ListAltAddFilledIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="list_alt_add" fill={1} />;
}

/** Google Material Symbols `search_check_2`, outlined. */
export function SearchCheckOutlinedIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="search_check_2" fill={0} />;
}

/** Google Material Symbols `search_check_2`, filled. */
export function SearchCheckFilledIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="search_check_2" fill={1} />;
}

/** Google Material Symbols `leaderboard`, outlined. */
export function LeaderboardOutlinedIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="leaderboard" fill={0} />;
}

/** Google Material Symbols `leaderboard`, filled. */
export function LeaderboardFilledIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="leaderboard" fill={1} />;
}

/** Google Material Symbols `warning`, filled and bold. */
export function WarningFilledIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="warning" fill={1} weight={700} />;
}

/** Google Material Symbols `balance`, filled and bold. */
export function BalanceFilledIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="balance" fill={1} weight={700} />;
}

/** Google Material Symbols `workspace_premium`, filled and bold. */
export function WorkspacePremiumFilledIcon(props: MaterialSymbolProps) {
  return <MaterialSymbol {...props} name="workspace_premium" fill={1} weight={700} />;
}
