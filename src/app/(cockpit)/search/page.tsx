import { PageHeader } from "@/components/cockpit/page-header";
import { SearchPanel } from "@/components/search/search-panel";

export default function SearchPage() {
  return (
    <>
      <PageHeader
        title="Semantic Search"
        description="Hybrid full-text + pgvector semantic search across knowledge and related entities"
      />
      <SearchPanel />
    </>
  );
}
