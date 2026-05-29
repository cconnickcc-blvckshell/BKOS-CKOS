import { listDiscoverySuggestionsForGap } from "@/actions/discovery";
import { DiscoverySuggestionsPanel } from "@/components/discovery/discovery-suggestions-panel";

export async function GapDiscoverySuggestions({ gapId }: { gapId: string }) {
  const suggestions = await listDiscoverySuggestionsForGap(gapId);
  return (
    <DiscoverySuggestionsPanel
      suggestions={suggestions}
      title="Source suggestions for this gap"
    />
  );
}
