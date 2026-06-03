import { JSX } from "solid-js";

type PrimaryButtonProps = {
  title: string;
  icon?: JSX.Element;
  variant?: string;
  onClick?: () => void;
};

export default function PrimaryButton(props: PrimaryButtonProps) {
  return (
    <button
      onClick={props.onClick}
      class={`hover:opacity-70 duration-150 flex items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold transition-colors bg-annex-dark-purple text-annex-light-purple border-annex-light-purple border
        ${props.variant}
      `}
    >
      <span>{props.title}</span>
      {props.icon && <span class="flex items-center">{props.icon}</span>}
    </button>
  );
}
