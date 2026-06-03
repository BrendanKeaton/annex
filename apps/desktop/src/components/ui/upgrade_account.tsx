import { openUrl } from "@tauri-apps/plugin-opener";
import PrimaryButton from "../primary_button";
import ArrowRightIcon from "../icons/arrow_right";
import PlugsIcon from "../icons/plugs";

export default function UpgradeAccount() {
  // Only appears at 700px height or more. Not willing to compromise usability for an ad.
  return (
    <div class="hidden relative overflow-hidden rounded-lg border border-annex-light-gray [@media(min-height:700px)]:flex flex-col gap-3 py-6 bg-annex-background px-6">
      <h3 class="font-mono text-base">Upgrade Your Organization</h3>
      <p class="text-annex-light-gray text-sm max-w-50">
        Unlock more space for protecting your data.
      </p>
      <PrimaryButton
        title="Upgrade"
        variant="w-fit text-xs! hover:cursor-pointer"
        onClick={() => openUrl("https://github.com/your-org/annex")}
        icon={<ArrowRightIcon class="text-annex-light-purple w-4 h-4" />}
      ></PrimaryButton>
      <PlugsIcon class="absolute -right-3 -bottom-3 w-22 h-22 text-annex-light-gray" />
    </div>
  );
}
