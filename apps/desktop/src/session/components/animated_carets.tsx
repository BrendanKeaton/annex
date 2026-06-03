import { Dynamic } from "solid-js/web";
import CaretDownIcon from "../../components/icons/caret_down";
import CaretUpIcon from "../../components/icons/caret_up";
import type { ProtectedState } from "../../context/app_state";

export default function AnimatedCarets(props: { state: ProtectedState }) {
  const isVisible = () =>
    props.state === "in_process" || props.state === "ending";
  const isEnding = () => props.state === "ending";
  const Caret = () => (isEnding() ? CaretUpIcon : CaretDownIcon);

  return (
    <div class={`${isVisible() ? "flex" : "invisible"} py-2`}>
      <div class="flex flex-col items-center -my-1">
        <Dynamic
          component={Caret()}
          class="w-7 h-7 text-annex-light-yellow animate-caret-1"
        />
        <Dynamic
          component={Caret()}
          class="w-7 h-7 text-annex-light-yellow animate-caret-2 -mt-2"
        />
        <Dynamic
          component={Caret()}
          class="w-7 h-7 text-annex-light-yellow animate-caret-3 -mt-2"
        />
      </div>
    </div>
  );
}
